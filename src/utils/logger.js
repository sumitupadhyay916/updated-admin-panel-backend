/**
 * Simple logger utility for security and application logging
 */

const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

function formatLog(level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

function info(message, metadata = {}) {
  console.log(formatLog(LOG_LEVELS.INFO, message, metadata));
}

function warn(message, metadata = {}) {
  console.warn(formatLog(LOG_LEVELS.WARN, message, metadata));
}

function error(message, metadata = {}) {
  console.error(formatLog(LOG_LEVELS.ERROR, message, metadata));
}

/**
 * Log authorization failures for security auditing
 * @param {Object} params - Authorization failure details
 * @param {string} params.userId - User ID attempting access
 * @param {string} params.role - User role
 * @param {string} params.operation - Operation attempted (list, view, update, delete)
 * @param {string} params.sellerId - Seller ID being accessed (optional for list operations)
 * @param {string} params.reason - Reason for denial
 */
function logAuthorizationFailure({ userId, role, operation, sellerId, reason }) {
  const message = `Authorization failure: User ${userId} (role: ${role}) attempted to ${operation} seller${sellerId ? ` ${sellerId}` : 's'}. Reason: ${reason}`;
  warn(message);
}

module.exports = {
  info,
  warn,
  error,
  logAuthorizationFailure,
};
