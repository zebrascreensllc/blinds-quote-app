import React from 'react';
import { ArrowLeft, Search, Edit2, ChevronDown, ChevronUp } from 'lucide-react';

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
  quotes,
  safeDeleteQuotes,
  searchQuery,
  selectedVersions,
  setCurrentView,
  setExpandedClients,
  setSearchQuery,
  setSelectedQuote,
  setSelectedVersions,
  undoBuffer,
  undoLastDelete
}) {
  const activeQuotes = quotes.filter(q => !q.archived);
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

  const filteredClients = Object.keys(groupedByClient).filter(client =>
    client.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <button onClick={() => { setCurrentView('menu'); setSearchQuery(''); setSelectedVersions(new Set()); }} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={24} color="#aaa" />
          </button>
          <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff', fontFamily: 'Georgia, serif' }}>Quote History</h2>
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
            Tip: tap Copy and paste into Notes or email it to yourself. The app also keeps 7 days of automatic backups on this device.
          </p>
        </div>

        {selectedVersions.size > 0 && (
          <button onClick={() => {
            // ✅ Goes through the safe delete funnel: names what will be lost,
            // double-confirms if a whole client would vanish, and saves an undo snapshot
            const done = safeDeleteQuotes([...selectedVersions], `Deleted ${selectedVersions.size} selected version(s)`);
            if (done) {
              setSelectedVersions(new Set());
              alert('✅ Deleted. If that was a mistake, use "Undo Last Delete" at the top of this screen.');
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
        ) : activeQuotes.length === 0 ? (
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
        )}
      </div>
    </div>
  );
}
