import React, { useState } from 'react';

const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', fontSize: '16px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white', boxSizing: 'border-box' };
const stepBtnStyle = { width: '40px', height: '44px', borderRadius: '8px', background: 'rgba(212,175,55,0.2)', border: '1px solid #d4af37', color: '#d4af37', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0 };

const MAX_WINDOWS_PER_ROOM = 50;

const newRoomEntry = () => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: '', count: '1' });

// A blank starting point for a sheet with no quote behind it yet - the
// client-wants-measurements-before-a-quote case. Client Name (required for
// the CSV/Excel "Client name" column), Address (optional), then a quick
// room list ("Living Room" x5, "BF Nook" x3...) so a 40-window job doesn't
// mean tapping "+ Add Window" 40 times. Each room becomes that many rows
// sharing one locationBase - recomputeLocationIndices then numbers them
// "Living Room 1".."Living Room 5" exactly like a hand-named window would.
// Leaving every room blank keeps the old behavior (one blank window).
// "+ Add Window" still works on the next screen for anything missed.
export default function ManualEntryScreen({ onBack, onCreate, creatingSheet }) {
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [rooms, setRooms] = useState(() => [newRoomEntry()]);

  const updateRoom = (key, patch) => setRooms(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const removeRoom = (key) => setRooms(prev => (prev.length <= 1 ? [newRoomEntry()] : prev.filter(r => r.key !== key)));
  const stepCount = (key, delta) => setRooms(prev => prev.map(r => {
    if (r.key !== key) return r;
    const n = Math.min(MAX_WINDOWS_PER_ROOM, Math.max(1, (parseInt(r.count, 10) || 0) + delta));
    return { ...r, count: String(n) };
  }));

  // Only named rooms count; a blank/0 count on a named room is treated as 1
  // (a named room with zero windows makes no sense, and silently dropping a
  // room the user typed would be worse than giving it one window).
  // Names are matched case-insensitively and merged under the first spelling
  // typed: the size/fabric mismatch checks group windows by exact room name,
  // so "Living room" + "Living Room" as two entries would silently become two
  // unrelated rooms and never get compared against each other.
  const roomPlan = [];
  rooms.forEach(r => {
    const name = r.name.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const count = Math.min(MAX_WINDOWS_PER_ROOM, Math.max(1, parseInt(r.count, 10) || 1));
    const existing = roomPlan.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) existing.count = Math.min(MAX_WINDOWS_PER_ROOM, existing.count + count);
    else roomPlan.push({ name, count });
  });
  const totalWindows = roomPlan.reduce((sum, r) => sum + r.count, 0);
  const disabled = creatingSheet || !clientName.trim();

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px', paddingBottom: '96px' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <button onClick={onBack} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer', color: '#fff' }}>← Back</button>
          <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>Start Without a Quote</h2>
          <div style={{ width: '60px' }} />
        </div>

        <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '20px' }}>
          For a client who wants precise measurements taken before deciding on a quote. List the rooms and how many windows each has — the windows are created for you, numbered (Living Room 1, Living Room 2...). You can still add or delete windows on the next screen.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          <input type="text" placeholder="Client Name" value={clientName} onChange={(e) => setClientName(e.target.value)} style={inputStyle} autoFocus />
          <input type="text" placeholder="Address (optional)" value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ color: '#d4af37', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Rooms</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
          {rooms.map((room, idx) => (
            <div key={room.key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="text"
                placeholder={idx === 0 ? 'e.g. Living Room' : 'Room name'}
                value={room.name}
                autoFocus={idx > 0 && idx === rooms.length - 1}
                onChange={(e) => updateRoom(room.key, { name: e.target.value })}
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}
              />
              <button type="button" onClick={() => stepCount(room.key, -1)} style={stepBtnStyle} aria-label="Fewer windows">−</button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={room.count}
                onChange={(e) => updateRoom(room.key, { count: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })}
                onBlur={() => stepCount(room.key, 0)}
                style={{ ...inputStyle, width: '48px', padding: '12px 4px', textAlign: 'center', flexShrink: 0 }}
                aria-label="Number of windows"
              />
              <button type="button" onClick={() => stepCount(room.key, 1)} style={stepBtnStyle} aria-label="More windows">+</button>
              <button type="button" onClick={() => removeRoom(room.key)} style={{ ...stepBtnStyle, width: '32px', background: 'transparent', border: 'none', color: '#f87171' }} aria-label="Remove room">✕</button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRooms(prev => [...prev, newRoomEntry()])}
          style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'transparent', border: '1px dashed #d4af37', color: '#d4af37', fontSize: '14px', cursor: 'pointer', marginBottom: '20px' }}
        >
          + Add Room
        </button>

      </div>

      {/* Sticky so Create Sheet stays reachable however many rooms are listed. */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px', background: 'rgba(26,26,26,0.97)', borderTop: '1px solid #444' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          <button
            onClick={() => onCreate(clientName, address, roomPlan)}
            disabled={disabled}
            style={{ width: '100%', padding: '14px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '15px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}
          >
            {creatingSheet
              ? 'Creating...'
              : totalWindows > 0
                ? `Create Sheet (${totalWindows} window${totalWindows === 1 ? '' : 's'})`
                : 'Create Sheet (1 blank window)'}
          </button>
        </div>
      </div>
    </div>
  );
}
