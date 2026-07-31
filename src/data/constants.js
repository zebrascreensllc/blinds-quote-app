// Business constants for Zebra Screens & Rollers

export const BUSINESS_NAME = 'Zebra Screens & Rollers';

// Pricing snapshot (stored with each quote for consistency)
export const getPricingSnapshot = () => ({
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
  CREATED_DATE: new Date().toISOString()
});

// Fabric wrap cost (added to all supplier calculations)
export const FABRIC_WRAP_COST_PER_SQM = 2; // $2 per sq meter

// Minimum area for quotes
export const MINIMUM_AREA = 1.5; // sq meters

// Area calculation factor
export const AREA_CALC_FACTOR = 1550; // (Width × Height) ÷ 1550 = Area

// Sales tax rate
export const SALES_TAX_RATE = 0.0825; // 8.25%

// Blind type options
export const BLIND_TYPES = ['Roller', 'Zebra', 'Roman', 'Bamboo (Roller)', 'Bamboo (Roman)'];

// Default control types
export const CONTROL_TYPES = ['Manual', 'Motor', 'Cordless'];

// Mount options
export const MOUNT_OPTIONS = ['Inside', 'Outside'];
