import React from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { autoDetectBlindTypes, getHeightSurcharge, getWidthSurcharge } from '../../utils/pricing';

const getRoomSummary = (room) => {
  const totalWindows = room.windowGroups.reduce((sum, g) => sum + (parseInt(g.quantity) || 0), 0);
  const motorCount = room.windowGroups.filter(g => g.controlType === 'Motor').reduce((sum, g) => sum + (parseInt(g.quantity) || 0), 0);
  const firstGroup = room.windowGroups[0];
  const dimensions = firstGroup ? `${firstGroup.width || '?'}"W x ${firstGroup.height || '?'}"H` : '? x ?';
  const blindType = (room.blindTypes || ['Roller'])[0];

  return {
    windows: totalWindows,
    dimensions,
    fabric: room.fabricInput || blindType,
    motorCount
  };
};

// Quote form - relocated from App.js's renderQuoteForm with no logic
// changes. getRoomSummary/applyBulkAssignment/toggleRoomExpanded moved in
// as local helpers since they only depend on props this screen already
// needs - keeping them here (rather than passing 3 more functions down from
// App.js) matches how the split components in components/measurements/
// keep their own row-level helpers local.
export default function QuoteFormScreen({
  bulkBlindTypes,
  bulkFabricInput,
  bulkMode,
  bulkSelectedRoomIds,
  editingQuote,
  expandedFabricSection,
  expandedRooms,
  expandedSurchargeOverride,
  formData,
  generateQuote,
  lastHeight,
  lastWidth,
  resetForm,
  setBulkBlindTypes,
  setBulkFabricInput,
  setBulkMode,
  setBulkSelectedRoomIds,
  setCurrentView,
  setEditingQuote,
  setExpandedFabricSection,
  setExpandedRooms,
  setExpandedSurchargeOverride,
  setFormData,
  setLastHeight,
  setLastWidth,
  setShowBulkAssign,
  showBulkAssign
}) {
  // Applies either a specific fabric number OR a blind-type-only estimate
  // (when the client hasn't picked exact fabric yet) to every selected
  // room's OWN fields - the same fields the per-room inputs already use, so
  // there's never a second place that could hold a different value for the
  // same room.
  const applyBulkAssignment = () => {
    if (bulkSelectedRoomIds.size === 0) {
      alert('Select at least one room to apply it to.');
      return;
    }

    let newRooms;
    let appliedLabel;

    if (bulkMode === 'fabric') {
      const fabricValue = bulkFabricInput.trim();
      if (!fabricValue) {
        alert('Enter a fabric number first.');
        return;
      }
      const detectedTypes = autoDetectBlindTypes(fabricValue);
      newRooms = formData.rooms.map(room =>
        bulkSelectedRoomIds.has(room.id) ? { ...room, fabricInput: fabricValue, blindTypes: detectedTypes } : room
      );
      appliedLabel = `fabric "${fabricValue}"`;
    } else {
      if (bulkBlindTypes.length === 0) {
        alert('Select at least one blind type first.');
        return;
      }
      // Blind-type-only: matches the per-room fallback behavior exactly -
      // leave fabricInput blank so pricing uses a Min/Max range for these
      // types instead of one exact fabric price.
      newRooms = formData.rooms.map(room =>
        bulkSelectedRoomIds.has(room.id) ? { ...room, fabricInput: '', blindTypes: [...bulkBlindTypes] } : room
      );
      appliedLabel = `blind type "${bulkBlindTypes.join(', ')}" (Min/Max estimate, no exact fabric)`;
    }

    const appliedCount = bulkSelectedRoomIds.size;
    setFormData({ ...formData, rooms: newRooms });
    setBulkFabricInput('');
    setBulkBlindTypes([]);
    setBulkSelectedRoomIds(new Set());
    alert(`✅ Applied ${appliedLabel} to ${appliedCount} room${appliedCount > 1 ? 's' : ''}. You can still fine-tune any individual room below.`);
  };

  const toggleRoomExpanded = (roomId) => {
    const newExpanded = new Set(expandedRooms);
    if (newExpanded.has(roomId)) {
      newExpanded.delete(roomId);
    } else {
      newExpanded.add(roomId);
    }
    setExpandedRooms(newExpanded);
  };

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', paddingBottom: '48px', padding: '32px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <button onClick={() => { setCurrentView('menu'); resetForm(); setEditingQuote(null); }} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={24} color="#aaa" />
          </button>
          <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff', fontFamily: 'Georgia, serif' }}>{editingQuote ? 'Edit Quote' : 'Create Quote'}</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
          <input type="text" placeholder="Client Name" value={formData.clientName} onChange={(e) => setFormData({...formData, clientName: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '16px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white' }} />
          <input type="tel" placeholder="Client Phone" value={formData.clientPhone} onChange={(e) => setFormData({...formData, clientPhone: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '16px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white' }} />
          <input type="text" placeholder="Location / Address" value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '16px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white' }} />
          <input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '16px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white' }} />
        </div>

        <h3 style={{ fontWeight: 'bold', fontSize: '20px', color: '#fff', marginBottom: '24px', fontFamily: 'Georgia, serif' }}>Rooms & Windows</h3>

        {/* ✅ NEW: Bulk Assign Fabric - types one fabric number, applies it into the
            SAME fabricInput field each room already uses, for as many rooms as picked.
            No separate data path, so this can never disagree with the room cards below. */}
        <div style={{ borderRadius: '8px', marginBottom: '24px', background: '#1a2a3a', border: '1px solid #4a6a8a', overflow: 'hidden' }}>
          <button onClick={() => setShowBulkAssign(!showBulkAssign)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#7dd3fc' }}>🧵 Bulk Assign Fabric to Multiple Rooms</span>
            <span style={{ color: '#888', fontSize: '14px' }}>{showBulkAssign ? '▼' : '▶'}</span>
          </button>
          {showBulkAssign && (
            <div style={{ padding: '0 16px 16px 16px' }}>
              <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '12px' }}>
                Pick rooms, choose fabric OR blind type below, and apply. Each room's own field gets updated - you can still fine-tune any single room afterward.
              </p>

              {/* Mode toggle: exact fabric vs. blind-type-only estimate */}
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
                <input
                  type="text"
                  placeholder="e.g., 82086K, 82067E"
                  value={bulkFabricInput}
                  onChange={(e) => setBulkFabricInput(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', marginBottom: '12px', fontSize: '14px', background: '#0a0a0a', border: '1px solid #4a6a8a', color: 'white' }}
                />
              ) : (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>For a Min/Max price range instead of an exact price - select one or more:</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {['Roller', 'Zebra', 'Roman', 'Bamboo (Roller)', 'Bamboo (Roman)'].map(type => {
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

              {formData.rooms.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#888', fontStyle: 'italic' }}>Add a room below first, then come back here to bulk-assign.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                    <button onClick={() => setBulkSelectedRoomIds(new Set(formData.rooms.map(r => r.id)))} style={{ fontSize: '12px', color: '#7dd3fc', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Select All</button>
                    <button onClick={() => setBulkSelectedRoomIds(new Set())} style={{ fontSize: '12px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Clear</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', maxHeight: '260px', overflowY: 'auto' }}>
                    {formData.rooms.map((room, idx) => {
                      const summary = getRoomSummary(room);
                      const checked = bulkSelectedRoomIds.has(room.id);
                      return (
                        <label key={room.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '6px', background: checked ? '#1a3a4a' : '#0a0a0a', border: checked ? '1px solid #4ade80' : '1px solid #333', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const newSet = new Set(bulkSelectedRoomIds);
                              if (newSet.has(room.id)) newSet.delete(room.id); else newSet.add(room.id);
                              setBulkSelectedRoomIds(newSet);
                            }}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }}
                          />
                          <span style={{ fontSize: '13px', color: checked ? '#4ade80' : '#ccc' }}>
                            {room.name || `Room ${idx + 1}`}
                            <span style={{ color: '#888' }}> — {summary.windows} windows, {summary.dimensions}{room.fabricInput ? `, currently: ${room.fabricInput}` : ''}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    onClick={applyBulkAssignment}
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#0e7490', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                  >
                    Apply to {bulkSelectedRoomIds.size || 0} Selected Room{bulkSelectedRoomIds.size === 1 ? '' : 's'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {formData.rooms.map((room, roomIndex) => {
          const isExpanded = expandedRooms.has(room.id);
          const summary = getRoomSummary(room);

          return (
            <div key={room.id} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', marginBottom: '24px', overflow: 'hidden' }}>
              {/* COLLAPSED VIEW - Click to expand */}
              <button onClick={() => toggleRoomExpanded(room.id)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#d4af37', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span>{room.name || 'Unnamed Room'}</span>
                    <span style={{ fontSize: '13px', color: '#aaa' }}>({summary.windows} windows | {summary.dimensions})</span>
                    <span style={{ fontSize: '13px', color: '#888' }}>{summary.fabric}</span>
                    {summary.motorCount > 0 && <span style={{ fontSize: '13px', color: '#ffaa00' }}>Motor ({summary.motorCount})</span>}
                  </p>
                </div>
                <span style={{ color: '#888', fontSize: '16px' }}>{isExpanded ? '▼' : '▶'}</span>
              </button>

              {/* EXPANDED VIEW - Edit form */}
              {isExpanded && (
                <div style={{ background: '#1a1a1a', padding: '24px', borderTop: '1px solid #444' }}>
                  <input type="text" placeholder="Room Name (e.g., Living Room)" value={room.name} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].name = e.target.value; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontWeight: 'bold', fontSize: '16px', background: '#0a0a0a', border: '1px solid #d4af37', color: 'white' }} />

                  {/* ✅ NEW: Fabric Numbers + Blind Type - collapsed by default.
                      Bulk Assign Fabric (top of page) handles most rooms now;
                      this stays here for the rare single-room exception. */}
                  {(() => {
                    const isFabricExpanded = expandedFabricSection.has(room.id);
                    const toggleFabricSection = () => {
                      const s = new Set(expandedFabricSection);
                      if (s.has(room.id)) s.delete(room.id); else s.add(room.id);
                      setExpandedFabricSection(s);
                    };
                    const summaryLabel = room.fabricInput.trim()
                      ? `Fabric: ${room.fabricInput.trim()}`
                      : `Blind Type: ${(room.blindTypes || ['Roller']).join(', ')} (no fabric set)`;
                    return (
                      <div style={{ marginBottom: '16px', border: '1px solid #444', borderRadius: '8px', overflow: 'hidden' }}>
                        <button onClick={toggleFabricSection} style={{ width: '100%', textAlign: 'left', background: '#0a0a0a', border: 'none', cursor: 'pointer', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#aaa' }}>{summaryLabel}</span>
                          <span style={{ color: '#888', fontSize: '13px' }}>{isFabricExpanded ? '▼ Hide' : '▶ Edit'}</span>
                        </button>
                        {isFabricExpanded && (
                          <div style={{ padding: '16px', background: '#1a1a1a' }}>
                            <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Fabric Numbers (comma-separated, or leave blank for Min/Max):</p>
                            <input type="text" placeholder="e.g., 82086K, 82067E (or leave blank)" value={room.fabricInput} onChange={(e) => {
                              const newRooms = [...formData.rooms];
                              newRooms[roomIndex].fabricInput = e.target.value;

                              if (e.target.value.trim()) {
                                const detectedTypes = autoDetectBlindTypes(e.target.value);
                                newRooms[roomIndex].blindTypes = detectedTypes;
                              }

                              setFormData({...formData, rooms: newRooms});
                            }} style={{ width: '100%', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', background: '#0a0a0a', border: '1px solid #666', color: 'white' }} />

                            <div>
                              <p style={{ fontSize: '12px', fontWeight: 'bold', color: room.fabricInput.trim() ? '#4ade80' : '#888', marginBottom: '8px' }}>
                                {room.fabricInput.trim()
                                  ? `✅ Auto-Detected: ${(room.blindTypes || ['Roller']).join(', ')} (Click to change)`
                                  : 'Blind Type (for Min/Max calculation) - Select one or more:'
                                }
                              </p>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                {['Roller', 'Zebra', 'Roman', 'Bamboo (Roller)', 'Bamboo (Roman)'].map(type => (
                                  <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '6px', background: (room.blindTypes || ['Roller']).includes(type) ? '#1a3a1a' : '#0a0a0a', border: (room.blindTypes || ['Roller']).includes(type) ? '1px solid #4ade80' : '1px solid #444', cursor: 'pointer', fontSize: '14px', color: (room.blindTypes || ['Roller']).includes(type) ? '#4ade80' : '#ccc', transition: 'all 0.2s' }}>
                                    <input
                                      type="checkbox"
                                      checked={(room.blindTypes || ['Roller']).includes(type)}
                                      onChange={(e) => {
                                        const newRooms = [...formData.rooms];
                                        let types = room.blindTypes || ['Roller'];
                                        if (e.target.checked) {
                                          types = [...new Set([...types, type])];
                                        } else {
                                          types = types.filter(t => t !== type);
                                        }
                                        newRooms[roomIndex].blindTypes = types.length > 0 ? types : ['Roller'];
                                        setFormData({...formData, rooms: newRooms});
                                      }}
                                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                    />
                                    {type}
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#ccc', marginBottom: '12px' }}>Window Groups:</p>

                  {room.windowGroups.map((group, groupIndex) => (
                    <div key={group.id} style={{ background: '#0a0a0a', padding: '12px', borderRadius: '8px', marginBottom: '12px', border: '1px solid #555' }}>
                      <input type="number" placeholder="Qty" value={group.quantity} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].quantity = e.target.value; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '8px', borderRadius: '4px', fontSize: '16px', background: '#0a0a0a', border: '1px solid #666', color: 'white', marginBottom: '8px' }} />
                      <input type="text" placeholder="Width (e.g., 35, 3'6, 83in 12/16)" value={group.width} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].width = e.target.value; setFormData({...formData, rooms: newRooms}); setLastWidth(e.target.value); }} style={{ width: '100%', padding: '8px', borderRadius: '4px', fontSize: '16px', background: '#0a0a0a', border: '1px solid #666', color: 'white', marginBottom: '8px' }} />
                      <input type="text" placeholder="Height (e.g., 75, 6'3, 83in 12/16)" value={group.height} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].height = e.target.value; setFormData({...formData, rooms: newRooms}); setLastHeight(e.target.value); }} style={{ width: '100%', padding: '8px', borderRadius: '4px', fontSize: '16px', background: '#0a0a0a', border: '1px solid #666', color: 'white', marginBottom: '12px' }} />

                      <select value={group.mount} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].mount = e.target.value; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '8px', borderRadius: '4px', fontSize: '14px', background: '#0a0a0a', border: '1px solid #666', color: 'white', marginBottom: '8px' }}>
                        <option>Inside</option>
                        <option>Outside</option>
                        <option>Outside-NoReduc</option>
                      </select>
                      <select value={group.controlType || 'Manual'} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].controlType = e.target.value; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '8px', borderRadius: '4px', fontSize: '14px', background: '#0a0a0a', border: '1px solid #666', color: 'white', marginBottom: '12px' }}>
                        <option value="Manual">Manual</option>
                        <option value="Cordless">Cordless</option>
                        <option value="Motor">Motor</option>
                      </select>

                      {(group.controlType || 'Manual') === 'Motor' && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', color: '#ccc', marginBottom: '6px' }}>
                          <input type="checkbox" checked={group.solar} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].solar = e.target.checked; setFormData({...formData, rooms: newRooms}); }} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />Solar (+$40)
                        </label>
                      )}

                      {(() => {
                        const surchargeKey = `${room.id}_${groupIndex}`;
                        const isSurchargeExpanded = expandedSurchargeOverride.has(surchargeKey);
                        const toggleSurchargeSection = () => {
                          const s = new Set(expandedSurchargeOverride);
                          if (s.has(surchargeKey)) s.delete(surchargeKey); else s.add(surchargeKey);
                          setExpandedSurchargeOverride(s);
                        };
                        return (
                          <div style={{ borderRadius: '6px', marginBottom: '8px', border: '1px solid #4a6a4a', overflow: 'hidden' }}>
                            <button onClick={toggleSurchargeSection} style={{ width: '100%', textAlign: 'left', background: '#2a3a2a', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#aaa' }}>Surcharge Override (Optional){typeof group.surchargeOverride === 'number' && ` — Overridden: $${group.surchargeOverride.toFixed(0)}`}</span>
                              <span style={{ color: '#888', fontSize: '12px' }}>{isSurchargeExpanded ? '▼' : '▶'}</span>
                            </button>
                            {isSurchargeExpanded && (
                              <div style={{ padding: '8px', background: '#2a3a2a' }}>
                                <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>Auto: ${(() => { try { const widthVal = (group.width || '').trim(); const heightVal = (group.height || '').trim(); const w = widthVal ? getWidthSurcharge(widthVal) : 0; const h = heightVal ? getHeightSurcharge(heightVal) : 0; const total = w + h; return isNaN(total) ? '0' : total.toFixed(0); } catch(e) { console.error('Surcharge calc error:', e); return '0'; } })()} {typeof group.surchargeOverride === 'number' && `→ Overridden: $${group.surchargeOverride.toFixed(0)}`}</p>
                                <input type="number" placeholder="Leave blank to use auto-calculated" value={typeof group.surchargeOverride === 'number' ? group.surchargeOverride : ''} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].surchargeOverride = e.target.value === '' ? null : parseFloat(e.target.value) || 0; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '6px', borderRadius: '4px', fontSize: '12px', background: '#0a0a0a', border: '1px solid #555', color: 'white', marginBottom: '6px' }} />
                                <button onClick={() => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].surchargeOverride = null; setFormData({...formData, rooms: newRooms}); }} style={{ fontSize: '10px', padding: '4px 8px', background: 'transparent', color: '#888', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}>Reset to Auto</button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <button onClick={() => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups.splice(groupIndex, 1); setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '8px', marginTop: '8px', borderRadius: '4px', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <Trash2 size={14} /> Delete This Window Group
                      </button>
                    </div>
                  ))}

                  <button onClick={() => { const newRooms = [...formData.rooms]; const newWindowId = Math.max(...newRooms[roomIndex].windowGroups.map(w => w.id)) + 1; newRooms[roomIndex].windowGroups.push({ id: newWindowId, quantity: '', width: lastWidth, height: lastHeight, controlType: 'Manual', solar: false, mount: 'Inside', surchargeOverride: null }); setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '12px', borderRadius: '4px', color: '#888', fontWeight: 'bold', fontSize: '16px', background: 'transparent', border: '2px dashed #666', cursor: 'pointer' }}>+ Add Window Group</button>

                  <button onClick={() => { const newRooms = [...formData.rooms]; newRooms.splice(roomIndex, 1); setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '12px', marginTop: '12px', borderRadius: '4px', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Trash2 size={16} /> Delete This Room
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <button onClick={() => {
          const newRoomId = Math.max(...formData.rooms.map(r => r.id), 0) + 1;
          setFormData({...formData, rooms: [...formData.rooms, { id: newRoomId, name: '', fabricInput: '', blindTypes: ['Roller'], windowGroups: [{ id: 1, quantity: '', width: lastWidth, height: lastHeight, controlType: 'Manual', solar: false, mount: 'Inside', surchargeOverride: null }] }]});
          // ✅ Collapse every existing room and open only the new one, so you don't
          // have to scroll back up to close the room you just finished.
          setExpandedRooms(new Set([newRoomId]));
        }} style={{ width: '100%', padding: '16px', borderRadius: '4px', color: '#888', fontWeight: 'bold', fontSize: '16px', background: 'transparent', border: '2px dashed #666', cursor: 'pointer', marginBottom: '32px' }}>+ Add Room</button>

        <button onClick={generateQuote} style={{ width: '100%', padding: '16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', background: '#d4af37', color: '#000', border: 'none', cursor: 'pointer' }}>{editingQuote ? 'Save as New Version' : 'Generate Quote'}</button>
      </div>
    </div>
  );
}
