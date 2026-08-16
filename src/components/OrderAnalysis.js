import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { computeQuoteFinancials } from '../utils/pricing';
import { formatMoney } from '../utils/formatters';
import { subscribeToAnalysisEntries, saveAnalysisEntryRemote, deleteAnalysisEntryRemote } from '../services/analysisSync';
import EntryEditorScreen from './analysis/EntryEditorScreen';

// Order Analysis: records, per confirmed order, what the supplier actually
// charged vs what this app estimated (fabric/motor/remote/solar/shipping),
// so those numbers can be compared over time to tune the app's pricing
// constants (MOTOR_COST_SUPPLIER, SOLAR_COST_SUPPLIER, etc. in constants.js)
// closer to reality. Deliberately its own Firestore collection ('orderAnalysis'),
// same isolation reasoning as measurementSheets - a bug here can't touch
// quotes or measurement sheets, and vice versa.
export default function OrderAnalysis({ quotes, onBack, uid }) {
  const [entries, setEntries] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [screen, setScreen] = useState('list'); // 'list' | 'select' | 'editor'
  const [activeEntryId, setActiveEntryId] = useState(null);
  const [creatingEntry, setCreatingEntry] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ ok: true, failedCount: 0, lastError: null });

  useEffect(() => {
    if (!uid) return;
    const unsubscribe = subscribeToAnalysisEntries(
      uid,
      (remoteEntries) => {
        setEntries(remoteEntries);
        setHasLoaded(true);
        setLoadError(null);
      },
      (error) => {
        console.error('Order analysis sync error:', error);
        setHasLoaded(true);
        setLoadError(error?.message || 'Could not load your analysis entries.');
      }
    );
    return () => unsubscribe();
  }, [uid]);

  const activeEntry = entries.find(e => e.id === activeEntryId) || null;

  // Same diffing write-through pattern as updateQuotes/updateSheets - entries
  // state is only ever set by the listener above, never directly.
  const updateEntries = (newEntriesOrUpdater) => {
    const newEntries = typeof newEntriesOrUpdater === 'function' ? newEntriesOrUpdater(entries) : newEntriesOrUpdater;
    const oldById = new Map(entries.map(e => [e.id, e]));
    const newIds = new Set(newEntries.map(e => e.id));

    const toSave = newEntries.filter(e => {
      const old = oldById.get(e.id);
      return !old || JSON.stringify(old) !== JSON.stringify(e);
    });
    const toDeleteIds = [];
    oldById.forEach((e, id) => { if (!newIds.has(id)) toDeleteIds.push(id); });

    const attempts = [
      ...toSave.map(e => saveAnalysisEntryRemote(uid, e).then(() => ({ ok: true })).catch(err => {
        console.error('Failed to save analysis entry', e.id, err);
        return { ok: false, message: err?.message || String(err) };
      })),
      ...toDeleteIds.map(id => deleteAnalysisEntryRemote(uid, id).then(() => ({ ok: true })).catch(err => {
        console.error('Failed to delete analysis entry', id, err);
        return { ok: false, message: err?.message || String(err) };
      }))
    ];

    if (attempts.length === 0) return Promise.resolve({ success: true, errors: [] });

    return Promise.all(attempts).then(results => {
      const failed = results.filter(r => !r.ok);
      setSyncStatus(
        failed.length > 0
          ? { ok: false, failedCount: failed.length, lastError: failed[0].message }
          : { ok: true, failedCount: 0, lastError: null }
      );
      return { success: failed.length === 0, errors: failed.map(f => f.message) };
    });
  };

  const updateActiveEntry = (updater) => {
    updateEntries(prev => prev.map(e => (e.id === activeEntryId ? updater(e) : e)));
  };

  // Latest version per quote lineage only - same pattern as Supplier
  // Measurements' quote picker, and what the user asked for explicitly
  // ("pulled from quote generated section from latest version").
  const latestQuotes = () => {
    const map = new Map();
    (quotes || []).forEach(q => {
      if (q.archived || q.trashedAt) return;
      const key = q.lineageId || q.id;
      const existing = map.get(key);
      if (!existing || new Date(q.updatedDate) > new Date(existing.updatedDate)) {
        map.set(key, q);
      }
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.updatedDate) - new Date(a.updatedDate));
  };

  const createEntryFromQuote = async (quote) => {
    // Snapshot the App-generated numbers at creation time, same reasoning as
    // quotes storing their own `pricing` snapshot - if pricing constants or
    // the quote itself change later, this analysis entry still reflects what
    // was true for the order actually placed.
    const financials = computeQuoteFinancials(quote);
    const newEntry = {
      id: `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      quoteId: quote.id,
      quoteLineageId: quote.lineageId || quote.id,
      clientName: quote.clientName,
      quoteName: quote.quoteName,
      orderConfirmedDate: new Date().toISOString().slice(0, 10),
      supplierCosts: { fabric: null, motor: null, remote: null, solar: null, shipping: null },
      appGeneratedCosts: financials.appGeneratedCosts,
      revenueSubtotal: financials.revenueSubtotal,
      // ✅ NEW: what the client was ACTUALLY charged, editable and separate
      // from revenueSubtotal (the app's original estimate at the moment
      // this entry was created). Defaults to the estimate, but a
      // client-negotiated discount changes this without needing to go back
      // and re-edit the quote itself - the difference is shown as
      // "Discount Given", and profit is computed against this number since
      // it's the only economically real one.
      finalPriceCharged: financials.revenueSubtotal,
      invoiceFile: null,
      notes: ''
    };
    setCreatingEntry(true);
    const result = await updateEntries(prev => [...prev, newEntry]);
    setCreatingEntry(false);
    if (!result.success) {
      alert(`Could not create the analysis entry - ${result.errors[0] || 'sync failed'}.\n\nNothing was lost; just try again once you have a connection.`);
      return;
    }
    setActiveEntryId(newEntry.id);
    setScreen('editor');
  };

  const openEntry = (id) => {
    setActiveEntryId(id);
    setScreen('editor');
  };

  const deleteEntry = (id) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    if (!window.confirm(`Delete the analysis entry for ${entry.clientName || 'this order'}? This cannot be undone.`)) return;
    updateEntries(prev => prev.filter(e => e.id !== id));
    if (activeEntryId === id) {
      setActiveEntryId(null);
      setScreen('list');
    }
  };

  if (screen === 'editor') {
    return (
      <EntryEditorScreen
        activeEntry={activeEntry}
        onBack={() => { setActiveEntryId(null); setScreen('list'); }}
        syncStatus={syncStatus}
        updateActiveEntry={updateActiveEntry}
      />
    );
  }

  if (screen === 'select') {
    const pickable = latestQuotes();
    return (
      <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <button onClick={() => setScreen('list')} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer', color: '#fff' }}>← Back</button>
            <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold', fontFamily: 'Georgia, serif' }}>Pick a Quote</h2>
            <div style={{ width: '60px' }} />
          </div>
          <p style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>Select the confirmed order's quote. App-generated costs are pulled from its latest version.</p>
          {pickable.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', fontSize: '14px' }}>No quotes yet.</p>
          ) : (
            pickable.map(q => (
              <button
                key={q.id}
                disabled={creatingEntry}
                onClick={() => createEntryFromQuote(q)}
                style={{ width: '100%', textAlign: 'left', background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', padding: '14px', marginBottom: '10px', cursor: creatingEntry ? 'default' : 'pointer', opacity: creatingEntry ? 0.6 : 1 }}
              >
                <p style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>{q.clientName}</p>
                <p style={{ color: '#888', fontSize: '12px' }}>{q.location} — {q.version}</p>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // screen === 'list'
  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <button onClick={onBack} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={24} color="#aaa" />
          </button>
          <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold', fontFamily: 'Georgia, serif' }}>Order Analysis</h2>
          <div style={{ width: '40px' }} />
        </div>

        <button
          onClick={() => setScreen('select')}
          style={{ width: '100%', padding: '20px', borderRadius: '8px', background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', color: '#d4af37', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginBottom: '24px' }}
        >
          + New Analysis Entry
        </button>

        {syncStatus && !syncStatus.ok && (
          <div style={{ padding: '12px', marginBottom: '16px', background: '#3a1a1a', border: '1px solid #ef4444', borderRadius: '8px' }}>
            <p style={{ color: '#f87171', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
              ⚠️ {syncStatus.failedCount} change{syncStatus.failedCount > 1 ? 's' : ''} not yet saved to the cloud
            </p>
            <p style={{ color: '#ccc', fontSize: '12px' }}>{syncStatus.lastError} — your local copy is safe, and this keeps retrying automatically.</p>
          </div>
        )}

        {loadError ? (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <p style={{ color: '#f87171', fontSize: '15px', fontWeight: 'bold', marginBottom: '8px' }}>⚠️ Could not load your analysis entries</p>
            <p style={{ color: '#888', fontSize: '13px' }}>{loadError}</p>
          </div>
        ) : !hasLoaded ? (
          <p style={{ color: '#888', textAlign: 'center', fontSize: '14px' }}>Loading...</p>
        ) : entries.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', fontSize: '14px' }}>No analysis entries yet.</p>
        ) : (
          entries.slice().sort((a, b) => new Date(b.updatedDate) - new Date(a.updatedDate)).map(entry => {
            const supplierTotal = ['fabric', 'motor', 'remote', 'solar', 'shipping']
              .reduce((sum, k) => sum + (typeof entry.supplierCosts?.[k] === 'number' ? entry.supplierCosts[k] : 0), 0);
            const hasSupplierData = ['fabric', 'motor', 'remote', 'solar', 'shipping'].some(k => typeof entry.supplierCosts?.[k] === 'number');
            const appTotal = entry.appGeneratedCosts?.total || 0;
            const variance = supplierTotal - appTotal;
            return (
              <div key={entry.id} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', padding: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <button onClick={() => openEntry(entry.id)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <p style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '15px', marginBottom: '4px' }}>{entry.clientName || 'Untitled'}</p>
                  <p style={{ color: '#888', fontSize: '12px' }}>{entry.orderConfirmedDate ? new Date(entry.orderConfirmedDate).toLocaleDateString() : 'No date set'} • App est: ${formatMoney(appTotal)}</p>
                  {hasSupplierData && (
                    <p style={{ color: variance > 0 ? '#f87171' : '#4ade80', fontSize: '12px', marginTop: '2px' }}>
                      Supplier actual: ${formatMoney(supplierTotal)} ({variance > 0 ? '+' : ''}{formatMoney(variance)} vs estimate)
                    </p>
                  )}
                </button>
                <button onClick={() => deleteEntry(entry.id)} style={{ padding: '10px', borderRadius: '6px', background: '#b91c1c', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '12px' }}>Delete</button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
