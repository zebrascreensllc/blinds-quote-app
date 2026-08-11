import React from 'react';

// The "list of saved sheets" screen. Purely presentational - all state
// (sheets array) and mutations (open/delete/create) live in the parent
// container; this component only renders and calls back up.
export default function SheetListScreen({ sheets, onBack, onNewSheet, onOpenSheet, onDeleteSheet }) {
  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <button onClick={onBack} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer', color: '#fff' }}>← Back</button>
          <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold', fontFamily: 'Georgia, serif' }}>Supplier Measurements</h2>
          <div style={{ width: '60px' }} />
        </div>

        <button
          onClick={onNewSheet}
          style={{ width: '100%', padding: '20px', borderRadius: '8px', background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', color: '#d4af37', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginBottom: '24px' }}
        >
          + New Measurement Sheet
        </button>

        {sheets.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', fontSize: '14px' }}>No measurement sheets yet.</p>
        ) : (
          sheets.slice().sort((a, b) => new Date(b.updatedDate) - new Date(a.updatedDate)).map(sheet => (
            <div key={sheet.id} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', padding: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <button onClick={() => onOpenSheet(sheet.id)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
                <p style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '15px', marginBottom: '4px' }}>{sheet.address || 'Untitled'}</p>
                <p style={{ color: '#888', fontSize: '12px' }}>{sheet.sourceQuoteNames?.join(', ')}</p>
                <p style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>{sheet.rows.length} windows • {new Date(sheet.updatedDate).toLocaleDateString()}</p>
              </button>
              <button onClick={() => onDeleteSheet(sheet.id)} style={{ padding: '10px', borderRadius: '6px', background: '#b91c1c', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '12px' }}>Delete</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
