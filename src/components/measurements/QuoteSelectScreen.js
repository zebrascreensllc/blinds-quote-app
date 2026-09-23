import React, { useState } from 'react';

// The "pick which quote(s) to build a sheet from" screen. Receives the
// already-deduplicated (latest version per quote) list from the parent -
// this component doesn't touch the raw quotes array or dedup logic at all.
//
// onStartBlank is optional - only Bulk Measurements passes it (for the
// "client wants measurements before a quote exists" case), so the original
// Supplier Measurements flow renders exactly as it always has.
//
// ✅ FIX: at real scale (a real report: "after 1000 quotes it will be very
// very hard to find that option") this screen had two compounding problems -
// "Create Sheet" only ever appeared after scrolling past every single quote
// in the list, and there was no way to narrow the list down at all, so
// finding the right quotes to check in the first place meant scanning the
// whole thing top to bottom too. Fixed both without touching the actual
// multi-select logic (selectedQuoteIds/onToggleQuote are untouched - a
// search filter only changes which already-selectable rows are rendered,
// selections for quotes scrolled out of view are preserved):
//   1. A search box (same "type to narrow by client name" pattern History's
//      screen already uses) filters the visible list by client + location.
//   2. The Create Sheet button is now a sticky bar pinned to the bottom of
//      the viewport - reachable in one tap no matter how long the list is or
//      how far you've scrolled, exactly like a shopping-cart checkout bar.
export default function QuoteSelectScreen({ quotesList, selectedQuoteIds, onToggleQuote, onBack, onCreateSheet, creatingSheet, onStartBlank }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredQuotesList = searchQuery.trim()
    ? quotesList.filter(q => `${q.clientName} ${q.location}`.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : quotesList;

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px', paddingBottom: quotesList.length > 0 ? '96px' : '24px' }}>
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

        {quotesList.length > 0 && (
          <input
            type="text"
            placeholder="Search by client name or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '12px', marginBottom: '16px', borderRadius: '8px', fontSize: '14px', background: '#2a2a2a', border: '1px solid #555', color: 'white', boxSizing: 'border-box' }}
          />
        )}

        {selectedQuoteIds.size > 0 && (
          <p style={{ color: '#4ade80', fontSize: '12px', fontWeight: 'bold', marginBottom: '12px' }}>
            {selectedQuoteIds.size} quote{selectedQuoteIds.size === 1 ? '' : 's'} selected{searchQuery.trim() ? ' (some may be scrolled out of view by the search above - they stay selected)' : ''}
          </p>
        )}

        {quotesList.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center' }}>No quotes found.</p>
        ) : filteredQuotesList.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center' }}>No quotes match "{searchQuery}".</p>
        ) : (
          filteredQuotesList.map(q => {
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
      </div>

      {/* ✅ FIX: sticky bottom bar - always one tap away regardless of list
          length or scroll position, instead of requiring a scroll past every
          quote in the list first. */}
      {quotesList.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px', background: 'rgba(26,26,26,0.97)', borderTop: '1px solid #444', backdropFilter: 'blur(4px)' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <button onClick={onCreateSheet} disabled={creatingSheet} style={{ width: '100%', padding: '14px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '15px', cursor: creatingSheet ? 'default' : 'pointer', opacity: creatingSheet ? 0.6 : 1 }}>
              {creatingSheet ? 'Creating...' : `Create Sheet with ${selectedQuoteIds.size} Quote${selectedQuoteIds.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
