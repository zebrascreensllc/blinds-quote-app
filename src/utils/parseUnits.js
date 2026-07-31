// Parse width/height in various formats to inches
// Supports: inches, feet, feet+inches, fractions

/**
 * Convert various unit formats to inches
 * Supports: "35", "3'6", "8' 8\"", "83in 12/16"
 * @param {string} input - Width/height input string
 * @returns {number} Value in inches
 */
export const parseUnits = (input) => {
  if (!input) return 0;
  
  input = String(input).trim();
  
  // 1. Check feet+inches FIRST (e.g., 8' 8", 3'6)
  const feetInchMatch = input.match(/(\d+)\s*['ft]*\s*(\d+)\s*['"]/);
  if (feetInchMatch) {
    const feet = parseInt(feetInchMatch[1]);
    const inches = parseInt(feetInchMatch[2]);
    return feet * 12 + inches;
  }
  
  // 2. Fractional format (e.g., 83in 12/16 or just 12/16)
  // Only if no apostrophe or FT (to avoid confusing with feet)
  if (!input.includes("'") && !input.includes('FT')) {
    const fractionalMatch = input.match(/(\d+)\s*(?:in)?\s+(\d+)\/(\d+)/);
    if (fractionalMatch) {
      const wholePart = parseInt(fractionalMatch[1]);
      const numerator = parseInt(fractionalMatch[2]);
      const denominator = parseInt(fractionalMatch[3]);
      const fraction = numerator / denominator;
      return wholePart + fraction;
    }
  }
  
  // 3. Just a number
  const num = parseFloat(input);
  if (!isNaN(num)) {
    // If input includes ' multiply by 12 (convert feet to inches)
    if (input.includes("'") || input.includes("FT")) {
      return num * 12;
    }
    return num;
  }
  
  return 0;
};
