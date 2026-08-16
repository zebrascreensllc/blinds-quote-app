import React from 'react';
import { Trash2 } from 'lucide-react';
import { SALES_TAX_RATE } from '../../utils/constants';
import { formatPrice, formatMoney, isRangeOverride, formatPriceOverride, filterNumericText } from '../../utils/formatters';
import { calculateGroupQuote, getBlindTypeFromFabric } from '../../utils/pricing';

// Extracted from QuoteDetailScreen.js (was ~1440 lines - this section alone
// was ~550 of them) as a close relocation, not a rewrite: same variable
// names, same structure, only the closed-over values are now explicit props
// instead of direct closure access - same approach as the original
// App.js -> QuoteDetailScreen split. The room-card list, per-window
// Qty/Size/Type/Solar/Price editing, and the Total/Motor/Solar/Subtotal/
// Tax/Grand Total summary rows all still work exactly as before; only the
// file they live in changed.
export default function CurrentPricingSection({
  activeEditText,
  activeEditTextMax,
  editingTableField,
  effectiveMotorCost,
  effectiveRooms,
  effectiveSolarCost,
  expandedQuoteTable,
  findMatchingSizePriceKeys,
  grandMax,
  grandMin,
  groupEdits,
  motorCount,
  motorGrandTotal,
  priceEditMode,
  selectedQuote,
  setActiveEditText,
  setActiveEditTextMax,
  setEditingTableField,
  setExpandedQuoteTable,
  setPriceEditMode,
  setTableEditValues,
  solarCount,
  solarGrandTotal,
  storedPricing,
  subtotalMax,
  subtotalMin,
  tableEditValues,
  taxMax,
  taxMin,
  totalMax,
  totalMin
}) {
  return (
          <div style={{ borderRadius: '8px', marginBottom: '32px', background: '#2a2a2a', border: '1px solid #444' }}>
            <button onClick={() => setExpandedQuoteTable(!expandedQuoteTable)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 16px', marginBottom: expandedQuoteTable ? '0' : '0' }}>
              <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#d4af37', marginBottom: '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>💰 CURRENT PRICING</span>
                <span style={{ color: '#888', fontSize: '14px' }}>{expandedQuoteTable ? '▼' : '▶'}</span>
              </p>
            </button>
            {expandedQuoteTable && (
            <div style={{ marginBottom: '12px' }}>
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

                  // Composite key (room + window group) so multiple window groups
                  // in the same room don't collide with each other's edited price
                  const priceKey = `${room.id}_${groupIdx}`;
                  const fieldKey = `perWindow-${priceKey}`;

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

                  const savedPrice = selectedQuote.editedPrices?.perWindowPrices?.[priceKey];
                  const hasSavedPrice = typeof savedPrice === 'number' || isRangeOverride(savedPrice);
                  const basePrice = hasSavedPrice ? savedPrice : perWindowMin;

                  const pendingPrice = tableEditValues.perWindowPrices[priceKey];
                  const hasPendingPrice = typeof pendingPrice === 'number' || isRangeOverride(pendingPrice);
                  const effectivePrice = hasPendingPrice ? pendingPrice : basePrice;
                  const isEdited = hasPendingPrice || hasSavedPrice;
                  const isEditingThis = editingTableField === fieldKey;

                  return (
                    <div key={`${roomIdx}-${groupIdx}`} style={{ background: '#1f1f1f', border: '1px solid #444', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #333' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>
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
                        <span style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: isEdited ? '#ffcc00' : '#fff' }}>
                          {isEdited
                            ? (isRangeOverride(effectivePrice) ? formatPrice(effectivePrice.min * quantity, effectivePrice.max * quantity) : `$${formatMoney(effectivePrice * quantity)}`)
                            : (q.isRange ? formatPrice(q.baseMinQuote, q.baseMaxQuote) : `$${formatMoney(effectivePrice * quantity)}`)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px', marginBottom: '10px' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px', fontWeight: 'bold' }}>QTY</div>
                          <div style={{ color: isQtyEdited ? '#ffcc00' : '#ccc' }}>
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
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px', fontWeight: 'bold' }}>SIZE</div>
                          <div style={{ color: isSizeEdited ? '#ffcc00' : '#ccc' }}>
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
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px', fontWeight: 'bold' }}>TYPE</div>
                          <div style={{ color: isTypeEdited ? '#ffcc00' : '#ccc' }}>
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
                          </div>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px', fontWeight: 'bold' }}>PER WINDOW PRICE</div>
                        <div style={{ color: isEdited ? '#ffcc00' : '#d4af37', fontWeight: '600', fontSize: '12px' }}>
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
                        </div>
                      </div>
                    </div>
                  );
                });
              })}

              <div style={{ background: '#1a3a3a', border: '1px solid #d4af37', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span style={{ color: '#fff' }}>TOTAL:</span>
                <span style={{ color: '#fff' }}>{formatPrice(totalMin, totalMax)}</span>
              </div>

              <div style={{ background: '#2a3a2a', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#aaa' }}>TOTAL WINDOWS:</span>
                <span style={{ color: '#fff', fontWeight: 'bold' }}>{(() => {
                  let totalWins = 0;
                  effectiveRooms.forEach(room => {
                    room.windowGroups.forEach(group => {
                      totalWins += parseInt(group.quantity) || 0;
                    });
                  });
                  return totalWins;
                })()}</span>
              </div>

              {motorCount > 0 && (() => {
                const isEditingMotor = editingTableField === 'motorCost';
                const isMotorEdited = typeof tableEditValues.motorCost === 'number' || typeof selectedQuote.editedPrices?.motorCost === 'number';
                return (
                  <div style={{ background: '#3a2a2a', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ color: '#aaa' }}>
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
                    </span>
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
                  </div>
                );
              })()}

              {solarCount > 0 && (() => {
                const isEditingSolar = editingTableField === 'solarCost';
                const isSolarEdited = typeof tableEditValues.solarCost === 'number' || typeof selectedQuote.editedPrices?.solarCost === 'number';
                return (
                  <div style={{ background: '#2a3a2a', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ color: '#aaa' }}>
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
                    </span>
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
                  </div>
                );
              })()}

              {(motorCount > 0 || solarCount > 0) && (
                <div style={{ background: '#2a2a3a', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span style={{ color: '#ccc' }}>Subtotal (before tax):</span>
                  <span style={{ color: '#ccc' }}>{formatPrice(subtotalMin, subtotalMax)}</span>
                </div>
              )}

              <div style={{ background: '#1a3a3a', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ color: '#aaa' }}>
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
                </span>
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
                <span style={{ color: '#aaa' }}>{formatPrice(taxMin, taxMax)}</span>
              </div>

              <div style={{ background: '#2a5a2a', borderRadius: '8px', padding: '10px 12px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#fff' }}>GRAND TOTAL:</span>
                <span style={{ color: '#fff' }}>{formatPrice(grandMin, grandMax)}</span>
              </div>
            </div>
            )}
          </div>
  );
}
