import React from 'react';

// The "pick which quote(s) to build a sheet from" screen. Receives the
// already-deduplicated (latest version per quote) list from the parent -
// this component doesn't touch the raw quotes array or dedup logic at all.
//
// onStartBlank is optional - only Bulk Measurements passes it (for the
// "client wants measurements before a quote exists" case), so the original
// Supplier Measurements flow renders exactly as it always has.
export default function QuoteSelectScreen({ quotesList, selectedQuoteIds, onToggleQuote, onBack, onCreateSheet, creatingSheet, onStartBlank }) {
  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <button onClick={onBack} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer', color: '#fff' }}>← Back</button>
          <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>Select Quote(s)</h2>
          <div style={{ width: '60px' }} />
        </div>

        <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '16px' }}>
          Pick one or more quotes to combine into a single supplier sheet (handy when several clients confirm the same week).
        </p>

        {onStartBlank && (
          <button
            onClick={onStartBlank}
            style={{ width: '100%', padding: '12px', marginBottom: '16px', borderRadius: '8px', background: 'transparent', border: '2px dashed #666', color: '#aaa', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
          >
            Don't have a quote yet? Start blank →
          </button>
        )}

        {quotesList.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center' }}>No quotes found.</p>
        ) : (
          quotesList.map(q => {
            const checked = selectedQuoteIds.has(q.id);
            return (
              <label key={q.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '8px', background: checked ? '#1a3a2a' : '#2a2a2a', border: checked ? '1px solid #4ade80' : '1px solid #444', marginBottom: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={checked} onChange={() => onToggleQuote(q.id)} style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }} />
                <div>
                  <p style={{ color: checked ? '#4ade80' : '#fff', fontWeight: 'bold', fontSize: '14px' }}>{q.clientName} — {q.location} ({q.version})</p>
                  <p style={{ color: '#888', fontSize: '12px' }}>{q.rooms?.length || 0} rooms • Updated {new Date(q.updatedDate).toLocaleDateString()}</p>
                </div>
              </label>
            );
          })
        )}

        {quotesList.length > 0 && (
          <button onClick={onCreateSheet} disabled={creatingSheet} style={{ width: '100%', padding: '14px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '15px', cursor: creatingSheet ? 'default' : 'pointer', opacity: creatingSheet ? 0.6 : 1, marginTop: '16px' }}>
            {creatingSheet ? 'Creating...' : `Create Sheet with ${selectedQuoteIds.size} Quote${selectedQuoteIds.size === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </div>
  );
}
