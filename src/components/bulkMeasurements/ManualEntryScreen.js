import React, { useState } from 'react';

const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', fontSize: '16px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white', boxSizing: 'border-box' };

// A blank starting point for a sheet with no quote behind it yet - the
// client-wants-measurements-before-a-quote case. Just enough to name the
// sheet (Client Name required for the CSV/Excel "Client name" column,
// Address optional) before landing in the same editor a quote-derived
// sheet uses, with one blank window ready to fill in.
export default function ManualEntryScreen({ onBack, onCreate, creatingSheet }) {
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <button onClick={onBack} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer', color: '#fff' }}>← Back</button>
          <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>Start Without a Quote</h2>
          <div style={{ width: '60px' }} />
        </div>

        <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '20px' }}>
          For a client who wants precise measurements taken before deciding on a quote. You'll add windows one at a time on the next screen.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          <input type="text" placeholder="Client Name" value={clientName} onChange={(e) => setClientName(e.target.value)} style={inputStyle} autoFocus />
          <input type="text" placeholder="Address (optional)" value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
        </div>

        <button
          onClick={() => onCreate(clientName, address)}
          disabled={creatingSheet || !clientName.trim()}
          style={{ width: '100%', padding: '14px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '15px', cursor: (creatingSheet || !clientName.trim()) ? 'default' : 'pointer', opacity: (creatingSheet || !clientName.trim()) ? 0.6 : 1 }}
        >
          {creatingSheet ? 'Creating...' : 'Create Sheet'}
        </button>
      </div>
    </div>
  );
}
