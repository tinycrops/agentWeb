/**
 * Main entry point for the AgentWeb backend
 * Initializes all core components and agents
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

// Core components
let FactStore, EventBroker, ViewMaterializer;

// Check if we should use mock implementations
const useMocks = process.env.USE_MOCKS === 'true' || !checkDependencies();

if (useMocks) {
  console.log('Using mock implementations for FactStore, EventBroker, and ViewMaterializer');
  FactStore = require('./core/MockFactStore');
  EventBroker = require('./core/MockEventBroker');
  ViewMaterializer = require('./core/MockViewMaterializer');
} else {
  FactStore = require('./core/FactStore');
  EventBroker = require('./core/EventBroker');
  ViewMaterializer = require('./view/ViewMaterializer');
}

// Ingestion
const IngestionGate = require('./ingestion/IngestionGate');

// Agents
const ProgressAgent = require('./agents/ProgressAgent');
const RelationAgent = require('./agents/RelationAgent');
const InsightAgent = require('./agents/InsightAgent');
const NarrativeAgent = require('./agents/NarrativeAgent');
const GuardianAgent = require('./agents/GuardianAgent');

// Create Express application
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Core components
const factStore = new FactStore();
const eventBroker = new EventBroker({ factStore });

// Ingestion
const ingestionGate = new IngestionGate({ broker: eventBroker });

// View layer
const viewMaterializer = new ViewMaterializer({ broker: eventBroker });

// Agents
const progressAgent = new ProgressAgent({ broker: eventBroker });
const relationAgent = new RelationAgent({ broker: eventBroker });
const insightAgent = new InsightAgent({ broker: eventBroker });
const narrativeAgent = new NarrativeAgent({ 
  broker: eventBroker,
  // Use a shorter interval for testing purposes
  narrativeInterval: 5 * 60 * 1000 // 5 minutes
});
const guardianAgent = new GuardianAgent({ 
  broker: eventBroker,
  factStore: factStore 
});

// Initialize and start everything
async function initialize() {
  console.log('Initializing AgentWeb backend...');
  
  try {
    // Initialize core components
    await factStore.initialize();
    await eventBroker.initialize();
    
    // Initialize view materializer
    await viewMaterializer.initialize();
    
    // Initialize and start agents (in the right order)
    await progressAgent.initialize();
    await progressAgent.start();
    
    await relationAgent.initialize();
    await relationAgent.start();
    
    await insightAgent.initialize();
    await insightAgent.start();
    
    await narrativeAgent.initialize();
    await narrativeAgent.start();
    
    await guardianAgent.initialize();
    await guardianAgent.start();
    
    console.log('AgentWeb backend initialized successfully');
  } catch (error) {
    console.error('Failed to initialize AgentWeb backend:', error);
    process.exit(1);
  }
}

// Check if MongoDB and Redis are available
function checkDependencies() {
  try {
    // Try to require MongoDB and Redis
    require('mongodb');
    require('redis');
    
    // If both are available, check if they're running
    // This is a simple check - in production you'd want to actually try to connect
    
    return true;
  } catch (error) {
    console.warn('MongoDB or Redis modules not available, using mock implementations');
    return false;
  }
}

// Routes
app.use('/api/ingestion', ingestionGate.getRouter());

// API endpoints for the view layer
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await viewMaterializer.getProjects();
    res.json(projects);
  } catch (error) {
    console.error('Error getting projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects/:projectId', async (req, res) => {
  try {
    const project = await viewMaterializer.getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    console.error(`Error getting project ${req.params.projectId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects/:projectId/dependencies', async (req, res) => {
  try {
    const direction = req.query.direction || 'outgoing';
    const dependencies = await viewMaterializer.getProjectDependencies(
      req.params.projectId,
      direction
    );
    res.json(dependencies);
  } catch (error) {
    console.error(`Error getting dependencies for project ${req.params.projectId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects/:projectId/insights', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const insights = await viewMaterializer.getProjectInsights(
      req.params.projectId,
      limit
    );
    res.json(insights);
  } catch (error) {
    console.error(`Error getting insights for project ${req.params.projectId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/narratives', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const narratives = await viewMaterializer.getLatestNarratives(limit);
    res.json(narratives);
  } catch (error) {
    console.error('Error getting narratives:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  // Serve static files
  app.use(express.static(path.join(__dirname, '../../build')));
  
  // For any other route, serve the React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../build', 'index.html'));
  });
}

// Set up Socket.IO events for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Setup event forwarding from view materializer to clients
  const emitViewUpdate = (kind, data) => {
    socket.emit('update', { kind, data });
  };
  
  // Subscribe socket to updates
  socket.on('subscribe', (projectId) => {
    if (projectId) {
      socket.join(`project:${projectId}`);
      console.log(`Client ${socket.id} subscribed to project ${projectId}`);
    } else {
      socket.join('all-updates');
      console.log(`Client ${socket.id} subscribed to all updates`);
    }
  });
  
  socket.on('unsubscribe', (projectId) => {
    if (projectId) {
      socket.leave(`project:${projectId}`);
      console.log(`Client ${socket.id} unsubscribed from project ${projectId}`);
    } else {
      socket.leave('all-updates');
      console.log(`Client ${socket.id} unsubscribed from all updates`);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Forward view events to connected clients
viewMaterializer.on('projectUpdated', (projectId, data) => {
  io.to(`project:${projectId}`).to('all-updates').emit('update', {
    kind: 'projectUpdated',
    data
  });
});

viewMaterializer.on('dependencyAdded', (data) => {
  io.to(`project:${data.sourceProjectId}`).to(`project:${data.targetProjectId}`).to('all-updates').emit('update', {
    kind: 'dependencyAdded',
    data
  });
});

viewMaterializer.on('insightRaised', (projectId, data) => {
  io.to(`project:${projectId}`).to('all-updates').emit('update', {
    kind: 'insightRaised',
    data
  });
});

viewMaterializer.on('narrativeGenerated', (data) => {
  io.to('all-updates').emit('update', {
    kind: 'narrativeGenerated',
    data
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Startup
const PORT = process.env.PORT || 4000;

server.listen(PORT, async () => {
  console.log(`AgentWeb backend server listening on port ${PORT}`);
  await initialize();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Stop all agents
  await narrativeAgent.stop();
  await insightAgent.stop();
  await relationAgent.stop();
  await progressAgent.stop();
  await guardianAgent.stop();
  
  // Close view materializer
  await viewMaterializer.close();
  
  // Close core components
  await eventBroker.close();
  
  // Close server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force close after timeout
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

module.exports = {
  app,
  server,
  io,
  factStore,
  eventBroker,
  viewMaterializer,
  progressAgent,
  relationAgent,
  insightAgent,
  narrativeAgent,
  guardianAgent
}; 