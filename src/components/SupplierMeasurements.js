import React, { useState, useEffect } from 'react';
import {
  MOTOR_OPTIONS,
  CASSETTE_OPTIONS,
  MOUNT_OPTIONS,
  validateMeasurementFormat,
  findRoomSizeOutliers,
  getLocationLabel,
  computeRemoteLabels,
  expandQuoteIntoRows,
  sheetToCSV
} from '../utils/measurementUtils';

// Deliberately separate from the quote app's 'blindsQuotes' key - a bug in this
// feature's storage can never corrupt or collide with quote data, and vice versa.
const STORAGE_KEY = 'zebraSupplierMeasurementSheets';

const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', fontSize: '13px', background: '#1a1a1a', border: '1px solid #444', color: 'white', boxSizing: 'border-box' };
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const labelStyle = { fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' };
const errorTextStyle = { fontSize: '11px', color: '#ef4444', marginTop: '4px' };

export default function SupplierMeasurements({ quotes, onBack }) {
  const [sheets, setSheets] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [screen, setScreen] = useState('list'); // 'list' | 'select' | 'editor'
  const [selectedQuoteIds, setSelectedQuoteIds] = useState(new Set());
  const [activeSheetId, setActiveSheetId] = useState(null);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [bulkFabricInput, setBulkFabricInput] = useState('');
  // ✅ Replaces the old blur-triggered window.confirm() approach entirely.
  // Warnings are now purely DERIVED from current data on every render (so they
  // can never fail to appear the way a blur+dialog race could), and "accepting"
  // one is an explicit button tap, not a popup. Keyed by row+field+value, so
  // editing the value again automatically clears a stale acknowledgment.
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState(new Set());

  // ---- Load / save (own storage key, own effect, untouched by the quote app) ----
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSheets(parsed);
      }
    } catch (e) {
      console.error('Measurement sheets could not be read:', e);
    }
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sheets));
    } catch (e) {
      console.error('Measurement sheets could not be saved:', e);
    }
  }, [sheets, hasLoaded]);

  const activeSheet = sheets.find(s => s.id === activeSheetId) || null;

  const updateActiveSheet = (updater) => {
    setSheets(prev => prev.map(s => (s.id === activeSheetId ? updater(s) : s)));
  };

  const updateRow = (rowId, patch) => {
    updateActiveSheet(sheet => ({
      ...sheet,
      rows: sheet.rows.map(r => (r.id === rowId ? { ...r, ...patch } : r)),
      updatedDate: new Date().toISOString()
    }));
  };

  // ---- Building a new sheet from selected quotes (latest version per quote lineage) ----
  const latestQuotes = () => {
    const map = new Map();
    (quotes || []).forEach(q => {
      const key = q.lineageId || q.id;
      const existing = map.get(key);
      if (!existing || new Date(q.updatedDate) > new Date(existing.updatedDate)) {
        map.set(key, q);
      }
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.updatedDate) - new Date(a.updatedDate));
  };

  const toggleQuoteSelected = (id) => {
    const s = new Set(selectedQuoteIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedQuoteIds(s);
  };

  const createSheet = () => {
    const selected = latestQuotes().filter(q => selectedQuoteIds.has(q.id));
    if (selected.length === 0) {
      alert('Select at least one quote first.');
      return;
    }
    let allRows = [];
    selected.forEach(q => { allRows = allRows.concat(expandQuoteIntoRows(q)); });
    const newSheet = {
      id: `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      address: selected[0]?.location || '',
      sourceQuoteNames: selected.map(q => q.quoteName || q.clientName),
      rows: allRows
    };
    setSheets(prev => [...prev, newSheet]);
    setActiveSheetId(newSheet.id);
    setSelectedQuoteIds(new Set());
    setFlaggedRows(new Set());
    setScreen('editor');
  };

  const openSheet = (id) => {
    setActiveSheetId(id);
    setFlaggedRows(new Set());
    setScreen('editor');
  };

  const deleteSheet = (id) => {
    const sheet = sheets.find(s => s.id === id);
    if (!sheet) return;
    if (!window.confirm(`Delete this measurement sheet (${sheet.address || 'untitled'}, ${sheet.rows.length} windows)? This cannot be undone.`)) return;
    setSheets(prev => prev.filter(s => s.id !== id));
    if (activeSheetId === id) {
      setActiveSheetId(null);
      setScreen('list');
    }
  };

  // ---- Row selection (for bulk tools) ----
  const toggleRowSelected = (rowId) => {
    const s = new Set(selectedRowIds);
    if (s.has(rowId)) s.delete(rowId); else s.add(rowId);
    setSelectedRowIds(s);
  };

  // ---- Field change handlers ----
  const handleMotorChange = (rowId, value) => {
    const patch = { motor: value };
    if (value === 'Manual') {
      // Solar and remote only make sense for motorized windows
      patch.solar = false;
      patch.remoteGroup = null;
      patch.motorCustomText = '';
    }
    updateRow(rowId, patch);
  };

  // ---- Warning acknowledgment (tap-to-accept, replaces window.confirm entirely) ----
  const warningKey = (parts) => parts.join(':');

  const acknowledgeWarning = (key) => {
    setAcknowledgedWarnings(prev => new Set(prev).add(key));
  };

  // ---- Bulk fabric tool ----
  const applyBulkFabric = () => {
    if (!activeSheet) return;
    const value = bulkFabricInput.trim();
    if (!value) { alert('Enter a fabric number first.'); return; }
    if (selectedRowIds.size === 0) { alert('Select at least one window first.'); return; }

    const newRows = activeSheet.rows.map(r => (selectedRowIds.has(r.id) ? { ...r, fabricNumber: value } : r));
    updateActiveSheet(sheet => ({ ...sheet, rows: newRows, updatedDate: new Date().toISOString() }));
    const count = selectedRowIds.size;
    setBulkFabricInput('');
    setSelectedRowIds(new Set());
    alert(`Applied "${value}" to ${count} window${count > 1 ? 's' : ''}. Any room with more than one fabric number will show a warning below.`);
  };

  // ---- Bulk remote group tool ----
  const existingGroups = activeSheet
    ? [...new Set(activeSheet.rows.map(r => r.remoteGroup).filter(g => g))].sort((a, b) => a - b)
    : [];
  const nextGroupNumber = existingGroups.length > 0 ? Math.max(...existingGroups) + 1 : 1;

  const applyBulkRemoteGroup = (groupNumber) => {
    if (!activeSheet) return;
    if (selectedRowIds.size === 0) { alert('Select at least one motorized window first.'); return; }
    const newRows = activeSheet.rows.map(r => (selectedRowIds.has(r.id) ? { ...r, remoteGroup: groupNumber } : r));
    updateActiveSheet(sheet => ({ ...sheet, rows: newRows, updatedDate: new Date().toISOString() }));
    const count = selectedRowIds.size;
    setSelectedRowIds(new Set());
    alert(`Assigned ${count} window${count > 1 ? 's' : ''} to Remote Group ${groupNumber}.`);
  };

  // ---- Export ----
  const exportCSV = () => {
    if (!activeSheet) return;
    const invalidRows = activeSheet.rows.filter(r => !validateMeasurementFormat(r.width).valid || !validateMeasurementFormat(r.height).valid);
    if (invalidRows.length > 0) {
      alert(`${invalidRows.length} window(s) have an invalid width/height format. Fix the values highlighted in red before exporting.`);
      return;
    }
    const blankRows = activeSheet.rows.filter(r => !r.width.trim() || !r.height.trim());
    if (blankRows.length > 0) {
      if (!window.confirm(`${blankRows.length} window(s) are missing a width or height. Export anyway?`)) return;
    }
    const csv = sheetToCSV(activeSheet, activeSheet.rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeSheet.address || 'measurements').replace(/[^a-z0-9]/gi, '_')}_supplier_details.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyCSV = async () => {
    if (!activeSheet) return;
    const csv = sheetToCSV(activeSheet, activeSheet.rows);
    try {
      await navigator.clipboard.writeText(csv);
      alert('Copied! Paste into a new Excel/Sheets file, or straight into an email.');
    } catch (e) {
      alert('Could not copy. Try Download instead.');
    }
  };

  // ============================== RENDER ==============================

  if (screen === 'list') {
    return (
      <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <button onClick={onBack} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer', color: '#fff' }}>← Back</button>
            <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 'bold', fontFamily: 'Georgia, serif' }}>Supplier Measurements</h2>
            <div style={{ width: '60px' }} />
          </div>

          <button
            onClick={() => setScreen('select')}
            style={{ width: '100%', padding: '20px', borderRadius: '8px', background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', color: '#d4af37', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginBottom: '24px' }}
          >
            + New Measurement Sheet
          </button>

          {sheets.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', fontSize: '14px' }}>No measurement sheets yet.</p>
          ) : (
            sheets.slice().sort((a, b) => new Date(b.updatedDate) - new Date(a.updatedDate)).map(sheet => (
              <div key={sheet.id} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', padding: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <button onClick={() => openSheet(sheet.id)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <p style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '15px', marginBottom: '4px' }}>{sheet.address || 'Untitled'}</p>
                  <p style={{ color: '#888', fontSize: '12px' }}>{sheet.sourceQuoteNames?.join(', ')}</p>
                  <p style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>{sheet.rows.length} windows • {new Date(sheet.updatedDate).toLocaleDateString()}</p>
                </button>
                <button onClick={() => deleteSheet(sheet.id)} style={{ padding: '10px', borderRadius: '6px', background: '#b91c1c', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '12px' }}>Delete</button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (screen === 'select') {
    const list = latestQuotes();
    return (
      <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <button onClick={() => setScreen('list')} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer', color: '#fff' }}>← Back</button>
            <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>Select Quote(s)</h2>
            <div style={{ width: '60px' }} />
          </div>

          <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '16px' }}>
            Pick one or more quotes to combine into a single supplier sheet (handy when several clients confirm the same week).
          </p>

          {list.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center' }}>No quotes found.</p>
          ) : (
            list.map(q => {
              const checked = selectedQuoteIds.has(q.id);
              return (
                <label key={q.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '8px', background: checked ? '#1a3a2a' : '#2a2a2a', border: checked ? '1px solid #4ade80' : '1px solid #444', marginBottom: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleQuoteSelected(q.id)} style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }} />
                  <div>
                    <p style={{ color: checked ? '#4ade80' : '#fff', fontWeight: 'bold', fontSize: '14px' }}>{q.clientName} — {q.location} ({q.version})</p>
                    <p style={{ color: '#888', fontSize: '12px' }}>{q.rooms?.length || 0} rooms • Updated {new Date(q.updatedDate).toLocaleDateString()}</p>
                  </div>
                </label>
              );
            })
          )}

          {list.length > 0 && (
            <button onClick={createSheet} style={{ width: '100%', padding: '14px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', marginTop: '16px' }}>
              Create Sheet with {selectedQuoteIds.size} Quote{selectedQuoteIds.size === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // screen === 'editor'
  if (!activeSheet) {
    return (
      <div style={{ background: '#1a1a1a', minHeight: '100vh', padding: '24px', color: '#fff' }}>
        <p>Sheet not found.</p>
        <button onClick={() => setScreen('list')} style={{ marginTop: '12px', padding: '10px 16px', borderRadius: '8px', background: '#444', border: 'none', color: '#fff', cursor: 'pointer' }}>Back to list</button>
      </div>
    );
  }

  const remoteLabels = computeRemoteLabels(activeSheet.rows);
  const widthOutlierIds = findRoomSizeOutliers(activeSheet.rows, 'width');
  const heightOutlierIds = findRoomSizeOutliers(activeSheet.rows, 'height');

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button onClick={() => setScreen('list')} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer', color: '#fff' }}>← Back</button>
          <div style={{ width: '60px' }} />
        </div>

        <input
          type="text"
          placeholder="Address"
          value={activeSheet.address}
          onChange={(e) => updateActiveSheet(sheet => ({ ...sheet, address: e.target.value }))}
          style={{ ...inputStyle, fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}
        />
        <p style={{ color: '#888', fontSize: '12px', marginBottom: '20px' }}>{activeSheet.sourceQuoteNames?.join(', ')} • {activeSheet.rows.length} windows</p>

        {/* Bulk Fabric Tool */}
        <div style={{ background: '#1a2a3a', border: '1px solid #4a6a8a', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ color: '#7dd3fc', fontWeight: 'bold', fontSize: '13px', marginBottom: '10px' }}>🧵 Bulk Assign Fabric</p>
          <input
            type="text"
            placeholder="Fabric number"
            value={bulkFabricInput}
            onChange={(e) => setBulkFabricInput(e.target.value)}
            style={{ ...inputStyle, marginBottom: '10px' }}
          />
          <button onClick={applyBulkFabric} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0e7490', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
            Apply to {selectedRowIds.size} Selected
          </button>
        </div>

        {/* Bulk Remote Tool */}
        <div style={{ background: '#2a1a3a', border: '1px solid #6a4a8a', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ color: '#c4b5fd', fontWeight: 'bold', fontSize: '13px', marginBottom: '10px' }}>📡 Bulk Assign Remote Group</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {existingGroups.map(g => (
              <button key={g} onClick={() => applyBulkRemoteGroup(g)} style={{ padding: '10px 14px', borderRadius: '6px', background: '#4c1d95', color: '#fff', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>
                Group {g}
              </button>
            ))}
            <button onClick={() => applyBulkRemoteGroup(nextGroupNumber)} style={{ padding: '10px 14px', borderRadius: '6px', background: '#6d28d9', color: '#fff', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>
              + New Group {nextGroupNumber}
            </button>
          </div>
          <p style={{ color: '#888', fontSize: '11px', marginTop: '8px' }}>Select windows below, then tap a group to assign them all at once. Channel numbers (#1, #2...) are set automatically.</p>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
          <button onClick={() => setSelectedRowIds(new Set(activeSheet.rows.map(r => r.id)))} style={{ fontSize: '12px', color: '#7dd3fc', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Select All</button>
          <button onClick={() => setSelectedRowIds(new Set())} style={{ fontSize: '12px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Clear Selection</button>
        </div>

        {/* Rows */}
        {activeSheet.rows.map(row => {
          const locationLabel = getLocationLabel(row);
          const isMotor = row.motor !== 'Manual';
          const remoteLabel = remoteLabels[row.id] || '';
          const widthCheck = validateMeasurementFormat(row.width);
          const heightCheck = validateMeasurementFormat(row.height);
          const isSelected = selectedRowIds.has(row.id);

          // Width/height outlier warnings - purely derived from current data every
          // render, so there's nothing that can silently fail to appear.
          const widthOutlierKey = warningKey([row.id, 'width', row.width]);
          const showWidthWarning = widthCheck.valid && widthOutlierIds.has(row.id) && !acknowledgedWarnings.has(widthOutlierKey);

          const heightOutlierKey = warningKey([row.id, 'height', row.height]);
          const showHeightWarning = heightCheck.valid && heightOutlierIds.has(row.id) && !acknowledgedWarnings.has(heightOutlierKey);

          // Mixed-fabric warning - room-level, so any row in an affected room shows it
          const roomFabricValues = [...new Set(activeSheet.rows.filter(r => r.locationBase === row.locationBase && r.fabricNumber.trim()).map(r => r.fabricNumber.trim()))];
          const roomHasMixedFabric = roomFabricValues.length > 1;
          const fabricWarningKeyForRoom = warningKey(['fabric', row.locationBase, roomFabricValues.slice().sort().join('|')]);
          const showFabricWarning = roomHasMixedFabric && !acknowledgedWarnings.has(fabricWarningKeyForRoom);

          const hasAnyWarning = showWidthWarning || showHeightWarning || showFabricWarning;

          return (
            <div key={row.id} style={{ background: hasAnyWarning ? '#3a2a1a' : '#2a2a2a', border: hasAnyWarning ? '1px solid #f59e0b' : '1px solid #444', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleRowSelected(row.id)} style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#d4af37' }}>{locationLabel}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Motor</label>
                  <select value={row.motor} onChange={(e) => handleMotorChange(row.id, e.target.value)} style={selectStyle}>
                    {MOTOR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  {row.motor === 'Custom' && (
                    <input type="text" placeholder="Type motor type" value={row.motorCustomText} onChange={(e) => updateRow(row.id, { motorCustomText: e.target.value })} style={{ ...inputStyle, marginTop: '6px' }} />
                  )}
                  <p style={{ ...labelStyle, marginTop: '8px' }}>Side</p>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => updateRow(row.id, { motorSide: '' })}
                      style={{ flex: 1, padding: '8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', background: row.motorSide === '' ? '#0e7490' : '#1a1a1a', color: row.motorSide === '' ? '#fff' : '#888', border: row.motorSide === '' ? '1px solid #0e7490' : '1px solid #444' }}
                    >
                      Right (default)
                    </button>
                    <button
                      onClick={() => updateRow(row.id, { motorSide: 'Left' })}
                      style={{ flex: 1, padding: '8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', background: row.motorSide === 'Left' ? '#0e7490' : '#1a1a1a', color: row.motorSide === 'Left' ? '#fff' : '#888', border: row.motorSide === 'Left' ? '1px solid #0e7490' : '1px solid #444' }}
                    >
                      Left
                    </button>
                  </div>
                </div>

                {isMotor && (
                  <div>
                    <label style={labelStyle}>Solar</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: '#1a1a1a', borderRadius: '6px', border: '1px solid #444', cursor: 'pointer' }}>
                      <input type="checkbox" checked={row.solar} onChange={(e) => updateRow(row.id, { solar: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                      <span style={{ color: row.solar ? '#4ade80' : '#ccc', fontSize: '13px' }}>{row.solar ? 'Yes' : 'No'}</span>
                    </label>
                  </div>
                )}

                {isMotor && (
                  <div>
                    <label style={labelStyle}>Remote</label>
                    <select
                      value={row.remoteGroup || ''}
                      onChange={(e) => updateRow(row.id, { remoteGroup: e.target.value ? parseInt(e.target.value, 10) : null })}
                      style={selectStyle}
                    >
                      <option value="">Not assigned</option>
                      {existingGroups.map(g => <option key={g} value={g}>Group {g}</option>)}
                      <option value={nextGroupNumber}>+ New Group {nextGroupNumber}</option>
                    </select>
                    {remoteLabel && <p style={{ fontSize: '11px', color: '#4ade80', marginTop: '4px' }}>{remoteLabel}</p>}
                  </div>
                )}

                <div>
                  <label style={labelStyle}>Cassette</label>
                  <select value={row.cassette} onChange={(e) => updateRow(row.id, { cassette: e.target.value })} style={selectStyle}>
                    {CASSETTE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  {row.cassette === 'Custom' && (
                    <input type="text" placeholder="Describe cassette" value={row.cassetteCustomText} onChange={(e) => updateRow(row.id, { cassetteCustomText: e.target.value })} style={{ ...inputStyle, marginTop: '6px' }} />
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Mount</label>
                  <select value={row.mount} onChange={(e) => updateRow(row.id, { mount: e.target.value })} style={selectStyle}>
                    {MOUNT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Fabric Number</label>
                  <input
                    type="text"
                    value={row.fabricNumber}
                    onChange={(e) => updateRow(row.id, { fabricNumber: e.target.value })}
                    style={{ ...inputStyle, border: showFabricWarning ? '1px solid #f59e0b' : inputStyle.border }}
                  />
                  {showFabricWarning && (
                    <div style={{ marginTop: '4px' }}>
                      <p style={{ fontSize: '11px', color: '#f59e0b' }}>⚠️ "{row.locationBase}" has different fabric numbers: {roomFabricValues.join(', ')}. Most rooms use one fabric.</p>
                      <button onClick={() => acknowledgeWarning(fabricWarningKeyForRoom)} style={{ fontSize: '11px', color: '#4ade80', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0, marginTop: '2px' }}>
                        ✓ Yes, this room really has different fabrics
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Width (e.g. 34 5/16)</label>
                  <input
                    type="text"
                    value={row.width}
                    onChange={(e) => updateRow(row.id, { width: e.target.value })}
                    style={{ ...inputStyle, border: !widthCheck.valid ? '1px solid #ef4444' : (showWidthWarning ? '1px solid #f59e0b' : inputStyle.border) }}
                  />
                  {!widthCheck.valid && <p style={errorTextStyle}>{widthCheck.message}</p>}
                  {showWidthWarning && (
                    <div style={{ marginTop: '4px' }}>
                      <p style={{ fontSize: '11px', color: '#f59e0b' }}>⚠️ Different from other windows in "{row.locationBase}" - double check.</p>
                      <button onClick={() => acknowledgeWarning(widthOutlierKey)} style={{ fontSize: '11px', color: '#4ade80', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0, marginTop: '2px' }}>
                        ✓ Yes, this one is correct
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Height (e.g. 75 13/16)</label>
                  <input
                    type="text"
                    value={row.height}
                    onChange={(e) => updateRow(row.id, { height: e.target.value })}
                    style={{ ...inputStyle, border: !heightCheck.valid ? '1px solid #ef4444' : (showHeightWarning ? '1px solid #f59e0b' : inputStyle.border) }}
                  />
                  {!heightCheck.valid && <p style={errorTextStyle}>{heightCheck.message}</p>}
                  {showHeightWarning && (
                    <div style={{ marginTop: '4px' }}>
                      <p style={{ fontSize: '11px', color: '#f59e0b' }}>⚠️ Different from other windows in "{row.locationBase}" - double check.</p>
                      <button onClick={() => acknowledgeWarning(heightOutlierKey)} style={{ fontSize: '11px', color: '#4ade80', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0, marginTop: '2px' }}>
                        ✓ Yes, this one is correct
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Export */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', marginBottom: '32px' }}>
          <button onClick={copyCSV} style={{ flex: 1, padding: '14px', borderRadius: '8px', background: '#d4af37', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>
            📋 Copy
          </button>
          <button onClick={exportCSV} style={{ flex: 1, padding: '14px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>
            ⬇️ Download CSV
          </button>
        </div>
      </div>
    </div>
  );
}

