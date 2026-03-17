/**
 * reservationCleanupJob.js
 *
 * Background cron job that runs every minute.
 * Finds reservations where status = "active" and expiresAt < now,
 * and marks them as "expired" to logically release the stock.
 *
 * Start this job once when the server boots (called from server.js or app.js).
 */

const { cleanupExpiredReservations } = require('../services/reservationService');

let _jobInterval = null;

/**
 * Starts the cleanup job. Runs every 60 seconds.
 * Safe to call multiple times — will only start one instance.
 */
function startReservationCleanupJob() {
  if (_jobInterval) return; // already running

  // Run immediately once on startup, then every 60s
  cleanupExpiredReservations().catch((err) =>
    console.error('[ReservationCleanup] Error on startup run:', err)
  );

  _jobInterval = setInterval(() => {
    cleanupExpiredReservations().catch((err) =>
      console.error('[ReservationCleanup] Error in interval:', err)
    );
  }, 60 * 1000); // every 60 seconds

  console.log('[ReservationCleanup] Cleanup job started (runs every 60s)');
}

/**
 * Stops the cleanup job. Useful for graceful shutdown or tests.
 */
function stopReservationCleanupJob() {
  if (_jobInterval) {
    clearInterval(_jobInterval);
    _jobInterval = null;
    console.log('[ReservationCleanup] Cleanup job stopped');
  }
}

module.exports = { startReservationCleanupJob, stopReservationCleanupJob };
