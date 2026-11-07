const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/campagnes',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  console.log(`statusCode: ${res.statusCode}`);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Response:', data);
  });
});

req.on('error', (err) => {
  console.error('Error:', err.message);
});

req.on('timeout', () => {
  console.error('Request timed out');
  req.destroy();
});

req.end();