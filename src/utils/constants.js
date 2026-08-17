// Business & Pricing Constants
export const BUSINESS_NAME = 'Zebra Screens & Rollers';
export const SALES_TAX_RATE = 0.0825;

// Create pricing snapshot (captures current pricing)
export const getPricingSnapshot = () => ({
  PROFIT_PER_WINDOW: 60,
  MOTOR_COST_CLIENT: 80,
  MOTOR_COST_SUPPLIER: 50,
  SOLAR_COST_CLIENT: 40,
  SOLAR_COST_SUPPLIER: 22,
  HUB_COST: 65,
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

export const DEFAULT_HUB = { included: false, quantity: 1, price: 65 };

export const INITIAL_FORM_STATE = {
  clientName: '',
  clientPhone: '',
  location: '',
  date: new Date().toISOString().split('T')[0],
  hub: DEFAULT_HUB,
  rooms: [{
    id: 1,
    name: '',
    fabricInput: '',
    blindTypes: ['Roller'],
    windowGroups: [{
      id: 1,
      quantity: 1,
      width: '',
      height: '',
      controlType: 'Manual'
    }]
  }]
};

export const INITIAL_TABLE_EDIT_VALUES = {
  perWindowPrices: {},
  motorCost: 80,
  taxRate: 0.0825
};
