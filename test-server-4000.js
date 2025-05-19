const express = require('express');
const path = require('path');
const app = express();

// JSON parsing middleware
app.use(express.json());

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Serve the camera demo files
app.use('/camera', express.static(path.join(__dirname, 'src/frontend/public/camera')));

// Simple test endpoint
app.get('/test', (req, res) => {
  res.send('Server is working!');
});

// Add the missing chat endpoint
app.post('/api/ingestion/chat', (req, res) => {
  console.log('Received chat message:', JSON.stringify(req.body, null, 2));
  res.status(202).json({
    success: true,
    message: 'Event accepted'
  });
});

// Start the server
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log(`Camera demo should be at http://localhost:${PORT}/camera/`);
}); 