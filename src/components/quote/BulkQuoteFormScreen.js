import React, { useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { autoDetectBlindTypes, getHeightSurcharge, getWidthSurcharge } from '../../utils/pricing';

const BLIND_TYPES = ['Roller', 'Zebra', 'Roman', 'Bamboo (Roller)', 'Bamboo (Roman)'];

const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', fontSize: '13px', background: '#1a1a1a', border: '1px solid #444', color: 'white', boxSizing: 'border-box' };
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const labelStyle = { fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' };
const cellStyle = { padding: '6px', fontSize: '12px', color: '#ccc', borderBottom: '1px solid #333', verticalAlign: 'top' };
const headerCellStyle = { padding: '8px 6px', fontSize: '11px', fontWeight: 'bold', color: '#fff', textAlign: 'left', borderBottom: '1px solid #444', whiteSpace: 'nowrap' };

// Generic bulk-tool checklist, same shared pattern as BulkEditorScreen.js
// (Bulk Measurements) - reused here since the interaction is identical,
// just over rooms or window groups instead of measurement rows.
function RowChecklist({ items, selectedIds, toggleInSet, setSelectedIds, renderLabel, accentColor }) {
  if (items.length === 0) {
    return <p style={{ color: '#888', fontSize: '12px' }}>Nothing to select yet.</p>;
  }
  return (
    <>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
        <button onClick={() => setSelectedIds(new Set(items.map(i => i.key)))} style={{ fontSize: '12px', color: accentColor, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Select All</button>
        <button onClick={() => setSelectedIds(new Set())} style={{ fontSize: '12px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Clear</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto', marginBottom: '10px', border: '1px solid #333', borderRadius: '6px', padding: '6px' }}>
        {items.map(item => {
          const checked = selectedIds.has(item.key);
          return (
            <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', background: checked ? 'rgba(255,255,255,0.08)' : 'transparent', cursor: 'pointer' }}>
              <input type="checkbox" checked={checked} onChange={() => toggleInSet(item.key, selectedIds, setSelectedIds)} style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: checked ? accentColor : '#ccc' }}>{renderLabel(item)}</span>
            </label>
          );
        })}
      </div>
    </>
  );
}

function BulkToolPanel({ title, icon, bg, border, accentColor, isOpen, onToggle, children }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '8px', marginBottom: '16px', overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: accentColor, fontWeight: 'bold', fontSize: '13px' }}>{icon} {title}</span>
        <span style={{ color: '#888', fontSize: '14px' }}>{isOpen ? '▼' : '▶'}</span>
      </button>
      {isOpen && <div style={{ padding: '0 16px 16px 16px' }}>{children}</div>}
    </div>
  );
}

// A bulk-first alternative to QuoteFormScreen.js for creating a NEW quote,
// trialed alongside it. Deliberately reuses App.js's real formData/
// generateQuote UNCHANGED - a quote made here is byte-identical in shape to
// one made through the regular form, uses the exact same pricing engine,
// and lands in the exact same Firestore collection - it shows up in Quote
// History, Statistics, Order Analysis exactly like any other quote, with no
// extra code needed anywhere else. Only the entry UX differs: rooms only
// take Qty/Width/Height directly, everything else (fabric/motor/solar) is
// bulk-assigned in one pass instead of per-room/per-window-group, same
// "why is this so repetitive" fix as Bulk Measurements.
export default function BulkQuoteFormScreen({ formData, setFormData, generateQuote, resetForm, editingQuote, setEditingQuote, setCurrentView }) {
  // Fabric applies at the ROOM level (matches the existing data model -
  // room.fabricInput, not per window group). Motor and Solar apply at the
  // WINDOW GROUP level, keyed the same way the rest of the app keys window
  // groups (`${room.id}_${groupIndex}`), since group ids are only unique
  // within their own room.
  const [fabricSelectedRoomIds, setFabricSelectedRoomIds] = useState(new Set());
  const [motorSelectedKeys, setMotorSelectedKeys] = useState(new Set());
  const [solarSelectedKeys, setSolarSelectedKeys] = useState(new Set());

  const [bulkFabricInput, setBulkFabricInput] = useState('');
  // 'fabric' = exact fabric number, 'blindType' = client hasn't picked a
  // fabric yet, so pricing falls back to a Min/Max range for the selected
  // type(s) - same two modes as the regular Quote Generator's bulk tool.
  const [bulkMode, setBulkMode] = useState('fabric');
  const [bulkBlindTypes, setBulkBlindTypes] = useState([]);
  const [bulkMotorValue, setBulkMotorValue] = useState('Motor');
  const [bulkSolarValue, setBulkSolarValue] = useState(false);

  const [showFabricTool, setShowFabricTool] = useState(false);
  const [showMotorTool, setShowMotorTool] = useState(false);
  const [showSolarTool, setShowSolarTool] = useState(false);

  // ✅ NEW: parity with the original Quote Generator's per-window-group
  // Surcharge Override - collapsed by default, same as there. Keyed
  // `${room.id}_${groupIndex}` like the rest of this screen's per-group state.
  const [expandedSurchargeOverride, setExpandedSurchargeOverride] = useState(new Set());

  const toggleInSet = (key, currentSet, setter) => {
    const s = new Set(currentSet);
    if (s.has(key)) s.delete(key); else s.add(key);
    setter(s);
  };

  // ---- Room / window group structure (Qty/Width/Height only) ----
  const addRoom = () => {
    const newRoomId = Math.max(...formData.rooms.map(r => r.id), 0) + 1;
    setFormData({
      ...formData,
      rooms: [...formData.rooms, {
        id: newRoomId, name: '', fabricInput: '', blindTypes: ['Roller'],
        windowGroups: [{ id: 1, quantity: '', width: '', height: '', controlType: 'Manual', solar: false, mount: 'Inside', surchargeOverride: null }]
      }]
    });
  };

  const deleteRoom = (roomIndex) => {
    const newRooms = [...formData.rooms];
    newRooms.splice(roomIndex, 1);
    setFormData({ ...formData, rooms: newRooms });
  };

  const updateRoomName = (roomIndex, name) => {
    const newRooms = [...formData.rooms];
    newRooms[roomIndex].name = name;
    setFormData({ ...formData, rooms: newRooms });
  };

  const addWindowGroup = (roomIndex) => {
    const newRooms = [...formData.rooms];
    const group = newRooms[roomIndex].windowGroups;
    const newId = Math.max(...group.map(w => w.id), 0) + 1;
    group.push({ id: newId, quantity: '', width: '', height: '', controlType: 'Manual', solar: false, mount: 'Inside', surchargeOverride: null });
    setFormData({ ...formData, rooms: newRooms });
  };

  const deleteWindowGroup = (roomIndex, groupIndex) => {
    const newRooms = [...formData.rooms];
    newRooms[roomIndex].windowGroups.splice(groupIndex, 1);
    setFormData({ ...formData, rooms: newRooms });
  };

  const updateWindowGroupField = (roomIndex, groupIndex, field, value) => {
    const newRooms = [...formData.rooms];
    newRooms[roomIndex].windowGroups[groupIndex][field] = value;
    setFormData({ ...formData, rooms: newRooms });
  };

  // ---- Bulk assign fabric (room-level, matches the existing data model) ----
  const roomItems = formData.rooms.map((room, idx) => ({ key: room.id, room, idx }));

  const applyBulkFabric = () => {
    if (fabricSelectedRoomIds.size === 0) { alert('Select at least one room first.'); return; }

    let newRooms;
    let appliedLabel;

    if (bulkMode === 'fabric') {
      const fabricValue = bulkFabricInput.trim();
      if (!fabricValue) { alert('Enter a fabric number first.'); return; }
      const detectedTypes = autoDetectBlindTypes(fabricValue);
      newRooms = formData.rooms.map(room =>
        fabricSelectedRoomIds.has(room.id) ? { ...room, fabricInput: fabricValue, blindTypes: detectedTypes } : room
      );
      appliedLabel = `fabric "${fabricValue}"`;
    } else {
      if (bulkBlindTypes.length === 0) { alert('Select at least one blind type first.'); return; }
      // Blind-type-only: leave fabricInput blank so pricing uses a Min/Max
      // range for these types instead of one exact fabric price - same
      // fallback behavior as the regular Quote Generator's bulk tool.
      newRooms = formData.rooms.map(room =>
        fabricSelectedRoomIds.has(room.id) ? { ...room, fabricInput: '', blindTypes: [...bulkBlindTypes] } : room
      );
      appliedLabel = `blind type "${bulkBlindTypes.join(', ')}" (Min/Max estimate, no exact fabric)`;
    }

    const count = fabricSelectedRoomIds.size;
    setFormData({ ...formData, rooms: newRooms });
    setBulkFabricInput('');
    setBulkBlindTypes([]);
    setFabricSelectedRoomIds(new Set());
    alert(`Applied ${appliedLabel} to ${count} room${count > 1 ? 's' : ''}.`);
  };

  // ---- Bulk assign motor / solar (window-group-level) ----
  const allGroupItems = [];
  formData.rooms.forEach(room => {
    room.windowGroups.forEach((group, groupIndex) => {
      allGroupItems.push({ key: `${room.id}_${groupIndex}`, room, group, groupIndex });
    });
  });
  const motorGroupItems = allGroupItems.filter(i => i.group.controlType === 'Motor');

  const applyBulkMotor = () => {
    if (motorSelectedKeys.size === 0) { alert('Select at least one window group first.'); return; }
    const newRooms = formData.rooms.map(room => ({
      ...room,
      windowGroups: room.windowGroups.map((group, groupIndex) => {
        const key = `${room.id}_${groupIndex}`;
        if (!motorSelectedKeys.has(key)) return group;
        const patch = { controlType: bulkMotorValue };
        // Manual doesn't support Solar - same rule enforced elsewhere in
        // the app (Solar checkbox only shows for Motor windows).
        if (bulkMotorValue !== 'Motor') patch.solar = false;
        return { ...group, ...patch };
      })
    }));
    setFormData({ ...formData, rooms: newRooms });
    const count = motorSelectedKeys.size;
    setMotorSelectedKeys(new Set());
    alert(`Set ${count} window group${count > 1 ? 's' : ''} to "${bulkMotorValue}".`);
  };

  const applyBulkSolar = () => {
    if (solarSelectedKeys.size === 0) { alert('Select at least one motorized window group first.'); return; }
    const newRooms = formData.rooms.map(room => ({
      ...room,
      windowGroups: room.windowGroups.map((group, groupIndex) => {
        const key = `${room.id}_${groupIndex}`;
        if (!solarSelectedKeys.has(key)) return group;
        return { ...group, solar: bulkSolarValue };
      })
    }));
    setFormData({ ...formData, rooms: newRooms });
    const count = solarSelectedKeys.size;
    setSolarSelectedKeys(new Set());
    alert(`Set Solar = ${bulkSolarValue ? 'Yes' : 'No'} for ${count} window group${count > 1 ? 's' : ''}.`);
  };

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', paddingBottom: '48px', padding: '32px 16px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <button onClick={() => { setCurrentView('menu'); resetForm(); setEditingQuote(null); }} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={24} color="#aaa" />
          </button>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', fontFamily: 'Georgia, serif' }}>{editingQuote ? 'Edit Quote' : 'Quote Create'}</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
          <input type="text" placeholder="Client Name" value={formData.clientName} onChange={(e) => setFormData({ ...formData, clientName: e.target.value })} style={{ ...inputStyle, fontSize: '16px', padding: '12px' }} />
          <input type="tel" placeholder="Client Phone" value={formData.clientPhone} onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })} style={{ ...inputStyle, fontSize: '16px', padding: '12px' }} />
          <input type="text" placeholder="Client Address" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} style={{ ...inputStyle, fontSize: '16px', padding: '12px' }} />
          <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} style={{ ...inputStyle, fontSize: '16px', padding: '12px' }} />
        </div>

        {/* 4. Rooms - name + Qty/Width/Height only */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>Rooms</p>
        {formData.rooms.map((room, roomIndex) => (
          <div key={room.id} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input type="text" placeholder="Room Name" value={room.name} onChange={(e) => updateRoomName(roomIndex, e.target.value)} style={{ ...inputStyle, fontWeight: 'bold' }} />
              <button onClick={() => deleteRoom(roomIndex)} style={{ padding: '10px', borderRadius: '6px', background: '#b91c1c', border: 'none', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
                <Trash2 size={16} />
              </button>
            </div>

            {room.windowGroups.map((group, groupIndex) => {
              // ✅ NEW: parity with the original Quote Generator's per-window-
              // group Surcharge Override - same collapsed-by-default panel,
              // same key shape, same auto-calc preview + Reset to Auto.
              const surchargeKey = `${room.id}_${groupIndex}`;
              const isSurchargeExpanded = expandedSurchargeOverride.has(surchargeKey);
              const toggleSurchargeSection = () => {
                const s = new Set(expandedSurchargeOverride);
                if (s.has(surchargeKey)) s.delete(surchargeKey); else s.add(surchargeKey);
                setExpandedSurchargeOverride(s);
              };
              return (
                <div key={group.id} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'start', marginBottom: '6px' }}>
                    <div>
                      {groupIndex === 0 && <label style={labelStyle}>Qty</label>}
                      <input type="number" placeholder="Qty" value={group.quantity} onChange={(e) => updateWindowGroupField(roomIndex, groupIndex, 'quantity', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      {groupIndex === 0 && <label style={labelStyle}>Width</label>}
                      <input type="text" placeholder="Width" value={group.width} onChange={(e) => updateWindowGroupField(roomIndex, groupIndex, 'width', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      {groupIndex === 0 && <label style={labelStyle}>Height</label>}
                      <input type="text" placeholder="Height" value={group.height} onChange={(e) => updateWindowGroupField(roomIndex, groupIndex, 'height', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      {groupIndex === 0 && <label style={labelStyle}>&nbsp;</label>}
                      <button onClick={() => deleteWindowGroup(roomIndex, groupIndex)} style={{ padding: '10px', borderRadius: '6px', background: '#444', border: 'none', color: '#f87171', cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div style={{ borderRadius: '6px', border: '1px solid #4a6a4a', overflow: 'hidden' }}>
                    <button onClick={toggleSurchargeSection} style={{ width: '100%', textAlign: 'left', background: '#2a3a2a', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#aaa' }}>Surcharge Override (Optional){typeof group.surchargeOverride === 'number' && ` — Overridden: $${group.surchargeOverride.toFixed(0)}`}</span>
                      <span style={{ color: '#888', fontSize: '12px' }}>{isSurchargeExpanded ? '▼' : '▶'}</span>
                    </button>
                    {isSurchargeExpanded && (
                      <div style={{ padding: '8px', background: '#2a3a2a' }}>
                        <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                          Auto: ${(() => {
                            try {
                              const widthVal = (group.width || '').trim();
                              const heightVal = (group.height || '').trim();
                              const w = widthVal ? getWidthSurcharge(widthVal) : 0;
                              const h = heightVal ? getHeightSurcharge(heightVal) : 0;
                              const total = w + h;
                              return isNaN(total) ? '0' : total.toFixed(0);
                            } catch (e) {
                              console.error('Surcharge calc error:', e);
                              return '0';
                            }
                          })()} {typeof group.surchargeOverride === 'number' && `→ Overridden: $${group.surchargeOverride.toFixed(0)}`}
                        </p>
                        <input
                          type="number"
                          placeholder="Leave blank to use auto-calculated"
                          value={typeof group.surchargeOverride === 'number' ? group.surchargeOverride : ''}
                          onChange={(e) => updateWindowGroupField(roomIndex, groupIndex, 'surchargeOverride', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', fontSize: '12px', background: '#0a0a0a', border: '1px solid #555', color: 'white', marginBottom: '6px', boxSizing: 'border-box' }}
                        />
                        <button onClick={() => updateWindowGroupField(roomIndex, groupIndex, 'surchargeOverride', null)} style={{ fontSize: '10px', padding: '4px 8px', background: 'transparent', color: '#888', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}>Reset to Auto</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <button onClick={() => addWindowGroup(roomIndex)} style={{ width: '100%', padding: '10px', marginTop: '4px', borderRadius: '6px', color: '#888', fontWeight: 'bold', fontSize: '13px', background: 'transparent', border: '2px dashed #555', cursor: 'pointer' }}>
              + Add Window Group
            </button>
          </div>
        ))}
        <button onClick={addRoom} style={{ width: '100%', padding: '14px', borderRadius: '8px', color: '#888', fontWeight: 'bold', fontSize: '15px', background: 'transparent', border: '2px dashed #666', cursor: 'pointer', marginBottom: '24px' }}>
          + Add Room
        </button>

        {/* 5. Bulk Assign Fabric */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>Bulk Assign Fabric</p>
        <BulkToolPanel title="Bulk Assign Fabric" icon="🧵" bg="#1a2a3a" border="#4a6a8a" accentColor="#7dd3fc" isOpen={showFabricTool} onToggle={() => setShowFabricTool(!showFabricTool)}>
          {/* Mode toggle: exact fabric vs. blind-type-only estimate - same
              two modes as the regular Quote Generator's bulk tool. */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={() => setBulkMode('fabric')}
              style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: bulkMode === 'fabric' ? '#0e7490' : '#0a0a0a', color: bulkMode === 'fabric' ? '#fff' : '#888', border: bulkMode === 'fabric' ? '1px solid #0e7490' : '1px solid #444' }}
            >
              Fabric Number
            </button>
            <button
              onClick={() => setBulkMode('blindType')}
              style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: bulkMode === 'blindType' ? '#0e7490' : '#0a0a0a', color: bulkMode === 'blindType' ? '#fff' : '#888', border: bulkMode === 'blindType' ? '1px solid #0e7490' : '1px solid #444' }}
            >
              Blind Type (no fabric yet)
            </button>
          </div>

          {bulkMode === 'fabric' ? (
            <input type="text" placeholder="e.g., 82086K, 82067E" value={bulkFabricInput} onChange={(e) => setBulkFabricInput(e.target.value)} style={{ ...inputStyle, marginBottom: '10px' }} />
          ) : (
            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>For a Min/Max price range instead of an exact price - select one or more:</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {BLIND_TYPES.map(type => {
                  const checked = bulkBlindTypes.includes(type);
                  return (
                    <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '6px', background: checked ? '#1a3a4a' : '#0a0a0a', border: checked ? '1px solid #4ade80' : '1px solid #444', cursor: 'pointer', fontSize: '13px', color: checked ? '#4ade80' : '#ccc' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setBulkBlindTypes([...new Set([...bulkBlindTypes, type])]);
                          } else {
                            setBulkBlindTypes(bulkBlindTypes.filter(t => t !== type));
                          }
                        }}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      {type}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <RowChecklist
            items={roomItems}
            selectedIds={fabricSelectedRoomIds}
            toggleInSet={toggleInSet}
            setSelectedIds={setFabricSelectedRoomIds}
            accentColor="#7dd3fc"
            renderLabel={(item) => (
              <>{item.room.name || `Room ${item.idx + 1}`}<span style={{ color: '#666' }}>{item.room.fabricInput.trim() ? ` — ${item.room.fabricInput.trim()}` : ` — ${(item.room.blindTypes || ['Roller']).join(', ')} (no fabric set)`}</span></>
            )}
          />
          <button onClick={applyBulkFabric} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0e7490', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
            Apply to {fabricSelectedRoomIds.size} Selected
          </button>
        </BulkToolPanel>

        {/* 6. Bulk Assign Motor */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>Bulk Assign Motor</p>
        <BulkToolPanel title="Bulk Assign Motor" icon="⚙️" bg="#2a2a1a" border="#8a7a4a" accentColor="#fbbf24" isOpen={showMotorTool} onToggle={() => setShowMotorTool(!showMotorTool)}>
          <label style={labelStyle}>Set Type to</label>
          <select value={bulkMotorValue} onChange={(e) => setBulkMotorValue(e.target.value)} style={{ ...selectStyle, marginBottom: '10px' }}>
            <option value="Manual">Manual</option>
            <option value="Cordless">Cordless</option>
            <option value="Motor">Motor</option>
          </select>
          <RowChecklist
            items={allGroupItems}
            selectedIds={motorSelectedKeys}
            toggleInSet={toggleInSet}
            setSelectedIds={setMotorSelectedKeys}
            accentColor="#fbbf24"
            renderLabel={(item) => (
              <>{item.room.name || 'Room'} ({item.group.width || '?'}x{item.group.height || '?'})<span style={{ color: '#666' }}> — currently {item.group.controlType || 'Manual'}</span></>
            )}
          />
          <button onClick={applyBulkMotor} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#a16207', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
            Apply to {motorSelectedKeys.size} Selected
          </button>
        </BulkToolPanel>

        {/* 7. Bulk Assign Solar */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>Bulk Assign Solar</p>
        <BulkToolPanel title="Bulk Assign Solar (motorized windows only)" icon="☀️" bg="#2a2a1a" border="#8a8a4a" accentColor="#fde047" isOpen={showSolarTool} onToggle={() => setShowSolarTool(!showSolarTool)}>
          <label style={labelStyle}>Set Solar to</label>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <button onClick={() => setBulkSolarValue(false)} style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: !bulkSolarValue ? '#0e7490' : '#1a1a1a', color: !bulkSolarValue ? '#fff' : '#888', border: !bulkSolarValue ? '1px solid #0e7490' : '1px solid #444' }}>No</button>
            <button onClick={() => setBulkSolarValue(true)} style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: bulkSolarValue ? '#0e7490' : '#1a1a1a', color: bulkSolarValue ? '#fff' : '#888', border: bulkSolarValue ? '1px solid #0e7490' : '1px solid #444' }}>Yes</button>
          </div>
          {motorGroupItems.length === 0 ? (
            <p style={{ color: '#888', fontSize: '12px' }}>No motorized window groups yet - assign Motor above first.</p>
          ) : (
            <RowChecklist
              items={motorGroupItems}
              selectedIds={solarSelectedKeys}
              toggleInSet={toggleInSet}
              setSelectedIds={setSolarSelectedKeys}
              accentColor="#fde047"
              renderLabel={(item) => (
                <>{item.room.name || 'Room'} ({item.group.width || '?'}x{item.group.height || '?'})<span style={{ color: '#666' }}> — Solar currently {item.group.solar ? 'Yes' : 'No'}</span></>
              )}
            />
          )}
          <button onClick={applyBulkSolar} disabled={motorGroupItems.length === 0} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#a16207', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: motorGroupItems.length === 0 ? 'default' : 'pointer', opacity: motorGroupItems.length === 0 ? 0.5 : 1 }}>
            Apply to {solarSelectedKeys.size} Selected
          </button>
        </BulkToolPanel>

        {/* ✅ NEW: Hub - a smart-home hub covers many motorized windows (not
            per-window like Motor/Solar), so this only shows once there's at
            least one motorized window, and is a single quote-level charge
            rather than a per-window bulk-assign tool. Quantity auto-suggests
            1 per 20 motors when first turned on (large jobs need a 2nd hub),
            editable afterward. A price of $0 means complimentary - shown
            everywhere downstream as "Complimentary" rather than "$0". */}
        {motorGroupItems.length > 0 && (() => {
          const hub = formData.hub || { included: false, quantity: 1, price: 65 };
          const motorWindowCount = motorGroupItems.reduce((sum, i) => sum + (parseInt(i.group.quantity) || 0), 0);
          const suggestedQty = Math.max(1, Math.ceil(motorWindowCount / 20));
          return (
            <>
              <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>Hub</p>
              <div style={{ background: '#2a1a2a', border: '1px solid #8a4a7a', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: hub.included ? '12px' : 0 }}>
                  <input
                    type="checkbox"
                    checked={hub.included}
                    onChange={(e) => {
                      const included = e.target.checked;
                      setFormData({ ...formData, hub: { ...hub, included, quantity: included && hub.quantity === 1 ? suggestedQty : hub.quantity } });
                    }}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ color: '#f0abfc', fontWeight: 'bold', fontSize: '13px' }}>Include Hub ({motorWindowCount} motorized window{motorWindowCount === 1 ? '' : 's'})</span>
                </label>
                {hub.included && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={labelStyle}>Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={hub.quantity}
                        onChange={(e) => setFormData({ ...formData, hub: { ...hub, quantity: parseInt(e.target.value) || 1 } })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Price per Hub</label>
                      <input
                        type="number"
                        min="0"
                        value={hub.price}
                        onChange={(e) => setFormData({ ...formData, hub: { ...hub, price: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) } })}
                        style={inputStyle}
                      />
                      <p style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{hub.price === 0 ? 'Complimentary (not charged)' : `Total: $${(hub.quantity * hub.price).toFixed(2)}`}</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          );
        })()}

        {/* 8. Review table */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', marginTop: '8px' }}>Review</p>
        <div style={{ overflowX: 'auto', marginBottom: '24px', border: '1px solid #444', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#1a1a1a' }}>
              <tr>
                <th style={headerCellStyle}>Room</th>
                <th style={headerCellStyle}>Qty</th>
                <th style={headerCellStyle}>Size</th>
                <th style={headerCellStyle}>Fabric</th>
                <th style={headerCellStyle}>Type</th>
                <th style={headerCellStyle}>Solar</th>
              </tr>
            </thead>
            <tbody>
              {allGroupItems.map(item => (
                <tr key={item.key}>
                  <td style={{ ...cellStyle, color: '#d4af37', fontWeight: 'bold' }}>{item.room.name || 'Unnamed'}</td>
                  <td style={cellStyle}>{item.group.quantity || '—'}</td>
                  <td style={cellStyle}>{item.group.width || '?'} x {item.group.height || '?'}</td>
                  <td style={cellStyle}>{item.room.fabricInput || `${(item.room.blindTypes || ['Roller']).join(', ')} (no fabric)`}</td>
                  <td style={cellStyle}>{item.group.controlType || 'Manual'}</td>
                  <td style={cellStyle}>{item.group.solar ? 'Yes' : 'No'}</td>
                </tr>
              ))}
              {allGroupItems.length === 0 && (
                <tr><td style={cellStyle} colSpan={6}>No window groups yet - add a room above.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 9. Generate Quote - same function the regular Quote Generator uses,
            unchanged: same pricing engine, same quote object shape, same
            Firestore write. */}
        <button onClick={generateQuote} style={{ width: '100%', padding: '16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', background: '#d4af37', color: '#000', border: 'none', cursor: 'pointer' }}>
          {editingQuote ? 'Save as New Version' : 'Generate Quote'}
        </button>
      </div>
    </div>
  );
}
