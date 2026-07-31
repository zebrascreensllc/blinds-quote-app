// Fabric-related utility functions
// Handles: validation, detection, pricing lookup

import { PRICING_DATA } from '../data/pricingData';

/**
 * Get fabric price by number, blind type, and control type
 * @param {string} fabricNum - Fabric number (e.g., '83009K')
 * @param {string} blindType - Blind type (Roller, Zebra, Roman, etc.)
 * @param {boolean} cordless - Is cordless? (true/false)
 * @param {object} fabricData - Fabric data (defaults to PRICING_DATA)
 * @returns {number} Price per sq meter
 */
export const getFabricPrice = (fabricNum, blindType, cordless, fabricData = null) => {
  const data = fabricData || PRICING_DATA;
  const searchNum = (fabricNum || '').toUpperCase(); // Case-insensitive
  
  for (const type of Object.keys(data)) {
    const fabric = data[type].find(f => (f.number || '').toUpperCase() === searchNum);
    if (fabric) {
      if (type === 'Bamboo') {
        if (blindType === 'Bamboo (Roller)') return fabric.roller_manual;
        if (blindType === 'Bamboo (Roman)') return fabric.roman_manual;
      } else {
        return cordless ? fabric.cordless : fabric.manual;
      }
    }
  }
  return 0; // Not found
};

/**
 * Determine blind type from fabric number
 * @param {string} fabricNum - Fabric number
 * @param {object} fabricData - Fabric data (defaults to PRICING_DATA)
 * @returns {string|null} Blind type or null if not found
 */
export const getBlindTypeFromFabric = (fabricNum, fabricData = null) => {
  const data = fabricData || PRICING_DATA;
  const searchNum = (fabricNum || '').toUpperCase();
  
  for (const type of Object.keys(data)) {
    const fabric = data[type].find(f => (f.number || '').toUpperCase() === searchNum);
    if (fabric) return type;
  }
  return null;
};

/**
 * Check if fabric number exists in database
 * @param {string} fabricNum - Fabric number
 * @param {object} fabricData - Fabric data (defaults to PRICING_DATA)
 * @returns {boolean} True if fabric exists
 */
export const isFabricValid = (fabricNum, fabricData = null) => {
  const data = fabricData || PRICING_DATA;
  const searchNum = (fabricNum || '').toUpperCase();
  
  for (const type of Object.keys(data)) {
    const fabric = data[type].find(f => (f.number || '').toUpperCase() === searchNum);
    if (fabric) return true;
  }
  return false;
};

/**
 * Get maximum price for a blind type (used as fallback for invalid fabrics)
 * @param {string} blindType - Blind type
 * @param {boolean} cordless - Is cordless?
 * @param {object} fabricData - Fabric data (defaults to PRICING_DATA)
 * @returns {number} Maximum price for this blind type
 */
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
  
  return maxPrice > 0 ? maxPrice : 20.38; // Default estimate if nothing found
};

/**
 * Get all unique blind types from fabric input
 * @param {array} rooms - Array of room objects
 * @param {object} fabricData - Fabric data
 * @returns {array} Array of detected blind types
 */
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

/**
 * Auto-detect blind types from fabric input string
 * @param {string} fabricInput - Comma-separated fabric numbers
 * @param {object} fabricData - Fabric data
 * @returns {array} Array of detected blind types
 */
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

/**
 * Determine quote name prefix based on fabrics entered
 * @param {array} rooms - Array of room objects
 * @param {object} fabricData - Fabric data
 * @returns {string} Quote name prefix (e.g., 'Zebra', 'Roller', 'multiple-fabric')
 */
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
