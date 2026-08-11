import React, { useState, useEffect } from 'react';
import {
  validateMeasurementFormat,
  findRoomSizeOutliers,
  getLocationLabel,
  computeRemoteLabels,
  expandQuoteIntoRows,
  getIncompleteFields,
  sheetToCSV
} from '../utils/measurementUtils';
import SheetListScreen from './measurements/SheetListScreen';
import QuoteSelectScreen from './measurements/QuoteSelectScreen';
import SheetEditorScreen from './measurements/SheetEditorScreen';

// Deliberately separate from the quote app's 'blindsQuotes' key - a bug in this
// feature's storage can never corrupt or collide with quote data, and vice versa.
const STORAGE_KEY = 'zebraSupplierMeasurementSheets';

// Split into 3 files (list / select / editor screens), same idea as the
// quote generator's utils split - all STATE and LOGIC still live in this one
// container (single source of truth, unchanged behavior), only the JSX for
// each screen moved out. Screens receive the exact same variable names they
// used to close over as props, so this stays a relocation, not a rewrite.
export default function SupplierMeasurements({ quotes, onBack }) {
  const [sheets, setSheets] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [screen, setScreen] = useState('list'); // 'list' | 'select' | 'editor'
  const [selectedQuoteIds, setSelectedQuoteIds] = useState(new Set());
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
    setSheets(prev => prev.filter(s => s.id !== id));
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
    const newRows = activeSheet.rows.map(r => (remoteSelectedRowIds.has(r.id) ? { ...r, remoteGroup: groupNumber } : r));
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

  // ============================== ROUTE TO SCREEN ==============================

  if (screen === 'list') {
    return (
      <SheetListScreen
        sheets={sheets}
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
    />
  );
}
