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
    PRICING_DATA: PRICING_DATA
  };
  
  const cost = calculateGroupCost(group, fabricNumbers, blindType, p);
  const quantity = parseInt(group.quantity) || 1;
  let profitPerWindow = p.PROFIT_PER_WINDOW;
  
  const widthSurcharge = getWidthSurcharge(group.width, p);
  const heightSurcharge = getHeightSurcharge(group.height, p);
  const calculatedSurcharge = widthSurcharge + heightSurcharge;
  const surchargePerWindow = group.surchargeOverride !== null ? group.surchargeOverride : calculatedSurcharge;
  
  if (group.controlType === 'Motor') {
    const remoteType = totalMotorizedInRoom > 6 ? p.REMOTE_16CH : p.REMOTE_6CH;
    profitPerWindow += p.MOTOR_COST_CLIENT - p.MOTOR_COST_SUPPLIER - (remoteType / totalMotorizedInRoom);
  }
  
  if (group.solar) {
    profitPerWindow += p.SOLAR_COST_CLIENT - p.SOLAR_COST_SUPPLIER;
  }
  
  let baseProfitPerWindow = p.PROFIT_PER_WINDOW;
  if (group.solar) {
    baseProfitPerWindow += p.SOLAR_COST_CLIENT - p.SOLAR_COST_SUPPLIER;
  }
  
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
    isOverridden: group.surchargeOverride !== null,
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
