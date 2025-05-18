/**
 * ForecastAgent
 * 
 * Experimental agent that predicts project completion timelines.
 * Can be enabled/disabled via feature flags at runtime.
 */
const Agent = require('./Agent');

class ForecastAgent extends Agent {
  /**
   * Create a new ForecastAgent
   * 
   * @param {Object} options - Options for the agent
   * @param {EventBroker} options.broker - Event broker to subscribe to events
   */
  constructor(options = {}) {
    super('ForecastAgent', options);
    this.subscribedEvents = ['ProjectProgressCalculated'];
  }

  /**
   * Initialize the agent
   */
  async initialize() {
    await super.initialize();
    console.log('ForecastAgent initialized');
  }

  /**
   * Process a ProjectProgressCalculated event
   * 
   * @param {Event} event - ProjectProgressCalculated event
   */
  async processEvent(event) {
    if (event.kind !== 'ProjectProgressCalculated') return;

    try {
      const { projectId } = event.subject;
      const { progress, completedTasks, totalTasks } = event.payload;
      
      console.log(`ForecastAgent processing project ${projectId} progress: ${progress}%`);
      
      // Calculate a simple forecast based on progress
      const remainingWork = totalTasks - completedTasks;
      const forecastDate = this.calculateForecastDate(progress, remainingWork);
      
      // Create and publish a ProjectForecast event
      const forecastEvent = this.eventFactory.createCustomEvent(
        'ProjectForecast',
        { projectId },
        this.agentId,
        event.id,
        {
          predictedCompletionDate: forecastDate.toISOString(),
          confidenceScore: this.calculateConfidence(progress),
          remainingWork
        }
      );
      
      await this.broker.publish(forecastEvent);
      console.log(`Published forecast for project ${projectId}`);
    } catch (error) {
      console.error('Error in ForecastAgent:', error);
    }
  }

  /**
   * Calculate a projected completion date
   * 
   * @param {number} progress - Current progress percentage
   * @param {number} remainingWork - Number of remaining tasks
   * @returns {Date} Projected completion date
   */
  calculateForecastDate(progress, remainingWork) {
    // Simple heuristic for demo purposes
    const now = new Date();
    const daysPerTask = 0.5; // Assume half a day per task
    
    // If no progress yet, add more buffer time
    const buffer = progress < 5 ? 1.5 : 1.0;
    const daysToCompletion = Math.ceil(remainingWork * daysPerTask * buffer);
    
    // Add days to current date
    const forecastDate = new Date(now);
    forecastDate.setDate(forecastDate.getDate() + daysToCompletion);
    
    return forecastDate;
  }

  /**
   * Calculate confidence score for the forecast
   * 
   * @param {number} progress - Current progress percentage
   * @returns {number} Confidence score between 0 and 1
   */
  calculateConfidence(progress) {
    // More progress = more confidence in the forecast
    return Math.min(Math.max(progress / 100, 0.1), 0.9);
  }
}

module.exports = ForecastAgent; 