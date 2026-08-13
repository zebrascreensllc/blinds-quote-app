import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Check, ArrowLeft, Search, BarChart3, TrendingUp, Edit2, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';

import { PRICING_DATA } from './data/pricingData';
import { BUSINESS_NAME, SALES_TAX_RATE, getPricingSnapshot } from './utils/constants';
import { formatPrice } from './utils/formatters';
import {
  getWidthSurcharge,
  getHeightSurcharge,
  isFabricValid,
  calculateGroupQuote,
  getBlindTypeFromFabric,
  getQuoteNamePrefix,
  autoDetectBlindTypes,
  getNextVersion
} from './utils/pricing';

// ✅ NEW (Phase 2): Supplier Measurements - fully isolated feature, own files,
// own storage key. Only reads the `quotes` array (never writes it) to build
// sheets from - never touches quote pricing/calculation state.
import SupplierMeasurements from './components/SupplierMeasurements';
import OrderAnalysis from './components/OrderAnalysis';
import { subscribeToQuotes, saveQuoteRemote, deleteQuoteRemote } from './services/quoteSync';
// ✅ NEW: reuses the same, already-tested row-expansion + CSV logic for a quick
// "send to supplier for quote confirmation" export directly from a quote.
// One-way only: App.js may read from measurementUtils.js, but nothing in
// measurementUtils.js or SupplierMeasurements.js ever imports from App.js or
// the pricing engine - the isolation guarantee from Phase 2 is unchanged.
import { expandQuoteIntoRows, sheetToCSV } from './utils/measurementUtils';


export default function BlindsQuoteApp({ uid, onLogout }) {
  const [currentView, setCurrentView] = useState('menu');
  const [quotes, setQuotes] = useState([]);
  // ✅ SAFETY: guards against overwriting stored quotes before the initial load finishes
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // ✅ SAFETY: holds a snapshot so the most recent delete can be undone
  const [undoBuffer, setUndoBuffer] = useState(null);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [expandedPricingDetails, setExpandedPricingDetails] = useState(false);
  const [expandedQuoteTable, setExpandedQuoteTable] = useState(true);
  const [expandedPricingComparison, setExpandedPricingComparison] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedClients, setExpandedClients] = useState({});
  const [selectedVersions, setSelectedVersions] = useState(new Set());
  const [editingQuote, setEditingQuote] = useState(null);
  const [lastWidth, setLastWidth] = useState('');
  const [lastHeight, setLastHeight] = useState('');
  // ✅ NEW: Room collapse state
  const [expandedRooms, setExpandedRooms] = useState(new Set());
  // ✅ NEW: per-room Fabric Numbers / Blind Type section, collapsed by default -
  // Bulk Assign Fabric handles the common case now, this stays available for
  // the rare per-room exception without taking up space during normal entry.
  const [expandedFabricSection, setExpandedFabricSection] = useState(new Set());
  // ✅ NEW: per-window-group Surcharge Override section, collapsed by default -
  // rarely used (auto-calculated surcharge covers the normal case), so it
  // shouldn't take up space in every window group during normal entry.
  const [expandedSurchargeOverride, setExpandedSurchargeOverride] = useState(new Set());
  // ✅ NEW: Bulk-assign fabric OR blind-type-only (client hasn't picked exact fabric yet) to multiple rooms
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkMode, setBulkMode] = useState('fabric'); // 'fabric' | 'blindType'
  const [bulkFabricInput, setBulkFabricInput] = useState('');
  const [bulkBlindTypes, setBulkBlindTypes] = useState([]);
  const [bulkSelectedRoomIds, setBulkSelectedRoomIds] = useState(new Set());
  // ✅ NEW: Edit pricing table fields
  const [editingTableField, setEditingTableField] = useState(null);
  // ✅ FIX: Use null as sentinel for "not edited this session" (distinct from 0 or any real value)
  // activeEditText = the RAW TEXT currently in whichever input is open (text input, not number input - avoids mobile keyboard bugs)
  const [tableEditValues, setTableEditValues] = useState({ perWindowPrices: {}, motorCost: null, solarCost: null, taxRate: null });
  const [activeEditText, setActiveEditText] = useState('');
  // ✅ NEW: for range-priced windows, editing uses two separate Min/Max boxes
  // instead of one text field with a typed hyphen - simpler and fully
  // reliable regardless of what keyboard the phone shows.
  const [activeEditTextMax, setActiveEditTextMax] = useState('');
  const [priceEditMode, setPriceEditMode] = useState('fixed'); // 'fixed' | 'range'
  // (Profit Details section merged into PRICING COMPARISON above - uses expandedPricingComparison)

  const [formData, setFormData] = useState({
    clientName: '',
    clientPhone: '',
    location: '',
    date: new Date().toISOString().split('T')[0],
    rooms: [{
      id: 1,
      name: '',
      fabricInput: '',
      blindTypes: ['Roller'],
      windowGroups: [{
        id: 1,
        quantity: '',
        width: '',
        height: '',
        controlType: 'Manual',
        solar: false,
        mount: 'Inside',
        surchargeOverride: null
      }]
    }]
  });

  // ✅ CLOUD SYNC: quotes now come from Firestore in real time, not localStorage.
  // This ONE listener replaces the old load-on-mount + save-on-change +
  // rolling-backup effects entirely - Firestore's own durability and offline
  // cache take over that role. Fires immediately with whatever's cached
  // locally (works with zero signal), then again every time anything
  // changes - on THIS device or any other device signed into this account.
  useEffect(() => {
    if (!uid) return;
    const unsubscribe = subscribeToQuotes(
      uid,
      (remoteQuotes) => {
        setQuotes(remoteQuotes);
        setHasLoaded(true);
        setLoadError(null);
      },
      (error) => {
        console.error('Quote sync error:', error);
        setHasLoaded(true);
        // ✅ NEW: distinct from "genuinely zero quotes" - a persistent
        // permission or connectivity problem would otherwise be silently
        // indistinguishable from an empty account, which is exactly the
        // kind of misleading state that caused real alarm last time.
        setLoadError(error?.message || 'Could not load your quotes.');
      }
    );
    return () => unsubscribe();
  }, [uid]);

  // ✅ ONE-TIME MIGRATION: if this device has quotes sitting in the OLD
  // localStorage record from before cloud sync existed, offer to upload them
  // rather than silently leaving them behind. Scoped per-uid so switching
  // accounts on the same device re-checks cleanly.
  const [migrationQuotes, setMigrationQuotes] = useState(null); // null = nothing pending; array = pending upload
  const [migrationBusy, setMigrationBusy] = useState(false);
  useEffect(() => {
    if (!uid) return;
    if (localStorage.getItem(`migratedToFirebase_${uid}`)) return;
    try {
      const saved = localStorage.getItem('blindsQuotes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMigrationQuotes(parsed);
        }
      }
    } catch (e) {
      console.error('Could not read old local quotes for migration:', e);
    }
  }, [uid]);

  const runMigration = async () => {
    if (!migrationQuotes) return;
    setMigrationBusy(true);
    // ✅ Each quote is now attempted independently - one problematic quote
    // can no longer silently block every other quote from uploading (the
    // previous version aborted the entire loop on the first failure).
    const failures = [];
    for (const q of migrationQuotes) {
      try {
        await saveQuoteRemote(uid, q);
      } catch (e) {
        console.error(`Migration failed for quote "${q.quoteName || q.id}":`, e);
        failures.push({ name: q.quoteName || q.clientName || q.id, message: e?.message || String(e) });
      }
    }
    setMigrationBusy(false);

    const succeeded = migrationQuotes.length - failures.length;
    if (failures.length === 0) {
      localStorage.setItem(`migratedToFirebase_${uid}`, 'true');
      setMigrationQuotes(null);
      alert(`✅ Uploaded all ${succeeded} quote${succeeded > 1 ? 's' : ''} to your account.`);
    } else {
      // ✅ Shows the REAL error instead of a generic "check your connection"
      // message, so the exact cause is visible instead of guessed at.
      const preview = failures.slice(0, 3).map(f => `• ${f.name}: ${f.message}`).join('\n');
      const more = failures.length > 3 ? `\n...and ${failures.length - 3} more` : '';
      alert(`Uploaded ${succeeded} of ${migrationQuotes.length} quotes.\n\n${failures.length} failed:\n${preview}${more}\n\nYour local copy is untouched either way - use the backup buttons above to be extra safe, then try again.`);
      // Only the successfully-uploaded ones shouldn't be re-sent on retry -
      // for now, leaving the full set queued keeps this simple and safe
      // (re-uploading an already-succeeded quote just overwrites it with the
      // same data, which is harmless).
    }
  };

  const skipMigration = () => {
    localStorage.setItem(`migratedToFirebase_${uid}`, 'true');
    setMigrationQuotes(null);
  };

  // ✅ SAFETY: backup buttons that live directly ON the migration screen,
  // reading straight from migrationQuotes (the OLD local data) - NOT from
  // `quotes` state, which is driven by the Firestore listener and is empty
  // until migration succeeds. This gives an off-device copy of the at-risk
  // data BEFORE touching anything, regardless of whether the upload works.
  const downloadMigrationBackup = () => {
    try {
      const payload = {
        app: 'Zebra Screens & Rollers - Blinds Quote App',
        exportedAt: new Date().toISOString(),
        quoteCount: migrationQuotes.length,
        quotes: migrationQuotes
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zebra-quotes-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('Migration backup download failed:', e);
      alert('Could not download. Try "Copy Backup" instead.');
    }
  };

  const copyMigrationBackup = async () => {
    try {
      const payload = {
        app: 'Zebra Screens & Rollers - Blinds Quote App',
        exportedAt: new Date().toISOString(),
        quoteCount: migrationQuotes.length,
        quotes: migrationQuotes
      };
      await navigator.clipboard.writeText(JSON.stringify(payload));
      alert(`✅ Backup for ${migrationQuotes.length} quotes copied. Paste into Notes or email it to yourself now, before doing anything else.`);
    } catch (e) {
      console.error('Migration backup copy failed:', e);
      alert('Could not copy. Try "Download Backup" instead.');
    }
  };

  // ✅ Diffing write-through wrapper - a drop-in replacement for the old
  // `setQuotes(newArray)` calls used throughout this file. Every existing
  // call site below keeps its EXACT same logic for building the new array;
  // only the function name changes (now awaited, since it reports success).
  // Internally, this figures out which quotes were added/changed/removed and
  // pushes exactly those writes or deletes to Firestore. `quotes` state
  // itself is only ever updated by the listener above - one source of truth,
  // no risk of local state drifting from what's actually saved.
  //
  // ✅ BUGFIX: previously, a failed write was only logged to the browser
  // console while the calling code immediately showed a "✅ success" alert
  // regardless - the exact same silent-failure shape that caused the
  // migration incident. Now returns { success, errors } so every call site
  // can tell the user the truth about whether it actually saved.
  const updateQuotes = async (newQuotesOrUpdater) => {
    const newQuotes = typeof newQuotesOrUpdater === 'function' ? newQuotesOrUpdater(quotes) : newQuotesOrUpdater;
    const oldById = new Map(quotes.map(q => [q.id, q]));
    const newIds = new Set(newQuotes.map(q => q.id));
    const errors = [];

    const writes = newQuotes
      .filter(q => {
        const old = oldById.get(q.id);
        return !old || JSON.stringify(old) !== JSON.stringify(q);
      })
      .map(q => saveQuoteRemote(uid, q).catch(err => {
        console.error('Failed to save quote', q.id, err);
        errors.push({ name: q.quoteName || q.clientName || q.id, message: err?.message || String(err) });
      }));

    const deletes = [];
    oldById.forEach((q, id) => {
      if (!newIds.has(id)) {
        deletes.push(deleteQuoteRemote(uid, id).catch(err => {
          console.error('Failed to delete quote', id, err);
          errors.push({ name: q.quoteName || q.clientName || id, message: err?.message || String(err) });
        }));
      }
    });

    await Promise.all([...writes, ...deletes]);
    return { success: errors.length === 0, errors };
  };

  // Builds the user-facing warning text for a partial/failed sync, reused by
  // every checkpoint below instead of duplicating this message six times.
  const syncFailureMessage = (errors) => {
    const preview = errors.slice(0, 3).map(e => `• ${e.name}: ${e.message}`).join('\n');
    const more = errors.length > 3 ? `\n...and ${errors.length - 3} more` : '';
    return `⚠️ Saved on this device, but ${errors.length} item${errors.length > 1 ? 's' : ''} failed to reach the cloud:\n\n${preview}${more}\n\nIt will keep retrying in the background. If this persists, check your connection - your local copy is safe either way.`;
  };

  // ✅ SAFETY: snapshot current state so the last delete can be undone
  const snapshotForUndo = (label) => {
    setUndoBuffer({ quotes: JSON.parse(JSON.stringify(quotes)), label, at: new Date().toISOString() });
  };

  // ✅ SAFETY: one funnel for ALL deletions. Warns clearly, names what will be lost,
  // requires a second confirmation if it would remove every version for a client,
  // and always stores an undo snapshot first.
  const safeDeleteQuotes = (idsToDelete, description) => {
    const ids = new Set(idsToDelete);
    const doomed = quotes.filter(q => ids.has(q.id));
    if (doomed.length === 0) return false;

    const survivors = quotes.filter(q => !ids.has(q.id));

    // Which client folders would be emptied completely?
    const clientKey = q => `${q.clientName} - ${q.location}`;
    const doomedClients = [...new Set(doomed.map(clientKey))];
    const survivingClients = new Set(survivors.map(clientKey));
    const clientsBeingWiped = doomedClients.filter(c => !survivingClients.has(c));

    const nameList = doomed.map(q => `  • ${q.quoteName || q.version}`).join('\n');
    const message = `Delete ${doomed.length} quote${doomed.length > 1 ? 's' : ''}?\n\n${nameList}\n\nThis cannot be undone from another device.`;

    if (!window.confirm(message)) return false;

    // Second, louder confirmation when an entire client would disappear
    if (clientsBeingWiped.length > 0) {
      const warning =
        `⚠️ WARNING — THIS REMOVES ENTIRE CLIENT${clientsBeingWiped.length > 1 ? 'S' : ''}\n\n` +
        clientsBeingWiped.map(c => `  • ${c}`).join('\n') +
        `\n\nNo versions will remain for ${clientsBeingWiped.length > 1 ? 'these clients' : 'this client'}. ` +
        `Everything for ${clientsBeingWiped.length > 1 ? 'them' : 'them'} will be gone from this list.\n\n` +
        `Are you absolutely sure?`;
      if (!window.confirm(warning)) return false;
    }

    snapshotForUndo(description || `Deleted ${doomed.length} quote(s)`);
    // .then() here (not await) deliberately keeps this function's return
    // value synchronous, since the buttons calling this rely on getting
    // true/false immediately to know whether to clear selection/close the
    // view. The cloud-sync outcome is still reported - just slightly after.
    updateQuotes(survivors).then(result => {
      if (!result.success) alert(syncFailureMessage(result.errors));
    });
    return true;
  };

  // ✅ SAFETY: restore the pre-delete snapshot
  const undoLastDelete = () => {
    if (!undoBuffer) return;
    updateQuotes(undoBuffer.quotes).then(result => {
      alert(result.success ? '✅ Restored. Your quotes are back.' : syncFailureMessage(result.errors));
    });
    setUndoBuffer(null);
  };

  // ✅ BACKUP: download every quote as a JSON file
  const exportBackup = () => {
    try {
      const payload = {
        app: 'Zebra Screens & Rollers - Blinds Quote App',
        exportedAt: new Date().toISOString(),
        quoteCount: quotes.length,
        quotes
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zebra-quotes-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('Export failed:', e);
      alert('Could not download the backup file. Try "Copy Backup" instead and paste it somewhere safe.');
    }
  };

  // ✅ BACKUP: copy backup text to clipboard (most reliable route on iPhone —
  // paste into Notes, Mail, or Messages to keep an off-device copy)
  const copyBackupToClipboard = async () => {
    try {
      const payload = {
        app: 'Zebra Screens & Rollers - Blinds Quote App',
        exportedAt: new Date().toISOString(),
        quoteCount: quotes.length,
        quotes
      };
      await navigator.clipboard.writeText(JSON.stringify(payload));
      alert(`✅ Backup for ${quotes.length} quotes copied. Paste it into Notes or email it to yourself now.`);
    } catch (e) {
      console.error('Clipboard copy failed:', e);
      alert('Could not copy to clipboard. Try "Download Backup" instead.');
    }
  };

  // ✅ BACKUP: restore from a backup file, merging rather than replacing
  const importBackup = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const incoming = Array.isArray(parsed) ? parsed : parsed.quotes;
        if (!Array.isArray(incoming)) {
          alert('That file does not look like a Zebra quotes backup.');
          return;
        }
        const existingIds = new Set(quotes.map(q => q.id));
        const newOnes = incoming.filter(q => q && q.id && !existingIds.has(q.id));
        if (newOnes.length === 0) {
          alert(`Backup read successfully, but all ${incoming.length} quotes are already on this device. Nothing to add.`);
          return;
        }
        if (!window.confirm(`Restore ${newOnes.length} quote(s) from this backup?\n\nExisting quotes will be kept — this only adds what is missing.`)) return;
        snapshotForUndo('Imported backup');
        const result = await updateQuotes([...quotes, ...newOnes]);
        alert(result.success ? `✅ Restored ${newOnes.length} quote(s).` : syncFailureMessage(result.errors));
      } catch (err) {
        console.error('Import failed:', err);
        alert('Could not read that backup file. Make sure it is the .json file exported from this app.');
      }
    };
    reader.readAsText(file);
  };

  // ✅ CRITICAL FIX: Reset editing state when viewing a different quote
  useEffect(() => {
    // Reset editing state whenever a different quote is selected
    setTableEditValues({ perWindowPrices: {}, motorCost: null, solarCost: null, taxRate: null });
    setEditingTableField(null);
    setActiveEditText('');
    setActiveEditTextMax('');
    setPriceEditMode('fixed');
  }, [selectedQuote?.id]);

  // ✅ HELPER: Filter raw text input to valid decimal number text as user types
  // (only digits + at most one decimal point + max 2 decimal places). Using a
  // plain text input (not type="number") avoids known mobile Safari/Chrome bugs
  // where number inputs "stick" or revert on backspace/decimal entry.
  const filterNumericText = (raw) => {
    if (raw === '') return '';
    let filtered = raw.replace(/[^0-9.]/g, '');
    const parts = filtered.split('.');
    if (parts.length > 2) {
      filtered = parts[0] + '.' + parts.slice(1).join('');
    }
    const dotIndex = filtered.indexOf('.');
    if (dotIndex !== -1 && filtered.length - dotIndex - 1 > 2) {
      filtered = filtered.slice(0, dotIndex + 3);
    }
    return filtered;
  };

  // ✅ HELPER: Format a number for display/editing - max 2 decimals, trailing zeros trimmed
  const formatMoney = (num) => {
    const val = parseFloat(num);
    if (isNaN(val)) return '0';
    return val.toFixed(2).replace(/\.?0+$/, '');
  };

  // Returns true if v is a valid {min, max} custom range override.
  const isRangeOverride = (v) => v !== null && typeof v === 'object' && typeof v.min === 'number' && typeof v.max === 'number';

  // Formats either shape for display, fully including the "$" sign.
  const formatPriceOverride = (v) => isRangeOverride(v) ? formatPrice(v.min, v.max) : `$${formatMoney(v)}`;

  const generateQuote = async () => {
    if (!formData.clientName || !formData.clientPhone) {
      alert('Please fill client name and phone');
      return;
    }

    // Determine quote name prefix based on ACTUAL FABRICS entered, not selected blind types
    const quoteNamePrefix = getQuoteNamePrefix(formData.rooms, PRICING_DATA);
    
    // ✅ BUGFIX: `quotes` was missing here, which threw a TypeError and silently
    // broke quote creation entirely. Always pass the quotes array.
    const newVersion = `v${getNextVersion(formData.clientName, formData.location, quotes)}`;
    
    // Create quote name based on fabrics
    const quoteName = `${formData.clientName}-${formData.location}-${quoteNamePrefix}-quote-${newVersion}`;
    
    // Capture pricing snapshot once for all quotes
    const pricingSnapshot = getPricingSnapshot();

    // Create a SINGLE quote (not multiple)
    // ✅ CRITICAL BUGFIX (data loss): previously a new version REUSED editingQuote.id,
    // so every version of a quote shared one ID. Because delete matches on ID,
    // deleting one version silently deleted EVERY version sharing that ID —
    // which is how a whole client folder disappeared. Every version now gets a
    // guaranteed-unique ID. `lineageId` preserves the "same quote" relationship
    // for grouping/history without ever being used to match deletions.
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const quoteData = {
      ...formData,
      // Identity fields come AFTER the spread so they can never be clobbered
      id: uniqueId,
      lineageId: editingQuote ? (editingQuote.lineageId || editingQuote.id) : uniqueId,
      quoteName: quoteName,
      version: newVersion,
      pricing: pricingSnapshot,
      createdDate: editingQuote ? editingQuote.createdDate : new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      status: 'quote',
      // ✅ BUGFIX (major): quoteData never included editedPrices at all, so
      // editing a window's dimensions/motor/solar via the form and saving as
      // a new version silently wiped every manually-adjusted price - motor
      // cost, solar cost, tax rate, and every per-window override - back to
      // freshly recalculated defaults, identical to v1. Now carries the
      // previous version's adjustments forward unchanged.
      //
      // One tradeoff worth knowing: if you resize or otherwise change a
      // SPECIFIC window that already had its own manual price override, that
      // override carries forward as-is too - it won't automatically reflect
      // the new size. Worth a quick check on that one window after this kind
      // of edit; everything else carries forward correctly untouched.
      editedPrices: editingQuote ? editingQuote.editedPrices : undefined
    };

    if (editingQuote) {
      // Create new version without archiving - keep all versions visible
      const result = await updateQuotes([...quotes, quoteData]);
      alert(result.success ? `✅ Quote updated successfully! New version created (${quoteNamePrefix}-${newVersion})` : syncFailureMessage(result.errors));
    } else {
      const result = await updateQuotes([...quotes, quoteData]);
      alert(result.success ? `✅ Quote created successfully!\n\n${quoteNamePrefix.toUpperCase()}` : syncFailureMessage(result.errors));
    }

    resetForm();
    setEditingQuote(null);
    setCurrentView('menu');
  };

  const resetForm = () => {
    setFormData({
      clientName: '',
      clientPhone: '',
      location: '',
      date: new Date().toISOString().split('T')[0],
      rooms: [{
        id: 1,
        name: '',
        fabricInput: '',
        blindTypes: ['Roller'],
        windowGroups: [{
          id: 1,
          quantity: '',
          width: '',
          height: '',
          controlType: 'Manual',
          solar: false,
          mount: 'Inside',
          surchargeOverride: null
        }]
      }]
    });
  };

  const loadQuoteForEdit = (quote) => {
    try {
      // Ensure rooms have proper structure
      const rooms = (quote.rooms || []).map(room => ({
        ...room,
        id: room.id || 1,
        name: room.name || '',
        fabricInput: room.fabricInput || '',
        blindTypes: Array.isArray(room.blindTypes) ? room.blindTypes : ['Roller'],
        windowGroups: (room.windowGroups || []).map(g => ({
          ...g,
          id: g.id || 1,
          quantity: g.quantity || '',
          width: g.width || '',
          height: g.height || '',
          controlType: g.controlType || 'Manual',
          solar: g.solar || false,
          mount: g.mount || 'Inside',
          surchargeOverride: g.surchargeOverride !== undefined ? g.surchargeOverride : null
        }))
      }));

      setFormData({
        clientName: quote.clientName || '',
        clientPhone: quote.clientPhone || '',
        location: quote.location || '',
        date: quote.date || new Date().toISOString().split('T')[0],
        rooms: rooms.length > 0 ? rooms : [{
          id: 1,
          name: '',
          fabricInput: '',
          blindTypes: ['Roller'],
          windowGroups: [{
            id: 1,
            quantity: '',
            width: '',
            height: '',
            controlType: 'Manual',
            solar: false,
            mount: 'Inside',
            surchargeOverride: null
          }]
        }]
      });
      setEditingQuote(quote);
      setCurrentView('quote');
    } catch (error) {
      console.error('Error loading quote for edit:', error);
      alert('❌ Error loading quote. Please try again.');
    }
  };

  const renderMenu = () => (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {onLogout && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button
              onClick={() => { if (window.confirm('Log out?')) onLogout(); }}
              style={{ background: 'none', border: 'none', color: '#666', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Log Out
            </button>
          </div>
        )}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 'bold', color: '#fff', marginBottom: '8px', fontFamily: 'Georgia, serif' }}>ZEBRA</h1>
          <p style={{ color: '#888', letterSpacing: '4px', fontSize: '12px', marginBottom: '16px' }}>SCREENS & ROLLERS</p>
          <div style={{ height: '4px', width: '64px', margin: '0 auto', background: 'linear-gradient(90deg, #d4af37, #f4e4c1)' }}></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <button onClick={() => { resetForm(); setEditingQuote(null); setCurrentView('quote'); }} style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.3s' }} onMouseEnter={e => e.target.style.boxShadow = '0 20px 25px rgba(0,0,0,0.5)'} onMouseLeave={e => e.target.style.boxShadow = 'none'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={28} color="#000" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>New Quote</h3>
                <p style={{ color: '#aaa', fontSize: '14px' }}>Create a new client quote</p>
              </div>
              <div style={{ fontSize: '24px', color: '#666' }}>→</div>
            </div>
          </button>

          <button onClick={() => setCurrentView('history')} style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.3s' }} onMouseEnter={e => e.target.style.boxShadow = '0 20px 25px rgba(0,0,0,0.5)'} onMouseLeave={e => e.target.style.boxShadow = 'none'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Search size={28} color="#000" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>Pull Existing Quote</h3>
                <p style={{ color: '#aaa', fontSize: '14px' }}>Search & view past quotes ({quotes.filter(q => !q.archived).length})</p>
              </div>
              <div style={{ fontSize: '24px', color: '#666' }}>→</div>
            </div>
          </button>

          <button onClick={() => setCurrentView('measurements')} style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.3s' }} onMouseEnter={e => e.target.style.boxShadow = '0 20px 25px rgba(0,0,0,0.5)'} onMouseLeave={e => e.target.style.boxShadow = 'none'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Edit2 size={28} color="#000" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>Supplier Measurements</h3>
                <p style={{ color: '#aaa', fontSize: '14px' }}>Precise measurements & supplier detail sheets</p>
              </div>
              <div style={{ fontSize: '24px', color: '#666' }}>→</div>
            </div>
          </button>

          <button onClick={() => setCurrentView('statistics')} style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.3s' }} onMouseEnter={e => e.target.style.boxShadow = '0 20px 25px rgba(0,0,0,0.5)'} onMouseLeave={e => e.target.style.boxShadow = 'none'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart3 size={28} color="#000" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>Statistics</h3>
                <p style={{ color: '#aaa', fontSize: '14px' }}>View business analytics & insights</p>
              </div>
              <div style={{ fontSize: '24px', color: '#666' }}>→</div>
            </div>
          </button>

          <button onClick={() => setCurrentView('analysis')} style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.3s' }} onMouseEnter={e => e.target.style.boxShadow = '0 20px 25px rgba(0,0,0,0.5)'} onMouseLeave={e => e.target.style.boxShadow = 'none'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ClipboardList size={28} color="#000" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>Order Analysis</h3>
                <p style={{ color: '#aaa', fontSize: '14px' }}>Supplier actual cost vs app estimate, per order</p>
              </div>
              <div style={{ fontSize: '24px', color: '#666' }}>→</div>
            </div>
          </button>
        </div>

        <div style={{ marginTop: '48px', textAlign: 'center' }}>
          <p style={{ color: '#666', fontSize: '12px' }}>All data is securely stored on your device</p>
        </div>
      </div>
    </div>
  );

  const renderHistory = () => {
    const activeQuotes = quotes.filter(q => !q.archived);
    const groupedByClient = {};
    
    activeQuotes.forEach(quote => {
      const clientKey = `${quote.clientName} - ${quote.location}`;
      if (!groupedByClient[clientKey]) {
        groupedByClient[clientKey] = [];
      }
      groupedByClient[clientKey].push(quote);
    });

    Object.keys(groupedByClient).forEach(client => {
      groupedByClient[client].sort((a, b) => {
        const versionA = parseInt(a.version.replace('v', ''));
        const versionB = parseInt(b.version.replace('v', ''));
        return versionA - versionB;
      });
    });

    const filteredClients = Object.keys(groupedByClient).filter(client =>
      client.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (selectedQuote) {
      return renderQuoteDetail();
    }

    return (
      <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <button onClick={() => { setCurrentView('menu'); setSearchQuery(''); setSelectedVersions(new Set()); }} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer' }}>
              <ArrowLeft size={24} color="#aaa" />
            </button>
            <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff', fontFamily: 'Georgia, serif' }}>Quote History</h2>
          </div>

          <div style={{ marginBottom: '32px', position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '12px', color: '#666' }} size={20} />
            <input
              type="text"
              placeholder="Search by client name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '40px', paddingRight: '16px', paddingTop: '12px', paddingBottom: '12px', borderRadius: '8px', background: '#2a2a2a', border: '1px solid #d4af37', color: 'white', fontSize: '16px' }}
            />
          </div>

          {/* ✅ UNDO: appears right after a delete so a mistake is recoverable in one tap */}
          {undoBuffer && (
            <div style={{ padding: '12px', marginBottom: '16px', background: '#3a2a1a', border: '2px solid #f59e0b', borderRadius: '8px' }}>
              <p style={{ color: '#fbbf24', fontWeight: 'bold', margin: '0 0 8px 0', fontSize: '14px' }}>
                ↩️ {undoBuffer.label}
              </p>
              <button
                onClick={undoLastDelete}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#f59e0b', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Undo Last Delete
              </button>
            </div>
          )}

          {/* ✅ BACKUP: keep an off-device copy; restore merges instead of replacing */}
          <div style={{ padding: '12px', marginBottom: '16px', background: '#1a2a2a', border: '1px solid #2a5a5a', borderRadius: '8px' }}>
            <p style={{ color: '#7dd3fc', fontWeight: 'bold', margin: '0 0 8px 0', fontSize: '13px' }}>
              🛟 Backup ({quotes.length} quote{quotes.length === 1 ? '' : 's'})
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={exportBackup}
                style={{ flex: '1 1 45%', padding: '10px', borderRadius: '6px', background: '#0e7490', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
              >
                ⬇️ Download
              </button>
              <button
                onClick={copyBackupToClipboard}
                style={{ flex: '1 1 45%', padding: '10px', borderRadius: '6px', background: '#0e7490', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
              >
                📋 Copy
              </button>
              <label
                style={{ flex: '1 1 100%', padding: '10px', borderRadius: '6px', background: '#334155', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', textAlign: 'center', display: 'block' }}
              >
                ⬆️ Restore from Backup File
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => { importBackup(e.target.files?.[0]); e.target.value = ''; }}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            <p style={{ color: '#64748b', fontSize: '11px', margin: '8px 0 0 0' }}>
              Tip: tap Copy and paste into Notes or email it to yourself. The app also keeps 7 days of automatic backups on this device.
            </p>
          </div>

          {selectedVersions.size > 0 && (
            <button onClick={() => {
              // ✅ Goes through the safe delete funnel: names what will be lost,
              // double-confirms if a whole client would vanish, and saves an undo snapshot
              const done = safeDeleteQuotes([...selectedVersions], `Deleted ${selectedVersions.size} selected version(s)`);
              if (done) {
                setSelectedVersions(new Set());
                alert('✅ Deleted. If that was a mistake, use "Undo Last Delete" at the top of this screen.');
              }
            }} style={{ width: '100%', padding: '12px', marginBottom: '16px', borderRadius: '8px', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
              Delete {selectedVersions.size} Selected
            </button>
          )}

          {loadError ? (
            <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
              <p style={{ color: '#f87171', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>⚠️ Could not load your quotes</p>
              <p style={{ color: '#888', fontSize: '13px' }}>{loadError}</p>
              <p style={{ color: '#666', fontSize: '12px', marginTop: '8px' }}>This is a sync problem, not missing data - check your connection and reopen the app.</p>
            </div>
          ) : !hasLoaded ? (
            <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
              <p style={{ color: '#888', fontSize: '18px' }}>Loading your quotes...</p>
            </div>
          ) : activeQuotes.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
              <p style={{ color: '#888', fontSize: '18px' }}>No quotes created yet</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
              <p style={{ color: '#888', fontSize: '18px' }}>No quotes found for "{searchQuery}"</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredClients.map(clientName => (
                <div key={clientName} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedClients({...expandedClients, [clientName]: !expandedClients[clientName]})}
                    style={{ width: '100%', padding: '16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <p style={{ fontWeight: 'bold', color: '#fff', fontSize: '18px', marginBottom: '4px' }}>{clientName}</p>
                      <p style={{ color: '#888', fontSize: '14px' }}>{groupedByClient[clientName].length} version(s)</p>
                    </div>
                    {expandedClients[clientName] ? <ChevronUp size={24} color="#d4af37" /> : <ChevronDown size={24} color="#d4af37" />}
                  </button>

                  {expandedClients[clientName] && (
                    <div style={{ background: '#1a1a1a', borderTop: '1px solid #444', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {groupedByClient[clientName].map(quote => (
                        <div key={quote.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#2a2a2a', borderRadius: '6px' }}>
                          <input
                            type="checkbox"
                            checked={selectedVersions.has(quote.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedVersions);
                              if (e.target.checked) {
                                newSet.add(quote.id);
                              } else {
                                newSet.delete(quote.id);
                              }
                              setSelectedVersions(newSet);
                            }}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                          <button
                            onClick={() => setSelectedQuote(quote)}
                            style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', paddingLeft: '0' }}
                          >
                            <p style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>{quote.quoteName}</p>
                            <p style={{ color: '#888', fontSize: '12px' }}>{quote.date}</p>
                          </button>
                          <button onClick={() => loadQuoteForEdit(quote)} style={{ padding: '6px', borderRadius: '4px', background: '#d4af37', color: '#000', border: 'none', cursor: 'pointer' }}>
                            <Edit2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderQuoteDetail = () => {
    if (!selectedQuote) return null;

    try {
      const rooms = selectedQuote.rooms;
      const storedPricing = selectedQuote.pricing || null; // Use stored pricing or null (fallback to defaults)
      let totalMin = 0, totalMax = 0;
      // ✅ NEW: Supplier-side cost breakdown for the Pricing Comparison section.
      // Computed from the physical specs of each window (fabric, size, motor, solar) -
      // NOT from any price override, since what you charge the client doesn't change
      // what the supplier actually costs you.
      let overallFabricCost = 0, overallShippingCost = 0, overallMotorSupplierCost = 0, overallSolarSupplierCost = 0;

      // ✅ BUGFIX: Motor cost edits updated the "Motor total" row but never reached
      // Grand Total or Profit - same class of bug as the per-window price issue.
      // Computed ONCE here (single source of truth) and reused everywhere below,
      // so the displayed motor total and Grand Total can never drift apart again.
      const defaultMotorCostClient = storedPricing?.MOTOR_COST_CLIENT || 80;
      const effectiveMotorCost = (() => {
        const pending = tableEditValues.motorCost;
        if (typeof pending === 'number') return pending;
        const saved = selectedQuote.editedPrices?.motorCost;
        if (typeof saved === 'number') return saved;
        return defaultMotorCostClient;
      })();
      const defaultSolarCostClient = storedPricing?.SOLAR_COST_CLIENT || 40;
      const effectiveSolarCost = (() => {
        const pending = tableEditValues.solarCost;
        if (typeof pending === 'number') return pending;
        const saved = selectedQuote.editedPrices?.solarCost;
        if (typeof saved === 'number') return saved;
        return defaultSolarCostClient;
      })();

      // ✅ BUGFIX (major): Motor/Solar cost totals were shown as their own rows
      // but NEVER actually added into Tax or Grand Total - those rows were
      // purely informational displays floating separately from the real math.
      // Motor and Solar are now genuinely additive line items: computed ONCE
      // here as motorCount/solarCount (single source of truth, also reused by
      // the breakdown rows below so they can never disagree), multiplied by
      // the effective per-unit rate, and added directly into the taxable base
      // and Grand Total. No more delta-tracking needed - the full amount is
      // simply added once, cleanly.
      let motorCount = 0;
      let solarCount = 0;
      rooms.forEach(room => {
        room.windowGroups.forEach(group => {
          const qty = parseInt(group.quantity) || 0;
          if (group.controlType === 'Motor') motorCount += qty;
          if (group.solar) solarCount += qty;
        });
      });
      const motorGrandTotal = motorCount * effectiveMotorCost;
      const solarGrandTotal = solarCount * effectiveSolarCost;
      
      // Check for invalid fabrics
      const invalidFabrics = [];
      rooms.forEach((room, roomIndex) => {
        const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
        const fabricData = storedPricing?.PRICING_DATA || PRICING_DATA;
        
        fabricNumbers.forEach(fabricNum => {
          if (!isFabricValid(fabricNum, fabricData)) {
            invalidFabrics.push({ fabric: fabricNum, room: room.name || `Room ${roomIndex + 1}` });
          }
        });
      });

      rooms.forEach(room => {
        const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
        const fabricData = storedPricing?.PRICING_DATA || PRICING_DATA;
        
        // Determine blind type from ACTUAL FABRICS entered, not from selected checkbox
        let actualBlindType = (room.blindTypes || ['Roller'])[0]; // Fallback to selected
        
        if (fabricNumbers.length > 0) {
          // Get blind type from first valid fabric
          for (const fabricNum of fabricNumbers) {
            const detectedType = getBlindTypeFromFabric(fabricNum, fabricData);
            if (detectedType) {
              actualBlindType = detectedType;
              break; // Use first valid fabric's type
            }
          }
        }
        
        room.windowGroups.forEach((group, groupIdx) => {
          const motorizedCount = room.windowGroups.filter(w => w.controlType === 'Motor').length;
          const q = calculateGroupQuote(group, fabricNumbers, actualBlindType, motorizedCount, storedPricing);
          
          // Safety check for NaN
          if (isNaN(q.minQuote) || isNaN(q.maxQuote)) {
            console.error('NaN detected in quote calculation:', { group, q });
            return;
          }
          
          // ✅ NEW: Supplier cost breakdown (fabric/shipping/motor/solar), independent
          // of any price override - this reflects actual physical cost, not what's charged.
          const quantityForCost = parseInt(group.quantity) || 1;
          const avgGroupCost = (q.minCost + q.maxCost) / 2;
          const shippingForGroup = (storedPricing?.SHIPPING_COST ?? 42) * quantityForCost;
          overallShippingCost += shippingForGroup;
          overallFabricCost += (avgGroupCost - shippingForGroup); // fabric price + wrap + misc
          if (group.controlType === 'Motor') {
            const remoteType = motorizedCount > 6 ? (storedPricing?.REMOTE_16CH ?? 10) : (storedPricing?.REMOTE_6CH ?? 7);
            overallMotorSupplierCost += ((storedPricing?.MOTOR_COST_SUPPLIER ?? 50) + (remoteType / motorizedCount)) * quantityForCost;
          }
          if (group.solar) {
            overallSolarSupplierCost += (storedPricing?.SOLAR_COST_SUPPLIER ?? 22) * quantityForCost;
          }

          // ✅ BUGFIX: Grand Total / Tax / Profit previously always used the raw
          // calculated price and ignored any edited per-window price, so a saved
          // edit changed the per-window row but not the totals. Now: if this
          // window group has an edited price (pending or already saved), the
          // totals use that instead.
          const priceKey = `${room.id}_${groupIdx}`;
          const pendingPrice = tableEditValues.perWindowPrices[priceKey];
          const savedPrice = selectedQuote.editedPrices?.perWindowPrices?.[priceKey];
          const overridePrice = (typeof pendingPrice === 'number' || isRangeOverride(pendingPrice)) ? pendingPrice
            : ((typeof savedPrice === 'number' || isRangeOverride(savedPrice)) ? savedPrice : null);

          if (overridePrice !== null) {
            const quantity = parseInt(group.quantity) || 1;
            if (isRangeOverride(overridePrice)) {
              // ✅ NEW: a custom range override (e.g. "125-140") contributes its
              // own min/max separately, instead of collapsing to one point.
              totalMin += overridePrice.min * quantity;
              totalMax += overridePrice.max * quantity;
            } else {
              const overrideTotal = overridePrice * quantity;
              totalMin += overrideTotal;
              totalMax += overrideTotal;
            }
          } else {
            // ✅ BUGFIX: use baseMinQuote/baseMaxQuote (window/fabric cost only -
            // the same number shown in the "Per Window" column) instead of
            // minQuote/maxQuote, which had a NET motor/solar margin baked in.
            // Motor and Solar are now added exactly once, globally, via
            // motorGrandTotal/solarGrandTotal below - using minQuote here too
            // would double-count them for every non-overridden motorized or
            // solar window.
            totalMin += q.baseMinQuote;
            totalMax += q.baseMaxQuote;
          }
        });
      });

      // ✅ NEW: Overall expected supplier-side cost = sum of the 4 buckets above (no profit).
      const overallSupplierCost = overallFabricCost + overallShippingCost + overallMotorSupplierCost + overallSolarSupplierCost;
      // ✅ BUGFIX: profit must be measured against the FULL revenue (window +
      // motor + solar, all client-facing amounts) - previously used totalMin
      // alone, which understated revenue by the entire motor/solar amount and
      // therefore understated profit too.
      const pricingComparisonProfit = (totalMin + motorGrandTotal + solarGrandTotal) - overallSupplierCost;

      // ✅ FIX: "Effective" tax rate - checks pending edit FIRST, then saved edit, then default
      // Works whether actively editing, just clicked Done, or viewing a saved version
      const taxRate = (() => {
        const pending = tableEditValues.taxRate;
        if (typeof pending === 'number') return pending;          // Pending edit (typed a value)
        if (pending === '') return 0;                              // Pending edit (cleared to empty)
        const saved = selectedQuote.editedPrices?.taxRate;
        if (typeof saved === 'number') return saved;                // Previously saved edit
        return storedPricing?.SALES_TAX_RATE || SALES_TAX_RATE;    // Default
      })();
      // ✅ BUGFIX (the main issue reported): Motor and Solar totals were never
      // actually added into the taxable base or Grand Total before - they were
      // just informational rows sitting next to numbers that didn't include them.
      // Tax now applies to Window + Motor + Solar together, and Grand Total
      // reflects that same combined amount, not just the window cost.
      const subtotalMin = totalMin + motorGrandTotal + solarGrandTotal;
      const subtotalMax = totalMax + motorGrandTotal + solarGrandTotal;
      const taxMin = subtotalMin * taxRate;
      const taxMax = subtotalMax * taxRate;
      const grandMin = subtotalMin + taxMin;
      const grandMax = subtotalMax + taxMax;

    const copyText = (() => {
      let text = `QUOTE - ${BUSINESS_NAME}\n\nClient: ${selectedQuote.clientName}\nPhone: ${selectedQuote.clientPhone}\nLocation: ${selectedQuote.location}\nDate: ${selectedQuote.date}\n\n`;
      
      let totalWindows = 0;
      
      text += `ROOMS:\n`;
      rooms.forEach(room => {
        // ✅ BUGFIX (2 issues):
        // 1. Only group.controlType was used to build the label, so a
        //    Motor+Solar group showed as just "Motor" - solar was silently dropped.
        // 2. All window groups in a room were merged into ONE line (summed
        //    quantity, a merged set of control types), so a room with two
        //    differently-configured groups (different size and/or Motor vs
        //    Motor+Solar) collapsed into a single misleading line showing
        //    only one of the sizes.
        // Now: each group gets its own correct "Motor+Solar"-style label, and
        // rooms with more than one group get one line PER group (with size,
        // so they're distinguishable) instead of being merged together.
        if (room.windowGroups.length === 1) {
          const group = room.windowGroups[0];
          const qty = parseInt(group.quantity) || 1;
          totalWindows += qty;
          const controlLabel = (group.controlType || 'Manual') + (group.solar ? '+Solar' : '');
          text += `${room.name} (${qty} windows) - ${controlLabel}\n`;
        } else {
          room.windowGroups.forEach(group => {
            const qty = parseInt(group.quantity) || 1;
            totalWindows += qty;
            const controlLabel = (group.controlType || 'Manual') + (group.solar ? '+Solar' : '');
            const size = `${group.width}x${group.height}`;
            text += `${room.name} (${qty} windows, ${size}) - ${controlLabel}\n`;
          });
        }
      });
      
      text += `\nTOTAL WINDOWS: ${totalWindows}\n\n`;
      
      // Format price - show single if min === max
      const formatTextPrice = (min, max) => {
        const minR = Math.round(min);
        const maxR = Math.round(max);
        return minR === maxR ? `$${minR}` : `$${minR}-$${maxR}`;
      };
      
      text += `OVERALL QUOTE: ${formatTextPrice(totalMin, totalMax)}\n`;
      // ✅ FIX: Motor/Solar cost totals were shown on screen but never made it
      // into the copied text, so a copied quote silently understated the
      // Grand Total's components - same class of bug as the on-screen totals
      // once had before motorGrandTotal/solarGrandTotal became the single
      // source of truth. Reuse those same values here.
      if (motorCount > 0) {
        text += `Motor ${motorCount} cost total: $${formatMoney(motorGrandTotal)}\n`;
      }
      if (solarCount > 0) {
        text += `Solar ${solarCount} cost total: $${formatMoney(solarGrandTotal)}\n`;
      }
      if (motorCount > 0 || solarCount > 0) {
        text += `Subtotal (before tax): ${formatTextPrice(subtotalMin, subtotalMax)}\n`;
      }
      text += `Sales Tax (${formatMoney(taxRate * 100)}%): ${formatTextPrice(taxMin, taxMax)}\n`;
      text += `GRAND TOTAL: ${formatTextPrice(grandMin, grandMax)}`;
      
      return text;
    })();

    return (
      <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff' }}>{selectedQuote.quoteName}</h3>
            <button onClick={() => setSelectedQuote(null)} style={{ fontSize: '24px', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Invalid Fabrics Warning */}
          {invalidFabrics.length > 0 && (
            <div style={{ borderRadius: '8px', marginBottom: '24px', background: '#3a2a2a', border: '2px solid #ff6b6b', padding: '16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#ff6b6b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>⚠️</span>
                INVALID/NEW FABRICS DETECTED
              </p>
              <p style={{ fontSize: '11px', color: '#ffaaaa', marginBottom: '8px', fontStyle: 'italic' }}>
                The following fabrics are not in the system. Quote is using HIGHEST PRICE as fallback:
              </p>
              <div style={{ background: '#2a1a1a', padding: '8px 12px', borderRadius: '4px', borderLeft: '3px solid #ff6b6b' }}>
                {invalidFabrics.map((item, idx) => (
                  <p key={idx} style={{ fontSize: '11px', color: '#ffdddd', margin: '4px 0' }}>
                    • <strong>{item.fabric}</strong> ({item.room})
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Pricing Details Section - Collapsible (default collapsed) */}
          {storedPricing && storedPricing.PROFIT_PER_WINDOW && (
            <div style={{ borderRadius: '8px', marginBottom: '24px', background: '#1a3a3a', border: '1px solid #4a7a6a', padding: '16px' }}>
              <button onClick={() => setExpandedPricingDetails(!expandedPricingDetails)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '0', marginBottom: expandedPricingDetails ? '12px' : '0' }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#d4af37', marginBottom: '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>📋 PRICING DETAILS (Used for this quote)</span>
                  <span style={{ color: '#888', fontSize: '14px' }}>{expandedPricingDetails ? '▼' : '▶'}</span>
                </p>
              </button>
              
              {expandedPricingDetails && (
                <>
                  <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px', fontStyle: 'italic' }}>✅ All fabric prices, profit margins, and surcharges captured and locked for this quote</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Profit Per Window:</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.PROFIT_PER_WINDOW}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Captured Date:</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>{storedPricing?.CREATED_DATE ? new Date(storedPricing.CREATED_DATE).toLocaleDateString() : selectedQuote?.createdDate ? new Date(selectedQuote.createdDate).toLocaleDateString() : 'N/A'}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Width Surcharge (41-55"):</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.WIDTH_SURCHARGES?.["41-55"] ?? 45}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Height Surcharge (&gt;90"):</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.HEIGHT_SURCHARGE ?? 37}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Motor Cost (Client):</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.MOTOR_COST_CLIENT ?? 80}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Solar Cost (Client):</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.SOLAR_COST_CLIENT ?? 40}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Misc Expense:</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.MISC_EXPENSE ?? 4.50}</p>
                    </div>
                    <div>
                      <p style={{ color: '#888', marginBottom: '4px' }}>Shipping Cost:</p>
                      <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.SHIPPING_COST ?? 42}</p>
                    </div>
                    <div style={{ gridColumn: '1 / -1', paddingTop: '8px', borderTop: '1px solid #4a7a6a' }}>
                      <p style={{ color: '#d4af37', fontSize: '11px', fontWeight: 'bold' }}>📦 Fabric Prices: LOCKED ({storedPricing.PRICING_DATA ? Object.keys(storedPricing.PRICING_DATA).length : 'N/A'} blind types)</p>
                      <p style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>All fabric costs are captured and will not change even if you update prices later</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ✅ PRICING COMPARISON - same structure as "📋 PRICING DETAILS" above */}
          <div style={{ borderRadius: '8px', marginBottom: '24px', background: '#1a3a3a', border: '1px solid #4a7a6a', padding: '16px' }}>
            <button onClick={() => setExpandedPricingComparison(!expandedPricingComparison)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '0', marginBottom: expandedPricingComparison ? '12px' : '0' }}>
              <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#d4af37', marginBottom: '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>📊 PRICING COMPARISON (Supplier Only)</span>
                <span style={{ color: '#888', fontSize: '14px' }}>{expandedPricingComparison ? '▼' : '▶'}</span>
              </p>
            </button>

            {expandedPricingComparison && (
              <>
                <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px', fontStyle: 'italic' }}>💡 Internal cost/profit breakdown. Not shown to clients.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                  <div>
                    <p style={{ color: '#888', marginBottom: '4px' }}>Fabric Cost (Supplier Cost):</p>
                    <p style={{ color: '#fff', fontWeight: 'bold' }}>${formatMoney(overallFabricCost)}</p>
                  </div>
                  <div>
                    <p style={{ color: '#888', marginBottom: '4px' }}>Shipping Cost:</p>
                    <p style={{ color: '#fff', fontWeight: 'bold' }}>${formatMoney(overallShippingCost)}</p>
                  </div>
                  <div>
                    <p style={{ color: '#888', marginBottom: '4px' }}>Motor Cost (Supplier Cost):</p>
                    <p style={{ color: '#fff', fontWeight: 'bold' }}>${formatMoney(overallMotorSupplierCost)}</p>
                  </div>
                  <div>
                    <p style={{ color: '#888', marginBottom: '4px' }}>Solar Cost (Supplier Cost):</p>
                    <p style={{ color: '#fff', fontWeight: 'bold' }}>${formatMoney(overallSolarSupplierCost)}</p>
                  </div>
                  <div style={{ gridColumn: '1 / -1', paddingTop: '8px', borderTop: '1px solid #4a7a6a' }}>
                    <p style={{ color: '#888', marginBottom: '4px' }}>Overall Expected Cost (Supplier Side, no profit):</p>
                    <p style={{ color: '#ffaa00', fontWeight: 'bold', fontSize: '13px' }}>${formatMoney(overallSupplierCost)}</p>
                  </div>
                  <div style={{ gridColumn: '1 / -1', paddingTop: '8px', borderTop: '1px solid #4a7a6a' }}>
                    <p style={{ color: '#d4af37', fontSize: '11px', fontWeight: 'bold' }}>💰 PROFIT: ${formatMoney(pricingComparisonProfit)}</p>
                    <p style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>Total price to client minus the overall supplier cost above</p>
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ borderRadius: '8px', marginBottom: '32px', background: '#2a2a2a', border: '1px solid #444' }}>
            <button onClick={() => setExpandedQuoteTable(!expandedQuoteTable)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 16px', marginBottom: expandedQuoteTable ? '0' : '0' }}>
              <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#d4af37', marginBottom: '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>💰 CURRENT PRICING</span>
                <span style={{ color: '#888', fontSize: '14px' }}>{expandedQuoteTable ? '▼' : '▶'}</span>
              </p>
            </button>
            {expandedQuoteTable && (
            <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#1a1a1a', borderBottom: '1px solid #444' }}>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold', color: '#fff' }}>Room</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#fff' }}>Qty</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#fff' }}>Size</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#fff' }}>Type</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#fff' }}>Per Window</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#fff' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room, roomIdx) => {
                  const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
                  
                  // Determine blind type from ACTUAL FABRICS entered
                  let actualBlindType = (room.blindTypes || ['Roller'])[0];
                  if (fabricNumbers.length > 0) {
                    for (const fabricNum of fabricNumbers) {
                      const detectedType = getBlindTypeFromFabric(fabricNum);
                      if (detectedType) {
                        actualBlindType = detectedType;
                        break;
                      }
                    }
                  }
                  
                  return room.windowGroups.map((group, groupIdx) => {
                    const q = calculateGroupQuote(group, fabricNumbers, actualBlindType, room.windowGroups.filter(w => w.controlType === 'Motor').length, storedPricing);
                    const motorType = group.controlType || 'Manual';
                    const quantity = parseInt(group.quantity) || 1;
                    const perWindowMin = q.baseMinQuote / quantity;
                    
                    // ✅ FIX: Composite key (room + window group) so multiple window groups
                    // in the same room don't collide with each other's edited price
                    const priceKey = `${room.id}_${groupIdx}`;
                    const fieldKey = `perWindow-${priceKey}`;
                    
                    // Saved price (from a previously saved version) - now either a
                    // plain number OR a {min,max} custom range override
                    const savedPrice = selectedQuote.editedPrices?.perWindowPrices?.[priceKey];
                    const hasSavedPrice = typeof savedPrice === 'number' || isRangeOverride(savedPrice);
                    const basePrice = hasSavedPrice ? savedPrice : perWindowMin;
                    
                    // "Effective" price - a committed pending edit (after Done, before Save) takes priority
                    const pendingPrice = tableEditValues.perWindowPrices[priceKey];
                    const hasPendingPrice = typeof pendingPrice === 'number' || isRangeOverride(pendingPrice);
                    const effectivePrice = hasPendingPrice ? pendingPrice : basePrice;
                    const isEdited = hasPendingPrice || hasSavedPrice;
                    const isEditingThis = editingTableField === fieldKey;
                    
                    return (
                      <tr key={`${roomIdx}-${groupIdx}`} style={{ borderBottom: '1px solid #444' }}>
                        <td style={{ padding: '8px', color: '#fff' }}>{room.name}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#ccc' }}>{group.quantity}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#ccc' }}>{group.width}x{group.height}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#ccc' }}>{motorType}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: isEdited ? '#ffcc00' : '#d4af37', fontWeight: '600' }}>
                          {isEditingThis ? (
                            <>
                              {/* ✅ Range-priced windows get a Fixed/Range toggle. Range mode
                                  shows two separate Min/Max boxes instead of one field with a
                                  typed hyphen - the mobile numeric keypad has no hyphen key at
                                  all, so a single combined field had no reliable way to enter one. */}
                              {q.isRange && (
                                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                                  <button
                                    onClick={() => setPriceEditMode('fixed')}
                                    style={{ flex: 1, padding: '3px 6px', borderRadius: '3px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', background: priceEditMode === 'fixed' ? '#0e7490' : '#333', color: priceEditMode === 'fixed' ? '#fff' : '#999', border: 'none' }}
                                  >
                                    Fixed
                                  </button>
                                  <button
                                    onClick={() => setPriceEditMode('range')}
                                    style={{ flex: 1, padding: '3px 6px', borderRadius: '3px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', background: priceEditMode === 'range' ? '#0e7490' : '#333', color: priceEditMode === 'range' ? '#fff' : '#999', border: 'none' }}
                                  >
                                    Range
                                  </button>
                                </div>
                              )}
                              {q.isRange && priceEditMode === 'range' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Min"
                                    value={activeEditText}
                                    onChange={(e) => setActiveEditText(filterNumericText(e.target.value))}
                                    style={{ width: '48px', padding: '2px', borderRadius: '4px', fontSize: '12px', background: '#1a1a1a', border: '1px solid #d4af37', color: 'white' }}
                                    autoFocus
                                  />
                                  <span style={{ color: '#888' }}>–</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Max"
                                    value={activeEditTextMax}
                                    onChange={(e) => setActiveEditTextMax(filterNumericText(e.target.value))}
                                    style={{ width: '48px', padding: '2px', borderRadius: '4px', fontSize: '12px', background: '#1a1a1a', border: '1px solid #d4af37', color: 'white' }}
                                  />
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={activeEditText}
                                  onChange={(e) => setActiveEditText(filterNumericText(e.target.value))}
                                  style={{ width: '55px', padding: '2px', borderRadius: '4px', fontSize: '12px', background: '#1a1a1a', border: '1px solid #d4af37', color: 'white' }}
                                  autoFocus={!q.isRange}
                                />
                              )}
                              {q.isRange && (
                                <p style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                                  Estimated range: {formatPrice(q.baseMinQuote / quantity, q.baseMaxQuote / quantity)}
                                </p>
                              )}
                            </>
                          ) : (
                            <span>
                              {/* A genuine, not-yet-priced range shows as a range (e.g.
                                  "$100-$150"); once you set either a fixed price or your
                                  own custom range, it shows exactly what you set. */}
                              {isEdited ? formatPriceOverride(effectivePrice) : (
                                q.isRange
                                  ? formatPrice(q.baseMinQuote / quantity, q.baseMaxQuote / quantity)
                                  : `$${formatMoney(effectivePrice)}`
                              )}
                            </span>
                          )}
                          <button
                            onClick={() => {
                              if (isEditingThis) {
                                // ✅ Commit whatever was entered - Range mode reads BOTH boxes
                                // (each a plain, always-valid number - no parsing ambiguity),
                                // Fixed mode reads the one box as before.
                                if (q.isRange && priceEditMode === 'range') {
                                  const min = parseFloat(activeEditText);
                                  const max = parseFloat(activeEditTextMax);
                                  if (!isNaN(min) && !isNaN(max) && min >= 0 && max >= 0) {
                                    setTableEditValues({...tableEditValues, perWindowPrices: {...tableEditValues.perWindowPrices, [priceKey]: { min: Math.min(min, max), max: Math.max(min, max) }}});
                                  }
                                  // If either box is empty/invalid, leave unchanged - same as
                                  // the existing "invalid input, don't commit" pattern.
                                } else {
                                  const parsed = parseFloat(activeEditText);
                                  if (activeEditText !== '' && !isNaN(parsed) && parsed >= 0) {
                                    setTableEditValues({...tableEditValues, perWindowPrices: {...tableEditValues.perWindowPrices, [priceKey]: parsed}});
                                  }
                                }
                                setEditingTableField(null);
                                setActiveEditText('');
                                setActiveEditTextMax('');
                              } else {
                                // Start editing - seed the box(es) with current effective value.
                                // Already a custom range -> range mode, seeded with its min/max.
                                // A genuine unpriced range -> range mode, seeded with the estimate.
                                // A plain fixed price (or single-fabric window) -> fixed mode.
                                setEditingTableField(fieldKey);
                                if (isRangeOverride(effectivePrice)) {
                                  setPriceEditMode('range');
                                  setActiveEditText(formatMoney(effectivePrice.min));
                                  setActiveEditTextMax(formatMoney(effectivePrice.max));
                                } else if (q.isRange && !isEdited) {
                                  setPriceEditMode('range');
                                  setActiveEditText(formatMoney(q.baseMinQuote / quantity));
                                  setActiveEditTextMax(formatMoney(q.baseMaxQuote / quantity));
                                } else {
                                  setPriceEditMode('fixed');
                                  setActiveEditText(formatMoney(effectivePrice));
                                  setActiveEditTextMax('');
                                }
                              }
                            }}
                            style={{ marginLeft: '6px', padding: '2px 6px', borderRadius: '2px', background: isEditingThis ? '#10b981' : '#666', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                          >
                            {isEditingThis ? 'Done' : '✏️'}
                          </button>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: isEdited ? '#ffcc00' : '#fff' }}>
                          {isEdited
                            ? (isRangeOverride(effectivePrice) ? formatPrice(effectivePrice.min * quantity, effectivePrice.max * quantity) : `$${formatMoney(effectivePrice * quantity)}`)
                            : (q.isRange ? formatPrice(q.baseMinQuote, q.baseMaxQuote) : `$${formatMoney(effectivePrice * quantity)}`)}
                        </td>
                      </tr>
                    );
                  });
                })}
                <tr style={{ background: '#1a3a3a', borderTop: '2px solid #d4af37', fontWeight: 'bold' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>TOTAL:</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>{formatPrice(totalMin, totalMax)}</td>
                </tr>
                {/* ✅ NEW: Total Windows Row */}
                <tr style={{ background: '#2a3a2a' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}>
                    TOTAL WINDOWS: <span style={{ color: '#fff', fontWeight: 'bold' }}>{(() => {
                      let totalWins = 0;
                      selectedQuote.rooms.forEach(room => {
                        room.windowGroups.forEach(group => {
                          totalWins += parseInt(group.quantity) || 0;
                        });
                      });
                      return totalWins;
                    })()}</span>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}></td>
                </tr>
                {/* ✅ Motor Cost Breakdown Row - uses the SAME motorCount/motorGrandTotal
                    computed once above for Grand Total, so this row and Grand Total can
                    never show different numbers again. */}
                {motorCount > 0 && (() => {
                  const isEditingMotor = editingTableField === 'motorCost';
                  const isMotorEdited = typeof tableEditValues.motorCost === 'number' || typeof selectedQuote.editedPrices?.motorCost === 'number';
                  return (
                    <tr style={{ background: '#3a2a2a' }}>
                      <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}>
                        Motor <span style={{ color: '#ffaa00', fontWeight: 'bold' }}>{motorCount}</span> cost total: 
                        {isEditingMotor ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={activeEditText}
                            onChange={(e) => setActiveEditText(filterNumericText(e.target.value))}
                            style={{ width: '55px', padding: '2px', borderRadius: '4px', fontSize: '12px', marginLeft: '4px', background: '#1a1a1a', border: '1px solid #d4af37', color: 'white' }}
                            autoFocus
                          />
                        ) : (
                          <span style={{ color: isMotorEdited ? '#ffcc00' : '#fff', fontWeight: 'bold', marginLeft: '4px' }}>${formatMoney(motorGrandTotal)}</span>
                        )}
                        <button
                          onClick={() => {
                            if (isEditingMotor) {
                              const parsed = parseFloat(activeEditText);
                              if (activeEditText !== '' && !isNaN(parsed)) {
                                setTableEditValues({...tableEditValues, motorCost: parsed});
                              }
                              setEditingTableField(null);
                              setActiveEditText('');
                              setActiveEditTextMax('');
                              setPriceEditMode('fixed');
                            } else {
                              setEditingTableField('motorCost');
                              setActiveEditText(formatMoney(effectiveMotorCost));
                            }
                          }}
                          style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '3px', background: isEditingMotor ? '#10b981' : '#666', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                        >
                          {isEditingMotor ? 'Done' : '✏️'}
                        </button>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}></td>
                    </tr>
                  );
                })()}
                {/* ✅ Solar Cost Breakdown Row - same shared-source-of-truth pattern as Motor */}
                {solarCount > 0 && (() => {
                  const isEditingSolar = editingTableField === 'solarCost';
                  const isSolarEdited = typeof tableEditValues.solarCost === 'number' || typeof selectedQuote.editedPrices?.solarCost === 'number';
                  return (
                    <tr style={{ background: '#2a3a2a' }}>
                      <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}>
                        Solar <span style={{ color: '#ffaa00', fontWeight: 'bold' }}>{solarCount}</span> cost total: 
                        {isEditingSolar ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={activeEditText}
                            onChange={(e) => setActiveEditText(filterNumericText(e.target.value))}
                            style={{ width: '55px', padding: '2px', borderRadius: '4px', fontSize: '12px', marginLeft: '4px', background: '#1a1a1a', border: '1px solid #d4af37', color: 'white' }}
                            autoFocus
                          />
                        ) : (
                          <span style={{ color: isSolarEdited ? '#ffcc00' : '#fff', fontWeight: 'bold', marginLeft: '4px' }}>${formatMoney(solarGrandTotal)}</span>
                        )}
                        <button
                          onClick={() => {
                            if (isEditingSolar) {
                              const parsed = parseFloat(activeEditText);
                              if (activeEditText !== '' && !isNaN(parsed)) {
                                setTableEditValues({...tableEditValues, solarCost: parsed});
                              }
                              setEditingTableField(null);
                              setActiveEditText('');
                              setActiveEditTextMax('');
                              setPriceEditMode('fixed');
                            } else {
                              setEditingTableField('solarCost');
                              setActiveEditText(formatMoney(effectiveSolarCost));
                            }
                          }}
                          style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '3px', background: isEditingSolar ? '#10b981' : '#666', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                        >
                          {isEditingSolar ? 'Done' : '✏️'}
                        </button>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}></td>
                    </tr>
                  );
                })()}
                {/* ✅ NEW: Subtotal row - makes it explicit that Tax applies to
                    Window + Motor + Solar together, not just the window cost. */}
                {(motorCount > 0 || solarCount > 0) && (
                  <tr style={{ background: '#2a2a3a' }}>
                    <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#ccc', fontWeight: 'bold' }}>Subtotal (before tax):</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: '#ccc', fontWeight: 'bold' }}>{formatPrice(subtotalMin, subtotalMax)}</td>
                  </tr>
                )}
                <tr style={{ background: '#1a3a3a' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}>
                    Tax (
                    {editingTableField === 'tax' ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={activeEditText}
                        onChange={(e) => setActiveEditText(filterNumericText(e.target.value))}
                        style={{ width: '45px', padding: '2px', borderRadius: '4px', fontSize: '12px', background: '#1a1a1a', border: '1px solid #d4af37', color: 'white' }}
                        autoFocus
                      />
                    ) : (
                      <span>{(() => {
                        // Show effective tax rate (pending edit > saved edit > default), as a percentage
                        const pending = tableEditValues.taxRate;
                        const effective = typeof pending === 'number' ? pending
                          : (typeof selectedQuote.editedPrices?.taxRate === 'number' ? selectedQuote.editedPrices.taxRate : (storedPricing?.SALES_TAX_RATE || SALES_TAX_RATE));
                        return formatMoney(effective * 100);
                      })()}</span>
                    )}
                    %):
                    <button
                      onClick={() => {
                        if (editingTableField === 'tax') {
                          // ✅ FIX #3: Commit whatever percentage was typed NOW
                          const parsed = parseFloat(activeEditText);
                          if (activeEditText !== '' && !isNaN(parsed)) {
                            setTableEditValues({...tableEditValues, taxRate: parsed / 100});
                          }
                          setEditingTableField(null);
                          setActiveEditText('');
                          setActiveEditTextMax('');
                          setPriceEditMode('fixed');
                        } else {
                          // Start editing - seed text box with the CURRENT effective percentage
                          const pending = tableEditValues.taxRate;
                          const currentEffective = typeof pending === 'number' ? pending 
                            : (typeof selectedQuote.editedPrices?.taxRate === 'number' ? selectedQuote.editedPrices.taxRate : (storedPricing?.SALES_TAX_RATE || SALES_TAX_RATE));
                          setEditingTableField('tax');
                          setActiveEditText(formatMoney(currentEffective * 100));
                        }
                      }}
                      style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '3px', background: editingTableField === 'tax' ? '#10b981' : '#666', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                    >
                      {editingTableField === 'tax' ? 'Done' : '✏️'}
                    </button>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}>{formatPrice(taxMin, taxMax)}</td>
                </tr>
                <tr style={{ background: '#2a5a2a', fontWeight: 'bold' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>GRAND TOTAL:</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>{formatPrice(grandMin, grandMax)}</td>
                </tr>
              </tbody>
            </table>
            </div>
            )}
          </div>

          {/* ✅ FIXED: Save All Changes Button - Show if ANY values differ from "not edited" defaults, OR you're actively typing a not-yet-committed edit */}
          {(Object.keys(tableEditValues.perWindowPrices).length > 0 || tableEditValues.motorCost !== null || tableEditValues.solarCost !== null || tableEditValues.taxRate !== null || (editingTableField && activeEditText !== '')) && (
            <>
              {/* Visual indicator of pending changes */}
              <div style={{ padding: '12px', marginBottom: '12px', background: '#2a3a1a', border: '2px solid #4ade80', borderRadius: '6px', textAlign: 'center' }}>
                <p style={{ color: '#4ade80', fontWeight: 'bold', margin: '0' }}>
                  ⚡ You have pending changes ({Object.keys(tableEditValues.perWindowPrices).length > 0 ? Object.keys(tableEditValues.perWindowPrices).length + ' prices' : ''}{tableEditValues.motorCost !== null ? ', motor cost' : ''}{tableEditValues.solarCost !== null ? ', solar cost' : ''}{tableEditValues.taxRate !== null ? ', tax rate' : ''}{editingTableField && activeEditText !== '' ? ' (still typing...)' : ''})
                </p>
              </div>
              
            <button
              onClick={async () => {
                // ✅ BUGFIX: if you're still typing in an input (e.g. edited Motor Cost
                // but clicked "Save All Changes" instead of that field's own "Done"
                // button first), the typed value never made it into tableEditValues and
                // was silently dropped - the new version saved with the OLD motor cost,
                // which is exactly what looked like "motor cost missing" after saving.
                // Auto-commit whatever's currently open before saving, so nothing is lost.
                let effectiveTableEditValues = tableEditValues;
                if (editingTableField && editingTableField.startsWith('perWindow-') && priceEditMode === 'range' && activeEditText !== '' && activeEditTextMax !== '') {
                  const min = parseFloat(activeEditText);
                  const max = parseFloat(activeEditTextMax);
                  if (!isNaN(min) && !isNaN(max) && min >= 0 && max >= 0) {
                    const key = editingTableField.replace('perWindow-', '');
                    effectiveTableEditValues = { ...tableEditValues, perWindowPrices: { ...tableEditValues.perWindowPrices, [key]: { min: Math.min(min, max), max: Math.max(min, max) } } };
                  }
                } else if (editingTableField && activeEditText !== '') {
                  const parsed = parseFloat(activeEditText);
                  if (!isNaN(parsed)) {
                    if (editingTableField === 'motorCost') {
                      effectiveTableEditValues = { ...tableEditValues, motorCost: parsed };
                    } else if (editingTableField === 'solarCost') {
                      effectiveTableEditValues = { ...tableEditValues, solarCost: parsed };
                    } else if (editingTableField === 'tax') {
                      effectiveTableEditValues = { ...tableEditValues, taxRate: parsed / 100 };
                    } else if (editingTableField.startsWith('perWindow-') && parsed >= 0) {
                      const key = editingTableField.replace('perWindow-', '');
                      effectiveTableEditValues = { ...tableEditValues, perWindowPrices: { ...tableEditValues.perWindowPrices, [key]: parsed } };
                    }
                  }
                }

                // ✅ FIX #1: Parse version string safely - handles corrupted versions
                const parseVersion = (version) => {
                  if (typeof version === 'string') {
                    // Extract ONLY numbers from version string
                    const num = parseInt(version.replace(/[^0-9]/g, ''));
                    return isNaN(num) ? 1 : num;
                  }
                  return parseInt(version) || 1;
                };
                
                const versionNumber = parseVersion(selectedQuote.version);
                const newVersionNumber = versionNumber + 1;
                const newVersionString = `v${newVersionNumber}`;
                
                // ✅ FIX #1 (continued): Update quoteName string too - it has the OLD version baked in!
                // e.g. "John-Dallas-Roller-quote-v1" -> "John-Dallas-Roller-quote-v2"
                const oldQuoteName = selectedQuote.quoteName || '';
                const newQuoteName = /-v\d+$/.test(oldQuoteName)
                  ? oldQuoteName.replace(/-v\d+$/, `-${newVersionString}`)
                  : `${oldQuoteName}-${newVersionString}`;
                
                // ✅ FIX #3: Generate unique ID for new version
                const uniqueId = `${selectedQuote.id}-${newVersionString}-${Date.now()}`;
                
                // ✅ IMPORTANT: Merge with previously saved edits, don't overwrite them!
                // If a prior version already had per-window prices edited, and this save
                // only touches motor cost, we must not lose those earlier per-window edits.
                const mergedEditedPrices = {
                  perWindowPrices: {
                    ...(selectedQuote.editedPrices?.perWindowPrices || {}),
                    ...Object.fromEntries(Object.entries(effectiveTableEditValues.perWindowPrices).filter(([, v]) => typeof v === 'number' || isRangeOverride(v)))
                  },
                  motorCost: typeof effectiveTableEditValues.motorCost === 'number' ? effectiveTableEditValues.motorCost : selectedQuote.editedPrices?.motorCost,
                  solarCost: typeof effectiveTableEditValues.solarCost === 'number' ? effectiveTableEditValues.solarCost : selectedQuote.editedPrices?.solarCost,
                  taxRate: typeof effectiveTableEditValues.taxRate === 'number' ? effectiveTableEditValues.taxRate : selectedQuote.editedPrices?.taxRate
                };
                
                // Create new version with merged edited prices
                const newQuote = {
                  ...selectedQuote,
                  id: uniqueId,
                  quoteName: newQuoteName,
                  version: newVersionString,
                  updatedDate: new Date().toISOString(),
                  editedPrices: mergedEditedPrices,
                  hasEditedPrices: true
                };
                
                // Save as new version to quotes array
                const updatedQuotes = [...quotes, newQuote];
                const syncResult = await updateQuotes(updatedQuotes);
                
                setSelectedQuote(newQuote);
                
                // Clear editing mode
                setEditingTableField(null);
                
                // Reset edit values for next time
                setTableEditValues({ perWindowPrices: {}, motorCost: null, solarCost: null, taxRate: null });
                setActiveEditText('');
                setActiveEditTextMax('');
                setPriceEditMode('fixed');
                
                // Show success with correct version number
                alert(syncResult.success ? `✅ Success! New version ${newVersionString} created with your edited prices` : syncFailureMessage(syncResult.errors));
              }}
              style={{ width: '100%', padding: '14px', marginBottom: '24px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
            >
              💾 Save All Changes & Create New Version
            </button>
            </>
          )}

          <button
            onClick={() => {
              // ✅ NEW: quick "send to supplier for quote confirmation" export.
              // Reuses the same tested row-expansion + CSV logic as the Supplier
              // Measurements tool, but carries over the quote's own rough
              // width/height as-is (prefillMeasurements: true) since the point
              // here is a fast confirmation pass, not precise measurements.
              const rows = expandQuoteIntoRows(selectedQuote, { prefillMeasurements: true });
              const csv = sheetToCSV({ address: selectedQuote.location }, rows);
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${(selectedQuote.quoteName || 'quote').replace(/[^a-z0-9]/gi, '_')}_supplier_confirmation.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
            style={{ width: '100%', padding: '12px', marginBottom: '12px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', background: '#0e7490', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            📤 Export Supplier CSV (Quote Confirmation)
          </button>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(copyText);
                setCopiedId(selectedQuote.id);
                setTimeout(() => setCopiedId(null), 2000);
              }}
              style={{ flex: 1, paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', background: '#d4af37', color: '#000', border: 'none', cursor: 'pointer' }}
            >
              {copiedId === selectedQuote.id ? <Check size={16} /> : <Copy size={16} />}
              {copiedId === selectedQuote.id ? 'Copied!' : 'Copy'}
            </button>
            
            <button
              onClick={() => loadQuoteForEdit(selectedQuote)}
              style={{ paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              <Edit2 size={16} />
              Edit
            </button>
            
            <button
              onClick={() => {
                // ✅ BUGFIX: this previously deleted instantly with NO confirmation.
                // Now it warns, names the quote, and stores an undo snapshot.
                const done = safeDeleteQuotes([selectedQuote.id], `Deleted ${selectedQuote.quoteName || 'quote'}`);
                if (done) setSelectedQuote(null);
              }}
              style={{ paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px', borderRadius: '8px', fontWeight: 'bold', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    );
    } catch (error) {
      console.error('Error rendering quote detail:', error);
      return (
        <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <button onClick={() => setSelectedQuote(null)} style={{ marginBottom: '24px', padding: '8px 16px', borderRadius: '8px', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer' }}>← Back</button>
            <div style={{ background: '#2a1a1a', border: '1px solid #8b4444', borderRadius: '8px', padding: '24px', color: '#ff6666' }}>
              <p style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>⚠️ Error Loading Quote</p>
              <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>{error.message}</p>
              <p style={{ fontSize: '12px', color: '#666' }}>This may be an old quote format. Try creating a new quote or editing this one.</p>
            </div>
          </div>
        </div>
      );
    }
  };

  // Get latest version of each quote (deduplicate by ID, keep only newest)
  // ✅ NEW HELPER: Get room summary for collapsed view
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

  // ✅ NEW: Applies either a specific fabric number OR a blind-type-only estimate
  // (when the client hasn't picked exact fabric yet) to every selected room's OWN
  // fields - the same fields the per-room inputs already use, so there's never a
  // second place that could hold a different value for the same room.
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
      // Blind-type-only: matches the per-room fallback behavior exactly - leave
      // fabricInput blank so pricing uses a Min/Max range for these types instead
      // of one exact fabric price.
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

  // ✅ NEW HELPER: Toggle room expanded/collapsed
  const toggleRoomExpanded = (roomId) => {
    const newExpanded = new Set(expandedRooms);
    if (newExpanded.has(roomId)) {
      newExpanded.delete(roomId);
    } else {
      newExpanded.add(roomId);
    }
    setExpandedRooms(newExpanded);
  };

  const getLatestQuoteVersions = (quotesToProcess) => {
    const latestByID = {};

    quotesToProcess.forEach(quote => {
      // ✅ BUGFIX: every version of a quote gets its own guaranteed-unique
      // `id` (see the comment on uniqueId in generateQuote) - `lineageId` is
      // what ties versions of the same quote together. Grouping by `id` here
      // meant this function never deduped anything at all: every version of
      // every quote counted as its own "latest quote", so Total Quotes in
      // Statistics counted versions instead of quotes, and Total Profit
      // summed profit across every version instead of just the current one.
      const key = quote.lineageId || quote.id;
      if (!latestByID[key]) {
        latestByID[key] = quote;
      } else {
        // Compare dates - keep the one with latest updatedDate
        const currentDate = new Date(latestByID[key].updatedDate || latestByID[key].createdDate);
        const newDate = new Date(quote.updatedDate || quote.createdDate);

        if (newDate > currentDate) {
          latestByID[key] = quote;
        }
      }
    });

    return Object.values(latestByID);
  };

  const renderStatistics = () => {
    const activeQuotes = quotes.filter(q => !q.archived);
    // ✅ FIX: Get only latest version of each quote
    const latestQuotes = getLatestQuoteVersions(activeQuotes);
    
    const stats = { monthlyStats: {}, totalProfit: 0, totalQuotes: 0, pendingOrders: 0 };
    
    // ✅ Use latestQuotes instead of activeQuotes
    latestQuotes.forEach(quote => {
      const date = new Date(quote.createdDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!stats.monthlyStats[monthKey]) {
        stats.monthlyStats[monthKey] = { quotes: 0, profit: 0 };
      }

      stats.monthlyStats[monthKey].quotes += 1;
      stats.totalQuotes += 1;

      let quoteProfit = 0;
      // ✅ BUGFIX: same motor-cost gap as the quote detail screen - a saved motor
      // cost edit changed the "Motor total" row but never reached profit stats.
      const dashDefaultMotorCost = quote.pricing?.MOTOR_COST_CLIENT || 80;
      const dashSavedMotorCost = quote.editedPrices?.motorCost;
      const dashEffectiveMotorCost = typeof dashSavedMotorCost === 'number' ? dashSavedMotorCost : dashDefaultMotorCost;
      const dashMotorCostDelta = dashEffectiveMotorCost - dashDefaultMotorCost;
      // ✅ Same fix as motor, mirrored for solar - a saved solar cost edit
      // previously never reached profit stats either.
      const dashDefaultSolarCost = quote.pricing?.SOLAR_COST_CLIENT || 40;
      const dashSavedSolarCost = quote.editedPrices?.solarCost;
      const dashEffectiveSolarCost = typeof dashSavedSolarCost === 'number' ? dashSavedSolarCost : dashDefaultSolarCost;
      const dashSolarCostDelta = dashEffectiveSolarCost - dashDefaultSolarCost;
      quote.rooms.forEach(room => {
        const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
        const motorizedCount = room.windowGroups.filter(w => w.controlType === 'Motor').length;
        
        // Determine blind type from ACTUAL FABRICS entered
        let actualBlindType = (room.blindTypes || ['Roller'])[0];
        if (fabricNumbers.length > 0) {
          for (const fabricNum of fabricNumbers) {
            const detectedType = getBlindTypeFromFabric(fabricNum, quote.pricing?.PRICING_DATA || PRICING_DATA);
            if (detectedType) {
              actualBlindType = detectedType;
              break;
            }
          }
        }
        
        room.windowGroups.forEach((group, groupIdx) => {
          const q = calculateGroupQuote(group, fabricNumbers, actualBlindType, motorizedCount, quote.pricing || null);
          // ✅ BUGFIX: same fix as the quote detail screen - use the edited
          // per-window price (if one was saved) for profit, not the raw calculated price.
          const priceKey = `${room.id}_${groupIdx}`;
          const savedPrice = quote.editedPrices?.perWindowPrices?.[priceKey];
          if (typeof savedPrice === 'number' || isRangeOverride(savedPrice)) {
            const quantity = parseInt(group.quantity) || 1;
            // A custom range override's revenue estimate uses its midpoint,
            // consistent with how ranges are estimated elsewhere in the app.
            const revenuePerWindow = isRangeOverride(savedPrice) ? (savedPrice.min + savedPrice.max) / 2 : savedPrice;
            const overrideTotal = revenuePerWindow * quantity;
            const avgCost = (q.minCost + q.maxCost) / 2;
            quoteProfit += (overrideTotal - avgCost);
          } else {
            const quantity = parseInt(group.quantity) || 1;
            const motorAdjustment = (group.controlType === 'Motor' && dashMotorCostDelta !== 0) ? dashMotorCostDelta * quantity : 0;
            const solarAdjustment = (group.solar && dashSolarCostDelta !== 0) ? dashSolarCostDelta * quantity : 0;
            quoteProfit += q.profit + motorAdjustment + solarAdjustment;
          }
        });
      });

      stats.monthlyStats[monthKey].profit += quoteProfit;
      stats.totalProfit += quoteProfit;
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    // ✅ Use latestQuotes for pending orders too
    latestQuotes.forEach(quote => {
      if (new Date(quote.createdDate) > sevenDaysAgo && quote.status === 'quote') {
        stats.pendingOrders += 1;
      }
    });

    const monthlyEntries = Object.entries(stats.monthlyStats).sort().reverse().slice(0, 12);

    return (
      <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <button onClick={() => setCurrentView('menu')} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer' }}>
              <ArrowLeft size={24} color="#aaa" />
            </button>
            <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff', fontFamily: 'Georgia, serif' }}>Statistics</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
            <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px' }}>
              <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Total Quotes</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>{stats.totalQuotes}</p>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px' }}>
              <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Total Profit</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>${stats.totalProfit.toFixed(0)}</p>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px' }}>
              <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Pending (7 days)</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>{stats.pendingOrders}</p>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px' }}>
              <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Avg Profit/Quote</p>
              <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>${(stats.totalProfit / Math.max(stats.totalQuotes, 1)).toFixed(0)}</p>
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #444', borderRadius: '8px', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={24} color="#d4af37" />
              Monthly Breakdown
            </h3>

            {monthlyEntries.length === 0 ? (
              <p style={{ color: '#888', textAlign: 'center', paddingTop: '32px', paddingBottom: '32px' }}>No data yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {monthlyEntries.map(([month, data]) => (
                  <div key={month} style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <p style={{ fontWeight: 'bold', color: '#fff' }}>{new Date(month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                      <span style={{ fontSize: '12px', paddingLeft: '12px', paddingRight: '12px', paddingTop: '4px', paddingBottom: '4px', borderRadius: '999px', background: '#d4af37', color: '#000' }}>{data.quotes} quotes</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <div>
                        <p style={{ color: '#888', fontSize: '14px' }}>Profit: <span style={{ color: '#4ade80', fontWeight: 'bold' }}>${data.profit.toFixed(0)}</span></p>
                      </div>
                      <div style={{ width: '128px', height: '32px', borderRadius: '4px', background: '#333' }}>
                        <div 
                          style={{ 
                            height: '100%',
                            borderRadius: '4px',
                            width: `${(data.profit / Math.max(...monthlyEntries.map(e => e[1].profit), 1)) * 100}%`,
                            background: 'linear-gradient(90deg, #d4af37, #f4e4c1)'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderQuoteForm = () => (
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

  // ✅ MIGRATION GATE: if quotes were found sitting in this device's old
  // localStorage record, offer to upload them before showing the normal app -
  // makes sure nothing from before cloud sync gets silently left behind.
  if (migrationQuotes) {
    return (
      <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ maxWidth: '400px', width: '100%', background: '#2a2a2a', border: '1px solid #d4af37', borderRadius: '12px', padding: '28px' }}>
          <h2 style={{ color: '#d4af37', fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>Found quotes on this device</h2>
          <p style={{ color: '#ccc', fontSize: '14px', marginBottom: '16px', lineHeight: '1.5' }}>
            This device has <strong>{migrationQuotes.length}</strong> quote{migrationQuotes.length > 1 ? 's' : ''} saved from before cloud sync. Upload {migrationQuotes.length > 1 ? 'them' : 'it'} to your account now so {migrationQuotes.length > 1 ? "they're" : "it's"} available on every device?
          </p>

          {/* ✅ SAFETY: an off-device copy, reachable right here, before anything
              else happens - regardless of whether the upload below works. */}
          <div style={{ padding: '10px', marginBottom: '16px', background: '#1a2a2a', border: '1px solid #2a5a5a', borderRadius: '8px' }}>
            <p style={{ color: '#7dd3fc', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>🛟 Get a safety copy first (recommended)</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={downloadMigrationBackup} style={{ flex: 1, padding: '10px', borderRadius: '6px', background: '#0e7490', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>⬇️ Download</button>
              <button onClick={copyMigrationBackup} style={{ flex: 1, padding: '10px', borderRadius: '6px', background: '#0e7490', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>📋 Copy</button>
            </div>
          </div>

          <button
            onClick={runMigration}
            disabled={migrationBusy}
            style={{ width: '100%', padding: '14px', borderRadius: '8px', background: '#4ade80', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '15px', cursor: migrationBusy ? 'default' : 'pointer', opacity: migrationBusy ? 0.6 : 1, marginBottom: '10px' }}
          >
            {migrationBusy ? 'Uploading...' : `Upload ${migrationQuotes.length} Quote${migrationQuotes.length > 1 ? 's' : ''}`}
          </button>
          <button
            onClick={skipMigration}
            disabled={migrationBusy}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'none', color: '#888', border: '1px solid #555', fontWeight: 'bold', fontSize: '14px', cursor: migrationBusy ? 'default' : 'pointer' }}
          >
            Skip (don't ask again on this device)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {currentView === 'menu' && renderMenu()}
      {currentView === 'quote' && renderQuoteForm()}
      {currentView === 'history' && renderHistory()}
      {currentView === 'statistics' && renderStatistics()}
      {currentView === 'measurements' && <SupplierMeasurements quotes={quotes} onBack={() => setCurrentView('menu')} uid={uid} />}
      {currentView === 'analysis' && <OrderAnalysis quotes={quotes} onBack={() => setCurrentView('menu')} uid={uid} />}
    </div>
  );
}
