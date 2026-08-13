// Parse various unit formats (feet, inches, fractional)
export const parseUnits = (input) => {
  if (!input) return 0;
  input = input.trim().toUpperCase();
  
  // Match formats: 3'6", 3ft6in, 3ft 6in, 8' 8", etc.
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

// Format price range (min-max) with $ symbol
export const formatPrice = (min, max) => {
  if (min === undefined || max === undefined || isNaN(min) || isNaN(max)) {
    return '$0';
  }
  const minRounded = Math.round(min);
  const maxRounded = Math.round(max);
  return minRounded === maxRounded ? `$${minRounded}` : `$${minRounded}-$${maxRounded}`;
};

// Format currency with 2 decimals
export const formatCurrency = (value) => {
  return typeof value === 'number' ? value.toFixed(2) : '0.00';
};

// Format a dollar amount, trimming trailing zeros (e.g. 42.50 -> "42.5", 42.00 -> "42")
export const formatMoney = (num) => {
  const val = parseFloat(num);
  if (isNaN(val)) return '0';
  return val.toFixed(2).replace(/\.?0+$/, '');
};

// True if v is a valid {min, max} custom range price override.
export const isRangeOverride = (v) => v !== null && typeof v === 'object' && typeof v.min === 'number' && typeof v.max === 'number';

// Formats either a plain number or a range override for display, including the "$" sign.
export const formatPriceOverride = (v) => isRangeOverride(v) ? formatPrice(v.min, v.max) : `$${formatMoney(v)}`;

// Filters raw text input down to valid decimal number text as the user types
// (digits + at most one decimal point + max 2 decimal places). A plain text
// input (not type="number") avoids known mobile Safari/Chrome bugs where
// number inputs "stick" or revert on backspace/decimal entry.
export const filterNumericText = (raw) => {
  if (raw === '') return '';
  let filtered = raw.replace(/[^0-9.]/g, '');
  const parts = filtered.split('.');
  if (parts.length > 2) {
    filtered = parts[0] + '.' + parts.slice(1).join('');
  }
  const dotIndex = filtered.indexOf('.');
  if (dotIndex !== -1 && filtered.length - dotIndex - 1 > 2) {
    filtered = filtered.slice(0, dotIndex + 3);
  }
  return filtered;
};

// Format date to readable string
export const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Generate unique ID
export const generateId = () => Math.random().toString(36).substr(2, 9);

// Create deep copy of object
export const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));
