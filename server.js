const app = require("./app");
const { startRappelsJob } = require("./jobs/rappels.job"); // adapte el chemin

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Serveur prêt sur le port ${PORT}`);
  startRappelsJob(); // lance node-cron
});

process.on('SIGINT', () => {
  console.log('Received SIGINT. Graceful shutdown...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Graceful shutdown...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});