/**
 * MockViewMaterializer
 * 
 * In-memory implementation of ViewMaterializer for development/testing
 * when MongoDB is not available.
 */
const EventEmitter = require('events');
const MockEventBroker = require('./MockEventBroker');

class MockViewMaterializer extends EventEmitter {
  /**
   * Create a new MockViewMaterializer
   * 
   * @param {Object} options - Configuration options
   * @param {MockEventBroker} options.broker - Event broker to subscribe to events
   */
  constructor(options = {}) {
    super();
    this.broker = options.broker;
    this.views = {
      projects: new Map(),      // Map<projectId, projectData>
      dependencies: new Map(),  // Map<`${sourceId}:${targetId}`, dependencyData>
      insights: [],             // Array of insight objects
      narratives: []            // Array of narrative objects
    };
    this.subscriptions = [];
    this.isInitialized = false;
  }

  /**
   * Initialize and subscribe to events
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Subscribe to events
      await this.subscribeToEvents();
      
      this.isInitialized = true;
      console.log('MockViewMaterializer initialized');
    } catch (error) {
      console.error('Failed to initialize MockViewMaterializer:', error);
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
        updatedAt: event.ts,
        createdAt: this.views.projects.has(projectId) 
          ? this.views.projects.get(projectId).createdAt 
          : event.ts
      };
      
      // Update project view
      this.views.projects.set(projectId, projectData);
      
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
      
      // Generate a unique key for this dependency
      const dependencyKey = `${sourceProjectId}:${targetProjectId}`;
      
      // Data to store and emit
      const dependencyData = {
        sourceProjectId,
        targetProjectId,
        dependencyType,
        updatedAt: event.ts,
        createdAt: this.views.dependencies.has(dependencyKey)
          ? this.views.dependencies.get(dependencyKey).createdAt
          : event.ts
      };
      
      // Update dependency view
      this.views.dependencies.set(dependencyKey, dependencyData);
      
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
      
      // Insert into insights array
      this.views.insights.push(insightData);
      
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
      
      // Insert into narratives array
      this.views.narratives.push(narrativeData);
      
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
    
    return Array.from(this.views.projects.values())
      .sort((a, b) => b.progress - a.progress);
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
    
    return this.views.projects.get(projectId) || null;
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
    
    return Array.from(this.views.dependencies.values())
      .filter(dep => direction === 'outgoing' 
        ? dep.sourceProjectId === projectId
        : dep.targetProjectId === projectId);
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
      .filter(insight => insight.projectId === projectId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  /**
   * Get the latest narratives
   * 
   * @param {number} limit - Maximum number of narratives to return
   * @returns {Array} Array of narratives
   */
  async getLatestNarratives(limit = 10) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.views.narratives
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  /**
   * Close the connection
   */
  async close() {
    // Unsubscribe from all events
    for (const subscription of this.subscriptions) {
      await this.broker.unsubscribe(subscription);
    }
    this.subscriptions = [];
    
    this.isInitialized = false;
    console.log('MockViewMaterializer closed');
  }
}

module.exports = MockViewMaterializer; 