/**
 * ViewMaterializer
 * 
 * Materializes events from the Fact Store into queryable views.
 * Acts as a cache layer on top of the append-only event log.
 */
const { MongoClient } = require('mongodb');
const EventBroker = require('../core/EventBroker');
const EventEmitter = require('events');
const config = require('../util/config');

class ViewMaterializer extends EventEmitter {
  /**
   * Create a new ViewMaterializer
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.mongoUrl - MongoDB connection URL
   * @param {string} options.dbName - Database name
   * @param {EventBroker} options.broker - Event broker to subscribe to events
   */
  constructor(options = {}) {
    super();
    this.mongoUrl = options.mongoUrl || config.get('storage.factStore.mongo.url', 'mongodb://localhost:27017');
    this.dbName = options.dbName || config.get('storage.factStore.mongo.database', 'agentWeb');
    this.broker = options.broker;
    this.client = null;
    this.db = null;
    this.views = {};
    this.subscriptions = [];
    this.isInitialized = false;
  }

  /**
   * Initialize the connection to MongoDB and subscribe to events
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      this.client = new MongoClient(this.mongoUrl);
      await this.client.connect();
      
      this.db = this.client.db(this.dbName);
      
      // Initialize collections for each view
      this.views.projects = this.db.collection('view_projects');
      this.views.dependencies = this.db.collection('view_dependencies');
      this.views.insights = this.db.collection('view_insights');
      this.views.narratives = this.db.collection('view_narratives');
      
      // Create indexes
      await this.views.projects.createIndex({ projectId: 1 }, { unique: true });
      await this.views.dependencies.createIndex({ sourceProjectId: 1, targetProjectId: 1 }, { unique: true });
      await this.views.insights.createIndex({ projectId: 1, createdAt: -1 });
      await this.views.narratives.createIndex({ createdAt: -1 });
      
      // Subscribe to relevant events
      await this.subscribeToEvents();
      
      this.isInitialized = true;
      console.log('ViewMaterializer initialized');
    } catch (error) {
      console.error('Failed to initialize ViewMaterializer:', error);
      throw error;
    }
  }

  /**
   * Subscribe to all relevant events
   */
  async subscribeToEvents() {
    if (!this.broker) {
      throw new Error('Event broker is required for subscriptions');
    }
    
    // Ensure broker is initialized
    await this.broker.initialize();
    
    // Subscribe to ProjectProgressCalculated events
    const progressSub = await this.broker.subscribe(
      'ProjectProgressCalculated',
      this.handleProjectProgress.bind(this),
      {
        groupName: 'ViewMaterializer',
        consumerName: 'view-materializer-progress'
      }
    );
    this.subscriptions.push(progressSub);
    
    // Subscribe to DependencyEdgeAdded events
    const dependencySub = await this.broker.subscribe(
      'DependencyEdgeAdded',
      this.handleDependencyEdge.bind(this),
      {
        groupName: 'ViewMaterializer',
        consumerName: 'view-materializer-dependency'
      }
    );
    this.subscriptions.push(dependencySub);
    
    // Subscribe to InsightRaised events
    const insightSub = await this.broker.subscribe(
      'InsightRaised',
      this.handleInsight.bind(this),
      {
        groupName: 'ViewMaterializer',
        consumerName: 'view-materializer-insight'
      }
    );
    this.subscriptions.push(insightSub);
    
    // Subscribe to NarrativeGenerated events
    const narrativeSub = await this.broker.subscribe(
      'NarrativeGenerated',
      this.handleNarrative.bind(this),
      {
        groupName: 'ViewMaterializer',
        consumerName: 'view-materializer-narrative'
      }
    );
    this.subscriptions.push(narrativeSub);
  }

  /**
   * Handle a ProjectProgressCalculated event
   * 
   * @param {Event} event - ProjectProgressCalculated event
   */
  async handleProjectProgress(event) {
    try {
      const { projectId } = event.subject;
      const { progress, completedTasks, totalTasks, repo, branch, rev } = event.payload;
      
      // Data to store and emit
      const projectData = {
        projectId,
        progress,
        completedTasks,
        totalTasks,
        repo,
        branch,
        latestRevision: rev,
        updatedAt: event.ts
      };
      
      // Update project view
      const result = await this.views.projects.updateOne(
        { projectId },
        {
          $set: projectData,
          $setOnInsert: {
            createdAt: event.ts
          }
        },
        { upsert: true }
      );
      
      // Emit event for real-time updates
      this.emit('projectUpdated', projectId, projectData);
      
      console.log(`Updated progress view for project ${projectId}: ${progress}%`);
    } catch (error) {
      console.error('Error handling ProjectProgressCalculated event:', error);
    }
  }

  /**
   * Handle a DependencyEdgeAdded event
   * 
   * @param {Event} event - DependencyEdgeAdded event
   */
  async handleDependencyEdge(event) {
    try {
      const { sourceProjectId, targetProjectId } = event.subject;
      const { dependencyType } = event.payload;
      
      // Data to store and emit
      const dependencyData = {
        sourceProjectId,
        targetProjectId,
        dependencyType,
        updatedAt: event.ts
      };
      
      // Update dependency view
      await this.views.dependencies.updateOne(
        { sourceProjectId, targetProjectId },
        {
          $set: dependencyData,
          $setOnInsert: {
            createdAt: event.ts
          }
        },
        { upsert: true }
      );
      
      // Emit event for real-time updates
      this.emit('dependencyAdded', dependencyData);
      
      console.log(`Updated dependency view: ${sourceProjectId} -> ${targetProjectId} (${dependencyType})`);
    } catch (error) {
      console.error('Error handling DependencyEdgeAdded event:', error);
    }
  }

  /**
   * Handle an InsightRaised event
   * 
   * @param {Event} event - InsightRaised event
   */
  async handleInsight(event) {
    try {
      const { projectId } = event.subject;
      const { message, severity } = event.payload;
      
      // Data to store and emit
      const insightData = {
        projectId,
        message,
        severity,
        createdAt: event.ts,
        eventId: event.id
      };
      
      // Insert into insights view (keep historical record)
      await this.views.insights.insertOne(insightData);
      
      // Emit event for real-time updates
      this.emit('insightRaised', projectId, insightData);
      
      console.log(`Added insight for project ${projectId}: ${severity}`);
    } catch (error) {
      console.error('Error handling InsightRaised event:', error);
    }
  }

  /**
   * Handle a NarrativeGenerated event
   * 
   * @param {Event} event - NarrativeGenerated event
   */
  async handleNarrative(event) {
    try {
      const { narrativeId } = event.subject;
      const { text, relatedEvents } = event.payload;
      
      // Data to store and emit
      const narrativeData = {
        narrativeId,
        text,
        relatedEvents,
        createdAt: event.ts,
        eventId: event.id
      };
      
      // Insert into narratives view
      await this.views.narratives.insertOne(narrativeData);
      
      // Emit event for real-time updates
      this.emit('narrativeGenerated', narrativeData);
      
      console.log(`Added narrative ${narrativeId}`);
    } catch (error) {
      console.error('Error handling NarrativeGenerated event:', error);
    }
  }

  /**
   * Get all projects
   * 
   * @returns {Array} Array of projects
   */
  async getProjects() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.views.projects.find().sort({ progress: -1 }).toArray();
  }

  /**
   * Get a project by ID
   * 
   * @param {string} projectId - Project ID
   * @returns {Object} Project or null if not found
   */
  async getProject(projectId) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.views.projects.findOne({ projectId });
  }

  /**
   * Get dependencies for a project
   * 
   * @param {string} projectId - Project ID
   * @param {string} direction - 'outgoing' or 'incoming'
   * @returns {Array} Array of dependencies
   */
  async getProjectDependencies(projectId, direction = 'outgoing') {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const filter = direction === 'outgoing'
      ? { sourceProjectId: projectId }
      : { targetProjectId: projectId };
    
    return this.views.dependencies.find(filter).toArray();
  }

  /**
   * Get insights for a project
   * 
   * @param {string} projectId - Project ID
   * @param {number} limit - Maximum number of insights to return
   * @returns {Array} Array of insights
   */
  async getProjectInsights(projectId, limit = 10) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.views.insights
      .find({ projectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Get the latest narratives
   * 
   * @param {number} limit - Maximum number of narratives to return
   * @param {string} kind - Optional kind of narrative to filter by
   * @returns {Array} Latest narratives
   */
  async getLatestNarratives(limit = 10, kind = null) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      let query = {};
      
      // Filter by kind if provided
      if (kind) {
        query.kind = kind;
      }
      
      const narratives = await this.views.narratives
        .find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      
      return narratives;
    } catch (error) {
      console.error('Error getting latest narratives:', error);
      throw error;
    }
  }

  /**
   * Rebuild a view from the fact store
   * 
   * @param {string} viewName - Name of the view to rebuild
   */
  async rebuildView(viewName) {
    // This would replay events from the fact store to rebuild the view
    // Not implemented in this prototype
    console.log(`Rebuilding view ${viewName} not implemented yet`);
  }

  /**
   * Close the connection to MongoDB
   */
  async close() {
    // Unsubscribe from all events
    for (const subscription of this.subscriptions) {
      await this.broker.unsubscribe(subscription);
    }
    this.subscriptions = [];
    
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.views = {};
    }
    
    this.isInitialized = false;
    console.log('ViewMaterializer closed');
  }
}

module.exports = ViewMaterializer; 