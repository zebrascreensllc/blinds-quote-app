import React, { useState } from 'react';
import { Copy, Check, Edit2, Trash2, Share2, Files, Archive } from 'lucide-react';
import { PRICING_DATA } from '../../data/pricingData';
import { BUSINESS_NAME, SALES_TAX_RATE } from '../../utils/constants';
import { formatMoney, isRangeOverride, parseUnits } from '../../utils/formatters';
import { isFabricValid, calculateGroupQuote, getBlindTypeFromFabric, autoDetectBlindTypes, getHubTotal } from '../../utils/pricing';
import { expandQuoteIntoRows, sheetToCSV } from '../../utils/measurementUtils';
import CurrentPricingSection from './CurrentPricingSection';

const BLIND_TYPES = ['Roller', 'Zebra', 'Roman', 'Bamboo (Roller)', 'Bamboo (Roman)'];

// Same checkbox-list pattern as BulkQuoteFormScreen.js's RowChecklist -
// duplicated locally (not imported) so this quote-view tool stays isolated
// from the Bulk Quote Create screen, same isolation reasoning as Bulk
// Measurements vs. Supplier Measurements elsewhere in this app.
function FabricRoomChecklist({ items, selectedIds, toggleInSet, setSelectedIds }) {
  if (items.length === 0) {
    return <p style={{ color: '#888', fontSize: '12px' }}>No rooms on this quote.</p>;
  }
  return (
    <>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
        <button onClick={() => setSelectedIds(new Set(items.map(i => i.key)))} style={{ fontSize: '12px', color: '#7dd3fc', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Select All</button>
        <button onClick={() => setSelectedIds(new Set())} style={{ fontSize: '12px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Clear</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto', marginBottom: '10px', border: '1px solid #333', borderRadius: '6px', padding: '6px' }}>
        {items.map(item => {
          const checked = selectedIds.has(item.key);
          return (
            <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', background: checked ? 'rgba(255,255,255,0.08)' : 'transparent', cursor: 'pointer' }}>
              <input type="checkbox" checked={checked} onChange={() => toggleInSet(item.key, selectedIds, setSelectedIds)} style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: checked ? '#7dd3fc' : '#ccc' }}>
                {item.room.name || `Room ${item.idx + 1}`}
                <span style={{ color: '#666' }}>{item.room.fabricInput.trim() ? ` — ${item.room.fabricInput.trim()}` : ` — ${(item.room.blindTypes || ['Roller']).join(', ')} (no fabric set)`}</span>
              </span>
            </label>
          );
        })}
      </div>
    </>
  );
}

// Quote Detail / Pricing Table - relocated from App.js's renderQuoteDetail
// with no logic changes. This is the highest-risk extraction in the split
// (pricing math, per-window/motor/solar/tax editing, copy text, pricing
// comparison), so it's a close relocation rather than a rewrite: same
// variable names, same structure, only the closed-over values are now
// explicit props instead of direct closure access.
export default function QuoteDetailScreen({
  activeEditText,
  activeEditTextMax,
  copiedId,
  editingTableField,
  expandedPricingComparison,
  expandedPricingDetails,
  expandedQuoteTable,
  archiveQuoteLineage,
  duplicateQuote,
  loadQuoteForEdit,
  priceEditMode,
  quotes,
  safeDeleteQuotes,
  selectedQuote,
  setActiveEditText,
  setActiveEditTextMax,
  setCopiedId,
  setEditingTableField,
  setExpandedPricingComparison,
  setExpandedPricingDetails,
  setExpandedQuoteTable,
  setPriceEditMode,
  setSelectedQuote,
  setTableEditValues,
  syncFailureMessage,
  tableEditValues,
  updateQuotes
}) {
  // ✅ NEW: local UI-only state for the Bulk Assign Fabric tool below -
  // same pattern as BulkQuoteFormScreen.js's own bulk tools, kept local
  // since it never needs to persist between renders or travel to App.js.
  const [showFabricTool, setShowFabricTool] = useState(false);
  const [fabricSelectedRoomIds, setFabricSelectedRoomIds] = useState(new Set());
  const [bulkFabricInput, setBulkFabricInput] = useState('');
  const [bulkFabricMode, setBulkFabricMode] = useState('fabric');
  const [bulkFabricBlindTypes, setBulkFabricBlindTypes] = useState([]);

  if (!selectedQuote) return null;

  try {
    const rooms = selectedQuote.rooms;
    const storedPricing = selectedQuote.pricing || null; // Use stored pricing or null (fallback to defaults)

    // ✅ NEW: pending structural edits (Qty/Width/Height/Type/Solar per
    // window group, and whole-room deletions) - same "pending until Save"
    // shape as perWindowPrices/motorCost/etc. above, never written to the
    // saved quote until "Save All Changes & Create New Version".
    const groupEdits = tableEditValues.groupEdits || {};
    const deletedRoomIds = tableEditValues.deletedRoomIds || new Set();
    // ✅ NEW: pending room-level fabric edits (Bulk Assign Fabric below),
    // same "pending until Save" shape as groupEdits - keyed by room.id
    // since fabric lives on the room, not the window group.
    const fabricEdits = tableEditValues.fabricEdits || {};

    // ✅ NEW: merges those pending edits onto the saved quote's rooms,
    // computed ONCE here and used for BOTH the totals below and the table
    // rows - same single-source-of-truth reasoning as motorGrandTotal/
    // solarGrandTotal, so the header totals and the table can never show
    // different numbers for the same pending edit. Group INDEX POSITIONS
    // never change (edits patch fields in place, deletions only ever
    // remove a whole ROOM by id) - priceKey (`${room.id}_${groupIdx}`)
    // stays valid across a save exactly like it does today.
    const effectiveRooms = rooms
      .filter(room => !deletedRoomIds.has(room.id))
      .map(room => ({
        ...room,
        ...(fabricEdits[room.id] ? { fabricInput: fabricEdits[room.id].fabricInput, blindTypes: fabricEdits[room.id].blindTypes } : {}),
        windowGroups: room.windowGroups.map((group, groupIdx) => {
          const edit = groupEdits[`${room.id}_${groupIdx}`];
          if (!edit) return group;
          const merged = { ...group, ...edit };
          // Solar only makes sense for a motorized window - same rule
          // enforced everywhere else in the app (bulk tools, per-row form).
          if (merged.controlType !== 'Motor') merged.solar = false;
          return merged;
        })
      }));

    // ✅ NEW: finds every OTHER window group in this quote (any room) whose
    // width x height numerically matches, for the "apply this price to
    // same-size windows too?" prompt below. Numeric comparison (via
    // parseUnits) rather than string equality, so "35" and "35.0" or "3'
    // 6"" match sensibly the way this app parses measurements everywhere
    // else. Uses effectiveRooms so a pending size edit is reflected too.
    const findMatchingSizePriceKeys = (excludeKey, width, height) => {
      const targetW = parseUnits(width);
      const targetH = parseUnits(height);
      if (!targetW || !targetH) return [];
      const matches = [];
      effectiveRooms.forEach(r => {
        r.windowGroups.forEach((g, idx) => {
          const key = `${r.id}_${idx}`;
          if (key === excludeKey) return;
          if (parseUnits(g.width) === targetW && parseUnits(g.height) === targetH) {
            matches.push(key);
          }
        });
      });
      return matches;
    };

    // ✅ NEW: Bulk Assign Fabric tool (mirrors BulkQuoteFormScreen.js's
    // room-level fabric bulk-assign). Applying here does NOT touch
    // Firestore directly - it stages the change into
    // tableEditValues.fabricEdits, same "pending until Save All Changes"
    // model as every other edit in this screen, so a price-integrity
    // mistake here is never silent or automatic.
    const fabricRoomItems = effectiveRooms.map((room, idx) => ({ key: room.id, room, idx }));
    const toggleFabricRoomId = (key, currentSet, setter) => {
      const s = new Set(currentSet);
      if (s.has(key)) s.delete(key); else s.add(key);
      setter(s);
    };
    const applyBulkFabricEdit = () => {
      if (fabricSelectedRoomIds.size === 0) { alert('Select at least one room first.'); return; }

      let edit;
      let appliedLabel;
      if (bulkFabricMode === 'fabric') {
        const fabricValue = bulkFabricInput.trim();
        if (!fabricValue) { alert('Enter a fabric number first.'); return; }
        edit = { fabricInput: fabricValue, blindTypes: autoDetectBlindTypes(fabricValue) };
        appliedLabel = `fabric "${fabricValue}"`;
      } else {
        if (bulkFabricBlindTypes.length === 0) { alert('Select at least one blind type first.'); return; }
        edit = { fabricInput: '', blindTypes: [...bulkFabricBlindTypes] };
        appliedLabel = `blind type "${bulkFabricBlindTypes.join(', ')}" (Min/Max estimate, no exact fabric)`;
      }

      const newFabricEdits = { ...(tableEditValues.fabricEdits || {}) };
      fabricSelectedRoomIds.forEach(roomId => { newFabricEdits[roomId] = edit; });

      const count = fabricSelectedRoomIds.size;
      setTableEditValues({ ...tableEditValues, fabricEdits: newFabricEdits });
      setBulkFabricInput('');
      setBulkFabricBlindTypes([]);
      setFabricSelectedRoomIds(new Set());
      alert(`Applied ${appliedLabel} to ${count} room${count > 1 ? 's' : ''}. Click "Save All Changes" below to create a new version with this fabric.`);
    };

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
    effectiveRooms.forEach(room => {
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
    effectiveRooms.forEach((room, roomIndex) => {
      const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
      const fabricData = storedPricing?.PRICING_DATA || PRICING_DATA;

      fabricNumbers.forEach(fabricNum => {
        if (!isFabricValid(fabricNum, fabricData)) {
          invalidFabrics.push({ fabric: fabricNum, room: room.name || `Room ${roomIndex + 1}` });
        }
      });
    });

    effectiveRooms.forEach(room => {
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
    // ✅ NEW: Hub is a quote-level charge (not per-window like Motor/Solar,
    // see getHubTotal) - taxed and added into Grand Total the same way.
    const hubTotal = getHubTotal(selectedQuote);

    // ✅ BUGFIX (the main issue reported): Motor and Solar totals were never
    // actually added into the taxable base or Grand Total before - they were
    // just informational rows sitting next to numbers that didn't include them.
    // Tax now applies to Window + Motor + Solar + Hub together, and Grand
    // Total reflects that same combined amount, not just the window cost.
    const subtotalMin = totalMin + motorGrandTotal + solarGrandTotal + hubTotal;
    const subtotalMax = totalMax + motorGrandTotal + solarGrandTotal + hubTotal;
    const taxMin = subtotalMin * taxRate;
    const taxMax = subtotalMax * taxRate;
    const grandMin = subtotalMin + taxMin;
    const grandMax = subtotalMax + taxMax;

    const copyText = (() => {
      let text = `QUOTE - ${BUSINESS_NAME}\n\nClient: ${selectedQuote.clientName}\nPhone: ${selectedQuote.clientPhone}\nLocation: ${selectedQuote.location}\nDate: ${selectedQuote.date}\n\n`;

      let totalWindows = 0;

      text += `ROOMS:\n`;
      effectiveRooms.forEach(room => {
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
      if (hubTotal > 0 || selectedQuote.hub?.included) {
        text += `Hub${selectedQuote.hub?.quantity > 1 ? ` (${selectedQuote.hub.quantity})` : ''}: ${hubTotal === 0 ? 'Complimentary' : `$${formatMoney(hubTotal)}`}\n`;
      }
      if (motorCount > 0 || solarCount > 0 || selectedQuote.hub?.included) {
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

          <CurrentPricingSection
            activeEditText={activeEditText}
            activeEditTextMax={activeEditTextMax}
            editingTableField={editingTableField}
            effectiveMotorCost={effectiveMotorCost}
            effectiveRooms={effectiveRooms}
            effectiveSolarCost={effectiveSolarCost}
            expandedQuoteTable={expandedQuoteTable}
            findMatchingSizePriceKeys={findMatchingSizePriceKeys}
            grandMax={grandMax}
            grandMin={grandMin}
            groupEdits={groupEdits}
            motorCount={motorCount}
            motorGrandTotal={motorGrandTotal}
            hubTotal={hubTotal}
            priceEditMode={priceEditMode}
            selectedQuote={selectedQuote}
            setActiveEditText={setActiveEditText}
            setActiveEditTextMax={setActiveEditTextMax}
            setEditingTableField={setEditingTableField}
            setExpandedQuoteTable={setExpandedQuoteTable}
            setPriceEditMode={setPriceEditMode}
            setTableEditValues={setTableEditValues}
            solarCount={solarCount}
            solarGrandTotal={solarGrandTotal}
            storedPricing={storedPricing}
            subtotalMax={subtotalMax}
            subtotalMin={subtotalMin}
            tableEditValues={tableEditValues}
            taxMax={taxMax}
            taxMin={taxMin}
            totalMax={totalMax}
            totalMin={totalMin}
          />

          {/* ✅ NEW: Bulk Assign Fabric - same tool as Bulk Quote Create's,
              scoped to this quote's own rooms. Applying stages the change
              into tableEditValues.fabricEdits (pending until "Save All
              Changes" below creates a new version) - never writes straight
              to the saved quote. */}
          <div style={{ background: '#1a2a3a', border: '1px solid #4a6a8a', borderRadius: '8px', marginBottom: '24px', overflow: 'hidden' }}>
            <button onClick={() => setShowFabricTool(!showFabricTool)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#7dd3fc', fontWeight: 'bold', fontSize: '13px' }}>🧵 BULK ASSIGN FABRIC</span>
              <span style={{ color: '#888', fontSize: '14px' }}>{showFabricTool ? '▼' : '▶'}</span>
            </button>
            {showFabricTool && (
              <div style={{ padding: '0 16px 16px 16px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button
                    onClick={() => setBulkFabricMode('fabric')}
                    style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: bulkFabricMode === 'fabric' ? '#0e7490' : '#0a0a0a', color: bulkFabricMode === 'fabric' ? '#fff' : '#888', border: bulkFabricMode === 'fabric' ? '1px solid #0e7490' : '1px solid #444' }}
                  >
                    Fabric Number
                  </button>
                  <button
                    onClick={() => setBulkFabricMode('blindType')}
                    style={{ flex: 1, padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: bulkFabricMode === 'blindType' ? '#0e7490' : '#0a0a0a', color: bulkFabricMode === 'blindType' ? '#fff' : '#888', border: bulkFabricMode === 'blindType' ? '1px solid #0e7490' : '1px solid #444' }}
                  >
                    Blind Type (no fabric yet)
                  </button>
                </div>

                {bulkFabricMode === 'fabric' ? (
                  <input type="text" placeholder="e.g., 82086K, 82067E" value={bulkFabricInput} onChange={(e) => setBulkFabricInput(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', fontSize: '13px', background: '#1a1a1a', border: '1px solid #444', color: 'white', boxSizing: 'border-box', marginBottom: '10px' }} />
                ) : (
                  <div style={{ marginBottom: '10px' }}>
                    <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>For a Min/Max price range instead of an exact price - select one or more:</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {BLIND_TYPES.map(type => {
                        const checked = bulkFabricBlindTypes.includes(type);
                        return (
                          <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '6px', background: checked ? '#1a3a4a' : '#0a0a0a', border: checked ? '1px solid #4ade80' : '1px solid #444', cursor: 'pointer', fontSize: '13px', color: checked ? '#4ade80' : '#ccc' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setBulkFabricBlindTypes([...new Set([...bulkFabricBlindTypes, type])]);
                                } else {
                                  setBulkFabricBlindTypes(bulkFabricBlindTypes.filter(t => t !== type));
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

                <FabricRoomChecklist
                  items={fabricRoomItems}
                  selectedIds={fabricSelectedRoomIds}
                  toggleInSet={toggleFabricRoomId}
                  setSelectedIds={setFabricSelectedRoomIds}
                />
                <button onClick={applyBulkFabricEdit} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#0e7490', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                  Apply to {fabricSelectedRoomIds.size} Selected
                </button>
              </div>
            )}
          </div>

          {/* ✅ FIXED: Save All Changes Button - Show if ANY values differ from "not edited" defaults, OR you're actively typing a not-yet-committed edit */}
          {(Object.keys(tableEditValues.perWindowPrices).length > 0 || tableEditValues.motorCost !== null || tableEditValues.solarCost !== null || tableEditValues.taxRate !== null || Object.keys(tableEditValues.groupEdits || {}).length > 0 || (tableEditValues.deletedRoomIds || new Set()).size > 0 || Object.keys(tableEditValues.fabricEdits || {}).length > 0 || (editingTableField && activeEditText !== '')) && (
            <>
              {/* Visual indicator of pending changes */}
              <div style={{ padding: '12px', marginBottom: '12px', background: '#2a3a1a', border: '2px solid #4ade80', borderRadius: '6px', textAlign: 'center' }}>
                <p style={{ color: '#4ade80', fontWeight: 'bold', margin: '0' }}>
                  ⚡ You have pending changes ({Object.keys(tableEditValues.perWindowPrices).length > 0 ? Object.keys(tableEditValues.perWindowPrices).length + ' prices' : ''}{tableEditValues.motorCost !== null ? ', motor cost' : ''}{tableEditValues.solarCost !== null ? ', solar cost' : ''}{tableEditValues.taxRate !== null ? ', tax rate' : ''}{Object.keys(tableEditValues.groupEdits || {}).length > 0 ? `, ${Object.keys(tableEditValues.groupEdits).length} window edit${Object.keys(tableEditValues.groupEdits).length > 1 ? 's' : ''}` : ''}{(tableEditValues.deletedRoomIds || new Set()).size > 0 ? `, ${(tableEditValues.deletedRoomIds || new Set()).size} room(s) removed` : ''}{Object.keys(tableEditValues.fabricEdits || {}).length > 0 ? `, ${Object.keys(tableEditValues.fabricEdits).length} room fabric${Object.keys(tableEditValues.fabricEdits).length > 1 ? 's' : ''}` : ''}{editingTableField && activeEditText !== '' ? ' (still typing...)' : ''})
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
                // ✅ NEW: same auto-commit safety net, extended to the Qty and
                // Size edit boxes - clicking "Save All Changes" instead of that
                // row's own checkmark first must not silently drop what was typed.
                } else if (editingTableField && editingTableField.startsWith('qty-') && activeEditText !== '') {
                  const parsed = parseInt(activeEditText, 10);
                  if (!isNaN(parsed) && parsed > 0) {
                    const key = editingTableField.replace('qty-', '');
                    const existing = (tableEditValues.groupEdits || {})[key] || {};
                    effectiveTableEditValues = { ...tableEditValues, groupEdits: { ...(tableEditValues.groupEdits || {}), [key]: { ...existing, quantity: String(parsed) } } };
                  }
                } else if (editingTableField && editingTableField.startsWith('size-') && activeEditText.trim() !== '' && activeEditTextMax.trim() !== '') {
                  const key = editingTableField.replace('size-', '');
                  const existing = (tableEditValues.groupEdits || {})[key] || {};
                  effectiveTableEditValues = { ...tableEditValues, groupEdits: { ...(tableEditValues.groupEdits || {}), [key]: { ...existing, width: activeEditText.trim(), height: activeEditTextMax.trim() } } };
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

                // ✅ NEW: bakes any pending Qty/Width/Height/Type/Solar edits and
                // room deletions into the rooms this new version actually saves -
                // same merge logic as effectiveRooms above, recomputed here from
                // effectiveTableEditValues so an edit still sitting in the input
                // box (just auto-committed above) is included too.
                const roomsToSave = rooms
                  .filter(room => !(effectiveTableEditValues.deletedRoomIds || new Set()).has(room.id))
                  .map(room => ({
                    ...room,
                    ...((effectiveTableEditValues.fabricEdits || {})[room.id] ? { fabricInput: (effectiveTableEditValues.fabricEdits || {})[room.id].fabricInput, blindTypes: (effectiveTableEditValues.fabricEdits || {})[room.id].blindTypes } : {}),
                    windowGroups: room.windowGroups.map((group, groupIdx) => {
                      const edit = (effectiveTableEditValues.groupEdits || {})[`${room.id}_${groupIdx}`];
                      if (!edit) return group;
                      const merged = { ...group, ...edit };
                      if (merged.controlType !== 'Motor') merged.solar = false;
                      return merged;
                    })
                  }));

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

                // Create new version with merged edited prices and any pending
                // structural edits (Qty/Width/Height/Type/Solar/room deletions) baked in
                const newQuote = {
                  ...selectedQuote,
                  id: uniqueId,
                  quoteName: newQuoteName,
                  version: newVersionString,
                  updatedDate: new Date().toISOString(),
                  rooms: roomsToSave,
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
                setTableEditValues({ perWindowPrices: {}, motorCost: null, solarCost: null, taxRate: null, groupEdits: {}, deletedRoomIds: new Set(), fabricEdits: {} });
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

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(copyText);
                setCopiedId(selectedQuote.id);
                setTimeout(() => setCopiedId(null), 2000);
              }}
              style={{ flex: '1 1 90px', paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', background: '#d4af37', color: '#000', border: 'none', cursor: 'pointer' }}
            >
              {copiedId === selectedQuote.id ? <Check size={16} /> : <Copy size={16} />}
              {copiedId === selectedQuote.id ? 'Copied!' : 'Copy'}
            </button>

            {/* ✅ NEW: native share sheet (Messages/Mail/WhatsApp/etc) where the
                browser supports it - skips the copy-then-switch-app-then-paste
                round trip. Feature-detected, so it just doesn't render on
                browsers without Web Share support (most desktop browsers). */}
            {typeof navigator.share === 'function' && (
              <button
                onClick={async () => {
                  try {
                    await navigator.share({ title: selectedQuote.quoteName || 'Quote', text: copyText });
                  } catch (err) {
                    if (err.name !== 'AbortError') console.error('Share failed:', err);
                  }
                }}
                title="Share"
                style={{ padding: '12px', borderRadius: '8px', background: '#0e7490', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Share2 size={16} />
              </button>
            )}

            <button
              onClick={() => loadQuoteForEdit(selectedQuote)}
              style={{ flex: '1 1 90px', paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              <Edit2 size={16} />
              Edit
            </button>

            {/* ✅ NEW: clones this quote's client info + rooms into a fresh
                Quote Create draft - a new quote, not a new version of this
                one. Handy for a repeat client or a similar job. */}
            <button
              onClick={() => duplicateQuote(selectedQuote)}
              title="Duplicate this quote"
              style={{ padding: '12px', borderRadius: '8px', background: '#444', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <Files size={16} />
            </button>

            {/* ✅ NEW: hides every version of this quote from your active
                list/Statistics without deleting anything - unlike Delete
                (moves to Trash, 7-day expiry), Archive keeps it forever
                until you unarchive it from History > Archived. */}
            <button
              onClick={() => archiveQuoteLineage(selectedQuote)}
              title="Archive this quote"
              style={{ padding: '12px', borderRadius: '8px', background: '#444', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <Archive size={16} />
            </button>

            <button
              onClick={() => {
                // ✅ BUGFIX: this previously deleted instantly with NO confirmation.
                // Now it warns, names the quote, and stores an undo snapshot.
                const done = safeDeleteQuotes([selectedQuote.id], `Deleted ${selectedQuote.quoteName || 'quote'}`);
                if (done) setSelectedQuote(null);
              }}
              style={{ padding: '12px', borderRadius: '8px', fontWeight: 'bold', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
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
}
