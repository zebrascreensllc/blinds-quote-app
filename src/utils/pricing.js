import { PRICING_DATA } from '../data/pricingData';
import { parseUnits } from './formatters';

// Width surcharge based on inches
export const getWidthSurcharge = (width, pricing = null) => {
  const p = pricing || { WIDTH_SURCHARGES: { "36-40": 10, "41-55": 20, "56-70": 40, "71-88": 60 } };
  const w = parseUnits(width);
  if (w > 35 && w <= 40) return p.WIDTH_SURCHARGES["36-40"];
  if (w > 40 && w <= 55) return p.WIDTH_SURCHARGES["41-55"];
  if (w > 55 && w <= 70) return p.WIDTH_SURCHARGES["56-70"];
  if (w > 70 && w <= 88) return p.WIDTH_SURCHARGES["71-88"];
  if (w > 88) return 75;
  return 0;
};

// Height surcharge based on inches
export const getHeightSurcharge = (height, pricing = null) => {
  const p = pricing || { HEIGHT_SURCHARGE: 37 };
  const h = parseUnits(height);
  if (h > 90) return p.HEIGHT_SURCHARGE;
  return 0;
};

// ✅ NEW: fabrics that still exist in PRICING_DATA (isFabricValid returns
// true for them - they're real catalog entries) but are out of stock with
// no more orders being taken. Distinct from "invalid" - an invalid fabric
// might be a typo (soft warning, still allowed), a discontinued one is a
// hard block regardless of spelling.
export const DISCONTINUED_FABRICS = ['82032D', '82032E'];

/** Given a comma-separated fabric input (room.fabricInput's own format),
 * returns which of the entered numbers are discontinued - empty array if
 * none. Case-insensitive, same as isFabricValid. */
export const findDiscontinuedFabrics = (fabricInput) => {
  const numbers = (fabricInput || '').split(',').map(f => f.trim().toUpperCase()).filter(f => f);
  return numbers.filter(n => DISCONTINUED_FABRICS.includes(n));
};

// Check if fabric is valid
export const isFabricValid = (fabricNum, fabricData = null) => {
  const data = fabricData || PRICING_DATA;
  const searchNum = (fabricNum || '').toUpperCase();
  
  for (const type of Object.keys(data)) {
    const fabric = data[type].find(f => (f.number || '').toUpperCase() === searchNum);
    if (fabric) return true;
  }
  return false;
};

// Get price for specific fabric
export const getFabricPrice = (fabricNum, blindType, cordless, fabricData = null) => {
  const data = fabricData || PRICING_DATA;
  const searchNum = (fabricNum || '').toUpperCase();
  
  for (const type of Object.keys(data)) {
    const fabric = data[type].find(f => (f.number || '').toUpperCase() === searchNum);
    if (fabric) {
      if (type === 'Bamboo') {
        if (blindType === 'Bamboo (Roller)' && fabric.roller_manual) {
          return fabric.roller_manual;
        } else if (blindType === 'Bamboo (Roman)' && fabric.roman_manual) {
          return fabric.roman_manual;
        }
      } else {
        return cordless ? fabric.cordless : fabric.manual;
      }
    }
  }
  return 0;
};

// Get max price for blind type
export const getMaxPriceForBlindType = (blindType, cordless, fabricData = null) => {
  const data = fabricData || PRICING_DATA;
  let maxPrice = 0;
  
  Object.keys(data).forEach(type => {
    if (Array.isArray(data[type])) {
      data[type].forEach(fabric => {
        if (type === 'Bamboo') {
          if (blindType === 'Bamboo (Roller)' && fabric.roller_manual) {
            maxPrice = Math.max(maxPrice, fabric.roller_manual);
          } else if (blindType === 'Bamboo (Roman)' && fabric.roman_manual) {
            maxPrice = Math.max(maxPrice, fabric.roman_manual);
          }
        } else {
          const price = cordless ? fabric.cordless : fabric.manual;
          if (price) maxPrice = Math.max(maxPrice, price);
        }
      });
    }
  });
  
  return maxPrice > 0 ? maxPrice : 20.38;
};

// Calculate cost for a window group
export const calculateGroupCost = (group, fabricNumbers, blindType, pricing = null) => {
  const p = pricing || {};
  const fabricData = p.PRICING_DATA || PRICING_DATA;
  const miscExpense = typeof p.MISC_EXPENSE === 'number' ? p.MISC_EXPENSE : 4.50;
  const shippingCost = typeof p.SHIPPING_COST === 'number' ? p.SHIPPING_COST : 42;
  const fabricWrapCost = 2;
  
  const width = parseUnits(group.width);
  const height = parseUnits(group.height);
  const quantity = parseInt(group.quantity) || 1;
  const cordless = group.controlType === 'Cordless';
  
  const area = Math.max(1.5, (width * height) / 1550);
  const fabricWrapTotal = area * fabricWrapCost;
  
  if (fabricNumbers.length === 0) {
    const allPrices = [];
    Object.keys(fabricData).forEach(type => {
      if (Array.isArray(fabricData[type])) {
        fabricData[type].forEach(fabric => {
          if (type === 'Bamboo') {
            if (blindType === 'Bamboo (Roller)' && fabric.roller_manual) {
              allPrices.push(fabric.roller_manual);
            } else if (blindType === 'Bamboo (Roman)' && fabric.roman_manual) {
              allPrices.push(fabric.roman_manual);
            }
          } else {
            const price = cordless ? fabric.cordless : fabric.manual;
            if (price) allPrices.push(price);
          }
        });
      }
    });
    
    if (allPrices.length === 0) {
      return {
        minCost: (area * 14.92 + miscExpense + shippingCost + fabricWrapTotal) * quantity,
        maxCost: (area * 20.38 + miscExpense + shippingCost + fabricWrapTotal) * quantity,
        isRange: true
      };
    }
    
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    
    return {
      minCost: (area * minPrice + miscExpense + shippingCost + fabricWrapTotal) * quantity,
      maxCost: (area * maxPrice + miscExpense + shippingCost + fabricWrapTotal) * quantity,
      isRange: true
    };
  } else {
    const maxPrice = getMaxPriceForBlindType(blindType, cordless, fabricData);
    
    const costs = fabricNumbers.map(fabricNum => {
      const price = getFabricPrice(fabricNum, blindType, cordless, fabricData);
      const effectivePrice = price > 0 ? price : maxPrice;
      return (area * effectivePrice + miscExpense + shippingCost + fabricWrapTotal) * quantity;
    }).filter(c => c !== null);
    
    if (costs.length === 0) {
      return {
        minCost: (area * maxPrice + miscExpense + shippingCost + fabricWrapTotal) * quantity,
        maxCost: (area * maxPrice + miscExpense + shippingCost + fabricWrapTotal) * quantity,
        isRange: false
      };
    }
    
    return {
      minCost: Math.min(...costs),
      maxCost: Math.max(...costs),
      isRange: costs.length > 1
    };
  }
};

// Calculate quote for a window group
export const calculateGroupQuote = (group, fabricNumbers, blindType, totalMotorizedInRoom, pricing = null) => {
  const p = pricing || {
    PROFIT_PER_WINDOW: 60,
    MOTOR_COST_CLIENT: 80,
    MOTOR_COST_SUPPLIER: 50,
    SOLAR_COST_CLIENT: 40,
    SOLAR_COST_SUPPLIER: 22,
    REMOTE_6CH: 7,
    REMOTE_16CH: 10,
    MISC_EXPENSE: 4.50,
    SHIPPING_COST: 42,
    // ✅ BUGFIX: these two were missing. getWidthSurcharge/getHeightSurcharge
    // each have their own independent default fallback for these values, but
    // that fallback only triggers when the pricing argument passed to THEM is
    // itself null/undefined. Since this object is truthy and gets passed
    // straight through as that argument, their fallbacks never ran - so any
    // quote with no pricing snapshot (pricing=null, e.g. legacy quotes from
    // before that feature existed) crashed the moment a window's width
    // exceeded 35in, which is nearly every real quote. Values here match
    // getWidthSurcharge/getHeightSurcharge's own fallbacks exactly.
    WIDTH_SURCHARGES: { "36-40": 10, "41-55": 20, "56-70": 40, "71-88": 60 },
    HEIGHT_SURCHARGE: 37,
    PRICING_DATA: PRICING_DATA
  };
  
  const cost = calculateGroupCost(group, fabricNumbers, blindType, p);
  const quantity = parseInt(group.quantity) || 1;
  let profitPerWindow = p.PROFIT_PER_WINDOW;
  
  const widthSurcharge = getWidthSurcharge(group.width, p);
  const heightSurcharge = getHeightSurcharge(group.height, p);
  const calculatedSurcharge = widthSurcharge + heightSurcharge;
  // ✅ BUGFIX: was `group.surchargeOverride !== null`, which treats `undefined`
  // as "yes there's an override" (undefined !== null is true in JS!) and then
  // uses `undefined` as the surcharge value - cascading to NaN, silently
  // reduced to $0 for that window by the isNaN safety net below. Reachable
  // for any quote saved before surchargeOverride existed as a field, or any
  // group object missing the key. loadQuoteForEdit already defensively
  // normalizes this when editing, but viewing a quote reads rooms directly
  // and skips that normalization - so the fix belongs here, at the source.
  const surchargePerWindow = typeof group.surchargeOverride === 'number' ? group.surchargeOverride : calculatedSurcharge;
  
  if (group.controlType === 'Motor') {
    const remoteType = totalMotorizedInRoom > 6 ? p.REMOTE_16CH : p.REMOTE_6CH;
    profitPerWindow += p.MOTOR_COST_CLIENT - p.MOTOR_COST_SUPPLIER - (remoteType / totalMotorizedInRoom);
  }
  
  if (group.solar) {
    profitPerWindow += p.SOLAR_COST_CLIENT - p.SOLAR_COST_SUPPLIER;
  }
  
  // ✅ BUGFIX: baseProfitPerWindow previously included solar markup, so the
  // per-window price shown in the table had solar baked in with no way to
  // edit it separately - editing a window's price silently swallowed the
  // solar amount too. Motor was already excluded from baseProfitPerWindow
  // for exactly this reason; solar now gets the same treatment. Grand Total
  // (which uses profitPerWindow, not baseProfitPerWindow) is unaffected -
  // solar is still fully counted there, just via its own line instead of
  // being hidden inside the per-window number.
  let baseProfitPerWindow = p.PROFIT_PER_WINDOW;
  const baseMinQuote = cost.minCost + (baseProfitPerWindow * quantity) + (surchargePerWindow * quantity);
  const baseMaxQuote = cost.maxCost + (baseProfitPerWindow * quantity) + (surchargePerWindow * quantity);
  const safeBaseMinQuote = isNaN(baseMinQuote) ? 0 : baseMinQuote;
  const safeBaseMaxQuote = isNaN(baseMaxQuote) ? 0 : baseMaxQuote;
  
  const minQuote = cost.minCost + (profitPerWindow * quantity) + (surchargePerWindow * quantity);
  const maxQuote = cost.maxCost + (profitPerWindow * quantity) + (surchargePerWindow * quantity);
  
  const safeMinQuote = isNaN(minQuote) ? 0 : minQuote;
  const safeMaxQuote = isNaN(maxQuote) ? 0 : maxQuote;
  
  return {
    minQuote: safeMinQuote,
    maxQuote: safeMaxQuote,
    minCost: isNaN(cost.minCost) ? 0 : cost.minCost,
    maxCost: isNaN(cost.maxCost) ? 0 : cost.maxCost,
    profit: isNaN((profitPerWindow + surchargePerWindow) * quantity) ? 0 : (profitPerWindow + surchargePerWindow) * quantity,
    isRange: cost.isRange,
    widthSurcharge: widthSurcharge,
    heightSurcharge: heightSurcharge,
    calculatedSurcharge: calculatedSurcharge,
    actualSurcharge: surchargePerWindow,
    isOverridden: typeof group.surchargeOverride === 'number',
    baseMinQuote: safeBaseMinQuote,
    baseMaxQuote: safeBaseMaxQuote
  };
};

// Determine blind type from fabric
export const getBlindTypeFromFabric = (fabricNum, fabricData = null) => {
  const data = fabricData || PRICING_DATA;
  const searchNum = (fabricNum || '').toUpperCase();
  
  for (const type of Object.keys(data)) {
    const fabric = data[type].find(f => (f.number || '').toUpperCase() === searchNum);
    if (fabric) return type;
  }
  return null;
};

// Get blind types from fabrics
export const getBlindTypesFromFabrics = (rooms, fabricData = null) => {
  const data = fabricData || PRICING_DATA;
  const blindTypesSet = new Set();
  
  rooms.forEach(room => {
    const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
    fabricNumbers.forEach(fabricNum => {
      const blindType = getBlindTypeFromFabric(fabricNum, data);
      if (blindType) {
        blindTypesSet.add(blindType);
      }
    });
  });
  
  return Array.from(blindTypesSet);
};

// Get quote name prefix
export const getQuoteNamePrefix = (rooms, fabricData = null) => {
  const fabricBlindTypes = getBlindTypesFromFabrics(rooms, fabricData);
  
  if (fabricBlindTypes.length === 0) {
    return (rooms[0]?.blindTypes?.[0]) || 'Roller';
  } else if (fabricBlindTypes.length === 1) {
    return fabricBlindTypes[0];
  } else {
    return 'multiple-fabric';
  }
};

// Auto-detect blind types from fabric input
export const autoDetectBlindTypes = (fabricInput, fabricData = null) => {
  const data = fabricData || PRICING_DATA;
  const fabricNumbers = fabricInput.split(',').map(f => f.trim()).filter(f => f);
  const detectedTypes = new Set();
  
  fabricNumbers.forEach(fabricNum => {
    const blindType = getBlindTypeFromFabric(fabricNum, data);
    if (blindType) {
      detectedTypes.add(blindType);
    }
  });
  
  return detectedTypes.size > 0 ? Array.from(detectedTypes) : ['Roller'];
};

// ✅ NEW (Order Analysis): reusable, non-JSX version of the same supplier-cost-
// breakdown + profit math already used inline in App.js's Pricing Comparison
// panel (renderQuoteDetail) - same formulas, same field names, kept in sync
// deliberately so the two can never drift apart. Remote cost is split out
// from Motor here (the Pricing Comparison panel bundles them into one
// "Motor Cost" figure) since Order Analysis tracks them as separate line
// items to compare against the supplier's actual invoice.
// ✅ NEW: Hub is a quote-level charge (one smart-home hub can cover many
// motorized windows, unlike Motor/Solar which are per-window) - not part of
// calculateGroupQuote's per-window math at all. quantity*price, or 0 if Hub
// isn't included on this quote. A price of exactly 0 means "complimentary"
// (included but not charged) - callers that display this should check for
// that explicitly rather than just hiding a $0 row.
export const getHubTotal = (quote) => {
  const hub = quote?.hub;
  if (!hub || !hub.included) return 0;
  const qty = parseInt(hub.quantity) || 1;
  const price = typeof hub.price === 'number' ? hub.price : 0;
  return qty * price;
};

export const computeQuoteFinancials = (quote) => {
  const rooms = quote.rooms || [];
  const storedPricing = quote.pricing || null;
  const fabricData = storedPricing?.PRICING_DATA || PRICING_DATA;
  const isRangeOverride = (v) => v !== null && typeof v === 'object' && typeof v.min === 'number' && typeof v.max === 'number';

  let totalMin = 0, totalMax = 0;
  let fabricCost = 0, shippingCost = 0, motorSupplierCost = 0, remoteSupplierCost = 0, solarSupplierCost = 0;
  let motorCount = 0, solarCount = 0;

  rooms.forEach(room => {
    const fabricNumbers = (room.fabricInput || '').split(',').map(f => f.trim()).filter(f => f);
    let actualBlindType = (room.blindTypes || ['Roller'])[0];
    if (fabricNumbers.length > 0) {
      for (const fabricNum of fabricNumbers) {
        const detectedType = getBlindTypeFromFabric(fabricNum, fabricData);
        if (detectedType) { actualBlindType = detectedType; break; }
      }
    }

    const motorizedCount = room.windowGroups.filter(w => w.controlType === 'Motor').length;

    room.windowGroups.forEach((group, groupIdx) => {
      const qty = parseInt(group.quantity) || 0;
      if (group.controlType === 'Motor') motorCount += qty;
      if (group.solar) solarCount += qty;

      const q = calculateGroupQuote(group, fabricNumbers, actualBlindType, motorizedCount, storedPricing);
      if (isNaN(q.minQuote) || isNaN(q.maxQuote)) return;

      const quantityForCost = parseInt(group.quantity) || 1;
      const avgGroupCost = (q.minCost + q.maxCost) / 2;
      const shippingForGroup = (storedPricing?.SHIPPING_COST ?? 42) * quantityForCost;
      shippingCost += shippingForGroup;
      fabricCost += (avgGroupCost - shippingForGroup);
      if (group.controlType === 'Motor') {
        const remoteType = motorizedCount > 6 ? (storedPricing?.REMOTE_16CH ?? 10) : (storedPricing?.REMOTE_6CH ?? 7);
        motorSupplierCost += (storedPricing?.MOTOR_COST_SUPPLIER ?? 50) * quantityForCost;
        remoteSupplierCost += (remoteType / motorizedCount) * quantityForCost;
      }
      if (group.solar) {
        solarSupplierCost += (storedPricing?.SOLAR_COST_SUPPLIER ?? 22) * quantityForCost;
      }

      const priceKey = `${room.id}_${groupIdx}`;
      const savedPrice = quote.editedPrices?.perWindowPrices?.[priceKey];
      const quantity = parseInt(group.quantity) || 1;
      if (typeof savedPrice === 'number' || isRangeOverride(savedPrice)) {
        if (isRangeOverride(savedPrice)) {
          totalMin += savedPrice.min * quantity;
          totalMax += savedPrice.max * quantity;
        } else {
          const overrideTotal = savedPrice * quantity;
          totalMin += overrideTotal;
          totalMax += overrideTotal;
        }
      } else {
        totalMin += q.baseMinQuote;
        totalMax += q.baseMaxQuote;
      }
    });
  });

  const defaultMotorCostClient = storedPricing?.MOTOR_COST_CLIENT || 80;
  const effectiveMotorCost = typeof quote.editedPrices?.motorCost === 'number' ? quote.editedPrices.motorCost : defaultMotorCostClient;
  const defaultSolarCostClient = storedPricing?.SOLAR_COST_CLIENT || 40;
  const effectiveSolarCost = typeof quote.editedPrices?.solarCost === 'number' ? quote.editedPrices.solarCost : defaultSolarCostClient;
  const motorGrandTotal = motorCount * effectiveMotorCost;
  const solarGrandTotal = solarCount * effectiveSolarCost;
  // Hub has no known supplier-cost figure (unlike Motor/Solar), so it's only
  // added to revenue/profit, never to appGeneratedCosts - fabricating a
  // supplier cost would be worse than omitting one.
  const hubTotal = getHubTotal(quote);

  const appGeneratedCosts = {
    fabric: fabricCost,
    shipping: shippingCost,
    motor: motorSupplierCost,
    remote: remoteSupplierCost,
    solar: solarSupplierCost,
    total: fabricCost + shippingCost + motorSupplierCost + remoteSupplierCost + solarSupplierCost
  };

  return {
    appGeneratedCosts,
    // Revenue actually charged to the client (window + motor + solar + hub,
    // no tax) - uses the MIN side of any still-ranged pricing, matching how
    // the rest of the app treats an un-resolved range as its conservative
    // low end.
    revenueSubtotal: totalMin + motorGrandTotal + solarGrandTotal + hubTotal,
    revenueSubtotalMax: totalMax + motorGrandTotal + solarGrandTotal + hubTotal,
    appEstimatedProfit: (totalMin + motorGrandTotal + solarGrandTotal + hubTotal) - appGeneratedCosts.total,
    motorCount,
    solarCount,
    hubTotal
  };
};

// Get next version number
// ✅ DEFENSIVE: quotes defaults to [] so a missing argument can never crash quote creation.
// Also parses versions safely (strips any non-digits) and ignores unparseable ones.
export const getNextVersion = (clientName, location, quotes = []) => {
  const list = Array.isArray(quotes) ? quotes : [];
  const clientQuotes = list.filter(q => q && q.clientName === clientName && q.location === location);
  if (clientQuotes.length === 0) return 1;
  const versions = clientQuotes
    .map(q => parseInt(String(q.version || '').replace(/[^0-9]/g, ''), 10))
    .filter(n => !isNaN(n));
  if (versions.length === 0) return 1;
  return Math.max(...versions) + 1;
};
