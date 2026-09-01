import React, { useState } from 'react';
import { ArrowLeft, Search, Edit2, ChevronDown, ChevronUp, RotateCcw, Trash2 } from 'lucide-react';

const daysRemaining = (trashedAt) => {
  const elapsedMs = Date.now() - new Date(trashedAt).getTime();
  const daysElapsed = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
  return Math.max(0, 7 - daysElapsed);
};

// Quote History - relocated from App.js's renderHistory. The original
// function returned renderQuoteDetail() inline whenever selectedQuote was
// set; that routing now happens one level up in App.js (currentView ===
// 'history' picks QuoteDetailScreen vs HistoryScreen based on selectedQuote),
// so this component no longer needs to know about the detail screen at all -
// same on-screen behavior, smaller/cleaner prop surface.
export default function HistoryScreen({
  copyBackupToClipboard,
  expandedClients,
  exportBackup,
  hasLoaded,
  importBackup,
  loadError,
  loadQuoteForEdit,
  permanentlyDeleteQuotes,
  quotes,
  restoreQuotes,
  safeDeleteQuotes,
  searchQuery,
  selectedVersions,
  setCurrentView,
  setExpandedClients,
  setSearchQuery,
  setSelectedQuote,
  setSelectedVersions,
  undoBuffer,
  undoLastDelete,
  unarchiveQuoteLineage
}) {
  // ✅ NEW: Active/Trash/Archived tabs - local, resets to Active whenever
  // History is reopened (this component unmounts when navigating away),
  // which is the desired default every time.
  const [viewMode, setViewMode] = useState('active');

  const activeQuotes = quotes.filter(q => !q.archived && !q.trashedAt);
  const trashedQuotes = quotes.filter(q => q.trashedAt);
  const archivedQuotes = quotes.filter(q => q.archived && !q.trashedAt);

  const groupedByClient = {};
  activeQuotes.forEach(quote => {
    const clientKey = `${quote.clientName} - ${quote.location}`;
    if (!groupedByClient[clientKey]) {
      groupedByClient[clientKey] = [];
    }
    groupedByClient[clientKey].push(quote);
  });

  Object.keys(groupedByClient).forEach(client => {
    groupedByClient[client].sort((a, b) => {
      const versionA = parseInt(a.version.replace('v', ''));
      const versionB = parseInt(b.version.replace('v', ''));
      return versionA - versionB;
    });
  });

  // ✅ FIX: client groups previously showed in whatever order Firestore
  // happened to return them (effectively oldest-created-quote-first) - the
  // clients you're actively working are the ones you need to find fastest,
  // so this now sorts by each group's own most recently updated version,
  // newest first. (Versions WITHIN a group still sort oldest-to-newest
  // above - that's a different, correct ordering: v1 before v2 before v3.)
  // ✅ FIX: a plain Math.max(...dates) breaks silently the moment ANY quote
  // in a group has a missing/malformed date (an older, pre-migration quote,
  // for example) - Math.max propagates a single NaN to the whole group,
  // and comparing NaN in a sort callback is neither positive nor negative,
  // so the browser is free to leave that group wherever it originally was -
  // exactly the "sort doesn't seem to do anything" symptom. This skips any
  // date that fails to parse instead of letting one bad value poison the
  // whole comparison, and falls back to version number as a tiebreaker so
  // a genuinely dateless group still sorts predictably instead of randomly.
  const latestValidTime = (list) => list.reduce((max, q) => {
    const t = new Date(q.updatedDate || q.createdDate || 0).getTime();
    return isNaN(t) ? max : Math.max(max, t);
  }, 0);
  const highestVersion = (list) => list.reduce((max, q) => {
    const v = parseInt(String(q.version || '').replace(/[^0-9]/g, ''), 10);
    return isNaN(v) ? max : Math.max(max, v);
  }, 0);
  const filteredClients = Object.keys(groupedByClient)
    .filter(client => client.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const latestA = latestValidTime(groupedByClient[a]);
      const latestB = latestValidTime(groupedByClient[b]);
      if (latestA !== latestB) return latestB - latestA;
      return highestVersion(groupedByClient[b]) - highestVersion(groupedByClient[a]);
    });

  const filteredTrashed = trashedQuotes
    .filter(q => `${q.clientName} - ${q.location}`.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => new Date(b.trashedAt) - new Date(a.trashedAt));

  const filteredArchived = archivedQuotes
    .filter(q => `${q.clientName} - ${q.location}`.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => new Date(b.updatedDate) - new Date(a.updatedDate));

  const tabStyle = (active) => ({
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
    background: active ? '#d4af37' : '#2a2a2a',
    color: active ? '#000' : '#aaa',
    border: active ? 'none' : '1px solid #444'
  });

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <button onClick={() => { setCurrentView('menu'); setSearchQuery(''); setSelectedVersions(new Set()); }} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={24} color="#aaa" />
          </button>
          <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff', fontFamily: 'Georgia, serif' }}>Quote History</h2>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button onClick={() => setViewMode('active')} style={tabStyle(viewMode === 'active')}>Active ({activeQuotes.length})</button>
          <button onClick={() => setViewMode('trash')} style={tabStyle(viewMode === 'trash')}>Trash ({trashedQuotes.length})</button>
          <button onClick={() => setViewMode('archived')} style={tabStyle(viewMode === 'archived')}>Archived ({archivedQuotes.length})</button>
        </div>

        <div style={{ marginBottom: '32px', position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '12px', color: '#666' }} size={20} />
          <input
            type="text"
            placeholder="Search by client name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', paddingLeft: '40px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', borderRadius: '8px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white', fontSize: '16px' }}
          />
        </div>

        {/* ✅ UNDO: appears right after a delete so a mistake is recoverable in one tap */}
        {undoBuffer && (
          <div style={{ padding: '12px', marginBottom: '16px', background: '#3a2a1a', border: '2px solid #f59e0b', borderRadius: '8px' }}>
            <p style={{ color: '#fbbf24', fontWeight: 'bold', margin: '0 0 8px 0', fontSize: '14px' }}>
              ↩️ {undoBuffer.label}
            </p>
            <button
              onClick={undoLastDelete}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#f59e0b', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Undo Last Delete
            </button>
          </div>
        )}

        {/* ✅ BACKUP: keep an off-device copy; restore merges instead of replacing */}
        <div style={{ padding: '12px', marginBottom: '16px', background: '#1a2a2a', border: '1px solid #2a5a5a', borderRadius: '8px' }}>
          <p style={{ color: '#7dd3fc', fontWeight: 'bold', margin: '0 0 8px 0', fontSize: '13px' }}>
            🛟 Backup ({quotes.length} quote{quotes.length === 1 ? '' : 's'})
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={exportBackup}
              style={{ flex: '1 1 45%', padding: '10px', borderRadius: '6px', background: '#0e7490', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
            >
              ⬇️ Download
            </button>
            <button
              onClick={copyBackupToClipboard}
              style={{ flex: '1 1 45%', padding: '10px', borderRadius: '6px', background: '#0e7490', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
            >
              📋 Copy
            </button>
            <label
              style={{ flex: '1 1 100%', padding: '10px', borderRadius: '6px', background: '#334155', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', textAlign: 'center', display: 'block' }}
            >
              ⬆️ Restore from Backup File
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => { importBackup(e.target.files?.[0]); e.target.value = ''; }}
                style={{ display: 'none' }}
              />
            </label>
          </div>
          <p style={{ color: '#64748b', fontSize: '11px', margin: '8px 0 0 0' }}>
            Tip: tap Copy and paste into Notes or email it to yourself. Deleted quotes also sit in Trash for 7 days before they're gone for good.
          </p>
        </div>

        {viewMode === 'active' && selectedVersions.size > 0 && (
          <button onClick={() => {
            // ✅ Goes through the safe delete funnel: names what will be lost,
            // double-confirms if a whole client would vanish, and saves an undo snapshot
            const done = safeDeleteQuotes([...selectedVersions], `Deleted ${selectedVersions.size} selected version(s)`);
            if (done) {
              setSelectedVersions(new Set());
              alert('✅ Moved to Trash. If that was a mistake, use "Undo Last Delete" above, or restore it from the Trash tab within 7 days.');
            }
          }} style={{ width: '100%', padding: '12px', marginBottom: '16px', borderRadius: '8px', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
            Delete {selectedVersions.size} Selected
          </button>
        )}

        {loadError ? (
          <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
            <p style={{ color: '#f87171', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>⚠️ Could not load your quotes</p>
            <p style={{ color: '#888', fontSize: '13px' }}>{loadError}</p>
            <p style={{ color: '#666', fontSize: '12px', marginTop: '8px' }}>This is a sync problem, not missing data - check your connection and reopen the app.</p>
          </div>
        ) : !hasLoaded ? (
          <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
            <p style={{ color: '#888', fontSize: '18px' }}>Loading your quotes...</p>
          </div>
        ) : viewMode === 'active' ? (
          activeQuotes.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
              <p style={{ color: '#888', fontSize: '18px' }}>No quotes created yet</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
              <p style={{ color: '#888', fontSize: '18px' }}>No quotes found for "{searchQuery}"</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredClients.map(clientName => (
                <div key={clientName} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedClients({...expandedClients, [clientName]: !expandedClients[clientName]})}
                    style={{ width: '100%', padding: '16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <p style={{ fontWeight: 'bold', color: '#fff', fontSize: '18px', marginBottom: '4px' }}>{clientName}</p>
                      <p style={{ color: '#888', fontSize: '14px' }}>{groupedByClient[clientName].length} version(s)</p>
                    </div>
                    {expandedClients[clientName] ? <ChevronUp size={24} color="#d4af37" /> : <ChevronDown size={24} color="#d4af37" />}
                  </button>

                  {expandedClients[clientName] && (
                    <div style={{ background: '#1a1a1a', borderTop: '1px solid #444', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {groupedByClient[clientName].map(quote => (
                        <div key={quote.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#2a2a2a', borderRadius: '6px' }}>
                          <input
                            type="checkbox"
                            checked={selectedVersions.has(quote.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedVersions);
                              if (e.target.checked) {
                                newSet.add(quote.id);
                              } else {
                                newSet.delete(quote.id);
                              }
                              setSelectedVersions(newSet);
                            }}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                          <button
                            onClick={() => setSelectedQuote(quote)}
                            style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', paddingLeft: '0' }}
                          >
                            <p style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>{quote.quoteName}</p>
                            <p style={{ color: '#888', fontSize: '12px' }}>{quote.date}</p>
                          </button>
                          <button onClick={() => loadQuoteForEdit(quote)} style={{ padding: '6px', borderRadius: '4px', background: '#d4af37', color: '#000', border: 'none', cursor: 'pointer' }}>
                            <Edit2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : viewMode === 'trash' ? (
          filteredTrashed.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
              <p style={{ color: '#888', fontSize: '18px' }}>Trash is empty</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredTrashed.map(quote => {
                const remaining = daysRemaining(quote.trashedAt);
                return (
                  <div key={quote.id} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', padding: '14px' }}>
                    <p style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>{quote.quoteName || quote.clientName}</p>
                    <p style={{ color: '#888', fontSize: '12px', marginBottom: '10px' }}>
                      {quote.clientName} - {quote.location} • {remaining > 0 ? `${remaining} day${remaining === 1 ? '' : 's'} left before it's gone for good` : 'Being permanently deleted soon'}
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => restoreQuotes([quote.id])}
                        style={{ flex: 1, padding: '10px', borderRadius: '6px', background: '#4ade80', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <RotateCcw size={14} /> Restore
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Permanently delete "${quote.quoteName || quote.clientName}" right now? This cannot be undone.`)) {
                            permanentlyDeleteQuotes([quote.id]);
                          }
                        }}
                        style={{ padding: '10px 14px', borderRadius: '6px', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Trash2 size={14} /> Delete Forever
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          filteredArchived.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
              <p style={{ color: '#888', fontSize: '18px' }}>No archived quotes</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredArchived.map(quote => (
                <div key={quote.id} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>{quote.quoteName || quote.clientName}</p>
                    <p style={{ color: '#888', fontSize: '12px' }}>{quote.clientName} - {quote.location}</p>
                  </div>
                  <button
                    onClick={() => unarchiveQuoteLineage(quote)}
                    style={{ padding: '10px 14px', borderRadius: '6px', background: '#4ade80', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <RotateCcw size={14} /> Unarchive
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
