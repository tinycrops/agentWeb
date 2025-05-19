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

// Import configuration manager
const config = require('./util/config');

// Core components
let FactStore, EventBroker, ViewMaterializer;

// Ensure config is loaded
config.load();

// Check if we should use mock implementations
const useMocks = true; // Force usage of mocks for testing

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
    origin: config.get('api.cors.origin', 'http://localhost:3000'),
    methods: config.get('api.cors.methods', ['GET', 'POST'])
  }
});

// Middleware
app.use(cors({
  origin: config.get('api.cors.origin', 'http://localhost:3001'),
  methods: ['GET', 'POST'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('dev'));

// Core components
const factStore = new FactStore({
  mongoUrl: config.get('storage.factStore.mongo.url'),
  dbName: config.get('storage.factStore.mongo.database'),
  collectionName: config.get('storage.factStore.mongo.collection'),
  schemaVersion: config.get('storage.factStore.schemaVersion')
});

const eventBroker = new EventBroker({
  redisUrl: config.get('messaging.broker.redis.url'),
  factStore: factStore
});

// Ingestion
const ingestionGate = new IngestionGate({ broker: eventBroker });

// View layer
const viewMaterializer = new ViewMaterializer({
  mongoUrl: config.get('storage.factStore.mongo.url'),
  dbName: config.get('storage.factStore.mongo.database'),
  broker: eventBroker
});

// Agent instances
const agents = {};

// Initialize and start everything
async function initialize() {
  console.log('Initializing AgentWeb backend...');
  
  try {
    // Initialize core components
    await factStore.initialize();
    await eventBroker.initialize();
    
    // Initialize view materializer
    await viewMaterializer.initialize();
    
    // Initialize and start agents based on configuration
    await initializeAgents();
    
    // Set up config change handler for agent management
    config.onChange(handleConfigChange);
    
    console.log('AgentWeb backend initialized successfully');
  } catch (error) {
    console.error('Failed to initialize AgentWeb backend:', error);
    process.exit(1);
  }
}

// Initialize agents based on configuration
async function initializeAgents() {
  // Progress Agent
  if (config.get('agents.ProgressAgent', true)) {
    agents.progressAgent = new ProgressAgent({ broker: eventBroker });
    await agents.progressAgent.initialize();
    await agents.progressAgent.start();
    console.log('ProgressAgent started');
  }
  
  // Relation Agent
  if (config.get('agents.RelationAgent', true)) {
    agents.relationAgent = new RelationAgent({ broker: eventBroker });
    await agents.relationAgent.initialize();
    await agents.relationAgent.start();
    console.log('RelationAgent started');
  }
  
  // Insight Agent
  if (config.get('agents.InsightAgent', true)) {
    agents.insightAgent = new InsightAgent({ broker: eventBroker });
    await agents.insightAgent.initialize();
    await agents.insightAgent.start();
    console.log('InsightAgent started');
  }
  
  // Narrative Agent
  if (config.get('agents.NarrativeAgent', true)) {
    agents.narrativeAgent = new NarrativeAgent({ 
      broker: eventBroker,
      narrativeInterval: config.get('agents.narrativeAgent.narrativeInterval', 5 * 60 * 1000)
    });
    await agents.narrativeAgent.initialize();
    await agents.narrativeAgent.start();
    console.log('NarrativeAgent started');
  }
  
  // Guardian Agent
  if (config.get('agents.GuardianAgent', true)) {
    agents.guardianAgent = new GuardianAgent({ 
      broker: eventBroker,
      factStore: factStore 
    });
    await agents.guardianAgent.initialize();
    await agents.guardianAgent.start();
    console.log('GuardianAgent started');
  }
}

// Handler for configuration changes
async function handleConfigChange(newConfig) {
  console.log('Detected configuration change, updating agents...');
}

// Check if MongoDB and Redis are available
function checkDependencies() {
  try {
    // Try to require MongoDB and Redis
    require('mongodb');
    require('redis');
    
    // If both are available, return true
    return true;
  } catch (error) {
    console.warn('MongoDB or Redis modules not available, using mock implementations');
    return false;
  }
}

// Routes
app.use('/api/ingestion', ingestionGate.getRouter());

// Serve the webcam demo at /camera
app.use('/camera', express.static(path.join(__dirname, '../../frontend/public/camera')));

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
    const kind = req.query.kind;
    const narratives = await viewMaterializer.getLatestNarratives(limit, kind);
    res.json(narratives);
  } catch (error) {
    console.error('Error getting narratives:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve React app in production
if (config.get('system.environment') === 'production') {
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

viewMaterializer.on('insightAdded', (projectId, data) => {
  io.to(`project:${projectId}`).to('all-updates').emit('update', {
    kind: 'insightAdded',
    data
  });
});

viewMaterializer.on('narrativeAdded', (data) => {
  io.to('all-updates').emit('update', {
    kind: 'narrativeAdded',
    data
  });
});

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`AgentWeb server listening on port ${PORT}`);
  
  // Save PID for the reload script
  try {
    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(path.join(process.cwd(), '.pid'), process.pid.toString());
    console.log(`PID ${process.pid} saved to .pid file`);
  } catch (error) {
    console.error('Failed to save PID file:', error);
  }
  
  initialize();
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Close all agents
  for (const agent of Object.values(agents)) {
    if (agent && agent.stop) {
      await agent.stop();
    }
  }
  
  // Close core components
  await eventBroker.close();
  await factStore.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = {
  app,
  server,
  io,
  factStore,
  eventBroker,
  viewMaterializer,
  progressAgent: agents.progressAgent,
  relationAgent: agents.relationAgent,
  insightAgent: agents.insightAgent,
  narrativeAgent: agents.narrativeAgent,
  guardianAgent: agents.guardianAgent
}; 