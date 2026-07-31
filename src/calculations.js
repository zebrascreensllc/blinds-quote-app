// Pricing calculations for quotes
// Handles: group costs, quotes, surcharges

import { PRICING_DATA } from '../data/pricingData';
import { parseUnits } from './utils/parseUnits';
import { getFabricPrice, getMaxPriceForBlindType } from './utils/fabricUtils';
import { 
  FABRIC_WRAP_COST_PER_SQM, 
  MINIMUM_AREA, 
  AREA_CALC_FACTOR 
} from '../data/constants';

/**
 * Get width surcharge based on width in inches
 * @param {string|number} width - Width (various formats)
 * @param {object} pricing - Pricing snapshot
 * @returns {number} Surcharge amount
 */
export const getWidthSurcharge = (width, pricing = null) => {
  const p = pricing || { WIDTH_SURCHARGES: { "36-40": 10, "41-55": 20, "56-70": 40, "71-88": 60 } };
  const w = parseUnits(width);
  
  if (w > 35 && w <= 40) return p.WIDTH_SURCHARGES["36-40"] || 0;
  if (w > 40 && w <= 55) return p.WIDTH_SURCHARGES["41-55"] || 0;
  if (w > 55 && w <= 70) return p.WIDTH_SURCHARGES["56-70"] || 0;
  if (w > 70 && w <= 88) return p.WIDTH_SURCHARGES["71-88"] || 0;
  if (w > 88) return 75;
  return 0;
};

/**
 * Get height surcharge based on height in inches
 * @param {string|number} height - Height (various formats)
 * @param {object} pricing - Pricing snapshot
 * @returns {number} Surcharge amount
 */
export const getHeightSurcharge = (height, pricing = null) => {
  const p = pricing || { HEIGHT_SURCHARGE: 37 };
  const h = parseUnits(height);
  
  if (h > 90) return p.HEIGHT_SURCHARGE || 0;
  return 0;
};

/**
 * Calculate cost for a window group (supplier cost)
 * @param {object} group - Window group object
 * @param {array} fabricNumbers - Array of fabric numbers
 * @param {string} blindType - Blind type (Roller, Zebra, etc.)
 * @param {boolean} cordless - Is cordless?
 * @param {object} fabricData - Fabric pricing data
 * @returns {object} { minCost, maxCost, isRange }
 */
export const calculateGroupCost = (group, fabricNumbers, blindType, cordless, fabricData = null) => {
  const data = fabricData || PRICING_DATA;
  const width = parseUnits(group.width);
  const height = parseUnits(group.height);
  const quantity = parseInt(group.quantity) || 1;
  
  const miscExpense = 4.50; // MISC_EXPENSE
  const shippingCost = 42; // SHIPPING_COST
  const fabricWrapCost = FABRIC_WRAP_COST_PER_SQM;
  
  const area = Math.max(MINIMUM_AREA, (width * height) / AREA_CALC_FACTOR);
  const fabricWrapTotal = area * fabricWrapCost;
  
  if (fabricNumbers.length === 0) {
    // No fabrics: show range for all fabrics of this blind type
    const allPrices = [];
    Object.keys(data).forEach(type => {
      if (Array.isArray(data[type])) {
        data[type].forEach(fabric => {
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
    // Specific fabrics entered
    const maxPrice = getMaxPriceForBlindType(blindType, cordless, data);
    
    const costs = fabricNumbers.map(fabricNum => {
      const price = getFabricPrice(fabricNum, blindType, cordless, data);
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

/**
 * Calculate quote for a window group (client price with profit)
 * @param {object} group - Window group object
 * @param {array} fabricNumbers - Array of fabric numbers
 * @param {string} blindType - Blind type
 * @param {number} totalMotorizedInRoom - Number of motorized windows in room
 * @param {object} pricing - Pricing snapshot
 * @returns {object} { minQuote, maxQuote, profit, ... }
 */
export const calculateGroupQuote = (group, fabricNumbers, blindType, totalMotorizedInRoom, pricing = null) => {
  const p = pricing || {};
  const quantity = parseInt(group.quantity) || 1;
  
  // Defaults
  const profitPerWindow = p.PROFIT_PER_WINDOW || 60;
  const motorCostClient = p.MOTOR_COST_CLIENT || 80;
  const motorCostSupplier = p.MOTOR_COST_SUPPLIER || 50;
  const solarCostClient = p.SOLAR_COST_CLIENT || 40;
  const solarCostSupplier = p.SOLAR_COST_SUPPLIER || 22;
  
  const fabricData = p.PRICING_DATA || PRICING_DATA;
  const cordless = group.controlType === 'Cordless';
  
  // Calculate group cost
  const cost = calculateGroupCost(group, fabricNumbers, blindType, cordless, fabricData);
  
  // Width and height surcharges
  const widthSurcharge = getWidthSurcharge(group.width, p);
  const heightSurcharge = getHeightSurcharge(group.height, p);
  const calculatedSurcharge = (widthSurcharge + heightSurcharge) * quantity;
  
  // Override surcharge if specified
  const surchargePerWindow = group.surchargeOverride !== null 
    ? group.surchargeOverride * quantity 
    : (widthSurcharge + heightSurcharge);
  const actualSurcharge = surchargePerWindow * quantity;
  
  // Motor costs
  let motorCost = 0;
  let motorCostDiff = 0;
  if (group.controlType === 'Motor') {
    motorCost = motorCostClient;
    motorCostDiff = motorCostClient - motorCostSupplier;
  }
  
  // Remote costs
  let remoteCost = 0;
  if (group.remoteCount) {
    if (group.remoteCount <= 6) {
      remoteCost = (p.REMOTE_6CH || 7) * group.remoteCount;
    } else {
      remoteCost = (p.REMOTE_16CH || 10) * group.remoteCount;
    }
  }
  
  // Solar costs
  let solarCost = 0;
  if (group.solar && group.controlType === 'Motor') {
    solarCost = solarCostClient;
  }
  
  // Total costs
  const totalSupplierCost = cost.minCost + actualSurcharge;
  const totalMotorCost = (motorCostSupplier * (group.controlType === 'Motor' ? 1 : 0));
  const totalSolarCost = (solarCostSupplier * (group.solar && group.controlType === 'Motor' ? 1 : 0));
  
  // Profit = Profit per window + Motor markup + Solar markup
  const baseProfit = profitPerWindow * quantity;
  const motorProfit = motorCostDiff * (group.controlType === 'Motor' ? 1 : 0);
  const solarProfit = (solarCostClient - solarCostSupplier) * (group.solar && group.controlType === 'Motor' ? 1 : 0);
  
  const profit = isNaN(baseProfit + motorProfit + solarProfit) ? 0 : (baseProfit + motorProfit + solarProfit);
  
  // Calculate quote
  const minCostTotal = cost.minCost + actualSurcharge;
  const maxCostTotal = cost.maxCost + actualSurcharge;
  
  const minQuote = isNaN(minCostTotal + profit) ? 0 : Math.round(minCostTotal + profit);
  const maxQuote = isNaN(maxCostTotal + profit) ? 0 : Math.round(maxCostTotal + profit);
  
  return {
    minQuote: isNaN(minQuote) ? 0 : minQuote,
    maxQuote: isNaN(maxQuote) ? 0 : maxQuote,
    minCost: isNaN(cost.minCost) ? 0 : cost.minCost,
    maxCost: isNaN(cost.maxCost) ? 0 : cost.maxCost,
    profit: isNaN(profit) ? 0 : profit,
    isRange: cost.isRange,
    widthSurcharge: widthSurcharge,
    heightSurcharge: heightSurcharge,
    calculatedSurcharge: calculatedSurcharge,
    actualSurcharge: surchargePerWindow,
    isOverridden: group.surchargeOverride !== null
  };
};
