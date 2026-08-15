import React, { useState, useEffect } from 'react';

import { PRICING_DATA } from './data/pricingData';
import { getPricingSnapshot } from './utils/constants';
import { getQuoteNamePrefix, getNextVersion } from './utils/pricing';

// ✅ NEW (Phase 2): Supplier Measurements - fully isolated feature, own files,
// own storage key. Only reads the `quotes` array (never writes it) to build
// sheets from - never touches quote pricing/calculation state.
import SupplierMeasurements from './components/SupplierMeasurements';
import BulkMeasurements from './components/BulkMeasurements';
import OrderAnalysis from './components/OrderAnalysis';
import MenuScreen from './components/quote/MenuScreen';
import HistoryScreen from './components/quote/HistoryScreen';
import StatisticsScreen from './components/quote/StatisticsScreen';
import QuoteFormScreen from './components/quote/QuoteFormScreen';
import BulkQuoteFormScreen from './components/quote/BulkQuoteFormScreen';
import QuoteDetailScreen from './components/quote/QuoteDetailScreen';
import { subscribeToQuotes, saveQuoteRemote, deleteQuoteRemote } from './services/quoteSync';

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
      {currentView === 'menu' && (
        <MenuScreen onLogout={onLogout} quotes={quotes} resetForm={resetForm} setCurrentView={setCurrentView} setEditingQuote={setEditingQuote} />
      )}
      {currentView === 'quote' && (
        <QuoteFormScreen
          bulkBlindTypes={bulkBlindTypes}
          bulkFabricInput={bulkFabricInput}
          bulkMode={bulkMode}
          bulkSelectedRoomIds={bulkSelectedRoomIds}
          editingQuote={editingQuote}
          expandedFabricSection={expandedFabricSection}
          expandedRooms={expandedRooms}
          expandedSurchargeOverride={expandedSurchargeOverride}
          formData={formData}
          generateQuote={generateQuote}
          lastHeight={lastHeight}
          lastWidth={lastWidth}
          resetForm={resetForm}
          setBulkBlindTypes={setBulkBlindTypes}
          setBulkFabricInput={setBulkFabricInput}
          setBulkMode={setBulkMode}
          setBulkSelectedRoomIds={setBulkSelectedRoomIds}
          setCurrentView={setCurrentView}
          setEditingQuote={setEditingQuote}
          setExpandedFabricSection={setExpandedFabricSection}
          setExpandedRooms={setExpandedRooms}
          setExpandedSurchargeOverride={setExpandedSurchargeOverride}
          setFormData={setFormData}
          setLastHeight={setLastHeight}
          setLastWidth={setLastWidth}
          setShowBulkAssign={setShowBulkAssign}
          showBulkAssign={showBulkAssign}
        />
      )}
      {currentView === 'bulkQuote' && (
        <BulkQuoteFormScreen
          formData={formData}
          setFormData={setFormData}
          generateQuote={generateQuote}
          resetForm={resetForm}
          setEditingQuote={setEditingQuote}
          setCurrentView={setCurrentView}
        />
      )}
      {currentView === 'history' && (
        selectedQuote ? (
          <QuoteDetailScreen
            activeEditText={activeEditText}
            activeEditTextMax={activeEditTextMax}
            copiedId={copiedId}
            editingTableField={editingTableField}
            expandedPricingComparison={expandedPricingComparison}
            expandedPricingDetails={expandedPricingDetails}
            expandedQuoteTable={expandedQuoteTable}
            loadQuoteForEdit={loadQuoteForEdit}
            priceEditMode={priceEditMode}
            quotes={quotes}
            safeDeleteQuotes={safeDeleteQuotes}
            selectedQuote={selectedQuote}
            setActiveEditText={setActiveEditText}
            setActiveEditTextMax={setActiveEditTextMax}
            setCopiedId={setCopiedId}
            setEditingTableField={setEditingTableField}
            setExpandedPricingComparison={setExpandedPricingComparison}
            setExpandedPricingDetails={setExpandedPricingDetails}
            setExpandedQuoteTable={setExpandedQuoteTable}
            setPriceEditMode={setPriceEditMode}
            setSelectedQuote={setSelectedQuote}
            setTableEditValues={setTableEditValues}
            syncFailureMessage={syncFailureMessage}
            tableEditValues={tableEditValues}
            updateQuotes={updateQuotes}
          />
        ) : (
          <HistoryScreen
            copyBackupToClipboard={copyBackupToClipboard}
            expandedClients={expandedClients}
            exportBackup={exportBackup}
            hasLoaded={hasLoaded}
            importBackup={importBackup}
            loadError={loadError}
            loadQuoteForEdit={loadQuoteForEdit}
            quotes={quotes}
            safeDeleteQuotes={safeDeleteQuotes}
            searchQuery={searchQuery}
            selectedVersions={selectedVersions}
            setCurrentView={setCurrentView}
            setExpandedClients={setExpandedClients}
            setSearchQuery={setSearchQuery}
            setSelectedQuote={setSelectedQuote}
            setSelectedVersions={setSelectedVersions}
            undoBuffer={undoBuffer}
            undoLastDelete={undoLastDelete}
          />
        )
      )}
      {currentView === 'statistics' && <StatisticsScreen quotes={quotes} setCurrentView={setCurrentView} />}
      {currentView === 'measurements' && <SupplierMeasurements quotes={quotes} onBack={() => setCurrentView('menu')} uid={uid} />}
      {currentView === 'bulkMeasurements' && <BulkMeasurements quotes={quotes} onBack={() => setCurrentView('menu')} uid={uid} />}
      {currentView === 'analysis' && <OrderAnalysis quotes={quotes} onBack={() => setCurrentView('menu')} uid={uid} />}
    </div>
  );
}
