import React from 'react';
import {
  MOTOR_OPTIONS,
  CASSETTE_OPTIONS,
  MOUNT_OPTIONS,
  validateMeasurementFormat,
  getLocationLabel,
  getIncompleteFields,
  getNextRemoteChannel,
  countInRemoteGroup,
  MAX_REMOTE_CHANNELS
} from '../../utils/measurementUtils';

const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', fontSize: '13px', background: '#1a1a1a', border: '1px solid #444', color: 'white', boxSizing: 'border-box' };
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const labelStyle = { fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' };
const errorTextStyle = { fontSize: '11px', color: '#ef4444', marginTop: '4px' };

// The main working screen: address, both bulk tools, the full window list,
// and export. Deliberately receives the SAME variable names the parent used
// to have as local state/handlers (just as props now) rather than wrapping
// them in newly-named callbacks - this keeps the JSX body a close relocation
// of the original code instead of a rewrite, which is the safer transform
// when there's no live environment to render and test against.
export default function SheetEditorScreen({
  activeSheet,
  onBack,
  updateActiveSheet,
  updateRow,
  handleMotorChange,
  remoteLabels,
  widthOutlierIds,
  heightOutlierIds,
  existingGroups,
  nextGroupNumber,
  showFabricTool,
  setShowFabricTool,
  bulkFabricInput,
  setBulkFabricInput,
  fabricSelectedRowIds,
  setFabricSelectedRowIds,
  toggleInSet,
  applyBulkFabric,
  showRemoteTool,
  setShowRemoteTool,
  remoteSelectedRowIds,
  setRemoteSelectedRowIds,
  applyBulkRemoteGroup,
  expandedRowId,
  setExpandedRowId,
  acknowledgedWarnings,
  warningKey,
  acknowledgeWarning,
  copyCSV,
  exportCSV
}) {
  if (!activeSheet) {
    return (
      <div style={{ background: '#1a1a1a', minHeight: '100vh', padding: '24px', color: '#fff' }}>
        <p>Sheet not found.</p>
        <button onClick={onBack} style={{ marginTop: '12px', padding: '10px 16px', borderRadius: '8px', background: '#444', border: 'none', color: '#fff', cursor: 'pointer' }}>Back to list</button>
      </div>
    );
  }

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button onClick={onBack} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer', color: '#fff' }}>← Back</button>
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

        {/* Bulk Fabric Tool - window list embedded right here, collapsed by default */}
        <div style={{ background: '#1a2a3a', border: '1px solid #4a6a8a', borderRadius: '8px', marginBottom: '16px', overflow: 'hidden' }}>
          <button onClick={() => setShowFabricTool(!showFabricTool)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#7dd3fc', fontWeight: 'bold', fontSize: '13px' }}>🧵 Bulk Assign Fabric</span>
            <span style={{ color: '#888', fontSize: '14px' }}>{showFabricTool ? '▼' : '▶'}</span>
          </button>
          {showFabricTool && (
            <div style={{ padding: '0 16px 16px 16px' }}>
              <input
                type="text"
                placeholder="Fabric number"
                value={bulkFabricInput}
                onChange={(e) => setBulkFabricInput(e.target.value)}
                style={{ ...inputStyle, marginBottom: '10px' }}
              />
              <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                <button onClick={() => setFabricSelectedRowIds(new Set(activeSheet.rows.map(r => r.id)))} style={{ fontSize: '12px', color: '#7dd3fc', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Select All</button>
                <button onClick={() => setFabricSelectedRowIds(new Set())} style={{ fontSize: '12px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Clear</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto', marginBottom: '10px', border: '1px solid #2a3a4a', borderRadius: '6px', padding: '6px' }}>
                {activeSheet.rows.map(row => {
                  const checked = fabricSelectedRowIds.has(row.id);
                  return (
                    <label key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', background: checked ? '#0e3a4a' : 'transparent', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleInSet(row.id, fabricSelectedRowIds, setFabricSelectedRowIds)} style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: checked ? '#7dd3fc' : '#ccc' }}>
                        {getLocationLabel(row)}
                        <span style={{ color: '#666' }}>{row.fabricNumber.trim() ? ` — ${row.fabricNumber.trim()}` : ' — no fabric yet'}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <button onClick={applyBulkFabric} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0e7490', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                Apply to {fabricSelectedRowIds.size} Selected
              </button>
            </div>
          )}
        </div>

        {/* Bulk Remote Tool - only motorized windows listed, collapsed by default */}
        <div style={{ background: '#2a1a3a', border: '1px solid #6a4a8a', borderRadius: '8px', marginBottom: '16px', overflow: 'hidden' }}>
          <button onClick={() => setShowRemoteTool(!showRemoteTool)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#c4b5fd', fontWeight: 'bold', fontSize: '13px' }}>📡 Bulk Assign Remote Group</span>
            <span style={{ color: '#888', fontSize: '14px' }}>{showRemoteTool ? '▼' : '▶'}</span>
          </button>
          {showRemoteTool && (
            <div style={{ padding: '0 16px 16px 16px' }}>
              {(() => {
                const motorizedRows = activeSheet.rows.filter(r => r.motor !== 'Manual');
                if (motorizedRows.length === 0) {
                  return <p style={{ color: '#888', fontSize: '12px' }}>No motorized windows on this sheet yet.</p>;
                }
                return (
                  <>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                      <button onClick={() => setRemoteSelectedRowIds(new Set(motorizedRows.map(r => r.id)))} style={{ fontSize: '12px', color: '#c4b5fd', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Select All Motorized</button>
                      <button onClick={() => setRemoteSelectedRowIds(new Set())} style={{ fontSize: '12px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Clear</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto', marginBottom: '10px', border: '1px solid #3a2a4a', borderRadius: '6px', padding: '6px' }}>
                      {motorizedRows.map(row => {
                        const checked = remoteSelectedRowIds.has(row.id);
                        const currentLabel = remoteLabels[row.id];
                        return (
                          <label key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', background: checked ? '#3a1a5a' : 'transparent', cursor: 'pointer' }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleInSet(row.id, remoteSelectedRowIds, setRemoteSelectedRowIds)} style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }} />
                            <span style={{ fontSize: '12px', color: checked ? '#c4b5fd' : '#ccc' }}>
                              {getLocationLabel(row)}
                              <span style={{ color: '#666' }}> — {row.motor}{currentLabel ? ` (currently ${currentLabel})` : ''}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
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
              <p style={{ color: '#888', fontSize: '11px', marginTop: '8px' }}>Select windows above, then tap a group to assign them all at once. Channel numbers (#1, #2...) are set automatically.</p>
            </div>
          )}
        </div>

        {/* Rows */}
        {activeSheet.rows.map((row, rowIndex) => {
          const locationLabel = getLocationLabel(row);
          const isMotor = row.motor !== 'Manual';
          const remoteLabel = remoteLabels[row.id] || '';
          const widthCheck = validateMeasurementFormat(row.width);
          const heightCheck = validateMeasurementFormat(row.height);
          const isExpanded = expandedRowId === row.id;
          const isLastRow = rowIndex === activeSheet.rows.length - 1;

          const widthOutlierKey = warningKey([row.id, 'width', row.width]);
          const showWidthWarning = widthCheck.valid && widthOutlierIds.has(row.id) && !acknowledgedWarnings.has(widthOutlierKey);

          const heightOutlierKey = warningKey([row.id, 'height', row.height]);
          const showHeightWarning = heightCheck.valid && heightOutlierIds.has(row.id) && !acknowledgedWarnings.has(heightOutlierKey);

          const roomFabricValues = [...new Set(activeSheet.rows.filter(r => r.locationBase === row.locationBase && r.fabricNumber.trim()).map(r => r.fabricNumber.trim()))];
          const roomHasMixedFabric = roomFabricValues.length > 1;
          const fabricWarningKeyForRoom = warningKey(['fabric', row.locationBase, roomFabricValues.slice().sort().join('|')]);
          const showFabricWarning = roomHasMixedFabric && !acknowledgedWarnings.has(fabricWarningKeyForRoom);

          const hasAnyWarning = showWidthWarning || showHeightWarning || showFabricWarning;

          const incompleteFields = getIncompleteFields(row);
          const isIncomplete = incompleteFields.length > 0;

          const measuredStatus = isIncomplete
            ? `Missing: ${incompleteFields.join(', ')}`
            : `${row.width} x ${row.height}`;

          return (
            <div key={row.id} style={{
              background: isIncomplete ? '#3a1a1a' : (hasAnyWarning ? '#3a2a1a' : '#2a2a2a'),
              border: isIncomplete ? '1px solid #ef4444' : (hasAnyWarning ? '1px solid #f59e0b' : '1px solid #444'),
              borderRadius: '8px', marginBottom: '16px', overflow: 'hidden'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px', paddingBottom: isExpanded ? '12px' : '16px' }}>
                <button
                  onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                >
                  <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#d4af37' }}>
                    {locationLabel}
                    {isIncomplete && <span style={{ marginLeft: '8px', fontSize: '13px' }}>🔴</span>}
                    {!isIncomplete && hasAnyWarning && <span style={{ marginLeft: '8px', fontSize: '13px' }}>⚠️</span>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {!isExpanded && <span style={{ fontSize: '12px', color: isIncomplete ? '#ef4444' : '#4ade80' }}>{measuredStatus}</span>}
                    <span style={{ color: '#888', fontSize: '14px' }}>{isExpanded ? '▼' : '▶'}</span>
                  </span>
                </button>
              </div>

              {isExpanded && (
                <div style={{ padding: '0 16px 16px 16px' }}>
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
                          onChange={(e) => {
                            if (e.target.value === '') {
                              // Unassigning - clear both group and channel
                              updateRow(row.id, { remoteGroup: null, remoteChannel: null });
                              return;
                            }
                            const groupNumber = parseInt(e.target.value, 10);
                            // ✅ BUGFIX: this dropdown previously only set remoteGroup and
                            // never set remoteChannel at all, so a manually-assigned window
                            // had no channel number until it also went through the bulk tool.
                            // Now assigns the next available channel in that group directly,
                            // same 16-channel cap as the bulk tool.
                            if (row.remoteGroup !== groupNumber) {
                              const alreadyInGroup = countInRemoteGroup(activeSheet.rows, groupNumber);
                              if (alreadyInGroup >= MAX_REMOTE_CHANNELS) {
                                alert(`Remote Group ${groupNumber} already has ${alreadyInGroup} windows - a remote only supports ${MAX_REMOTE_CHANNELS} channels. Use a different group.`);
                                return;
                              }
                              const nextChannel = getNextRemoteChannel(activeSheet.rows, groupNumber);
                              updateRow(row.id, { remoteGroup: groupNumber, remoteChannel: nextChannel });
                            }
                          }}
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

                  {!isLastRow ? (
                    <button
                      onClick={() => setExpandedRowId(activeSheet.rows[rowIndex + 1].id)}
                      style={{ width: '100%', padding: '12px', marginTop: '16px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
                    >
                      Next Window →
                    </button>
                  ) : (
                    <button
                      onClick={() => setExpandedRowId(null)}
                      style={{ width: '100%', padding: '12px', marginTop: '16px', borderRadius: '8px', background: '#333', color: '#ccc', border: '1px solid #555', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
                    >
                      ✓ Last Window - Done
                    </button>
                  )}
                </div>
              )}
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
