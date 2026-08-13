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
  sheetToCSV
} from '../utils/measurementUtils';
import SheetListScreen from './measurements/SheetListScreen';
import { subscribeToSheets, saveSheetRemote, deleteSheetRemote } from '../services/measurementSync';
import QuoteSelectScreen from './measurements/QuoteSelectScreen';
import SheetEditorScreen from './measurements/SheetEditorScreen';
import { sheetToExcelBuffer } from '../utils/xlsxExport';

// Deliberately separate from the quote app's 'blindsQuotes' key - a bug in this
// feature's storage can never corrupt or collide with quote data, and vice versa.
// Split into 3 files (list / select / editor screens), same idea as the
// quote generator's utils split - all STATE and LOGIC still live in this one
// container (single source of truth, unchanged behavior), only the JSX for
// each screen moved out. Screens receive the exact same variable names they
// used to close over as props, so this stays a relocation, not a rewrite.
export default function SupplierMeasurements({ quotes, onBack, uid }) {
  const [sheets, setSheets] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [screen, setScreen] = useState('list'); // 'list' | 'select' | 'editor'
  const [selectedQuoteIds, setSelectedQuoteIds] = useState(new Set());
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [activeSheetId, setActiveSheetId] = useState(null);
  // Fabric and Remote bulk tools each get their OWN selection, instead of
  // sharing one - sharing meant a leftover Fabric selection could silently
  // get swept into a Remote group assignment too.
  const [fabricSelectedRowIds, setFabricSelectedRowIds] = useState(new Set());
  const [remoteSelectedRowIds, setRemoteSelectedRowIds] = useState(new Set());
  const [bulkFabricInput, setBulkFabricInput] = useState('');
  // Both bulk tool panels collapse by default, so their embedded window
  // checklists don't take up space until you actually need them.
  const [showFabricTool, setShowFabricTool] = useState(false);
  const [showRemoteTool, setShowRemoteTool] = useState(false);
  // Warnings are purely DERIVED from current data on every render (so they
  // can never fail to appear the way a blur+dialog race could), and
  // "accepting" one is an explicit button tap, not a popup. Keyed by
  // row+field+value, so editing the value again clears a stale acknowledgment.
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState(new Set());
  // Accordion - only one window's full detail form is open at a time, so
  // working through many windows in sequence doesn't mean endless scrolling.
  const [expandedRowId, setExpandedRowId] = useState(null);

  // ✅ BUGFIX: updateSheets previously only console.error'd on a failed
  // Firestore write, with zero visible indication anything was wrong -
  // same silent-failure shape that caused the earlier data-loss incident.
  // Called on nearly every keystroke here (unlike App.js's quote saves,
  // which happen at a few big checkpoints), so a popup alert on every
  // field edit would be unusable - a persistent status banner instead.
  const [syncStatus, setSyncStatus] = useState({ ok: true, failedCount: 0, lastError: null });
  // ✅ NEW: distinct from "genuinely zero sheets" - same fix as App.js.
  const [loadError, setLoadError] = useState(null);

  // ✅ CLOUD SYNC: sheets now come from Firestore in real time, same pattern
  // as quotes in App.js. This one listener replaces the old localStorage
  // load/save effects entirely.
  useEffect(() => {
    if (!uid) return;
    const unsubscribe = subscribeToSheets(
      uid,
      (remoteSheets) => {
        setSheets(remoteSheets);
        setHasLoaded(true);
        setLoadError(null);
      },
      (error) => {
        console.error('Measurement sheet sync error:', error);
        setHasLoaded(true);
        setLoadError(error?.message || 'Could not load your measurement sheets.');
      }
    );
    return () => unsubscribe();
  }, [uid]);

  const activeSheet = sheets.find(s => s.id === activeSheetId) || null;

  // ✅ Diffing write-through wrapper - same pattern as updateQuotes in App.js.
  // Every existing call site below keeps calling this exactly like it used
  // to call setSheets (including the functional-updater form used by
  // updateActiveSheet just below), only the name changes. `sheets` state
  // itself is only ever updated by the listener above.
  //
  // ✅ BUGFIX: now returns a Promise<{success, errors}>. High-frequency call
  // sites (every field edit) can keep ignoring the return value exactly as
  // before - nothing changes for them. But checkpoint-style callers like
  // createSheet can now await it and confirm the write actually landed
  // before navigating anywhere - previously, navigation happened
  // immediately regardless of outcome, so a failed write silently left you
  // on a screen pointing at a sheet that was never actually saved.
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
      ...toSave.map(s => saveSheetRemote(uid, s).then(() => ({ ok: true })).catch(err => {
        console.error('Failed to save sheet', s.id, err);
        return { ok: false, message: err?.message || String(err) };
      })),
      ...toDeleteIds.map(id => deleteSheetRemote(uid, id).then(() => ({ ok: true })).catch(err => {
        console.error('Failed to delete sheet', id, err);
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
      id: `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      address: selected[0]?.location || '',
      sourceQuoteNames: selected.map(q => q.quoteName || q.clientName),
      rows: allRows
    };
    // ✅ BUGFIX: previously navigated to the editor screen immediately after
    // calling updateSheets, without waiting to see if the write actually
    // succeeded. A failed write left activeSheetId pointing at a sheet that
    // was never actually saved - "Sheet not found", every single time,
    // regardless of which quote it was built from. Now waits for
    // confirmation and shows the real error instead of navigating blind.
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
    if (!window.confirm(`Delete this measurement sheet (${sheet.address || 'untitled'}, ${sheet.rows.length} windows)? This cannot be undone.`)) return;
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

  // ---- Field change handlers ----
  const handleMotorChange = (rowId, value) => {
    const patch = { motor: value };
    if (value === 'Manual') {
      // Solar and remote only make sense for motorized windows
      patch.solar = false;
      patch.remoteGroup = null;
      patch.remoteChannel = null;
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
    if (fabricSelectedRowIds.size === 0) { alert('Select at least one window first.'); return; }

    const newRows = activeSheet.rows.map(r => (fabricSelectedRowIds.has(r.id) ? { ...r, fabricNumber: value } : r));
    updateActiveSheet(sheet => ({ ...sheet, rows: newRows, updatedDate: new Date().toISOString() }));
    const count = fabricSelectedRowIds.size;
    setBulkFabricInput('');
    setFabricSelectedRowIds(new Set());
    alert(`Applied "${value}" to ${count} window${count > 1 ? 's' : ''}. Any room with more than one fabric number will show a warning below.`);
  };

  // ---- Bulk remote group tool ----
  const existingGroups = activeSheet
    ? [...new Set(activeSheet.rows.map(r => r.remoteGroup).filter(g => g))].sort((a, b) => a - b)
    : [];
  const nextGroupNumber = existingGroups.length > 0 ? Math.max(...existingGroups) + 1 : 1;

  const applyBulkRemoteGroup = (groupNumber) => {
    if (!activeSheet) return;
    if (remoteSelectedRowIds.size === 0) { alert('Select at least one motorized window first.'); return; }

    // ✅ NEW: max 16 channels per physical remote. Check BEFORE applying -
    // existing windows already in this group plus the new selection.
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

    // ✅ BUGFIX: assign channels in the order windows were SELECTED (the Set
    // preserves insertion/click order), not table order - this is the actual
    // fix for the "channels assigned in the wrong order" bug. Continues
    // numbering after whatever's already in the group, rather than restarting.
    const selectionInOrder = [...remoteSelectedRowIds];
    let nextChannel = getNextRemoteChannel(activeSheet.rows, groupNumber);
    const channelById = {};
    selectionInOrder.forEach(id => {
      const row = activeSheet.rows.find(r => r.id === id);
      // A row already in this exact group keeps its existing channel rather
      // than being reassigned to the end - only genuinely new additions to
      // this group consume a new channel number.
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

  // ---- Export ----
  // Shared hard-block check, used by both Copy and Download - neither is
  // allowed to proceed until every window has its required fields filled in
  // (width, height, fabric, and remote group for any motorized window).
  // Format errors get caught first since those need fixing before completeness
  // even matters. On failure, the first problem window opens automatically.
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
    a.download = `${(activeSheet.address || 'measurements').replace(/[^a-z0-9]/gi, '_')}_supplier_details.csv`;
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

  // ✅ NEW: real .xlsx with cell highlighting, matching the supplier's exact
  // reference format - CSV cannot represent color at all, so this is the
  // format to use whenever the highlighting itself matters.
  const exportExcel = async () => {
    if (!validateSheetForExport()) return;
    try {
      const buffer = await sheetToExcelBuffer(activeSheet, activeSheet.rows);
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(activeSheet.address || 'measurements').replace(/[^a-z0-9]/gi, '_')}_supplier_details.xlsx`;
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
      />
    );
  }

  // screen === 'editor'
  const remoteLabels = activeSheet ? computeRemoteLabels(activeSheet.rows) : {};
  const widthOutlierIds = activeSheet ? findRoomSizeOutliers(activeSheet.rows, 'width') : new Set();
  const heightOutlierIds = activeSheet ? findRoomSizeOutliers(activeSheet.rows, 'height') : new Set();

  return (
    <SheetEditorScreen
      activeSheet={activeSheet}
      onBack={() => setScreen('list')}
      syncStatus={syncStatus}
      updateActiveSheet={updateActiveSheet}
      updateRow={updateRow}
      handleMotorChange={handleMotorChange}
      remoteLabels={remoteLabels}
      widthOutlierIds={widthOutlierIds}
      heightOutlierIds={heightOutlierIds}
      existingGroups={existingGroups}
      nextGroupNumber={nextGroupNumber}
      showFabricTool={showFabricTool}
      setShowFabricTool={setShowFabricTool}
      bulkFabricInput={bulkFabricInput}
      setBulkFabricInput={setBulkFabricInput}
      fabricSelectedRowIds={fabricSelectedRowIds}
      setFabricSelectedRowIds={setFabricSelectedRowIds}
      toggleInSet={toggleInSet}
      applyBulkFabric={applyBulkFabric}
      showRemoteTool={showRemoteTool}
      setShowRemoteTool={setShowRemoteTool}
      remoteSelectedRowIds={remoteSelectedRowIds}
      setRemoteSelectedRowIds={setRemoteSelectedRowIds}
      applyBulkRemoteGroup={applyBulkRemoteGroup}
      expandedRowId={expandedRowId}
      setExpandedRowId={setExpandedRowId}
      acknowledgedWarnings={acknowledgedWarnings}
      warningKey={warningKey}
      acknowledgeWarning={acknowledgeWarning}
      copyCSV={copyCSV}
      exportCSV={exportCSV}
      exportExcel={exportExcel}
    />
  );
}
