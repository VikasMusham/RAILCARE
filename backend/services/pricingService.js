/**
 * Pricing Service - Server-side price calculations
 * 
 * ARCHITECTURE RULES:
 * - Pricing decides money
 * - Controllers validate and orchestrate
 * - All monetary calculations happen here
 * - Frontend MUST NOT calculate final prices
 */

// Luggage pricing configuration (₹ per item)
const LUGGAGE_PRICES = {
  none: 0,
  small: 30,   // Backpack, handbag - up to 5kg
  medium: 60,  // Suitcase, duffel bag - up to 10kg
  large: 100   // Large trunk, multiple heavy bags - above 10kg
};

// Luggage weight guidance (for UI display)
const LUGGAGE_WEIGHT_INFO = {
  small: { maxWeight: 5, label: 'Up to 5kg', description: 'Backpack / Cabin Bag' },
  medium: { maxWeight: 10, label: 'Up to 10kg', description: 'Standard Suitcase' },
  large: { maxWeight: null, label: 'Above 10kg', description: 'Heavy Suitcase / Trunk' }
};

// Service base prices
// NOTE: 'Luggage' service fee REMOVED - luggage pricing is ALL-INCLUSIVE
// based on size (small: ₹30, medium: ₹60, large: ₹100) × quantity
const SERVICE_PRICES = {
  'Luggage': 0,    // All-inclusive in LUGGAGE_PRICES
  'SeatEscort': 60,
  'Language': 30
};

// Platform fee
const PLATFORM_FEE = 10;
const INSURANCE_COST = 0.45;

// Round trip multiplier
const ROUND_TRIP_MULTIPLIER = 2;

// Max luggage quantity allowed
const MAX_LUGGAGE_QUANTITY = 8;

/**
 * Calculate luggage cost based on size and quantity
 * @param {string} size - 'none', 'small', 'medium', 'large'
 * @param {number} quantity - Number of luggage items (0-8)
 * @returns {Object} { luggageCost, pricePerItem, validated }
 */
function calculateLuggageCost(size, quantity) {
  // Validate size
  const validSizes = Object.keys(LUGGAGE_PRICES);
  const normalizedSize = validSizes.includes(size) ? size : 'none';
  
  // Validate quantity - enforce integer, non-negative, max limit
  let validQuantity = parseInt(quantity, 10);
  if (isNaN(validQuantity) || validQuantity < 0) {
    validQuantity = 0;
  }
  if (validQuantity > MAX_LUGGAGE_QUANTITY) {
    validQuantity = MAX_LUGGAGE_QUANTITY;
  }
  
  // If size is 'none', quantity must be 0
  if (normalizedSize === 'none') {
    validQuantity = 0;
  }
  
  // If quantity is 0, cost must be 0
  const pricePerItem = LUGGAGE_PRICES[normalizedSize];
  const luggageCost = validQuantity === 0 ? 0 : pricePerItem * validQuantity;
  
  return {
    luggageCost,
    pricePerItem,
    size: normalizedSize,
    quantity: validQuantity,
    validated: true
  };
}

/**
 * Calculate cost for multi-luggage cart system
 * @param {Array} luggageItems - Array of { type, quantity }
 * @returns {Object} { items, totalCost, validated, errors }
 */
function calculateMultiLuggageCost(luggageItems = []) {
  if (!Array.isArray(luggageItems) || luggageItems.length === 0) {
    return {
      items: [],
      totalCost: 0,
      validated: true,
      errors: []
    };
  }
  
  const errors = [];
  const validTypes = ['small', 'medium', 'large'];
  const processedItems = [];
  let totalCost = 0;
  
  luggageItems.forEach((item, index) => {
    // Validate type
    if (!item.type || !validTypes.includes(item.type)) {
      errors.push(`Item ${index + 1}: Invalid luggage type "${item.type}"`);
      return;
    }
    
    // Validate quantity
    let qty = parseInt(item.quantity, 10);
    if (isNaN(qty) || qty < 1) {
      errors.push(`Item ${index + 1}: Quantity must be at least 1`);
      return;
    }
    if (qty > MAX_LUGGAGE_QUANTITY) {
      qty = MAX_LUGGAGE_QUANTITY;
    }
    
    const pricePerUnit = LUGGAGE_PRICES[item.type];
    const itemTotal = pricePerUnit * qty;
    
    processedItems.push({
      type: item.type,
      quantity: qty,
      pricePerUnit,
      totalPrice: itemTotal,
      weightInfo: LUGGAGE_WEIGHT_INFO[item.type]
    });
    
    totalCost += itemTotal;
  });
  
  return {
    items: processedItems,
    totalCost,
    validated: errors.length === 0,
    errors
  };
}

/**
 * Validate multi-luggage cart items
 * @param {Array} luggageItems 
 * @returns {Object} { valid, errors, sanitized }
 */
function validateMultiLuggageInput(luggageItems) {
  const errors = [];
  const sanitized = [];
  const validTypes = ['small', 'medium', 'large'];
  
  if (!Array.isArray(luggageItems)) {
    return { valid: true, errors: [], sanitized: [] };
  }
  
  // Check for empty items
  const nonEmptyItems = luggageItems.filter(item => item && item.type && item.quantity > 0);
  
  nonEmptyItems.forEach((item, index) => {
    // Validate type
    if (!validTypes.includes(item.type)) {
      errors.push(`Invalid luggage type: ${item.type}`);
      return;
    }
    
    // Validate quantity
    const qty = parseInt(item.quantity, 10);
    if (isNaN(qty) || qty < 1) {
      errors.push(`Quantity for ${item.type} must be at least 1`);
      return;
    }
    if (qty > MAX_LUGGAGE_QUANTITY) {
      errors.push(`Quantity for ${item.type} cannot exceed ${MAX_LUGGAGE_QUANTITY}`);
      return;
    }
    
    // Check for duplicates (merge same types)
    const existing = sanitized.find(s => s.type === item.type);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + qty, MAX_LUGGAGE_QUANTITY);
    } else {
      sanitized.push({
        type: item.type,
        quantity: qty
      });
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Calculate total booking price
 * Supports both legacy (single size/quantity) and new multi-luggage cart system
 * @param {Object} params - Booking parameters
 * @returns {Object} Price breakdown
 */
function calculateTotalPrice({
  services = [],
  luggageSize = 'none',
  luggageQuantity = 0,
  luggageItems = [],      // NEW: multi-luggage cart array
  serviceType = 'pickup',
  includeInsurance = false
}) {
  // Calculate services total
  let servicesTotal = 0;
  const serviceBreakdown = [];
  
  services.forEach(svc => {
    const price = SERVICE_PRICES[svc] || 0;
    if (price > 0) {
      servicesTotal += price;
      serviceBreakdown.push({ service: svc, price });
    }
  });
  
  // Calculate luggage cost - prefer new multi-luggage system if provided
  let luggageBreakdown;
  let totalLuggageCost = 0;
  
  if (Array.isArray(luggageItems) && luggageItems.length > 0) {
    // NEW: Multi-luggage cart calculation
    const multiCalc = calculateMultiLuggageCost(luggageItems);
    luggageBreakdown = {
      mode: 'multi',
      items: multiCalc.items,
      totalCost: multiCalc.totalCost
    };
    totalLuggageCost = multiCalc.totalCost;
  } else {
    // LEGACY: Single size/quantity calculation
    const legacyCalc = calculateLuggageCost(luggageSize, luggageQuantity);
    luggageBreakdown = {
      mode: 'legacy',
      size: legacyCalc.size,
      quantity: legacyCalc.quantity,
      pricePerItem: legacyCalc.pricePerItem,
      cost: legacyCalc.luggageCost
    };
    totalLuggageCost = legacyCalc.luggageCost;
  }
  
  // Base subtotal (services + luggage + platform fee)
  let subtotal = servicesTotal + totalLuggageCost + PLATFORM_FEE;
  
  // Round trip multiplier (applies to services and luggage, not platform fee)
  const isRoundTrip = serviceType === 'round_trip';
  let roundTripMultiplier = 1;
  
  if (isRoundTrip) {
    roundTripMultiplier = ROUND_TRIP_MULTIPLIER;
    // Only multiply services and luggage, platform fee stays same
    subtotal = (servicesTotal + totalLuggageCost) * ROUND_TRIP_MULTIPLIER + PLATFORM_FEE;
  }
  
  // Insurance
  const insuranceCost = includeInsurance ? INSURANCE_COST : 0;
  const total = subtotal + insuranceCost;
  
  return {
    breakdown: {
      services: serviceBreakdown,
      servicesTotal,
      luggage: luggageBreakdown,
      platformFee: PLATFORM_FEE,
      roundTripMultiplier: isRoundTrip ? ROUND_TRIP_MULTIPLIER : 1,
      roundTripApplied: isRoundTrip,
      insuranceCost,
      includeInsurance
    },
    luggageCost: totalLuggageCost * roundTripMultiplier,
    subtotal,
    total: parseFloat(total.toFixed(2))
  };
}

/**
 * Validate luggage input
 * @param {string} size 
 * @param {number} quantity 
 * @returns {Object} { valid, errors, sanitized }
 */
function validateLuggageInput(size, quantity) {
  const errors = [];
  
  // Validate size
  const validSizes = ['none', 'small', 'medium', 'large'];
  if (size && !validSizes.includes(size)) {
    errors.push(`Invalid luggage size: ${size}. Must be one of: ${validSizes.join(', ')}`);
  }
  
  // Validate quantity
  const qty = parseInt(quantity, 10);
  if (quantity !== undefined && quantity !== null && quantity !== '') {
    if (isNaN(qty)) {
      errors.push('Luggage quantity must be a number');
    } else if (qty < 0) {
      errors.push('Luggage quantity cannot be negative');
    } else if (qty > MAX_LUGGAGE_QUANTITY) {
      errors.push(`Luggage quantity cannot exceed ${MAX_LUGGAGE_QUANTITY}`);
    } else if (!Number.isInteger(Number(quantity))) {
      errors.push('Luggage quantity must be a whole number');
    }
  }
  
  // Cross-validation: if size is not 'none', quantity should be >= 1
  if (size && size !== 'none' && (!qty || qty < 1)) {
    errors.push('Please specify luggage quantity when size is selected');
  }
  
  // If quantity > 0, size must be specified
  if (qty > 0 && (!size || size === 'none')) {
    errors.push('Please select a luggage size when quantity is specified');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      size: validSizes.includes(size) ? size : 'none',
      quantity: isNaN(qty) || qty < 0 ? 0 : Math.min(qty, MAX_LUGGAGE_QUANTITY)
    }
  };
}

/**
 * Get luggage display string for UI
 * @param {string} size 
 * @param {number} quantity 
 * @returns {string}
 */
function getLuggageDisplayString(size, quantity) {
  if (!size || size === 'none' || !quantity || quantity === 0) {
    return 'No luggage';
  }
  
  const sizeLabels = {
    small: 'Small',
    medium: 'Medium',
    large: 'Large'
  };
  
  const label = sizeLabels[size] || size;
  return `${label} × ${quantity}`;
}

/**
 * Get display string for multi-luggage cart
 * @param {Array} luggageItems 
 * @returns {string}
 */
function getMultiLuggageDisplayString(luggageItems) {
  if (!Array.isArray(luggageItems) || luggageItems.length === 0) {
    return 'No luggage';
  }
  
  const sizeLabels = {
    small: 'Small',
    medium: 'Medium', 
    large: 'Large'
  };
  
  return luggageItems
    .filter(item => item.quantity > 0)
    .map(item => `${sizeLabels[item.type] || item.type} ×${item.quantity}`)
    .join(', ');
}

/**
 * Get luggage info for assistant display
 * @param {Array} luggageItems 
 * @returns {Array} Formatted items with weight info
 */
function getLuggageAssistantInfo(luggageItems) {
  if (!Array.isArray(luggageItems) || luggageItems.length === 0) {
    return [];
  }
  
  return luggageItems.map(item => ({
    type: item.type,
    quantity: item.quantity,
    weightLabel: LUGGAGE_WEIGHT_INFO[item.type]?.label || '',
    description: LUGGAGE_WEIGHT_INFO[item.type]?.description || ''
  }));
}

module.exports = {
  LUGGAGE_PRICES,
  LUGGAGE_WEIGHT_INFO,
  SERVICE_PRICES,
  PLATFORM_FEE,
  INSURANCE_COST,
  MAX_LUGGAGE_QUANTITY,
  ROUND_TRIP_MULTIPLIER,
  calculateLuggageCost,
  calculateMultiLuggageCost,
  calculateTotalPrice,
  validateLuggageInput,
  validateMultiLuggageInput,
  getLuggageDisplayString,
  getMultiLuggageDisplayString,
  getLuggageAssistantInfo
};