/**
 * NarrativeAgent
 * 
 * Agent responsible for generating natural language narratives based on events.
 * Triggered either on a timer or when significant events like InsightRaised occur.
 */
const BaseAgent = require('./BaseAgent');
const EventFactory = require('../core/EventFactory');
const { v4: uuidv4 } = require('uuid');

class NarrativeAgent extends BaseAgent {
  /**
   * Create a new NarrativeAgent
   * 
   * @param {Object} options - Agent configuration
   * @param {number} options.narrativeInterval - Interval in ms for generating narratives (default: 1 hour)
   */
  constructor(options = {}) {
    super({
      ...options,
      name: 'NarrativeAgent',
      subscribedEvents: ['InsightRaised'],
      snapshotInterval: options.snapshotInterval || 5
    });
    
    // State variables
    this.recentEvents = []; // Queue of recent important events
    this.lastNarrativeTime = Date.now();
    this.narrativeInterval = options.narrativeInterval || 60 * 60 * 1000; // 1 hour default
    this.maxRecentEvents = 50; // Max number of events to keep in memory
    this.timerHandle = null;
  }

  /**
   * Initialize the agent and start the timer
   */
  async initialize(broker = null) {
    await super.initialize(broker);
    
    // Start the timer for periodic narratives
    this.startTimer();
  }

  /**
   * Start the narrative timer
   */
  startTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
    }
    
    this.timerHandle = setInterval(() => {
      this.generateTimerNarrative().catch(err => {
        console.error('Error generating timer narrative:', err);
      });
    }, this.narrativeInterval);
    
    console.log(`Narrative timer started (interval: ${this.narrativeInterval}ms)`);
  }

  /**
   * Stop the narrative timer
   */
  stopTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  /**
   * Stop the agent
   */
  async stop() {
    this.stopTimer();
    await super.stop();
  }

  /**
   * Process an incoming event
   * 
   * @param {Event} event - Incoming event
   */
  async processEvent(event) {
    // Call super to handle snapshot scheduling
    await super.processEvent(event);
    
    if (!this.shouldProcessEvent(event)) return;

    try {
      // Add to recent events queue
      this.addRecentEvent(event);
      
      // For critical insights, generate a narrative immediately
      if (event.kind === 'InsightRaised' && event.payload.severity === 'critical') {
        await this.generateInsightNarrative(event);
      }
    } catch (error) {
      console.error('Error in NarrativeAgent.processEvent:', error);
    }
  }

  /**
   * Add an event to the recent events queue
   * 
   * @param {Event} event - Event to add
   */
  addRecentEvent(event) {
    this.recentEvents.push(event);
    
    // Trim the queue if it gets too long
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents = this.recentEvents.slice(-this.maxRecentEvents);
    }
  }

  /**
   * Generate a narrative based on a timer event
   */
  async generateTimerNarrative() {
    // Get events since the last narrative generation
    const events = this.getEventsSince(this.lastNarrativeTime);
    this.lastNarrativeTime = Date.now();
    
    if (events.length === 0) {
      console.log('No events to generate narrative for');
      return;
    }
    
    // Generate the narrative
    const text = this.composeNarrative(events);
    const narrativeId = uuidv4();
    const eventIds = events.map(e => e.id);
    
    // Create and publish the narrative event
    const narrativeEvent = EventFactory.createNarrativeGenerated(
      narrativeId,
      text,
      eventIds,
      this.id
    );
    
    await this.publishEvent(narrativeEvent);
    console.log(`Timer narrative generated: ${narrativeId}`);
    
    // Take a snapshot after generating a narrative
    await this.takeSnapshot();
  }

  /**
   * Generate a narrative based on a critical insight
   * 
   * @param {Event} insightEvent - Insight event that triggered this narrative
   */
  async generateInsightNarrative(insightEvent) {
    // Get some context events from around the time of the insight
    const contextEvents = this.getRecentContextEvents(insightEvent);
    
    // Generate the narrative
    const text = this.composeInsightNarrative(insightEvent, contextEvents);
    const narrativeId = uuidv4();
    const eventIds = [insightEvent.id, ...contextEvents.map(e => e.id)];
    
    // Create and publish the narrative event
    const narrativeEvent = EventFactory.createNarrativeGenerated(
      narrativeId,
      text,
      eventIds,
      this.id
    );
    
    await this.publishEvent(narrativeEvent);
    console.log(`Insight narrative generated: ${narrativeId}`);
    
    // Take a snapshot after generating a narrative
    await this.takeSnapshot();
  }

  /**
   * Get events since a certain time
   * 
   * @param {number} timestamp - Timestamp to get events since
   * @returns {Array<Event>} Array of events since the timestamp
   */
  getEventsSince(timestamp) {
    return this.recentEvents.filter(event => event.ts > timestamp);
  }

  /**
   * Get context events related to an insight
   * 
   * @param {Event} insightEvent - Insight event to get context for
   * @returns {Array<Event>} Array of context events
   */
  getRecentContextEvents(insightEvent) {
    const projectId = insightEvent.subject.projectId;
    
    // Get events related to the same project
    return this.recentEvents.filter(event => 
      event.id !== insightEvent.id && // Not the insight itself
      (
        // Related to the same project
        (event.subject.projectId === projectId) ||
        (event.subject.sourceProjectId === projectId) ||
        (event.subject.targetProjectId === projectId)
      )
    ).slice(-5); // Limit to 5 most recent context events
  }

  /**
   * Compose a narrative from a set of events
   * 
   * @param {Array<Event>} events - Events to compose a narrative from
   * @returns {string} Narrative text
   */
  composeNarrative(events) {
    // This is a simplified implementation
    // In a real system, this would use NLP/ML to generate more sophisticated narratives
    const now = new Date();
    const formattedDate = now.toLocaleDateString();
    const formattedTime = now.toLocaleTimeString();
    
    let text = `System Update (${formattedDate} ${formattedTime}):\n\n`;
    
    // Group events by type
    const progressEvents = events.filter(e => e.kind === 'ProjectProgressCalculated');
    const dependencyEvents = events.filter(e => e.kind === 'DependencyEdgeAdded');
    const insightEvents = events.filter(e => e.kind === 'InsightRaised');
    
    // Summarize progress events
    if (progressEvents.length > 0) {
      text += `Progress Updates:\n`;
      
      // Group by project
      const projectProgress = new Map();
      for (const event of progressEvents) {
        projectProgress.set(event.subject.projectId, event.payload.progress);
      }
      
      for (const [projectId, progress] of projectProgress.entries()) {
        text += `- Project ${projectId} is at ${progress}% completion\n`;
      }
      
      text += '\n';
    }
    
    // Summarize dependency events
    if (dependencyEvents.length > 0) {
      text += `Dependency Updates:\n`;
      
      for (const event of dependencyEvents) {
        const { sourceProjectId, targetProjectId } = event.subject;
        const { dependencyType } = event.payload;
        
        text += `- Project ${sourceProjectId} now ${dependencyType} ${targetProjectId}\n`;
      }
      
      text += '\n';
    }
    
    // Include insights
    if (insightEvents.length > 0) {
      text += `Insights:\n`;
      
      for (const event of insightEvents) {
        const { projectId } = event.subject;
        const { message, severity } = event.payload;
        
        text += `- [${severity.toUpperCase()}] ${projectId}: ${message}\n`;
      }
    }
    
    return text;
  }

  /**
   * Compose a narrative specifically about an insight
   * 
   * @param {Event} insightEvent - Insight event to focus on
   * @param {Array<Event>} contextEvents - Related context events
   * @returns {string} Narrative text
   */
  composeInsightNarrative(insightEvent, contextEvents) {
    const { projectId } = insightEvent.subject;
    const { message, severity } = insightEvent.payload;
    
    let text = `Critical Insight for Project ${projectId}:\n\n`;
    text += `${message}\n\n`;
    
    if (contextEvents.length > 0) {
      text += `Context:\n`;
      
      // Group context events by type
      const progressEvents = contextEvents.filter(e => e.kind === 'ProjectProgressCalculated');
      const dependencyEvents = contextEvents.filter(e => e.kind === 'DependencyEdgeAdded');
      
      // Add progress context
      for (const event of progressEvents) {
        const { projectId } = event.subject;
        const { progress, completedTasks, totalTasks } = event.payload;
        
        text += `- Project ${projectId} is at ${progress}% completion (${completedTasks}/${totalTasks} tasks)\n`;
      }
      
      // Add dependency context
      for (const event of dependencyEvents) {
        const { sourceProjectId, targetProjectId } = event.subject;
        const { dependencyType } = event.payload;
        
        text += `- Project ${sourceProjectId} ${dependencyType} ${targetProjectId}\n`;
      }
    }
    
    return text;
  }

  /**
   * Get a snapshot of the NarrativeAgent's state
   * 
   * @returns {Object} Agent state snapshot
   */
  getSnapshot() {
    // Get base snapshot from parent
    const baseSnapshot = super.getSnapshot();
    
    // Add NarrativeAgent-specific state
    return {
      ...baseSnapshot,
      lastNarrativeTime: this.lastNarrativeTime,
      // Only store the most recent events to keep snapshot size reasonable
      recentEvents: this.recentEvents.slice(-this.maxRecentEvents)
    };
  }

  /**
   * Load a snapshot into the NarrativeAgent's state
   * 
   * @param {Object} snapshot - Snapshot to load
   * @returns {boolean} Whether the snapshot was loaded successfully
   */
  loadSnapshot(snapshot) {
    // Load base snapshot from parent
    const baseResult = super.loadSnapshot(snapshot);
    
    if (!baseResult || !snapshot) return false;
    
    try {
      // Restore NarrativeAgent-specific state
      if (snapshot.lastNarrativeTime) {
        this.lastNarrativeTime = snapshot.lastNarrativeTime;
      }
      
      if (Array.isArray(snapshot.recentEvents)) {
        this.recentEvents = snapshot.recentEvents;
      }
      
      return true;
    } catch (error) {
      console.error('Error loading NarrativeAgent snapshot:', error);
      return false;
    }
  }
}

module.exports = NarrativeAgent; 