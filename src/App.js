import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Check, ArrowLeft, Search, BarChart3, TrendingUp, Edit2, ChevronDown, ChevronUp } from 'lucide-react';

const PRICING_DATA = {
  'Roller': [
    {'number': '82086K', 'manual': 14.92, 'cordless': 18.12},
    {'number': '82067E', 'manual': 15.23, 'cordless': 18.43},
    {'number': '82006S', 'manual': 15.23, 'cordless': 18.43},
    {'number': '82010G', 'manual': 15.91, 'cordless': 19.12},
    {'number': '82067M', 'manual': 15.91, 'cordless': 19.12},
    {'number': '82082A', 'manual': 16.28, 'cordless': 19.48},
    {'number': '82086F', 'manual': 16.33, 'cordless': 19.53},
    {'number': '82072C', 'manual': 16.38, 'cordless': 19.64},
    {'number': '82027F', 'manual': 16.60, 'cordless': 19.85},
    {'number': '82076A', 'manual': 16.60, 'cordless': 19.85},
    {'number': '82146A', 'manual': 16.60, 'cordless': 19.85},
    {'number': '82006A', 'manual': 16.81, 'cordless': 20.01},
    {'number': '82141A', 'manual': 17.28, 'cordless': 20.48},
    {'number': '82156A', 'manual': 17.28, 'cordless': 20.48},
    {'number': '82167A', 'manual': 17.28, 'cordless': 20.48},
    {'number': '82072F', 'manual': 17.28, 'cordless': 20.48},
    {'number': '82067K', 'manual': 17.65, 'cordless': 20.85},
    {'number': '82161A', 'manual': 17.65, 'cordless': 20.85},
    {'number': '82144A', 'manual': 17.96, 'cordless': 21.22},
    {'number': '82026A', 'manual': 17.96, 'cordless': 21.22},
    {'number': '82137A', 'manual': 17.96, 'cordless': 21.22},
    {'number': '82083A', 'manual': 17.96, 'cordless': 21.22},
    {'number': '82025F', 'manual': 17.96, 'cordless': 21.22},
    {'number': '82032D', 'manual': 18.28, 'cordless': 21.53},
    {'number': '82154A', 'manual': 18.33, 'cordless': 21.53},
    {'number': '82161D', 'manual': 18.59, 'cordless': 21.79},
    {'number': '82088F', 'manual': 18.64, 'cordless': 21.85},
    {'number': '82028F', 'manual': 19.01, 'cordless': 22.27},
    {'number': '82077A', 'manual': 19.01, 'cordless': 22.27},
    {'number': '82133A', 'manual': 19.01, 'cordless': 22.27},
    {'number': '82024A', 'manual': 19.01, 'cordless': 22.27},
    {'number': '82182A', 'manual': 19.22, 'cordless': 22.48},
    {'number': '82136A', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82141E', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82143A', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82142A', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82164A', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82155A', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82006G', 'manual': 19.33, 'cordless': 22.58},
    {'number': '82176A', 'manual': 19.69, 'cordless': 21.95},
    {'number': '82168A', 'manual': 19.69, 'cordless': 21.95},
    {'number': '82180A', 'manual': 20.01, 'cordless': 23.26},
    {'number': '82179A', 'manual': 20.01, 'cordless': 23.26},
    {'number': '82181A', 'manual': 20.01, 'cordless': 23.26},
    {'number': '82183A', 'manual': 20.38, 'cordless': 23.63},
    {'number': '82151A', 'manual': 21.06, 'cordless': 24.26},
    {'number': '82032A', 'manual': 21.74, 'cordless': 24.94},
    {'number': '82178A', 'manual': 22.48, 'cordless': 25.63},
    {'number': '82132D', 'manual': 22.79, 'cordless': 26.00}
  ],
  'Zebra': [
    {'number': '83003L', 'manual': 16.07, 'cordless': 19.85},
    {'number': '83048A', 'manual': 17.75, 'cordless': 19.85},
    {'number': '83038G', 'manual': 17.75, 'cordless': 21.53},
    {'number': '83011A', 'manual': 18.80, 'cordless': 22.58},
    {'number': '83073A', 'manual': 18.80, 'cordless': 22.58},
    {'number': '83055A', 'manual': 18.80, 'cordless': 22.58},
    {'number': '83049A', 'manual': 18.80, 'cordless': 22.58},
    {'number': '83056A', 'manual': 19.54, 'cordless': 23.32},
    {'number': '83061A', 'manual': 19.54, 'cordless': 23.32},
    {'number': '83042A', 'manual': 19.54, 'cordless': 23.32},
    {'number': '83050B', 'manual': 19.54, 'cordless': 23.32},
    {'number': '83013F', 'manual': 19.54, 'cordless': 23.32},
    {'number': '83070A', 'manual': 19.54, 'cordless': 23.32},
    {'number': '83032E', 'manual': 20.17, 'cordless': 23.95},
    {'number': '83045A', 'manual': 20.17, 'cordless': 23.95},
    {'number': '83071A', 'manual': 20.17, 'cordless': 23.95},
    {'number': '83012F', 'manual': 20.17, 'cordless': 23.95},
    {'number': '83009A', 'manual': 20.49, 'cordless': 24.26},
    {'number': '83062A', 'manual': 21.22, 'cordless': 24.94},
    {'number': '83053A', 'manual': 21.22, 'cordless': 24.94},
    {'number': '83039F', 'manual': 21.22, 'cordless': 24.94},
    {'number': '83067A', 'manual': 21.22, 'cordless': 24.94},
    {'number': '83068A', 'manual': 21.22, 'cordless': 24.94},
    {'number': '83070F', 'manual': 21.53, 'cordless': 25.31},
    {'number': '83047A', 'manual': 21.87, 'cordless': 25.63},
    {'number': '83040A', 'manual': 21.87, 'cordless': 25.63},
    {'number': '83066A', 'manual': 21.87, 'cordless': 25.63},
    {'number': '83051A', 'manual': 22.58, 'cordless': 26.31},
    {'number': '83014F', 'manual': 22.58, 'cordless': 26.31},
    {'number': '83043A', 'manual': 22.58, 'cordless': 26.31},
    {'number': '83065A', 'manual': 23.26, 'cordless': 26.99},
    {'number': '83068F', 'manual': 23.26, 'cordless': 26.99},
    {'number': '83058A', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83019F', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83020F', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83044A', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83059A', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83060A', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83046A', 'manual': 23.63, 'cordless': 27.36},
    {'number': '83064A', 'manual': 25.99, 'cordless': 29.77},
    {'number': '83015F', 'manual': 25.99, 'cordless': 29.77}
  ],
  'Roman': [
    {'number': '82067E', 'manual': 18.91, 'cordless': 20.38},
    {'number': '82072C', 'manual': 21.07, 'cordless': 22.73},
    {'number': '82146A', 'manual': 20.90, 'cordless': 22.54},
    {'number': '82072F', 'manual': 21.07, 'cordless': 22.73},
    {'number': '82161A', 'manual': 22.17, 'cordless': 23.92},
    {'number': '82144A', 'manual': 21.25, 'cordless': 22.92},
    {'number': '82161D', 'manual': 23.94, 'cordless': 25.85},
    {'number': '82136A', 'manual': 23.94, 'cordless': 25.85}
  ],
  'Bamboo': [
    {'number': '82005L', 'roller_manual': 17.00, 'roman_manual': 18.15},
    {'number': '82005M', 'roller_manual': 17.00, 'roman_manual': 18.15},
    {'number': '82005N', 'roller_manual': 17.00, 'roman_manual': 18.15},
    {'number': '82005O', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005P', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005B', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005Q', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005C', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005D', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005E', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005F', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005R', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005S', 'roller_manual': 13.54, 'roman_manual': 14.69},
    {'number': '82005T', 'roller_manual': 13.54, 'roman_manual': 14.69},
    {'number': '82005U', 'roller_manual': 10.08, 'roman_manual': 11.23},
    {'number': '82005V', 'roller_manual': 13.54, 'roman_manual': 14.69},
    {'number': '82005A5', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005A6', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005Y', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005Z', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005A0', 'roller_manual': 14.69, 'roman_manual': 15.85},
    {'number': '82005A1', 'roller_manual': 15.85, 'roman_manual': 17.00},
    {'number': '82005A2', 'roller_manual': 17.00, 'roman_manual': 18.15},
    {'number': '82005A3', 'roller_manual': 17.00, 'roman_manual': 18.15}
  ]
};

const BUSINESS_NAME = 'Zebra Screens & Rollers';
const SALES_TAX_RATE = 0.0825;

// Create pricing snapshot (captures current pricing)
const getPricingSnapshot = () => ({
  PROFIT_PER_WINDOW: 60,
  MOTOR_COST_CLIENT: 80,
  MOTOR_COST_SUPPLIER: 50,
  SOLAR_COST_CLIENT: 40,
  SOLAR_COST_SUPPLIER: 22,
  MISC_EXPENSE: 4.50,
  SHIPPING_COST: 42,
  REMOTE_6CH: 7,
  REMOTE_16CH: 10,
  SALES_TAX_RATE: 0.0825,
  WIDTH_SURCHARGES: {
    "36-40": 10,
    "41-55": 20,
    "56-70": 40,
    "71-88": 60
  },
  HEIGHT_SURCHARGE: 37,
  // NOTE: DO NOT store PRICING_DATA - too large for localStorage
  // Instead use current PRICING_DATA in calculateGroupCost with fallback
  CREATED_DATE: new Date().toISOString()
});

// Width surcharge based on inches (uses pricing snapshot)
const getWidthSurcharge = (width, pricing = null) => {
  const p = pricing || { WIDTH_SURCHARGES: { "36-40": 10, "41-55": 20, "56-70": 40, "71-88": 60 } };
  const w = parseUnits(width);
  if (w > 35 && w <= 40) return p.WIDTH_SURCHARGES["36-40"];
  if (w > 40 && w <= 55) return p.WIDTH_SURCHARGES["41-55"];
  if (w > 55 && w <= 70) return p.WIDTH_SURCHARGES["56-70"];
  if (w > 70 && w <= 88) return p.WIDTH_SURCHARGES["71-88"];
  if (w > 88) return 75;
  return 0;
};

// Height surcharge based on inches (uses pricing snapshot)
const getHeightSurcharge = (height, pricing = null) => {
  const p = pricing || { HEIGHT_SURCHARGE: 37 };
  const h = parseUnits(height);
  if (h > 90) return p.HEIGHT_SURCHARGE;
  return 0;
};

const parseUnits = (input) => {
  if (!input) return 0;
  input = input.trim().toUpperCase();
  
  // Match formats: 3'6", 3ft6in, 3ft 6in, 8' 8", etc. - CHECK THIS FIRST!
  const feetInchMatch = input.match(/(\d+)\s*['ft]*\s*(\d+)\s*['"]/);
  if (feetInchMatch) {
    const feet = parseInt(feetInchMatch[1]);
    const inches = parseInt(feetInchMatch[2]);
    return feet * 12 + inches;
  }
  
  // Handle format like "83in 12/16" or "83 12/16" or "83.75"
  const fractionalMatch = input.match(/(\d+)\s*(?:in|")?(?:\s+(\d+)\/(\d+))?/);
  if (fractionalMatch && !input.includes("'") && !input.includes("FT")) {
    const inches = parseInt(fractionalMatch[1]) || 0;
    const numerator = fractionalMatch[2] ? parseInt(fractionalMatch[2]) : 0;
    const denominator = fractionalMatch[3] ? parseInt(fractionalMatch[3]) : 1;
    const fraction = denominator > 0 ? numerator / denominator : 0;
    return inches + fraction;
  }
  
  // Match just inches or feet
  const justNumberMatch = input.match(/(\d+)/);
  if (justNumberMatch) {
    const num = parseInt(justNumberMatch[1]);
    if (input.includes("'") || input.includes('FT')) {
      return num * 12;
    }
    return num;
  }
  
  return 0;
};

export default function BlindsQuoteApp() {
  const [currentView, setCurrentView] = useState('menu');
  const [quotes, setQuotes] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedClients, setExpandedClients] = useState({});
  const [selectedVersions, setSelectedVersions] = useState(new Set());
  const [editingQuote, setEditingQuote] = useState(null);
  const [lastWidth, setLastWidth] = useState('');
  const [lastHeight, setLastHeight] = useState('');

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

  useEffect(() => {
    const saved = localStorage.getItem('blindsQuotes');
    if (saved) setQuotes(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('blindsQuotes', JSON.stringify(quotes));
  }, [quotes]);

  const getFabricPrice = (fabricNum, blindType, cordless, fabricData = null) => {
    const data = fabricData || PRICING_DATA; // Use stored or current pricing
    
    for (const type of Object.keys(data)) {
      const fabric = data[type].find(f => f.number === fabricNum);
      if (fabric) {
        if (type === 'Bamboo') {
          if (blindType === 'Bamboo (Roller)') return fabric.roller_manual;
          if (blindType === 'Bamboo (Roman)') return fabric.roman_manual;
        } else {
          return cordless ? fabric.cordless : fabric.manual;
        }
      }
    }
    return 0;
  };

  const calculateGroupCost = (group, fabricNumbers, blindType, pricing = null) => {
    // Build pricing object with fallbacks
    const p = pricing || {};
    
    // Always ensure we have PRICING_DATA (use current as fallback)
    const fabricData = p.PRICING_DATA || PRICING_DATA;
    
    // Defensive fallbacks for critical values
    const miscExpense = typeof p.MISC_EXPENSE === 'number' ? p.MISC_EXPENSE : 4.50;
    const shippingCost = typeof p.SHIPPING_COST === 'number' ? p.SHIPPING_COST : 42;
    
    const width = parseUnits(group.width);
    const height = parseUnits(group.height);
    const quantity = parseInt(group.quantity) || 1;
    const cordless = group.controlType === 'Cordless';
    
    const area = Math.max(1.5, (width * height) / 1550);
    
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
        // Fallback if no prices found - use safe estimate
        return {
          minCost: (area * 14.92 + miscExpense + shippingCost) * quantity,
          maxCost: (area * 20.38 + miscExpense + shippingCost) * quantity,
          isRange: true
        };
      }
      
      const minPrice = Math.min(...allPrices);
      const maxPrice = Math.max(...allPrices);
      
      return {
        minCost: (area * minPrice + miscExpense + shippingCost) * quantity,
        maxCost: (area * maxPrice + miscExpense + shippingCost) * quantity,
        isRange: true
      };
    } else {
      const costs = fabricNumbers.map(fabricNum => {
        const price = getFabricPrice(fabricNum, blindType, cordless, fabricData);
        if (price > 0) {
          return (area * price + miscExpense + shippingCost) * quantity;
        }
        return null;
      }).filter(c => c !== null);
      
      if (costs.length === 0) {
        // If no valid costs found, show range
        return {
          minCost: (area * 14.92 + miscExpense + shippingCost) * quantity,
          maxCost: (area * 20.38 + miscExpense + shippingCost) * quantity,
          isRange: true
        };
      }
      
      return {
        minCost: Math.min(...costs),
        maxCost: Math.max(...costs),
        isRange: costs.length > 1
      };
    }
  };

  const calculateGroupQuote = (group, fabricNumbers, blindType, totalMotorizedInRoom, pricing = null) => {
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
    
    // Add width and height surcharges
    const widthSurcharge = getWidthSurcharge(group.width, p);
    const heightSurcharge = getHeightSurcharge(group.height, p);
    const calculatedSurcharge = widthSurcharge + heightSurcharge;
    
    // Use override if provided, otherwise use calculated
    const surchargePerWindow = group.surchargeOverride !== null ? group.surchargeOverride : calculatedSurcharge;
    
    if (group.controlType === 'Motor') {
      const remoteType = totalMotorizedInRoom > 6 ? p.REMOTE_16CH : p.REMOTE_6CH;
      profitPerWindow += p.MOTOR_COST_CLIENT - p.MOTOR_COST_SUPPLIER - (remoteType / totalMotorizedInRoom);
    }
    
    if (group.solar) {
      profitPerWindow += p.SOLAR_COST_CLIENT - p.SOLAR_COST_SUPPLIER;
    }
    
    // Calculate final values
    const minQuote = cost.minCost + (profitPerWindow * quantity) + (surchargePerWindow * quantity);
    const maxQuote = cost.maxCost + (profitPerWindow * quantity) + (surchargePerWindow * quantity);
    
    // Validate and fallback for NaN
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
      isOverridden: group.surchargeOverride !== null
    };
  };

  const getNextVersion = (clientName, location) => {
    const clientQuotes = quotes.filter(q => q.clientName === clientName && q.location === location);
    if (clientQuotes.length === 0) return 1;
    const versions = clientQuotes.map(q => parseInt(q.version.replace('v', '')));
    return Math.max(...versions) + 1;
  };

  const generateQuote = () => {
    if (!formData.clientName || !formData.clientPhone) {
      alert('Please fill client name and phone');
      return;
    }

    // Get all selected blind types (or default to Roller)
    const selectedBlindTypes = formData.rooms[0]?.blindTypes || ['Roller'];
    
    // Calculate version ONCE for all blind types
    const newVersion = `v${getNextVersion(formData.clientName, formData.location)}`;
    
    // Capture pricing snapshot once for all quotes
    const pricingSnapshot = getPricingSnapshot();
    
    // Create a quote for EACH selected blind type (all with same version)
    const newQuotes = selectedBlindTypes.map((blindType, idx) => {
      const quoteName = `${formData.clientName}-${formData.location}-${blindType}-quote-${newVersion}`;
      
      // Create a copy of formData with only this blind type
      const quoteFormData = {
        ...formData,
        rooms: formData.rooms.map(room => ({
          ...room,
          blindTypes: [blindType] // Only this blind type for this quote
        }))
      };

      return {
        id: editingQuote ? editingQuote.id + idx : Date.now() + idx,
        quoteName: quoteName,
        version: newVersion,
        ...quoteFormData,
        pricing: pricingSnapshot,
        createdDate: editingQuote ? editingQuote.createdDate : new Date().toISOString(),
        updatedDate: new Date().toISOString(),
        status: 'quote'
      };
    });

    if (editingQuote) {
      // Create new versions without archiving - keep all versions visible
      setQuotes([...quotes, ...newQuotes]);
      const typeList = selectedBlindTypes.join(', ');
      alert(`✅ Quote updated successfully! Created ${selectedBlindTypes.length} quote(s) for: ${typeList}`);
    } else {
      setQuotes([...quotes, ...newQuotes]);
      const typeList = selectedBlindTypes.join(', ');
      alert(`✅ Created ${selectedBlindTypes.length} quote file(s)!\n\n${typeList}`);
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

          {selectedVersions.size > 0 && (
            <button onClick={() => {
              if (window.confirm(`Delete ${selectedVersions.size} version(s)? This cannot be undone.`)) {
                setQuotes(quotes.filter(q => !selectedVersions.has(q.id)));
                setSelectedVersions(new Set());
                alert('✅ Versions deleted successfully!');
              }
            }} style={{ width: '100%', padding: '12px', marginBottom: '16px', borderRadius: '8px', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
              Delete {selectedVersions.size} Selected
            </button>
          )}

          {activeQuotes.length === 0 ? (
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
      let totalMin = 0, totalMax = 0, totalProfit = 0;

      rooms.forEach(room => {
        const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
        
        room.windowGroups.forEach(group => {
          const motorizedCount = room.windowGroups.filter(w => w.controlType === 'Motor').length;
          const q = calculateGroupQuote(group, fabricNumbers, (room.blindTypes || ['Roller'])[0], motorizedCount, storedPricing);
          
          // Safety check for NaN
          if (isNaN(q.minQuote) || isNaN(q.maxQuote)) {
            console.error('NaN detected in quote calculation:', { group, q });
            return;
          }
          
          totalMin += q.minQuote;
          totalMax += q.maxQuote;
          totalProfit += q.profit;
        });
      });

      const taxRate = storedPricing?.SALES_TAX_RATE || SALES_TAX_RATE;
      const taxMin = totalMin * taxRate;
      const taxMax = totalMax * taxRate;
      const grandMin = totalMin + taxMin;
      const grandMax = totalMax + taxMax;

    const copyText = (() => {
      let text = `QUOTE - ${BUSINESS_NAME}\n\nClient: ${selectedQuote.clientName}\nPhone: ${selectedQuote.clientPhone}\nLocation: ${selectedQuote.location}\nDate: ${selectedQuote.date}\n\n`;
      
      let totalWindows = 0;
      
      text += `ROOMS:\n${'━'.repeat(50)}\n`;
      rooms.forEach(room => {
        let roomWindowCount = 0;
        const controlTypes = new Set();
        
        room.windowGroups.forEach(group => {
          const qty = parseInt(group.quantity) || 1;
          roomWindowCount += qty;
          totalWindows += qty;
          const controlLabel = group.controlType || 'Manual';
          controlTypes.add(controlLabel);
        });
        
        const controlList = Array.from(controlTypes).join(', ');
        text += `${room.name} (${roomWindowCount} windows) - ${controlList}\n`;
      });
      
      text += `\n${'━'.repeat(50)}\n`;
      text += `TOTAL WINDOWS: ${totalWindows}\n\n`;
      text += `OVERALL QUOTE: $${totalMin.toFixed(0)} - $${totalMax.toFixed(0)}\n`;
      text += `(Includes width & height surcharges)\n`;
      text += `Sales Tax (8.25%): $${taxMin.toFixed(0)} - $${taxMax.toFixed(0)}\n`;
      text += `GRAND TOTAL: $${grandMin.toFixed(0)} - $${grandMax.toFixed(0)}`;
      
      return text;
    })();

    return (
      <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff' }}>{selectedQuote.quoteName}</h3>
            <button onClick={() => setSelectedQuote(null)} style={{ fontSize: '24px', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Pricing Details Section - Only show if pricing snapshot exists */}
          {storedPricing && storedPricing.PROFIT_PER_WINDOW && (
            <div style={{ borderRadius: '8px', marginBottom: '24px', background: '#1a3a3a', border: '1px solid #4a7a6a', padding: '16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#d4af37', marginBottom: '12px' }}>📋 PRICING DETAILS (Used for this quote)</p>
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
            </div>
          )}

          {/* Current Pricing Comparison */}
          {storedPricing && storedPricing.WIDTH_SURCHARGES && (
            <div style={{ borderRadius: '8px', marginBottom: '24px', background: '#2a2a1a', border: '1px solid #6a6a4a', padding: '16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#f4e4c1', marginBottom: '12px' }}>⚠️ CURRENT PRICING (For comparison)</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', fontSize: '11px' }}>
                <div>
                  <p style={{ color: '#888', marginBottom: '4px' }}>Profit Per Window:</p>
                  <p style={{ color: storedPricing.PROFIT_PER_WINDOW === 60 ? '#aaa' : '#ffaa00', fontWeight: 'bold' }}>${60}</p>
                  {storedPricing.PROFIT_PER_WINDOW !== 60 && <p style={{ color: '#ff6666', fontSize: '10px' }}>Changed: ${storedPricing.PROFIT_PER_WINDOW} → $60</p>}
                </div>
                <div>
                  <p style={{ color: '#888', marginBottom: '4px' }}>Width Surcharge (41-55"):</p>
                  <p style={{ color: (storedPricing.WIDTH_SURCHARGES?.["41-55"] ?? 45) === 45 ? '#aaa' : '#ffaa00', fontWeight: 'bold' }}>${45}</p>
                  {(storedPricing.WIDTH_SURCHARGES?.["41-55"] ?? 45) !== 45 && <p style={{ color: '#ff6666', fontSize: '10px' }}>Changed: ${storedPricing.WIDTH_SURCHARGES?.["41-55"] ?? 45} → $45</p>}
                </div>
                <div>
                  <p style={{ color: '#888', marginBottom: '4px' }}>Height Surcharge (&gt;90"):</p>
                  <p style={{ color: (storedPricing.HEIGHT_SURCHARGE ?? 37) === 37 ? '#aaa' : '#ffaa00', fontWeight: 'bold' }}>${37}</p>
                  {(storedPricing.HEIGHT_SURCHARGE ?? 37) !== 37 && <p style={{ color: '#ff6666', fontSize: '10px' }}>Changed: ${storedPricing.HEIGHT_SURCHARGE ?? 37} → $37</p>}
                </div>
              </div>
            </div>
          )}

          <div style={{ borderRadius: '8px', marginBottom: '32px', background: '#2a2a2a', border: '1px solid #444', overflowX: 'auto' }}>
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
                  
                  return room.windowGroups.map((group, groupIdx) => {
                    const q = calculateGroupQuote(group, fabricNumbers, (room.blindTypes || ['Roller'])[0], room.windowGroups.filter(w => w.controlType === 'Motor').length, storedPricing);
                    const motorType = group.controlType || 'Manual';
                    const quantity = parseInt(group.quantity) || 1;
                    const perWindowMin = q.minQuote / quantity;
                    const perWindowMax = q.maxQuote / quantity;
                    
                    return (
                      <tr key={`${roomIdx}-${groupIdx}`} style={{ borderBottom: '1px solid #444' }}>
                        <td style={{ padding: '8px', color: '#fff' }}>{room.name}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#ccc' }}>{group.quantity}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#ccc' }}>{group.width}x{group.height}</td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#ccc' }}>{motorType}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#d4af37', fontWeight: '600' }}>${perWindowMin.toFixed(0)}-${perWindowMax.toFixed(0)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#fff' }}>${q.minQuote.toFixed(0)}-${q.maxQuote.toFixed(0)}</td>
                      </tr>
                    );
                  });
                })}
                <tr style={{ background: '#1a3a3a', borderTop: '2px solid #d4af37', fontWeight: 'bold' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>TOTAL:</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>${totalMin.toFixed(0)}-${totalMax.toFixed(0)}</td>
                </tr>
                <tr style={{ background: '#2a4a2a' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#aaa', fontSize: '12px' }}>Surcharges (Width + Height):</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#aaa', fontSize: '12px' }}>Included</td>
                </tr>
                <tr style={{ background: '#1a3a3a' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}>Tax (8.25%):</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#aaa' }}>${taxMin.toFixed(0)}-${taxMax.toFixed(0)}</td>
                </tr>
                <tr style={{ background: '#2a5a2a', fontWeight: 'bold' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>GRAND TOTAL:</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>${grandMin.toFixed(0)}-${grandMax.toFixed(0)}</td>
                </tr>
                <tr style={{ background: '#3a3a2a', fontWeight: 'bold' }}>
                  <td colSpan="4" style={{ padding: '8px', textAlign: 'right', color: '#fff' }}>YOUR PROFIT:</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#ffd700' }}>${totalProfit.toFixed(0)}</td>
                </tr>
              </tbody>
            </table>
          </div>

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
                setQuotes(quotes.filter(q => q.id !== selectedQuote.id));
                setSelectedQuote(null);
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

  const renderStatistics = () => {
    const activeQuotes = quotes.filter(q => !q.archived);
    const stats = { monthlyStats: {}, totalProfit: 0, totalQuotes: 0, pendingOrders: 0 };
    
    activeQuotes.forEach(quote => {
      const date = new Date(quote.createdDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!stats.monthlyStats[monthKey]) {
        stats.monthlyStats[monthKey] = { quotes: 0, profit: 0 };
      }

      stats.monthlyStats[monthKey].quotes += 1;
      stats.totalQuotes += 1;

      let quoteProfit = 0;
      quote.rooms.forEach(room => {
        const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
        const motorizedCount = room.windowGroups.filter(w => w.controlType === 'Motor').length;
        
        room.windowGroups.forEach(group => {
          const q = calculateGroupQuote(group, fabricNumbers, (room.blindTypes || ['Roller'])[0], motorizedCount, quote.pricing || null);
          quoteProfit += q.profit;
        });
      });

      stats.monthlyStats[monthKey].profit += quoteProfit;
      stats.totalProfit += quoteProfit;
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    activeQuotes.forEach(quote => {
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

        {formData.rooms.map((room, roomIndex) => (
          <div key={room.id} style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', padding: '24px', marginBottom: '24px' }}>
            <input type="text" placeholder="Room Name (e.g., Living Room)" value={room.name} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].name = e.target.value; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontWeight: 'bold', fontSize: '16px', background: '#1a1a1a', border: '1px solid #d4af37', color: 'white' }} />

            <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Fabric Numbers (comma-separated, or leave blank for Min/Max):</p>
            <input type="text" placeholder="e.g., 82086K, 82067E (or leave blank)" value={room.fabricInput} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].fabricInput = e.target.value; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', background: '#1a1a1a', border: '1px solid #666', color: 'white' }} />

            {!room.fabricInput.trim() && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#888', marginBottom: '8px' }}>Blind Type (for Min/Max calculation) - Select one or more:</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {['Roller', 'Zebra', 'Roman', 'Bamboo (Roller)', 'Bamboo (Roman)'].map(type => (
                    <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '6px', background: '#1a1a1a', cursor: 'pointer', fontSize: '14px', color: '#ccc' }}>
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
            )}

            <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#ccc', marginBottom: '12px' }}>Window Groups:</p>

            {room.windowGroups.map((group, groupIndex) => (
              <div key={group.id} style={{ background: '#1a1a1a', padding: '12px', borderRadius: '8px', marginBottom: '12px', border: '1px solid #555' }}>
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

                <div style={{ padding: '8px', borderRadius: '6px', background: '#2a3a2a', marginBottom: '8px', border: '1px solid #4a6a4a' }}>
                  <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#aaa', marginBottom: '6px' }}>Surcharge Override (Optional)</p>
                  <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>Auto: ${(() => { try { const widthVal = (group.width || '').trim(); const heightVal = (group.height || '').trim(); const w = widthVal ? getWidthSurcharge(widthVal) : 0; const h = heightVal ? getHeightSurcharge(heightVal) : 0; const total = w + h; return isNaN(total) ? '0' : total.toFixed(0); } catch(e) { console.error('Surcharge calc error:', e); return '0'; } })()} {group.surchargeOverride !== null && `→ Overridden: $${group.surchargeOverride.toFixed(0)}`}</p>
                  <input type="number" placeholder="Leave blank to use auto-calculated" value={group.surchargeOverride !== null ? group.surchargeOverride : ''} onChange={(e) => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].surchargeOverride = e.target.value === '' ? null : parseFloat(e.target.value) || 0; setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '6px', borderRadius: '4px', fontSize: '12px', background: '#1a1a1a', border: '1px solid #555', color: 'white', marginBottom: '6px' }} />
                  <button onClick={() => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups[groupIndex].surchargeOverride = null; setFormData({...formData, rooms: newRooms}); }} style={{ fontSize: '10px', padding: '4px 8px', background: 'transparent', color: '#888', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}>Reset to Auto</button>
                </div>

                <button onClick={() => { const newRooms = [...formData.rooms]; newRooms[roomIndex].windowGroups.splice(groupIndex, 1); setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '8px', marginTop: '8px', borderRadius: '4px', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Trash2 size={14} /> Delete This Window Group
                </button>
              </div>
            ))}

            <button onClick={() => { const newRooms = [...formData.rooms]; const newWindowId = Math.max(...newRooms[roomIndex].windowGroups.map(w => w.id)) + 1; newRooms[roomIndex].windowGroups.push({ id: newWindowId, quantity: '', width: lastWidth, height: lastHeight, controlType: 'Manual', solar: false, mount: 'Inside', surchargeOverride: null }); setFormData({...formData, rooms: newRooms}); }} style={{ width: '100%', padding: '12px', borderRadius: '4px', color: '#888', fontWeight: 'bold', fontSize: '16px', background: 'transparent', border: '2px dashed #666', cursor: 'pointer' }}>+ Add Window Group</button>
          </div>
        ))}

        <button onClick={() => { const newRoomId = Math.max(...formData.rooms.map(r => r.id), 0) + 1; setFormData({...formData, rooms: [...formData.rooms, { id: newRoomId, name: '', fabricInput: '', blindTypes: ['Roller'], windowGroups: [{ id: 1, quantity: '', width: lastWidth, height: lastHeight, controlType: 'Manual', solar: false, mount: 'Inside', surchargeOverride: null }] }]}); }} style={{ width: '100%', padding: '16px', borderRadius: '4px', color: '#888', fontWeight: 'bold', fontSize: '16px', background: 'transparent', border: '2px dashed #666', cursor: 'pointer', marginBottom: '32px' }}>+ Add Room</button>

        <button onClick={generateQuote} style={{ width: '100%', padding: '16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', background: '#d4af37', color: '#000', border: 'none', cursor: 'pointer' }}>{editingQuote ? 'Save as New Version' : 'Generate Quote'}</button>
      </div>
    </div>
  );

  return (
    <div>
      {currentView === 'menu' && renderMenu()}
      {currentView === 'quote' && renderQuoteForm()}
      {currentView === 'history' && renderHistory()}
      {currentView === 'statistics' && renderStatistics()}
    </div>
  );
}
