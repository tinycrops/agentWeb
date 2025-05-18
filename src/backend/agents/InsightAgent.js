/**
 * InsightAgent
 * 
 * Agent responsible for generating insights based on events in the system.
 * 
 * Input predicate:
 * - Triggered by ProjectProgressCalculated and DependencyEdgeAdded events
 */
const BaseAgent = require('./BaseAgent');
const EventFactory = require('../core/EventFactory');

class InsightAgent extends BaseAgent {
  /**
   * Create a new InsightAgent
   * 
   * @param {Object} options - Agent configuration
   */
  constructor(options = {}) {
    super({
      ...options,
      name: 'InsightAgent',
      subscribedEvents: ['ProjectProgressCalculated', 'DependencyEdgeAdded']
    });
    
    // State variables
    this.projectProgress = new Map(); // Map<projectId, progress>
    this.projectDependencies = new Map(); // Map<projectId, Set<targetProjectId>>
    this.insights = new Set(); // Set of insights already raised (to prevent duplicates)
  }

  /**
   * Process an incoming event
   * 
   * @param {Event} event - Incoming event
   */
  async processEvent(event) {
    if (!this.shouldProcessEvent(event)) return;

    try {
      switch (event.kind) {
        case 'ProjectProgressCalculated':
          await this.processProgressEvent(event);
          break;
        case 'DependencyEdgeAdded':
          await this.processDependencyEvent(event);
          break;
      }
      
      // After updating state, check for insights
      await this.generateInsights(event);
    } catch (error) {
      console.error('Error in InsightAgent.processEvent:', error);
    }
  }

  /**
   * Process a ProjectProgressCalculated event
   * 
   * @param {Event} event - ProjectProgressCalculated event
   */
  async processProgressEvent(event) {
    const { projectId } = event.subject;
    const { progress } = event.payload;
    
    // Update state
    this.projectProgress.set(projectId, progress);
  }

  /**
   * Process a DependencyEdgeAdded event
   * 
   * @param {Event} event - DependencyEdgeAdded event
   */
  async processDependencyEvent(event) {
    const { sourceProjectId, targetProjectId } = event.subject;
    
    // Update state
    if (!this.projectDependencies.has(sourceProjectId)) {
      this.projectDependencies.set(sourceProjectId, new Set());
    }
    
    this.projectDependencies.get(sourceProjectId).add(targetProjectId);
    
    // Also track reverse dependencies for insights
    if (!this.projectDependencies.has(targetProjectId)) {
      this.projectDependencies.set(targetProjectId, new Set());
    }
  }

  /**
   * Generate insights based on current state
   * 
   * @param {Event} triggeringEvent - Event that triggered this insight check
   */
  async generateInsights(triggeringEvent) {
    const insightsToRaise = [];
    
    // Check progress imbalance between dependent projects
    if (triggeringEvent.kind === 'ProjectProgressCalculated' || 
        triggeringEvent.kind === 'DependencyEdgeAdded') {
      
      const { projectId: relevantProjectId } = 
        triggeringEvent.kind === 'ProjectProgressCalculated' 
          ? triggeringEvent.subject 
          : { projectId: triggeringEvent.subject.sourceProjectId };
      
      insightsToRaise.push(...this.checkProgressImbalance(relevantProjectId, triggeringEvent));
    }
    
    // Check for blocked projects due to dependencies
    if (triggeringEvent.kind === 'ProjectProgressCalculated') {
      insightsToRaise.push(...this.checkBlockedProjects(triggeringEvent));
    }
    
    // Raise all insights
    for (const insight of insightsToRaise) {
      // Create a unique key for the insight to prevent duplicates
      const insightKey = `${insight.projectId}:${insight.message}`;
      
      if (!this.insights.has(insightKey)) {
        this.insights.add(insightKey);
        
        const insightEvent = EventFactory.createInsightRaised(
          insight.projectId,
          insight.message,
          insight.severity,
          this.id,
          triggeringEvent.id
        );
        
        await this.publishEvent(insightEvent);
      }
    }
  }

  /**
   * Check for progress imbalance between dependent projects
   * 
   * @param {string} projectId - Project ID to check
   * @param {Event} triggeringEvent - Event that triggered this check
   * @returns {Array<Object>} Array of insights to raise
   */
  checkProgressImbalance(projectId, triggeringEvent) {
    const insights = [];
    
    // Get the project's progress
    const progress = this.projectProgress.get(projectId);
    if (progress === undefined) {
      return insights; // No progress info yet
    }
    
    // Check dependencies
    const dependencies = this.projectDependencies.get(projectId);
    if (dependencies) {
      for (const targetId of dependencies) {
        const targetProgress = this.projectProgress.get(targetId);
        
        if (targetProgress !== undefined) {
          // If this project is significantly ahead of its dependency
          if (progress > targetProgress + 30) {
            insights.push({
              projectId,
              message: `This project is significantly ahead (${progress}%) of its dependency ${targetId} (${targetProgress}%)`,
              severity: 'warning'
            });
          }
          
          // If this project is significantly behind a project that depends on it
          if (progress + 30 < targetProgress) {
            insights.push({
              projectId,
              message: `This project is significantly behind (${progress}%) project ${targetId} (${targetProgress}%) which depends on it`,
              severity: 'critical'
            });
          }
        }
      }
    }
    
    // Check reverse dependencies (projects that depend on this one)
    for (const [sourceId, targets] of this.projectDependencies.entries()) {
      if (targets.has(projectId)) {
        const sourceProgress = this.projectProgress.get(sourceId);
        
        if (sourceProgress !== undefined) {
          // If a dependent project is blocked by this project's low progress
          if (sourceProgress > progress + 30) {
            insights.push({
              projectId,
              message: `Project ${sourceId} (${sourceProgress}%) may be blocked by this project's lower progress (${progress}%)`,
              severity: 'warning'
            });
          }
        }
      }
    }
    
    return insights;
  }

  /**
   * Check for projects blocked by dependencies
   * 
   * @param {Event} triggeringEvent - Event that triggered this check
   * @returns {Array<Object>} Array of insights to raise
   */
  checkBlockedProjects(triggeringEvent) {
    const insights = [];
    const { projectId } = triggeringEvent.subject;
    const { progress } = triggeringEvent.payload;
    
    // If the project has high progress (>80%) but dependent projects have low progress
    if (progress >= 80) {
      // Find projects that depend on this one
      for (const [sourceId, targets] of this.projectDependencies.entries()) {
        if (targets.has(projectId)) {
          const sourceProgress = this.projectProgress.get(sourceId);
          
          if (sourceProgress !== undefined && sourceProgress < 40) {
            insights.push({
              projectId: sourceId,
              message: `This project has low progress (${sourceProgress}%) but depends on ${projectId} which is almost complete (${progress}%)`,
              severity: 'info'
            });
          }
        }
      }
    }
    
    return insights;
  }
}

module.exports = InsightAgent; 