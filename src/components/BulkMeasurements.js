import React, { useState, useEffect } from 'react';
import {
  validateMeasurementFormat,
  findRoomSizeOutliers,
  getLocationLabel,
  computeRemoteLabels,
  expandQuoteIntoRows,
  getIncompleteFields,
  getNextRemoteChannel,
  countInRemoteGroup,
  MAX_REMOTE_CHANNELS,
  sheetToCSV,
  DEFAULT_MOTOR_TYPE,
  DEFAULT_CASSETTE,
  DEFAULT_MOUNT,
  createBlankMeasurementRow,
  recomputeLocationIndices
} from '../utils/measurementUtils';
import SheetListScreen from './measurements/SheetListScreen';
import QuoteSelectScreen from './measurements/QuoteSelectScreen';
import ManualEntryScreen from './bulkMeasurements/ManualEntryScreen';
import BulkEditorScreen from './bulkMeasurements/BulkEditorScreen';
import { subscribeToBulkSheets, saveBulkSheetRemote, deleteBulkSheetRemote } from '../services/bulkMeasurementSync';
import { sheetToExcelBuffer } from '../utils/xlsxExport';
// ✅ NEW: fabric-existence check, reused from the quote side (same
// isFabricValid already used by the "Invalid Fabrics" warning there). This
// is a deliberate, explicit exception to measurementUtils.js's own
// zero-pricing-import isolation - imported here in the container only,
// never into measurementUtils.js itself, and only for Bulk Measurements
// (the original Supplier Measurements feature is intentionally untouched).
import { isFabricValid, findDiscontinuedFabrics, findClosestFabricMatch } from '../utils/pricing';
import { PRICING_DATA } from '../data/pricingData';

// Same identity/export-naming convention as SupplierMeasurements.js.
const exportFileLabel = (sheet) => (sheet.clientNames?.length ? sheet.clientNames.join('_') : (sheet.address || 'measurements'));

// A parallel workflow to SupplierMeasurements.js, trialed alongside it so the
// business can compare which is faster day-to-day before deciding to drop
// one. Deliberately the SAME data model, the SAME measurementUtils.js
// formulas/validation/export logic, and the SAME list/quote-picker screens
// (reused unchanged, since neither of those differ between the two
// workflows) - only the editor screen's layout and data-entry order differ:
// width/height/comment inline in a table, then one bulk tool per remaining
// field (fabric/motor/solar/remote/cassette/mount) in that order, then a
// review table, matching what was asked for instead of the original's
// per-row accordion with every field editable in place.
export default function BulkMeasurements({ quotes, onBack, uid }) {
  const [sheets, setSheets] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [screen, setScreen] = useState('list'); // 'list' | 'select' | 'manual' | 'editor'
  const [selectedQuoteIds, setSelectedQuoteIds] = useState(new Set());
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [activeSheetId, setActiveSheetId] = useState(null);

  // Each bulk tool gets its OWN row selection, same reasoning as the
  // original feature's fabric/remote split - a leftover selection in one
  // tool should never silently apply to a different field.
  const [fabricSelectedRowIds, setFabricSelectedRowIds] = useState(new Set());
  const [motorSelectedRowIds, setMotorSelectedRowIds] = useState(new Set());
  const [solarSelectedRowIds, setSolarSelectedRowIds] = useState(new Set());
  // ✅ NEW: parity with the original feature's per-row Right/Left toggle -
  // motorSide only makes sense for a motorized window, same scoping as Solar.
  const [motorSideSelectedRowIds, setMotorSideSelectedRowIds] = useState(new Set());
  const [remoteSelectedRowIds, setRemoteSelectedRowIds] = useState(new Set());
  const [cassetteSelectedRowIds, setCassetteSelectedRowIds] = useState(new Set());
  const [mountSelectedRowIds, setMountSelectedRowIds] = useState(new Set());

  const [bulkFabricInput, setBulkFabricInput] = useState('');
  const [bulkMotorValue, setBulkMotorValue] = useState(DEFAULT_MOTOR_TYPE);
  const [bulkMotorCustomText, setBulkMotorCustomText] = useState('');
  const [bulkSolarValue, setBulkSolarValue] = useState(false);
  const [bulkMotorSideValue, setBulkMotorSideValue] = useState(''); // '' = Right (default), 'Left' = the exception
  const [bulkCassetteValue, setBulkCassetteValue] = useState(DEFAULT_CASSETTE);
  const [bulkCassetteCustomText, setBulkCassetteCustomText] = useState('');
  const [bulkMountValue, setBulkMountValue] = useState(DEFAULT_MOUNT);
  // 'Custom' is a Bulk-Measurements-only UI option, not part of the shared
  // MOUNT_OPTIONS list (adding it there would leak into the original
  // feature's per-row Mount dropdown too). row.mount is a free-text field
  // at the data layer, so applying "Custom" just writes the typed text
  // straight into row.mount - no separate mountCustomText field needed,
  // and export needs no changes since it already just reads row.mount as-is.
  const [bulkMountCustomText, setBulkMountCustomText] = useState('');

  // Accordion - only one window's Width/Height/Comment card is open at a
  // time, so entering measurements for many windows in sequence doesn't
  // mean scrolling past every already-finished card. Same pattern as the
  // original feature's expandedRowId, seeded to the first row whenever a
  // sheet is opened or created.
  const [expandedRowId, setExpandedRowId] = useState(null);

  // Every bulk panel collapses by default - same reasoning as the original:
  // don't take up space with a window checklist until it's actually needed.
  const [showFabricTool, setShowFabricTool] = useState(false);
  const [showMotorTool, setShowMotorTool] = useState(false);
  const [showSolarTool, setShowSolarTool] = useState(false);
  const [showMotorSideTool, setShowMotorSideTool] = useState(false);
  const [showRemoteTool, setShowRemoteTool] = useState(false);
  const [showCassetteTool, setShowCassetteTool] = useState(false);
  const [showMountTool, setShowMountTool] = useState(false);

  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState(new Set());

  const [syncStatus, setSyncStatus] = useState({ ok: true, failedCount: 0, lastError: null });
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!uid) return;
    const unsubscribe = subscribeToBulkSheets(
      uid,
      (remoteSheets) => {
        setSheets(remoteSheets);
        setHasLoaded(true);
        setLoadError(null);
      },
      (error) => {
        console.error('Bulk measurement sheet sync error:', error);
        setHasLoaded(true);
        setLoadError(error?.message || 'Could not load your measurement sheets.');
      }
    );
    return () => unsubscribe();
  }, [uid]);

  const activeSheet = sheets.find(s => s.id === activeSheetId) || null;

  // Same diffing write-through pattern as SupplierMeasurements.js/App.js.
  const updateSheets = (newSheetsOrUpdater) => {
    const newSheets = typeof newSheetsOrUpdater === 'function' ? newSheetsOrUpdater(sheets) : newSheetsOrUpdater;
    const oldById = new Map(sheets.map(s => [s.id, s]));
    const newIds = new Set(newSheets.map(s => s.id));

    const toSave = newSheets.filter(s => {
      const old = oldById.get(s.id);
      return !old || JSON.stringify(old) !== JSON.stringify(s);
    });
    const toDeleteIds = [];
    oldById.forEach((s, id) => { if (!newIds.has(id)) toDeleteIds.push(id); });

    const attempts = [
      ...toSave.map(s => saveBulkSheetRemote(uid, s).then(() => ({ ok: true })).catch(err => {
        console.error('Failed to save bulk sheet', s.id, err);
        return { ok: false, message: err?.message || String(err) };
      })),
      ...toDeleteIds.map(id => deleteBulkSheetRemote(uid, id).then(() => ({ ok: true })).catch(err => {
        console.error('Failed to delete bulk sheet', id, err);
        return { ok: false, message: err?.message || String(err) };
      }))
    ];

    if (attempts.length === 0) return Promise.resolve({ success: true, errors: [] });

    return Promise.all(attempts).then(results => {
      const failed = results.filter(r => !r.ok);
      setSyncStatus(
        failed.length > 0
          ? { ok: false, failedCount: failed.length, lastError: failed[0].message }
          : { ok: true, failedCount: 0, lastError: null }
      );
      return { success: failed.length === 0, errors: failed.map(f => f.message) };
    });
  };

  const updateActiveSheet = (updater) => {
    updateSheets(prev => prev.map(s => (s.id === activeSheetId ? updater(s) : s)));
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

  const createSheet = async () => {
    const selected = latestQuotes().filter(q => selectedQuoteIds.has(q.id));
    if (selected.length === 0) {
      alert('Select at least one quote first.');
      return;
    }
    let allRows = [];
    selected.forEach(q => { allRows = allRows.concat(expandQuoteIntoRows(q)); });
    const newSheet = {
      id: `bulksheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      address: selected[0]?.location || '',
      clientNames: [...new Set(selected.map(q => q.clientName).filter(Boolean))],
      sourceQuoteNames: selected.map(q => q.quoteName || q.clientName),
      rows: allRows
    };
    setCreatingSheet(true);
    const result = await updateSheets(prev => [...prev, newSheet]);
    setCreatingSheet(false);
    if (!result.success) {
      alert(`Could not create the sheet - ${result.errors[0] || 'sync failed'}.\n\nNothing was lost; just try again once you have a connection.`);
      return;
    }
    setActiveSheetId(newSheet.id);
    setSelectedQuoteIds(new Set());
    setAcknowledgedWarnings(new Set());
    setExpandedRowId(allRows.length > 0 ? allRows[0].id : null);
    setScreen('editor');
  };

  // ---- Building a new sheet with NO quote behind it (client wants
  // measurements taken before a quote exists) - one blank starter row,
  // straight into the editor to fill it in. ----
  const createBlankSheet = async (clientName, address) => {
    const trimmedName = clientName.trim();
    if (!trimmedName) {
      alert('Enter a client name first.');
      return;
    }
    const startRow = createBlankMeasurementRow({ clientName: trimmedName });
    const newSheet = {
      id: `bulksheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      address: address.trim(),
      clientNames: [trimmedName],
      sourceQuoteNames: [],
      rows: [startRow]
    };
    setCreatingSheet(true);
    const result = await updateSheets(prev => [...prev, newSheet]);
    setCreatingSheet(false);
    if (!result.success) {
      alert(`Could not create the sheet - ${result.errors[0] || 'sync failed'}.\n\nNothing was lost; just try again once you have a connection.`);
      return;
    }
    setActiveSheetId(newSheet.id);
    setAcknowledgedWarnings(new Set());
    setExpandedRowId(startRow.id);
    setScreen('editor');
  };

  // ---- Adding one more window to a sheet already being edited - either a
  // quote-derived sheet that needs an extra window, or a manual sheet that
  // needs more than the one starter row.
  //
  // ✅ FIX: this used to pre-fill the new window's Location with the exact
  // text of the last window's - convenient when that text was a real room
  // name ("Living Room"), but confusing when it wasn't: typing "Window 1"
  // as a placeholder name meant the next window inherited that literal
  // text and got auto-suffixed to "Window 1 2" instead of a clean
  // "Window 2". Starting blank lets getLocationLabel's own "Window N"
  // fallback number each unnamed window cleanly and sequentially - typing
  // a real room name for a repeat window is one extra tap, but never
  // collides like this. ----
  const addWindowRow = () => {
    if (!activeSheet) return;
    const lastRow = activeSheet.rows[activeSheet.rows.length - 1];
    const newRow = createBlankMeasurementRow({
      clientName: activeSheet.clientNames?.[0] || lastRow?.clientName || ''
    });
    updateActiveSheet(sheet => ({
      ...sheet,
      rows: recomputeLocationIndices([...sheet.rows, newRow]),
      updatedDate: new Date().toISOString()
    }));
    setExpandedRowId(newRow.id);
  };

  // ---- Renaming a window's Location - unlike updateRow's generic patch,
  // this also recomputes locationIndex/totalInLocation across the WHOLE
  // sheet, since renaming one row changes the numbering of every sibling
  // sharing its old or new location name. ----
  const updateRowLocation = (rowId, newLocationBase) => {
    updateActiveSheet(sheet => ({
      ...sheet,
      rows: recomputeLocationIndices(sheet.rows.map(r => (r.id === rowId ? { ...r, locationBase: newLocationBase } : r))),
      updatedDate: new Date().toISOString()
    }));
  };

  // ---- Deleting a single window - the "+ Add Window"/manual-entry flows
  // both make it easy to end up with an extra window that needs removing,
  // and neither this feature nor the original had any way to do that (only
  // deleting the WHOLE sheet). Keeps at least one row - an empty sheet is
  // a pointless state; delete the whole sheet from the list screen instead.
  // Recomputes location indices for whoever's left, same as adding/renaming.
  const deleteWindowRow = (rowId) => {
    if (!activeSheet) return;
    if (activeSheet.rows.length <= 1) {
      alert("Can't delete the last window - a sheet needs at least one. Delete the whole sheet from the list instead if you don't need it.");
      return;
    }
    const row = activeSheet.rows.find(r => r.id === rowId);
    const label = (row?.locationBase || '').trim() || 'this window';
    if (!window.confirm(`Delete "${label}" from this sheet?`)) return;
    updateActiveSheet(sheet => ({
      ...sheet,
      rows: recomputeLocationIndices(sheet.rows.filter(r => r.id !== rowId)),
      updatedDate: new Date().toISOString()
    }));
    if (expandedRowId === rowId) setExpandedRowId(null);
  };

  // ✅ NEW: manual reordering - swaps a window with its immediate neighbor.
  // Recomputes location indices afterward since same-name grouping and the
  // "Window N" fallback for unnamed windows both number rows by array
  // order, so moving a row changes numbering for it and its new neighbors.
  const moveWindowRow = (rowId, direction) => {
    if (!activeSheet) return;
    const rows = activeSheet.rows;
    const idx = rows.findIndex(r => r.id === rowId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= rows.length) return;
    const newRows = [...rows];
    [newRows[idx], newRows[targetIdx]] = [newRows[targetIdx], newRows[idx]];
    updateActiveSheet(sheet => ({
      ...sheet,
      rows: recomputeLocationIndices(newRows),
      updatedDate: new Date().toISOString()
    }));
  };

  const openSheet = (id) => {
    const sheet = sheets.find(s => s.id === id);
    setActiveSheetId(id);
    setAcknowledgedWarnings(new Set());
    setExpandedRowId(sheet && sheet.rows.length > 0 ? sheet.rows[0].id : null);
    setScreen('editor');
  };

  const deleteSheet = (id) => {
    const sheet = sheets.find(s => s.id === id);
    if (!sheet) return;
    const sheetLabel = sheet.clientNames?.length ? sheet.clientNames.join(', ') : (sheet.address || 'untitled');
    if (!window.confirm(`Delete this measurement sheet (${sheetLabel}, ${sheet.rows.length} windows)? This cannot be undone.`)) return;
    updateSheets(prev => prev.filter(s => s.id !== id));
    if (activeSheetId === id) {
      setActiveSheetId(null);
      setScreen('list');
    }
  };

  // ---- Row selection (generic - used independently by each bulk tool) ----
  const toggleInSet = (id, currentSet, setter) => {
    const s = new Set(currentSet);
    if (s.has(id)) s.delete(id); else s.add(id);
    setter(s);
  };

  // ---- Warning acknowledgment ----
  const warningKey = (parts) => parts.join(':');
  const acknowledgeWarning = (key) => {
    setAcknowledgedWarnings(prev => new Set(prev).add(key));
  };

  // ---- Bulk fabric tool ----
  const applyBulkFabric = () => {
    if (!activeSheet) return;
    const value = bulkFabricInput.trim();
    if (!value) { alert('Enter a fabric number first.'); return; }
    if (fabricSelectedRowIds.size === 0) { alert('Select at least one window first.'); return; }

    // ✅ NEW: discontinued fabrics are a hard block, not a warning - out of
    // stock, no more orders regardless of whether the number itself is
    // spelled right.
    const discontinued = findDiscontinuedFabrics(value);
    if (discontinued.length > 0) {
      alert(`${discontinued.join(', ')} ${discontinued.length > 1 ? 'are' : 'is'} out of stock - no longer available to order. Please choose a different fabric.`);
      return;
    }

    // Check the fabric number against the actual catalog before applying,
    // same isFabricValid check the quote side already uses to flag
    // unrecognized fabrics. A typo here (e.g. "fdsafw3") previously applied
    // silently with zero warning - now it's a confirm, not a hard block,
    // since a genuinely new fabric not yet in the system is still a real,
    // valid thing to send to the supplier.
    if (!isFabricValid(value, PRICING_DATA)) {
      // ✅ NEW: suggest the closest real catalog number when one is close
      // enough to plausibly be the typo (see findClosestFabricMatch).
      const suggestion = findClosestFabricMatch(value, PRICING_DATA);
      const suggestionLine = suggestion ? ` Did you mean "${suggestion}"?` : '';
      if (!window.confirm(`"${value}" is not in the fabric list - it may be a typo.${suggestionLine}\n\nApply it anyway?`)) return;
    }

    const newRows = activeSheet.rows.map(r => (fabricSelectedRowIds.has(r.id) ? { ...r, fabricNumber: value } : r));
    updateActiveSheet(sheet => ({ ...sheet, rows: newRows, updatedDate: new Date().toISOString() }));
    const count = fabricSelectedRowIds.size;
    setFabricSelectedRowIds(new Set());
    alert(`Applied "${value}" to ${count} window${count > 1 ? 's' : ''}. Any room with more than one fabric number will show a warning below.`);
  };

  // ---- Bulk motor tool ----
  // Same side effects as the original feature's single-row handleMotorChange:
  // switching a window to Manual also clears solar/remote, since those only
  // make sense for a motorized window.
  const applyBulkMotor = () => {
    if (!activeSheet) return;
    if (motorSelectedRowIds.size === 0) { alert('Select at least one window first.'); return; }
    if (bulkMotorValue === 'Custom' && !bulkMotorCustomText.trim()) { alert('Type the custom motor type first.'); return; }

    const newRows = activeSheet.rows.map(r => {
      if (!motorSelectedRowIds.has(r.id)) return r;
      const patch = { motor: bulkMotorValue };
      if (bulkMotorValue === 'Manual') {
        patch.solar = false;
        patch.remoteGroup = null;
        patch.remoteChannel = null;
        patch.motorCustomText = '';
        // ✅ FIX: a stale motorSide: 'Left' from before the switch would
        // otherwise leak into the export as "Manual - Left side", which
        // makes no sense for a non-motorized window. Same bug exists in
        // the original SheetEditorScreen.js's handleMotorChange - not
        // touched there since it's out of scope for the Bulk feature fix.
        patch.motorSide = '';
      } else if (bulkMotorValue === 'Custom') {
        patch.motorCustomText = bulkMotorCustomText.trim();
      } else {
        patch.motorCustomText = '';
      }
      return { ...r, ...patch };
    });
    updateActiveSheet(sheet => ({ ...sheet, rows: newRows, updatedDate: new Date().toISOString() }));
    const count = motorSelectedRowIds.size;
    setMotorSelectedRowIds(new Set());
    alert(`Set ${count} window${count > 1 ? 's' : ''} to "${bulkMotorValue === 'Custom' ? bulkMotorCustomText.trim() : bulkMotorValue}".`);
  };

  // ---- Bulk solar tool - scoped to motorized windows only, same reasoning
  // as the original feature's remote tool (solar only makes sense once a
  // window is motorized) ----
  const applyBulkSolar = () => {
    if (!activeSheet) return;
    if (solarSelectedRowIds.size === 0) { alert('Select at least one motorized window first.'); return; }

    const newRows = activeSheet.rows.map(r => (solarSelectedRowIds.has(r.id) ? { ...r, solar: bulkSolarValue } : r));
    updateActiveSheet(sheet => ({ ...sheet, rows: newRows, updatedDate: new Date().toISOString() }));
    const count = solarSelectedRowIds.size;
    setSolarSelectedRowIds(new Set());
    alert(`Set Solar = ${bulkSolarValue ? 'Yes' : 'No'} for ${count} window${count > 1 ? 's' : ''}.`);
  };

  // ---- Bulk motor side tool - parity with the original feature's per-row
  // Right/Left toggle, scoped to motorized windows the same way Solar is ----
  const applyBulkMotorSide = () => {
    if (!activeSheet) return;
    if (motorSideSelectedRowIds.size === 0) { alert('Select at least one motorized window first.'); return; }

    const newRows = activeSheet.rows.map(r => (motorSideSelectedRowIds.has(r.id) ? { ...r, motorSide: bulkMotorSideValue } : r));
    updateActiveSheet(sheet => ({ ...sheet, rows: newRows, updatedDate: new Date().toISOString() }));
    const count = motorSideSelectedRowIds.size;
    setMotorSideSelectedRowIds(new Set());
    alert(`Set Side = ${bulkMotorSideValue === 'Left' ? 'Left' : 'Right (default)'} for ${count} window${count > 1 ? 's' : ''}.`);
  };

  // ---- Bulk remote group tool (identical to the original feature) ----
  const existingGroups = activeSheet
    ? [...new Set(activeSheet.rows.map(r => r.remoteGroup).filter(g => g))].sort((a, b) => a - b)
    : [];
  const nextGroupNumber = existingGroups.length > 0 ? Math.max(...existingGroups) + 1 : 1;

  const applyBulkRemoteGroup = (groupNumber) => {
    if (!activeSheet) return;
    if (remoteSelectedRowIds.size === 0) { alert('Select at least one motorized window first.'); return; }

    const alreadyInGroup = countInRemoteGroup(activeSheet.rows, groupNumber);
    const wouldBeSelectedButNotAlreadyInGroup = [...remoteSelectedRowIds].filter(id => {
      const row = activeSheet.rows.find(r => r.id === id);
      return row && row.remoteGroup !== groupNumber;
    }).length;
    const totalAfter = alreadyInGroup + wouldBeSelectedButNotAlreadyInGroup;
    if (totalAfter > MAX_REMOTE_CHANNELS) {
      alert(`Remote Group ${groupNumber} would have ${totalAfter} windows, but a remote only supports ${MAX_REMOTE_CHANNELS} channels.\n\nCurrently in this group: ${alreadyInGroup}\nSelected to add: ${wouldBeSelectedButNotAlreadyInGroup}\n\nSelect fewer windows, or use a different group.`);
      return;
    }

    const selectionInOrder = [...remoteSelectedRowIds];
    let nextChannel = getNextRemoteChannel(activeSheet.rows, groupNumber);
    const channelById = {};
    selectionInOrder.forEach(id => {
      const row = activeSheet.rows.find(r => r.id === id);
      if (row && row.remoteGroup === groupNumber && typeof row.remoteChannel === 'number') {
        channelById[id] = row.remoteChannel;
      } else {
        channelById[id] = nextChannel;
        nextChannel += 1;
      }
    });

    const newRows = activeSheet.rows.map(r =>
      remoteSelectedRowIds.has(r.id) ? { ...r, remoteGroup: groupNumber, remoteChannel: channelById[r.id] } : r
    );
    updateActiveSheet(sheet => ({ ...sheet, rows: newRows, updatedDate: new Date().toISOString() }));
    const count = remoteSelectedRowIds.size;
    setRemoteSelectedRowIds(new Set());
    alert(`Assigned ${count} window${count > 1 ? 's' : ''} to Remote Group ${groupNumber}.`);
  };

  // ---- Unassign from a remote group - parity with the original feature's
  // per-row "Not assigned" dropdown option, which the bulk-only Assign
  // buttons here had no equivalent for (switching to Manual also cleared
  // this, but that meant losing the motor type just to clear the remote). ----
  const applyBulkRemoteUnassign = () => {
    if (!activeSheet) return;
    if (remoteSelectedRowIds.size === 0) { alert('Select at least one window first.'); return; }

    const newRows = activeSheet.rows.map(r => (remoteSelectedRowIds.has(r.id) ? { ...r, remoteGroup: null, remoteChannel: null } : r));
    updateActiveSheet(sheet => ({ ...sheet, rows: newRows, updatedDate: new Date().toISOString() }));
    const count = remoteSelectedRowIds.size;
    setRemoteSelectedRowIds(new Set());
    alert(`Unassigned ${count} window${count > 1 ? 's' : ''} from their remote group.`);
  };

  // ---- Bulk cassette tool ----
  const applyBulkCassette = () => {
    if (!activeSheet) return;
    if (cassetteSelectedRowIds.size === 0) { alert('Select at least one window first.'); return; }
    if (bulkCassetteValue === 'Custom' && !bulkCassetteCustomText.trim()) { alert('Describe the custom cassette first.'); return; }

    const newRows = activeSheet.rows.map(r => {
      if (!cassetteSelectedRowIds.has(r.id)) return r;
      return {
        ...r,
        cassette: bulkCassetteValue,
        cassetteCustomText: bulkCassetteValue === 'Custom' ? bulkCassetteCustomText.trim() : ''
      };
    });
    updateActiveSheet(sheet => ({ ...sheet, rows: newRows, updatedDate: new Date().toISOString() }));
    const count = cassetteSelectedRowIds.size;
    setCassetteSelectedRowIds(new Set());
    alert(`Applied cassette to ${count} window${count > 1 ? 's' : ''}.`);
  };

  // ---- Bulk mount tool ----
  const applyBulkMount = () => {
    if (!activeSheet) return;
    if (mountSelectedRowIds.size === 0) { alert('Select at least one window first.'); return; }
    if (bulkMountValue === 'Custom' && !bulkMountCustomText.trim()) { alert('Type the custom mount first.'); return; }

    const effectiveMount = bulkMountValue === 'Custom' ? bulkMountCustomText.trim() : bulkMountValue;
    const newRows = activeSheet.rows.map(r => (mountSelectedRowIds.has(r.id) ? { ...r, mount: effectiveMount } : r));
    updateActiveSheet(sheet => ({ ...sheet, rows: newRows, updatedDate: new Date().toISOString() }));
    const count = mountSelectedRowIds.size;
    setMountSelectedRowIds(new Set());
    alert(`Set Mount = "${effectiveMount}" for ${count} window${count > 1 ? 's' : ''}.`);
  };

  // ---- Export (identical rules/logic to the original feature) ----
  const validateSheetForExport = () => {
    if (!activeSheet) return false;

    const invalidRows = activeSheet.rows.filter(r => !validateMeasurementFormat(r.width).valid || !validateMeasurementFormat(r.height).valid);
    if (invalidRows.length > 0) {
      alert(`${invalidRows.length} window(s) have an invalid width/height format. Fix the values highlighted in red before exporting.`);
      setExpandedRowId(invalidRows[0].id);
      return false;
    }

    const incompleteRows = activeSheet.rows.filter(r => getIncompleteFields(r).length > 0);
    if (incompleteRows.length > 0) {
      const preview = incompleteRows.slice(0, 6).map(r => `• ${getLocationLabel(r)} - missing ${getIncompleteFields(r).join(', ')}`).join('\n');
      const more = incompleteRows.length > 6 ? `\n...and ${incompleteRows.length - 6} more` : '';
      alert(`Can't copy or download yet - ${incompleteRows.length} window(s) are missing required details:\n\n${preview}${more}\n\nThey're highlighted in red below.`);
      setExpandedRowId(incompleteRows[0].id);
      return false;
    }

    return true;
  };

  const exportCSV = () => {
    if (!validateSheetForExport()) return;
    const csv = sheetToCSV(activeSheet, activeSheet.rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(exportFileLabel(activeSheet)).replace(/[^a-z0-9]/gi, '_')}_supplier_details.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyCSV = async () => {
    if (!validateSheetForExport()) return;
    const csv = sheetToCSV(activeSheet, activeSheet.rows);
    try {
      await navigator.clipboard.writeText(csv);
      alert('Copied! Paste into a new Excel/Sheets file, or straight into an email.');
    } catch (e) {
      alert('Could not copy. Try Download instead.');
    }
  };

  // ✅ NEW: native share sheet where supported - skips copy-then-switch-
  // app-then-paste. Same validation gate as Copy/Download.
  const shareCSV = async () => {
    if (!validateSheetForExport()) return;
    const csv = sheetToCSV(activeSheet, activeSheet.rows);
    try {
      await navigator.share({ title: exportFileLabel(activeSheet), text: csv });
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Share failed:', err);
    }
  };

  const exportExcel = async () => {
    if (!validateSheetForExport()) return;
    try {
      const buffer = await sheetToExcelBuffer(activeSheet, activeSheet.rows);
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(exportFileLabel(activeSheet)).replace(/[^a-z0-9]/gi, '_')}_supplier_details.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('Excel export failed:', e);
      alert('Could not create the Excel file. Try Download CSV instead.');
    }
  };

  // ============================== ROUTE TO SCREEN ==============================

  if (screen === 'list') {
    return (
      <SheetListScreen
        sheets={sheets}
        hasLoaded={hasLoaded}
        loadError={loadError}
        syncStatus={syncStatus}
        onBack={onBack}
        onNewSheet={() => setScreen('select')}
        onOpenSheet={openSheet}
        onDeleteSheet={deleteSheet}
      />
    );
  }

  if (screen === 'select') {
    return (
      <QuoteSelectScreen
        quotesList={latestQuotes()}
        selectedQuoteIds={selectedQuoteIds}
        onToggleQuote={toggleQuoteSelected}
        onBack={() => setScreen('list')}
        onCreateSheet={createSheet}
        creatingSheet={creatingSheet}
        onStartBlank={() => setScreen('manual')}
      />
    );
  }

  if (screen === 'manual') {
    return (
      <ManualEntryScreen
        onBack={() => setScreen('select')}
        onCreate={createBlankSheet}
        creatingSheet={creatingSheet}
      />
    );
  }

  // screen === 'editor'
  const remoteLabels = activeSheet ? computeRemoteLabels(activeSheet.rows) : {};
  const widthOutlierIds = activeSheet ? findRoomSizeOutliers(activeSheet.rows, 'width') : new Set();
  const heightOutlierIds = activeSheet ? findRoomSizeOutliers(activeSheet.rows, 'height') : new Set();

  return (
    <BulkEditorScreen
      activeSheet={activeSheet}
      onBack={() => setScreen('list')}
      syncStatus={syncStatus}
      updateActiveSheet={updateActiveSheet}
      updateRow={updateRow}
      updateRowLocation={updateRowLocation}
      addWindowRow={addWindowRow}
      deleteWindowRow={deleteWindowRow}
      moveWindowRow={moveWindowRow}
      remoteLabels={remoteLabels}
      widthOutlierIds={widthOutlierIds}
      heightOutlierIds={heightOutlierIds}
      acknowledgedWarnings={acknowledgedWarnings}
      warningKey={warningKey}
      acknowledgeWarning={acknowledgeWarning}
      toggleInSet={toggleInSet}
      expandedRowId={expandedRowId}
      setExpandedRowId={setExpandedRowId}

      showFabricTool={showFabricTool}
      setShowFabricTool={setShowFabricTool}
      bulkFabricInput={bulkFabricInput}
      setBulkFabricInput={setBulkFabricInput}
      fabricSelectedRowIds={fabricSelectedRowIds}
      setFabricSelectedRowIds={setFabricSelectedRowIds}
      applyBulkFabric={applyBulkFabric}

      showMotorTool={showMotorTool}
      setShowMotorTool={setShowMotorTool}
      bulkMotorValue={bulkMotorValue}
      setBulkMotorValue={setBulkMotorValue}
      bulkMotorCustomText={bulkMotorCustomText}
      setBulkMotorCustomText={setBulkMotorCustomText}
      motorSelectedRowIds={motorSelectedRowIds}
      setMotorSelectedRowIds={setMotorSelectedRowIds}
      applyBulkMotor={applyBulkMotor}

      showSolarTool={showSolarTool}
      setShowSolarTool={setShowSolarTool}
      bulkSolarValue={bulkSolarValue}
      setBulkSolarValue={setBulkSolarValue}
      solarSelectedRowIds={solarSelectedRowIds}
      setSolarSelectedRowIds={setSolarSelectedRowIds}
      applyBulkSolar={applyBulkSolar}

      showMotorSideTool={showMotorSideTool}
      setShowMotorSideTool={setShowMotorSideTool}
      bulkMotorSideValue={bulkMotorSideValue}
      setBulkMotorSideValue={setBulkMotorSideValue}
      motorSideSelectedRowIds={motorSideSelectedRowIds}
      setMotorSideSelectedRowIds={setMotorSideSelectedRowIds}
      applyBulkMotorSide={applyBulkMotorSide}

      showRemoteTool={showRemoteTool}
      setShowRemoteTool={setShowRemoteTool}
      remoteSelectedRowIds={remoteSelectedRowIds}
      setRemoteSelectedRowIds={setRemoteSelectedRowIds}
      existingGroups={existingGroups}
      nextGroupNumber={nextGroupNumber}
      applyBulkRemoteGroup={applyBulkRemoteGroup}
      applyBulkRemoteUnassign={applyBulkRemoteUnassign}

      showCassetteTool={showCassetteTool}
      setShowCassetteTool={setShowCassetteTool}
      bulkCassetteValue={bulkCassetteValue}
      setBulkCassetteValue={setBulkCassetteValue}
      bulkCassetteCustomText={bulkCassetteCustomText}
      setBulkCassetteCustomText={setBulkCassetteCustomText}
      cassetteSelectedRowIds={cassetteSelectedRowIds}
      setCassetteSelectedRowIds={setCassetteSelectedRowIds}
      applyBulkCassette={applyBulkCassette}

      showMountTool={showMountTool}
      setShowMountTool={setShowMountTool}
      bulkMountValue={bulkMountValue}
      setBulkMountValue={setBulkMountValue}
      bulkMountCustomText={bulkMountCustomText}
      setBulkMountCustomText={setBulkMountCustomText}
      mountSelectedRowIds={mountSelectedRowIds}
      setMountSelectedRowIds={setMountSelectedRowIds}
      applyBulkMount={applyBulkMount}

      copyCSV={copyCSV}
      shareCSV={shareCSV}
      exportCSV={exportCSV}
      exportExcel={exportExcel}
    />
  );
}
