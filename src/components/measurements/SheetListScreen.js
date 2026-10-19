import React, { useState } from 'react';

const sheetTitle = (sheet) => (sheet.clientNames?.length ? sheet.clientNames.join(', ') : (sheet.address || 'Untitled'));

// The "list of saved sheets" screen. Purely presentational - all state
// (sheets array) and mutations (open/delete/create/export) live in the parent
// container; this component only renders and calls back up. The only state
// kept here is throwaway UI state: whether combine-mode is on, which sheets
// are ticked, and the search text.
//
// onExportCombined is optional - when it isn't passed (any screen that
// doesn't support it), the combine button simply doesn't render.
export default function SheetListScreen({ sheets, hasLoaded, loadingSlow, loadError, syncStatus, onBack, onNewSheet, onOpenSheet, onDeleteSheet, onExportCombined }) {
  // Combine mode: tap sheets to tick them (in the order you tap - that order
  // is the order their windows appear in the downloaded file), then download
  // them as ONE Excel file for the supplier.
  const [combineMode, setCombineMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Ignore ticks for sheets that have since been deleted (e.g. on another device).
  const sheetsById = new Map(sheets.map(s => [s.id, s]));
  const validSelectedIds = selectedIds.filter(id => sheetsById.has(id));
  const selectedWindowCount = validSelectedIds.reduce((sum, id) => sum + (sheetsById.get(id).rows?.length || 0), 0);

  const toggleSelected = (id) => setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const exitCombineMode = () => { setCombineMode(false); setSelectedIds([]); };

  const handleExport = async () => {
    if (exporting || validSelectedIds.length < 2) return;
    setExporting(true);
    try {
      await onExportCombined(validSelectedIds);
    } finally {
      setExporting(false);
    }
  };

  const query = searchQuery.trim().toLowerCase();
  const sortedSheets = sheets.slice().sort((a, b) => new Date(b.updatedDate) - new Date(a.updatedDate));
  const visibleSheets = query
    ? sortedSheets.filter(s => `${(s.clientNames || []).join(' ')} ${s.address || ''}`.toLowerCase().includes(query))
    : sortedSheets;

  const showBottomBar = combineMode && hasLoaded && !loadError;

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px', paddingBottom: showBottomBar ? '110px' : '24px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <button onClick={onBack} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer', color: '#fff' }}>← Back</button>
          <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold', fontFamily: 'Georgia, serif' }}>Supplier Measurements</h2>
          <div style={{ width: '60px' }} />
        </div>

        {!combineMode && (
          <button
            onClick={onNewSheet}
            style={{ width: '100%', padding: '20px', borderRadius: '8px', background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', color: '#d4af37', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginBottom: '16px' }}
          >
            + New Measurement Sheet
          </button>
        )}

        {onExportCombined && !combineMode && sheets.length >= 2 && (
          <button
            onClick={() => setCombineMode(true)}
            style={{ width: '100%', padding: '14px', borderRadius: '8px', background: 'transparent', border: '1px solid #4ade80', color: '#4ade80', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', marginBottom: '24px' }}
          >
            ☑ Combine sheets into one Excel
          </button>
        )}
        {!combineMode && !(onExportCombined && sheets.length >= 2) && <div style={{ marginBottom: '8px' }} />}

        {combineMode && (
          <div style={{ padding: '12px', marginBottom: '16px', background: '#1a3a2a', border: '1px solid #4ade80', borderRadius: '8px' }}>
            <p style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>Combine sheets</p>
            <p style={{ color: '#ccc', fontSize: '12px' }}>Tap the sheets to include. Their windows go into one Excel file in the order you tap (the number shows the order). Every selected sheet must be complete.</p>
          </div>
        )}

        {syncStatus && !syncStatus.ok && (
          <div style={{ padding: '12px', marginBottom: '16px', background: '#3a1a1a', border: '1px solid #ef4444', borderRadius: '8px' }}>
            <p style={{ color: '#f87171', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
              ⚠️ {syncStatus.failedCount} change{syncStatus.failedCount > 1 ? 's' : ''} not yet saved to the cloud
            </p>
            <p style={{ color: '#ccc', fontSize: '12px' }}>{syncStatus.lastError} — your local copy is safe, and this keeps retrying automatically.</p>
          </div>
        )}

        {hasLoaded && !loadError && sheets.length > 5 && (
          <input
            type="text"
            placeholder="Search by client name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '12px', marginBottom: '16px', borderRadius: '8px', fontSize: '14px', background: '#2a2a2a', border: '1px solid #555', color: 'white', boxSizing: 'border-box' }}
          />
        )}

        {loadError ? (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <p style={{ color: '#f87171', fontSize: '15px', fontWeight: 'bold', marginBottom: '8px' }}>⚠️ Could not load your sheets</p>
            <p style={{ color: '#888', fontSize: '13px' }}>{loadError}</p>
            <p style={{ color: '#666', fontSize: '12px', marginTop: '8px' }}>This is a sync problem, not missing data - check your connection and reopen the app.</p>
          </div>
        ) : !hasLoaded ? (
          <div style={{ textAlign: 'center', padding: '8px 16px' }}>
            <p style={{ color: '#888', fontSize: '14px' }}>Loading your measurement sheets...</p>
            {/* ✅ NEW: a real report of this spinner sometimes sitting for
                1-2 minutes with no way out. A reload is also the actual fix
                for the most likely cause (a stale cross-tab lock from a
                previous session on this device). */}
            {loadingSlow && (
              <div style={{ marginTop: '16px' }}>
                <p style={{ color: '#f59e0b', fontSize: '13px', marginBottom: '10px' }}>This is taking longer than usual.</p>
                <button
                  onClick={() => window.location.reload()}
                  style={{ padding: '10px 20px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
                >
                  🔄 Reload App
                </button>
              </div>
            )}
          </div>
        ) : sheets.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', fontSize: '14px' }}>No measurement sheets yet.</p>
        ) : visibleSheets.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', fontSize: '14px' }}>No sheets match "{searchQuery}".</p>
        ) : (
          visibleSheets.map(sheet => {
            const orderIdx = validSelectedIds.indexOf(sheet.id);
            const checked = orderIdx !== -1;
            const info = (
              <>
                <p style={{ color: checked ? '#4ade80' : '#d4af37', fontWeight: 'bold', fontSize: '15px', marginBottom: '4px' }}>{sheetTitle(sheet)}</p>
                {sheet.address && <p style={{ color: '#888', fontSize: '12px' }}>{sheet.address}</p>}
                <p style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>{sheet.rows.length} windows • {new Date(sheet.updatedDate).toLocaleDateString()}</p>
              </>
            );
            if (combineMode) {
              return (
                <label key={sheet.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: checked ? '#1a3a2a' : '#2a2a2a', border: checked ? '1px solid #4ade80' : '1px solid #444', borderRadius: '8px', padding: '16px', marginBottom: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSelected(sheet.id)} style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>{info}</div>
                  {checked && (
                    <span style={{ minWidth: '26px', height: '26px', borderRadius: '13px', background: '#4ade80', color: '#000', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{orderIdx + 1}</span>
                  )}
                </label>
              );
            }
            return (
              <div key={sheet.id} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', padding: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <button onClick={() => onOpenSheet(sheet.id)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {info}
                </button>
                <button onClick={() => onDeleteSheet(sheet.id)} style={{ padding: '10px', borderRadius: '6px', background: '#b91c1c', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '12px' }}>Delete</button>
              </div>
            );
          })
        )}
      </div>

      {/* Sticky so the download is one tap away however long the sheet list is. */}
      {showBottomBar && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px', background: 'rgba(26,26,26,0.97)', borderTop: '1px solid #444' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', gap: '10px' }}>
            <button
              onClick={exitCombineMode}
              disabled={exporting}
              style={{ padding: '14px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid #666', color: '#ccc', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || validSelectedIds.length < 2}
              style={{ flex: 1, padding: '14px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: (exporting || validSelectedIds.length < 2) ? 'default' : 'pointer', opacity: (exporting || validSelectedIds.length < 2) ? 0.6 : 1 }}
            >
              {exporting
                ? 'Preparing...'
                : validSelectedIds.length < 2
                  ? `Select at least 2 sheets (${validSelectedIds.length} selected)`
                  : `📊 Download Combined Excel (${validSelectedIds.length} sheets, ${selectedWindowCount} windows)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
