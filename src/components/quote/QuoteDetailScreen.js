import React from 'react';
import { Copy, Check, Edit2, Trash2 } from 'lucide-react';
import { PRICING_DATA } from '../../data/pricingData';
import { BUSINESS_NAME, SALES_TAX_RATE } from '../../utils/constants';
import { formatPrice, formatMoney, isRangeOverride, formatPriceOverride, filterNumericText, parseUnits } from '../../utils/formatters';
import { isFabricValid, calculateGroupQuote, getBlindTypeFromFabric } from '../../utils/pricing';
import { expandQuoteIntoRows, sheetToCSV } from '../../utils/measurementUtils';

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
                {effectiveRooms.map((room, roomIdx) => {
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

                    // ✅ NEW: Qty/Size/Type/Solar inline edit, same pencil-and-Done
                    // pattern as the Price cell. `group` already reflects any pending
                    // edit (effectiveRooms merged it in above), so the display value
                    // and the edit box's seed value are the same read - no separate
                    // "effective" lookup needed the way Motor/Solar cost required.
                    const groupEditForRow = groupEdits[priceKey] || {};
                    const isQtyEdited = groupEditForRow.quantity !== undefined;
                    const isSizeEdited = groupEditForRow.width !== undefined || groupEditForRow.height !== undefined;
                    const isTypeEdited = groupEditForRow.controlType !== undefined || groupEditForRow.solar !== undefined;
                    const qtyFieldKey = `qty-${priceKey}`;
                    const sizeFieldKey = `size-${priceKey}`;
                    const typeFieldKey = `type-${priceKey}`;
                    const isEditingQty = editingTableField === qtyFieldKey;
                    const isEditingSize = editingTableField === sizeFieldKey;
                    const isEditingType = editingTableField === typeFieldKey;

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
                        <td style={{ padding: '8px', color: '#fff' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {room.name}
                            <button
                              onClick={() => {
                                if (!window.confirm(`Delete "${room.name || 'this room'}" from this quote?\n\nIts windows won't be included when you save changes.`)) return;
                                setTableEditValues({
                                  ...tableEditValues,
                                  deletedRoomIds: new Set([...(tableEditValues.deletedRoomIds || new Set()), room.id])
                                });
                              }}
                              title="Delete this room"
                              style={{ padding: '2px', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </span>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', color: isQtyEdited ? '#ffcc00' : '#ccc' }}>
                          {isEditingQty ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={activeEditText}
                                onChange={(e) => setActiveEditText(e.target.value.replace(/[^0-9]/g, ''))}
                                style={{ width: '36px', padding: '2px', borderRadius: '4px', fontSize: '12px', background: '#1a1a1a', border: '1px solid #d4af37', color: 'white', textAlign: 'center' }}
                                autoFocus
                              />
                              <button
                                onClick={() => {
                                  const parsed = parseInt(activeEditText, 10);
                                  if (activeEditText !== '' && !isNaN(parsed) && parsed > 0) {
                                    setTableEditValues({ ...tableEditValues, groupEdits: { ...(tableEditValues.groupEdits || {}), [priceKey]: { ...groupEditForRow, quantity: String(parsed) } } });
                                  }
                                  setEditingTableField(null);
                                  setActiveEditText('');
                                }}
                                style={{ padding: '2px 4px', borderRadius: '2px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}
                              >
                                ✓
                              </button>
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              {group.quantity}
                              <button
                                onClick={() => { setEditingTableField(qtyFieldKey); setActiveEditText(String(group.quantity || '')); }}
                                style={{ padding: '1px 3px', borderRadius: '2px', background: '#444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '9px' }}
                              >
                                ✏️
                              </button>
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', color: isSizeEdited ? '#ffcc00' : '#ccc' }}>
                          {isEditingSize ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <input
                                type="text"
                                placeholder="W"
                                value={activeEditText}
                                onChange={(e) => setActiveEditText(e.target.value)}
                                style={{ width: '38px', padding: '2px', borderRadius: '4px', fontSize: '12px', background: '#1a1a1a', border: '1px solid #d4af37', color: 'white', textAlign: 'center' }}
                                autoFocus
                              />
                              <span style={{ color: '#888' }}>x</span>
                              <input
                                type="text"
                                placeholder="H"
                                value={activeEditTextMax}
                                onChange={(e) => setActiveEditTextMax(e.target.value)}
                                style={{ width: '38px', padding: '2px', borderRadius: '4px', fontSize: '12px', background: '#1a1a1a', border: '1px solid #d4af37', color: 'white', textAlign: 'center' }}
                              />
                              <button
                                onClick={() => {
                                  const w = activeEditText.trim();
                                  const h = activeEditTextMax.trim();
                                  if (w && h) {
                                    setTableEditValues({ ...tableEditValues, groupEdits: { ...(tableEditValues.groupEdits || {}), [priceKey]: { ...groupEditForRow, width: w, height: h } } });
                                  }
                                  setEditingTableField(null);
                                  setActiveEditText('');
                                  setActiveEditTextMax('');
                                }}
                                style={{ padding: '2px 4px', borderRadius: '2px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}
                              >
                                ✓
                              </button>
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              {group.width}x{group.height}
                              <button
                                onClick={() => { setEditingTableField(sizeFieldKey); setActiveEditText(group.width || ''); setActiveEditTextMax(group.height || ''); }}
                                style={{ padding: '1px 3px', borderRadius: '2px', background: '#444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '9px' }}
                              >
                                ✏️
                              </button>
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', color: isTypeEdited ? '#ffcc00' : '#ccc' }}>
                          {isEditingType ? (
                            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <select
                                value={group.controlType || 'Manual'}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const patch = { controlType: value };
                                  if (value !== 'Motor') patch.solar = false;
                                  setTableEditValues({ ...tableEditValues, groupEdits: { ...(tableEditValues.groupEdits || {}), [priceKey]: { ...groupEditForRow, ...patch } } });
                                }}
                                style={{ padding: '2px 4px', borderRadius: '4px', fontSize: '11px', background: '#1a1a1a', border: '1px solid #d4af37', color: 'white' }}
                              >
                                <option value="Manual">Manual</option>
                                <option value="Cordless">Cordless</option>
                                <option value="Motor">Motor</option>
                              </select>
                              {group.controlType === 'Motor' && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#ccc', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={!!group.solar}
                                    onChange={(e) => {
                                      setTableEditValues({ ...tableEditValues, groupEdits: { ...(tableEditValues.groupEdits || {}), [priceKey]: { ...groupEditForRow, solar: e.target.checked } } });
                                    }}
                                    style={{ width: '12px', height: '12px' }}
                                  />
                                  Solar
                                </label>
                              )}
                              <button
                                onClick={() => setEditingTableField(null)}
                                style={{ padding: '2px 6px', borderRadius: '2px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}
                              >
                                Done
                              </button>
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              {motorType}{group.solar ? '+Solar' : ''}
                              <button
                                onClick={() => setEditingTableField(typeFieldKey)}
                                style={{ padding: '1px 3px', borderRadius: '2px', background: '#444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '9px' }}
                              >
                                ✏️
                              </button>
                            </span>
                          )}
                        </td>
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
                                let committedValue = null;
                                if (q.isRange && priceEditMode === 'range') {
                                  const min = parseFloat(activeEditText);
                                  const max = parseFloat(activeEditTextMax);
                                  if (!isNaN(min) && !isNaN(max) && min >= 0 && max >= 0) {
                                    committedValue = { min: Math.min(min, max), max: Math.max(min, max) };
                                  }
                                  // If either box is empty/invalid, leave unchanged - same as
                                  // the existing "invalid input, don't commit" pattern.
                                } else {
                                  const parsed = parseFloat(activeEditText);
                                  if (activeEditText !== '' && !isNaN(parsed) && parsed >= 0) {
                                    committedValue = parsed;
                                  }
                                }

                                if (committedValue !== null) {
                                  const updates = { [priceKey]: committedValue };
                                  // ✅ NEW: offer (never automatic) to apply the same price to
                                  // every other same-size window group in this quote, any
                                  // room. Opt-in via a confirm - a silent price change here is
                                  // exactly the kind of bug this app has been burned by before,
                                  // so nothing propagates without you seeing it happen.
                                  const matchingKeys = findMatchingSizePriceKeys(priceKey, group.width, group.height);
                                  if (matchingKeys.length > 0) {
                                    const priceLabel = isRangeOverride(committedValue) ? formatPriceOverride(committedValue) : `$${formatMoney(committedValue)}`;
                                    const proceed = window.confirm(`${matchingKeys.length} other ${group.width}x${group.height} window${matchingKeys.length > 1 ? 's' : ''} in this quote.\n\nApply ${priceLabel} to ${matchingKeys.length > 1 ? 'them' : 'it'} too?`);
                                    if (proceed) {
                                      matchingKeys.forEach(k => { updates[k] = committedValue; });
                                    }
                                  }
                                  setTableEditValues({...tableEditValues, perWindowPrices: {...tableEditValues.perWindowPrices, ...updates}});
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
                      effectiveRooms.forEach(room => {
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
          {(Object.keys(tableEditValues.perWindowPrices).length > 0 || tableEditValues.motorCost !== null || tableEditValues.solarCost !== null || tableEditValues.taxRate !== null || Object.keys(tableEditValues.groupEdits || {}).length > 0 || (tableEditValues.deletedRoomIds || new Set()).size > 0 || (editingTableField && activeEditText !== '')) && (
            <>
              {/* Visual indicator of pending changes */}
              <div style={{ padding: '12px', marginBottom: '12px', background: '#2a3a1a', border: '2px solid #4ade80', borderRadius: '6px', textAlign: 'center' }}>
                <p style={{ color: '#4ade80', fontWeight: 'bold', margin: '0' }}>
                  ⚡ You have pending changes ({Object.keys(tableEditValues.perWindowPrices).length > 0 ? Object.keys(tableEditValues.perWindowPrices).length + ' prices' : ''}{tableEditValues.motorCost !== null ? ', motor cost' : ''}{tableEditValues.solarCost !== null ? ', solar cost' : ''}{tableEditValues.taxRate !== null ? ', tax rate' : ''}{Object.keys(tableEditValues.groupEdits || {}).length > 0 ? `, ${Object.keys(tableEditValues.groupEdits).length} window edit${Object.keys(tableEditValues.groupEdits).length > 1 ? 's' : ''}` : ''}{(tableEditValues.deletedRoomIds || new Set()).size > 0 ? `, ${(tableEditValues.deletedRoomIds || new Set()).size} room(s) removed` : ''}{editingTableField && activeEditText !== '' ? ' (still typing...)' : ''})
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
                setTableEditValues({ perWindowPrices: {}, motorCost: null, solarCost: null, taxRate: null, groupEdits: {}, deletedRoomIds: new Set() });
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
}
