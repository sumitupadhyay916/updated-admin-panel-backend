const { createApp } = require('./app');
const { env } = require('./config/env');
const { startReservationCleanupJob } = require('./services/reservationCleanupJob');

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${env.port}`);

  // Start background reservation cleanup (expires stale reservations every 60s)
  startReservationCleanupJob();
});


