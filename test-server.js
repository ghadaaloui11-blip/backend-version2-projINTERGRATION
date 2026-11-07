const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({ message: 'Server is running', timestamp: new Date().toISOString() }));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Simple server running on port ${PORT}`);
  console.log(`Test endpoint: http://localhost:${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});