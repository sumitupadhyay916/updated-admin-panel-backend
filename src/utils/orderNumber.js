/**
 * Generate a unique order number
 * Format: ORD-YYYYMMDD-XXXXXX (where XXXXXX is a random 6-digit number)
 */
function generateOrderNumber() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(100000 + Math.random() * 900000);
  return `ORD-${dateStr}-${random}`;
}

module.exports = { generateOrderNumber };
