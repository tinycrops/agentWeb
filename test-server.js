const express = require('express');
const path = require('path');
const app = express();

// Serve the camera demo files
app.use('/camera', express.static(path.join(__dirname, 'src/frontend/public/camera')));

// Simple test endpoint
app.get('/test', (req, res) => {
  res.send('Server is working!');
});

// Start the server
const PORT = 3500;
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log(`Camera demo should be at http://localhost:${PORT}/camera/`);
}); 