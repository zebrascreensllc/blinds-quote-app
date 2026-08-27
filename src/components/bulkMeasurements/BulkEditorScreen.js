import React from 'react';
import { Trash2 } from 'lucide-react';
import {
  MOTOR_OPTIONS,
  CASSETTE_OPTIONS,
  MOUNT_OPTIONS,
  validateMeasurementFormat,
  getLocationLabel,
  getIncompleteFields,
  findRoomsWithMixedFabric,
  normalizeRoomKey,
  buildRowExportFields
} from '../../utils/measurementUtils';

const inputStyle = { width: '100%', padding: '8px', borderRadius: '6px', fontSize: '13px', background: '#1a1a1a', border: '1px solid #444', color: 'white', boxSizing: 'border-box' };
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const labelStyle = { fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' };
const errorTextStyle = { fontSize: '11px', color: '#ef4444', marginTop: '4px' };
const cellStyle = { padding: '6px', fontSize: '12px', color: '#ccc', borderBottom: '1px solid #333', verticalAlign: 'top' };
const headerCellStyle = { padding: '8px 6px', fontSize: '11px', fontWeight: 'bold', color: '#fff', textAlign: 'left', borderBottom: '1px solid #444', whiteSpace: 'nowrap' };
// Frozen first column for the Review table - Location stays put while the
// rest of the (much wider) table scrolls underneath it. Needs an opaque
// background of its own, otherwise scrolled-under cells would show through.
const stickyHeaderCellStyle = { ...headerCellStyle, position: 'sticky', left: 0, zIndex: 2, background: '#1a1a1a' };
const stickyBodyCellStyle = (isIncomplete) => ({ ...cellStyle, position: 'sticky', left: 0, zIndex: 1, background: isIncomplete ? '#3a1a1a' : '#242424', color: '#d4af37', fontWeight: 'bold' });

// Generic bulk-tool checklist body, reused by every "select windows, then
// apply" panel below - same interaction pattern as the original feature's
// Bulk Assign Fabric/Remote tools, just shared instead of copy-pasted 6 times.
function RowChecklist({ rows, selectedIds, toggleInSet, setSelectedIds, renderLabel, accentColor }) {
  if (rows.length === 0) {
    return <p style={{ color: '#888', fontSize: '12px' }}>No matching windows on this sheet.</p>;
  }
  return (
    <>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
        <button onClick={() => setSelectedIds(new Set(rows.map(r => r.id)))} style={{ fontSize: '12px', color: accentColor, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Select All</button>
        <button onClick={() => setSelectedIds(new Set())} style={{ fontSize: '12px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Clear</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto', marginBottom: '10px', border: '1px solid #333', borderRadius: '6px', padding: '6px' }}>
        {rows.map(row => {
          const checked = selectedIds.has(row.id);
          return (
            <label key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', background: checked ? 'rgba(255,255,255,0.08)' : 'transparent', cursor: 'pointer' }}>
              <input type="checkbox" checked={checked} onChange={() => toggleInSet(row.id, selectedIds, setSelectedIds)} style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: checked ? accentColor : '#ccc' }}>{renderLabel(row)}</span>
            </label>
          );
        })}
      </div>
    </>
  );
}

// Collapsible wrapper shared by every bulk tool section below.
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

// Bulk-first rebuild of SheetEditorScreen.js, trialed as a separate feature -
// same measurementUtils.js formulas/validation/export, same data model,
// deliberately different layout: (1) width/height/comment inline in a table
// for every window, (2)-(7) one bulk-assign tool per remaining field in the
// order requested, (8) a read-only review table showing everything together,
// (9) the same Copy/CSV/Excel export as the original feature.
export default function BulkEditorScreen({
  activeSheet,
  onBack,
  syncStatus,
  updateActiveSheet,
  updateRow,
  updateRowLocation,
  addWindowRow,
  deleteWindowRow,
  moveWindowRow,
  remoteLabels,
  widthOutlierIds,
  heightOutlierIds,
  acknowledgedWarnings,
  warningKey,
  acknowledgeWarning,
  toggleInSet,
  expandedRowId,
  setExpandedRowId,

  showFabricTool,
  setShowFabricTool,
  bulkFabricInput,
  setBulkFabricInput,
  fabricSelectedRowIds,
  setFabricSelectedRowIds,
  applyBulkFabric,

  showMotorTool,
  setShowMotorTool,
  bulkMotorValue,
  setBulkMotorValue,
  bulkMotorCustomText,
  setBulkMotorCustomText,
  motorSelectedRowIds,
  setMotorSelectedRowIds,
  applyBulkMotor,

  showSolarTool,
  setShowSolarTool,
  bulkSolarValue,
  setBulkSolarValue,
  solarSelectedRowIds,
  setSolarSelectedRowIds,
  applyBulkSolar,

  showMotorSideTool,
  setShowMotorSideTool,
  bulkMotorSideValue,
  setBulkMotorSideValue,
  motorSideSelectedRowIds,
  setMotorSideSelectedRowIds,
  applyBulkMotorSide,

  showRemoteTool,
  setShowRemoteTool,
  remoteSelectedRowIds,
  setRemoteSelectedRowIds,
  existingGroups,
  nextGroupNumber,
  applyBulkRemoteGroup,
  applyBulkRemoteUnassign,

  showCassetteTool,
  setShowCassetteTool,
  bulkCassetteValue,
  setBulkCassetteValue,
  bulkCassetteCustomText,
  setBulkCassetteCustomText,
  cassetteSelectedRowIds,
  setCassetteSelectedRowIds,
  applyBulkCassette,

  showMountTool,
  setShowMountTool,
  bulkMountValue,
  setBulkMountValue,
  bulkMountCustomText,
  setBulkMountCustomText,
  mountSelectedRowIds,
  setMountSelectedRowIds,
  applyBulkMount,

  copyCSV,
  shareCSV,
  exportCSV,
  exportExcel
}) {
  if (!activeSheet) {
    return (
      <div style={{ background: '#1a1a1a', minHeight: '100vh', padding: '24px', color: '#fff' }}>
        <p>Sheet not found.</p>
        <button onClick={onBack} style={{ marginTop: '12px', padding: '10px 16px', borderRadius: '8px', background: '#444', border: 'none', color: '#fff', cursor: 'pointer' }}>Back to list</button>
      </div>
    );
  }

  const rows = activeSheet.rows;
  const motorizedRows = rows.filter(r => r.motor !== 'Manual');
  const roomsWithMixedFabric = new Set(findRoomsWithMixedFabric(rows));

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button onClick={onBack} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer', color: '#fff' }}>← Back</button>
          <div style={{ width: '60px' }} />
        </div>

        {syncStatus && !syncStatus.ok && (
          <div style={{ padding: '12px', marginBottom: '16px', background: '#3a1a1a', border: '1px solid #ef4444', borderRadius: '8px' }}>
            <p style={{ color: '#f87171', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
              ⚠️ {syncStatus.failedCount} change{syncStatus.failedCount > 1 ? 's' : ''} not yet saved to the cloud
            </p>
            <p style={{ color: '#ccc', fontSize: '12px' }}>{syncStatus.lastError} — your local copy is safe, and this keeps retrying automatically.</p>
          </div>
        )}

        {activeSheet.clientNames?.length > 0 && (
          <p style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '18px', marginBottom: '8px' }}>{activeSheet.clientNames.join(', ')}</p>
        )}
        <input
          type="text"
          placeholder="Address"
          value={activeSheet.address}
          onChange={(e) => updateActiveSheet(sheet => ({ ...sheet, address: e.target.value }))}
          style={{ ...inputStyle, fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}
        />
        <p style={{ color: '#888', fontSize: '12px', marginBottom: '20px' }}>
          {activeSheet.sourceQuoteNames?.length > 0 ? `${activeSheet.sourceQuoteNames.join(', ')} • ` : ''}{rows.length} window{rows.length === 1 ? '' : 's'}
        </p>

        {/* 1. Windows - width/height/comment only. A stacked card per window
            instead of a table - on a phone-width screen, 4 side-by-side
            table columns can't all fit without horizontal scrolling, which
            is exactly what this section exists to avoid. Accordion, same
            pattern as the original feature: only the current window's card
            is open, with a "Next Window" button advancing to the next one -
            finished windows collapse to a one-line summary instead of
            staying expanded and pushing everything else down the page. */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>1. Windows</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
          {rows.map((row, rowIndex) => {
            const widthCheck = validateMeasurementFormat(row.width);
            const heightCheck = validateMeasurementFormat(row.height);
            const widthOutlierKey = warningKey([row.id, 'width', row.width]);
            const showWidthWarning = widthCheck.valid && widthOutlierIds.has(row.id) && !acknowledgedWarnings.has(widthOutlierKey);
            const heightOutlierKey = warningKey([row.id, 'height', row.height]);
            const showHeightWarning = heightCheck.valid && heightOutlierIds.has(row.id) && !acknowledgedWarnings.has(heightOutlierKey);
            const isExpanded = expandedRowId === row.id;
            const isFirstRow = rowIndex === 0;
            const isLastRow = rowIndex === rows.length - 1;

            const missing = [!row.width.trim() && 'width', !row.height.trim() && 'height'].filter(Boolean);
            const hasFormatError = !widthCheck.valid || !heightCheck.valid;
            const summaryText = missing.length > 0
              ? `Missing: ${missing.join(', ')}`
              : `${row.width} x ${row.height}`;
            const summaryColor = missing.length > 0 || hasFormatError ? '#ef4444' : '#4ade80';

            return (
              <div key={row.id} style={{ background: '#242424', border: '1px solid #444', borderRadius: '8px', overflow: 'hidden' }}>
                {/* ✅ FIX: delete used to sit right next to the collapse
                    chevron on the far right, so a tap meant to collapse the
                    card could land on Delete instead. Moved next to the
                    location name (far left) - collapse (right) and delete
                    (left) are now as far apart as the card allows. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '12px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: row.locationBase.trim() ? '#d4af37' : '#888', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    {getLocationLabel(row)}
                    {row.comment && row.comment.trim() && <span style={{ marginLeft: '8px', fontSize: '13px' }} title={row.comment}>💬</span>}
                  </span>
                  <button
                    onClick={() => deleteWindowRow(row.id)}
                    title="Delete this window"
                    style={{ padding: '6px', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                    style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {!isExpanded && <span style={{ fontSize: '12px', color: summaryColor }}>{summaryText}</span>}
                    <span style={{ color: '#888', fontSize: '14px' }}>{isExpanded ? '▼' : '▶'}</span>
                  </button>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 12px 12px 12px' }}>
                    {/* ✅ NEW: manual reordering - up/down instead of drag-
                        and-drop, since drag targets are unreliable on a
                        touch screen inside a scrolling list. */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <button
                        onClick={() => moveWindowRow(row.id, 'up')}
                        disabled={isFirstRow}
                        style={{ flex: 1, padding: '8px', borderRadius: '6px', background: '#1a1a1a', border: '1px solid #444', color: isFirstRow ? '#555' : '#ccc', cursor: isFirstRow ? 'default' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                      >
                        ↑ Move Up
                      </button>
                      <button
                        onClick={() => moveWindowRow(row.id, 'down')}
                        disabled={isLastRow}
                        style={{ flex: 1, padding: '8px', borderRadius: '6px', background: '#1a1a1a', border: '1px solid #444', color: isLastRow ? '#555' : '#ccc', cursor: isLastRow ? 'default' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                      >
                        ↓ Move Down
                      </button>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={labelStyle}>Location (e.g. Living Room)</label>
                      <input
                        type="text"
                        value={row.locationBase}
                        onChange={(e) => updateRowLocation(row.id, e.target.value)}
                        placeholder={`e.g. Living Room (blank shows as "${getLocationLabel(row)}")`}
                        style={{ ...inputStyle, border: !row.locationBase.trim() ? '1px solid #ef4444' : inputStyle.border }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <div>
                        <label style={labelStyle}>Width</label>
                        <input
                          type="text"
                          value={row.width}
                          onChange={(e) => updateRow(row.id, { width: e.target.value })}
                          placeholder="e.g. 34 5/16"
                          style={{ ...inputStyle, border: !widthCheck.valid ? '1px solid #ef4444' : (showWidthWarning ? '1px solid #f59e0b' : inputStyle.border) }}
                        />
                        {!widthCheck.valid && <p style={errorTextStyle}>{widthCheck.message}</p>}
                        {showWidthWarning && (
                          <div style={{ marginTop: '4px' }}>
                            <p style={{ fontSize: '11px', color: '#f59e0b' }}>⚠️ Different from others in "{row.locationBase}".</p>
                            <button onClick={() => acknowledgeWarning(widthOutlierKey)} style={{ fontSize: '11px', color: '#4ade80', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>✓ Correct</button>
                          </div>
                        )}
                      </div>
                      <div>
                        <label style={labelStyle}>Height</label>
                        <input
                          type="text"
                          value={row.height}
                          onChange={(e) => updateRow(row.id, { height: e.target.value })}
                          placeholder="e.g. 75 13/16"
                          style={{ ...inputStyle, border: !heightCheck.valid ? '1px solid #ef4444' : (showHeightWarning ? '1px solid #f59e0b' : inputStyle.border) }}
                        />
                        {!heightCheck.valid && <p style={errorTextStyle}>{heightCheck.message}</p>}
                        {showHeightWarning && (
                          <div style={{ marginTop: '4px' }}>
                            <p style={{ fontSize: '11px', color: '#f59e0b' }}>⚠️ Different from others in "{row.locationBase}".</p>
                            <button onClick={() => acknowledgeWarning(heightOutlierKey)} style={{ fontSize: '11px', color: '#4ade80', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>✓ Correct</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={labelStyle}>Comment</label>
                      <input
                        type="text"
                        value={row.comment || ''}
                        onChange={(e) => updateRow(row.id, { comment: e.target.value })}
                        placeholder="e.g. Side-by-side"
                        style={inputStyle}
                      />
                    </div>

                    {!isLastRow ? (
                      <button
                        onClick={() => setExpandedRowId(rows[rowIndex + 1].id)}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#4ade80', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
                      >
                        Next Window →
                      </button>
                    ) : (
                      <button
                        onClick={() => setExpandedRowId(null)}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#333', color: '#ccc', border: '1px solid #555', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
                      >
                        ✓ Last Window - Done
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={addWindowRow}
          style={{ width: '100%', padding: '12px', marginBottom: '24px', borderRadius: '6px', color: '#888', fontWeight: 'bold', fontSize: '14px', background: 'transparent', border: '2px dashed #555', cursor: 'pointer' }}
        >
          + Add Window
        </button>

        {/* 2. Bulk Assign Fabric */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>2. Bulk Assign Fabric</p>
        <BulkToolPanel title="Bulk Assign Fabric" icon="🧵" bg="#1a2a3a" border="#4a6a8a" accentColor="#7dd3fc" isOpen={showFabricTool} onToggle={() => setShowFabricTool(!showFabricTool)}>
          <input
            type="text"
            placeholder="Fabric number"
            value={bulkFabricInput}
            onChange={(e) => setBulkFabricInput(e.target.value)}
            style={{ ...inputStyle, marginBottom: '10px' }}
          />
          <RowChecklist
            rows={rows}
            selectedIds={fabricSelectedRowIds}
            toggleInSet={toggleInSet}
            setSelectedIds={setFabricSelectedRowIds}
            accentColor="#7dd3fc"
            renderLabel={(row) => (
              <>{getLocationLabel(row)}<span style={{ color: '#666' }}>{row.fabricNumber.trim() ? ` — ${row.fabricNumber.trim()}` : ' — no fabric yet'}</span></>
            )}
          />
          <button onClick={applyBulkFabric} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0e7490', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
            Apply to {fabricSelectedRowIds.size} Selected
          </button>
        </BulkToolPanel>

        {/* 3. Bulk Assign Motor */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>3. Bulk Assign Motor</p>
        <BulkToolPanel title="Bulk Assign Motor" icon="⚙️" bg="#2a2a1a" border="#8a7a4a" accentColor="#fbbf24" isOpen={showMotorTool} onToggle={() => setShowMotorTool(!showMotorTool)}>
          <label style={labelStyle}>Set Motor to</label>
          <select value={bulkMotorValue} onChange={(e) => setBulkMotorValue(e.target.value)} style={{ ...selectStyle, marginBottom: '10px' }}>
            {MOTOR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          {bulkMotorValue === 'Custom' && (
            <input
              type="text"
              placeholder="Type motor type"
              value={bulkMotorCustomText}
              onChange={(e) => setBulkMotorCustomText(e.target.value)}
              style={{ ...inputStyle, marginBottom: '10px' }}
            />
          )}
          {bulkMotorValue === 'Manual' && (
            <p style={{ fontSize: '11px', color: '#888', marginBottom: '10px', fontStyle: 'italic' }}>Setting to Manual also clears Solar and Remote Group on the selected windows.</p>
          )}
          <RowChecklist
            rows={rows}
            selectedIds={motorSelectedRowIds}
            toggleInSet={toggleInSet}
            setSelectedIds={setMotorSelectedRowIds}
            accentColor="#fbbf24"
            renderLabel={(row) => (
              <>{getLocationLabel(row)}<span style={{ color: '#666' }}> — currently {row.motor}</span></>
            )}
          />
          <button onClick={applyBulkMotor} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#a16207', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
            Apply to {motorSelectedRowIds.size} Selected
          </button>
        </BulkToolPanel>

        {/* 4. Bulk Assign Solar */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>4. Bulk Assign Solar</p>
        <BulkToolPanel title="Bulk Assign Solar (motorized windows only)" icon="☀️" bg="#2a2a1a" border="#8a8a4a" accentColor="#fde047" isOpen={showSolarTool} onToggle={() => setShowSolarTool(!showSolarTool)}>
          <label style={labelStyle}>Set Solar to</label>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <button
              onClick={() => setBulkSolarValue(false)}
              style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: !bulkSolarValue ? '#0e7490' : '#1a1a1a', color: !bulkSolarValue ? '#fff' : '#888', border: !bulkSolarValue ? '1px solid #0e7490' : '1px solid #444' }}
            >
              No
            </button>
            <button
              onClick={() => setBulkSolarValue(true)}
              style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: bulkSolarValue ? '#0e7490' : '#1a1a1a', color: bulkSolarValue ? '#fff' : '#888', border: bulkSolarValue ? '1px solid #0e7490' : '1px solid #444' }}
            >
              Yes
            </button>
          </div>
          {motorizedRows.length === 0 ? (
            <p style={{ color: '#888', fontSize: '12px' }}>No motorized windows yet - assign Motor above first.</p>
          ) : (
            <RowChecklist
              rows={motorizedRows}
              selectedIds={solarSelectedRowIds}
              toggleInSet={toggleInSet}
              setSelectedIds={setSolarSelectedRowIds}
              accentColor="#fde047"
              renderLabel={(row) => (
                <>{getLocationLabel(row)}<span style={{ color: '#666' }}> — {row.motor}, Solar currently {row.solar ? 'Yes' : 'No'}</span></>
              )}
            />
          )}
          <button onClick={applyBulkSolar} disabled={motorizedRows.length === 0} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#a16207', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: motorizedRows.length === 0 ? 'default' : 'pointer', opacity: motorizedRows.length === 0 ? 0.5 : 1 }}>
            Apply to {solarSelectedRowIds.size} Selected
          </button>
        </BulkToolPanel>

        {/* 5. Bulk Assign Motor Side - parity with the original feature's
            per-row Right/Left toggle (Right is the default, never written to
            export; Left is the exception, shows as "Smart - Left side"). */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>5. Bulk Assign Motor Side</p>
        <BulkToolPanel title="Bulk Assign Motor Side (motorized windows only)" icon="↔️" bg="#2a1a1a" border="#8a5a4a" accentColor="#fca5a5" isOpen={showMotorSideTool} onToggle={() => setShowMotorSideTool(!showMotorSideTool)}>
          <label style={labelStyle}>Set Side to</label>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <button
              onClick={() => setBulkMotorSideValue('')}
              style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: bulkMotorSideValue === '' ? '#0e7490' : '#1a1a1a', color: bulkMotorSideValue === '' ? '#fff' : '#888', border: bulkMotorSideValue === '' ? '1px solid #0e7490' : '1px solid #444' }}
            >
              Right (default)
            </button>
            <button
              onClick={() => setBulkMotorSideValue('Left')}
              style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: bulkMotorSideValue === 'Left' ? '#0e7490' : '#1a1a1a', color: bulkMotorSideValue === 'Left' ? '#fff' : '#888', border: bulkMotorSideValue === 'Left' ? '1px solid #0e7490' : '1px solid #444' }}
            >
              Left
            </button>
          </div>
          {motorizedRows.length === 0 ? (
            <p style={{ color: '#888', fontSize: '12px' }}>No motorized windows yet - assign Motor above first.</p>
          ) : (
            <RowChecklist
              rows={motorizedRows}
              selectedIds={motorSideSelectedRowIds}
              toggleInSet={toggleInSet}
              setSelectedIds={setMotorSideSelectedRowIds}
              accentColor="#fca5a5"
              renderLabel={(row) => (
                <>{getLocationLabel(row)}<span style={{ color: '#666' }}> — {row.motor}, Side currently {row.motorSide === 'Left' ? 'Left' : 'Right (default)'}</span></>
              )}
            />
          )}
          <button onClick={applyBulkMotorSide} disabled={motorizedRows.length === 0} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#991b1b', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: motorizedRows.length === 0 ? 'default' : 'pointer', opacity: motorizedRows.length === 0 ? 0.5 : 1 }}>
            Apply to {motorSideSelectedRowIds.size} Selected
          </button>
        </BulkToolPanel>

        {/* 6. Bulk Assign Remote Group */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>6. Bulk Assign Remote Group</p>
        <BulkToolPanel title="Bulk Assign Remote Group" icon="📡" bg="#2a1a3a" border="#6a4a8a" accentColor="#c4b5fd" isOpen={showRemoteTool} onToggle={() => setShowRemoteTool(!showRemoteTool)}>
          {motorizedRows.length === 0 ? (
            <p style={{ color: '#888', fontSize: '12px' }}>No motorized windows on this sheet yet.</p>
          ) : (
            <RowChecklist
              rows={motorizedRows}
              selectedIds={remoteSelectedRowIds}
              toggleInSet={toggleInSet}
              setSelectedIds={setRemoteSelectedRowIds}
              accentColor="#c4b5fd"
              renderLabel={(row) => {
                const currentLabel = remoteLabels[row.id];
                return (
                  <>{getLocationLabel(row)}<span style={{ color: '#666' }}> — {row.motor}{currentLabel ? ` (currently ${currentLabel})` : ''}</span></>
                );
              }}
            />
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {existingGroups.map(g => (
              <button key={g} onClick={() => applyBulkRemoteGroup(g)} style={{ padding: '10px 14px', borderRadius: '6px', background: '#4c1d95', color: '#fff', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>
                Group {g}
              </button>
            ))}
            <button onClick={() => applyBulkRemoteGroup(nextGroupNumber)} style={{ padding: '10px 14px', borderRadius: '6px', background: '#6d28d9', color: '#fff', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>
              + New Group {nextGroupNumber}
            </button>
            <button onClick={applyBulkRemoteUnassign} style={{ padding: '10px 14px', borderRadius: '6px', background: '#444', color: '#fff', border: '1px solid #666', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>
              Unassign
            </button>
          </div>
          <p style={{ color: '#888', fontSize: '11px', marginTop: '8px' }}>Select windows above, then tap a group to assign them all at once (channel numbers are set automatically), or Unassign to clear their remote group.</p>
        </BulkToolPanel>

        {/* 6. Bulk Assign Cassette */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>7. Bulk Assign Cassette</p>
        <BulkToolPanel title="Bulk Assign Cassette" icon="🧱" bg="#1a2a2a" border="#4a8a7a" accentColor="#5eead4" isOpen={showCassetteTool} onToggle={() => setShowCassetteTool(!showCassetteTool)}>
          <label style={labelStyle}>Set Cassette to</label>
          <select value={bulkCassetteValue} onChange={(e) => setBulkCassetteValue(e.target.value)} style={{ ...selectStyle, marginBottom: '10px' }}>
            {CASSETTE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          {bulkCassetteValue === 'Custom' && (
            <input
              type="text"
              placeholder="Describe cassette"
              value={bulkCassetteCustomText}
              onChange={(e) => setBulkCassetteCustomText(e.target.value)}
              style={{ ...inputStyle, marginBottom: '10px' }}
            />
          )}
          <RowChecklist
            rows={rows}
            selectedIds={cassetteSelectedRowIds}
            toggleInSet={toggleInSet}
            setSelectedIds={setCassetteSelectedRowIds}
            accentColor="#5eead4"
            renderLabel={(row) => (
              <>{getLocationLabel(row)}<span style={{ color: '#666' }}> — currently {row.cassette === 'Custom' ? (row.cassetteCustomText || 'Custom') : row.cassette}</span></>
            )}
          />
          <button onClick={applyBulkCassette} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0f766e', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
            Apply to {cassetteSelectedRowIds.size} Selected
          </button>
        </BulkToolPanel>

        {/* 7. Bulk Assign Mount */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>8. Bulk Assign Mount</p>
        <BulkToolPanel title="Bulk Assign Mount" icon="🔩" bg="#2a1a2a" border="#8a4a7a" accentColor="#f0abfc" isOpen={showMountTool} onToggle={() => setShowMountTool(!showMountTool)}>
          <label style={labelStyle}>Set Mount to</label>
          <select value={bulkMountValue} onChange={(e) => setBulkMountValue(e.target.value)} style={{ ...selectStyle, marginBottom: '10px' }}>
            {MOUNT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            <option value="Custom">Custom</option>
          </select>
          {bulkMountValue === 'Custom' && (
            <input
              type="text"
              placeholder="Type mount"
              value={bulkMountCustomText}
              onChange={(e) => setBulkMountCustomText(e.target.value)}
              style={{ ...inputStyle, marginBottom: '10px' }}
            />
          )}
          <RowChecklist
            rows={rows}
            selectedIds={mountSelectedRowIds}
            toggleInSet={toggleInSet}
            setSelectedIds={setMountSelectedRowIds}
            accentColor="#f0abfc"
            renderLabel={(row) => (
              <>{getLocationLabel(row)}<span style={{ color: '#666' }}> — currently {row.mount}</span></>
            )}
          />
          <button onClick={applyBulkMount} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#86198f', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
            Apply to {mountSelectedRowIds.size} Selected
          </button>
        </BulkToolPanel>

        {/* 8. Review table - read-only, same fields the export actually uses */}
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', marginTop: '8px' }}>9. Review</p>
        <div style={{ overflowX: 'auto', marginBottom: '24px', border: '1px solid #444', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#1a1a1a' }}>
              <tr>
                <th style={stickyHeaderCellStyle}>Location</th>
                <th style={headerCellStyle}>Comment</th>
                <th style={headerCellStyle}>Manual/Smart</th>
                <th style={headerCellStyle}>Motor-type</th>
                <th style={headerCellStyle}>Remote</th>
                <th style={headerCellStyle}>Cassette</th>
                <th style={headerCellStyle}>Mount</th>
                <th style={headerCellStyle}>Fabric</th>
                <th style={headerCellStyle}>Width</th>
                <th style={headerCellStyle}>Height</th>
                <th style={headerCellStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const f = buildRowExportFields(row, idx, remoteLabels);
                const incompleteFields = getIncompleteFields(row);
                const isIncomplete = incompleteFields.length > 0;
                const mixedFabricWarning = roomsWithMixedFabric.has(normalizeRoomKey(row.locationBase));
                return (
                  <tr key={row.id} style={{ background: isIncomplete ? 'rgba(239,68,68,0.08)' : 'transparent' }}>
                    <td style={stickyBodyCellStyle(isIncomplete)}>{f.location}</td>
                    <td style={{ ...cellStyle, background: f.hasComment ? 'rgba(250,204,21,0.15)' : 'transparent' }}>{f.comment || '—'}</td>
                    <td style={{ ...cellStyle, background: f.hasMotorVariant ? 'rgba(250,204,21,0.15)' : 'transparent' }}>{f.manualSmart}</td>
                    <td style={cellStyle}>{f.motorType || '—'}</td>
                    <td style={cellStyle}>{f.remote || '—'}</td>
                    <td style={cellStyle}>{f.cassette}</td>
                    <td style={{ ...cellStyle, background: f.hasNonDefaultMount ? 'rgba(250,204,21,0.15)' : 'transparent' }}>{f.mount}</td>
                    <td style={cellStyle}>
                      {f.fabricNumber || '—'}
                      {mixedFabricWarning && <div style={{ color: '#f59e0b', fontSize: '10px' }}>⚠️ room has mixed fabric</div>}
                    </td>
                    <td style={cellStyle}>{f.width || '—'}</td>
                    <td style={cellStyle}>{f.height || '—'}</td>
                    <td style={{ ...cellStyle, color: isIncomplete ? '#f87171' : '#4ade80', fontWeight: 'bold' }}>
                      {isIncomplete ? `Missing: ${incompleteFields.join(', ')}` : 'Ready'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 10. Export - Copy and Share did the same job (get the CSV text
            somewhere else), with Share strictly more convenient wherever
            it's available (skips copy-then-switch-app-then-paste, and its
            own native share sheet already offers a Copy option). Same
            consolidation as the quote view: only one shows. */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {typeof navigator.share === 'function' ? (
            <button onClick={shareCSV} style={{ flex: '1 1 100px', padding: '14px', borderRadius: '8px', background: '#d4af37', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>
              📤 Share
            </button>
          ) : (
            <button onClick={copyCSV} style={{ flex: '1 1 100px', padding: '14px', borderRadius: '8px', background: '#d4af37', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>
              📋 Copy
            </button>
          )}
          <button onClick={exportCSV} style={{ flex: '1 1 100px', padding: '14px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>
            ⬇️ CSV
          </button>
        </div>
        <div style={{ marginBottom: '32px' }}>
          <button onClick={exportExcel} style={{ width: '100%', padding: '14px', borderRadius: '8px', background: '#1d6f42', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>
            📊 Download Excel (with highlighting)
          </button>
        </div>
      </div>
    </div>
  );
}
