/**
 * MockEventBroker
 * 
 * In-memory implementation of the EventBroker for development/testing
 * when Redis is not available.
 */
const Event = require('./Event');
const MockFactStore = require('./MockFactStore');

class MockEventBroker {
  /**
   * Create a new MockEventBroker
   * 
   * @param {Object} options - Configuration options
   * @param {MockFactStore} options.factStore - Reference to the FactStore
   */
  constructor(options = {}) {
    this.factStore = options.factStore || new MockFactStore();
    this.subscribers = new Map(); // Map<streamName, Map<groupName, Map<consumerName, callback>>>
    this.isInitialized = false;
  }

  /**
   * Initialize the broker
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Initialize FactStore if needed
      if (!this.factStore.isInitialized) {
        await this.factStore.initialize();
      }

      this.isInitialized = true;
      console.log('MockEventBroker initialized');
    } catch (error) {
      console.error('Failed to initialize MockEventBroker:', error);
      throw error;
    }
  }

  /**
   * Get the stream name for a particular event kind
   * 
   * @param {string} kind - Event kind
   * @returns {string} Stream name
   */
  getStreamName(kind) {
    return `events:${kind}`;
  }

  /**
   * Publish an event to interested subscribers
   * 
   * @param {Event} event - Event to publish
   * @returns {boolean} True if the event was published successfully
   */
  async publish(event) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Store the event in the FactStore first (single source of truth)
      const stored = await this.factStore.append(event);
      if (!stored) {
        console.warn(`Event ${event.id} was not stored in FactStore`);
        return false;
      }

      // Get the stream name for this event kind
      const streamName = this.getStreamName(event.kind);
      
      // Notify all subscribers interested in this event kind
      if (this.subscribers.has(streamName)) {
        const groupMap = this.subscribers.get(streamName);
        
        for (const [groupName, consumerMap] of groupMap.entries()) {
          // For each consumer group, pick just one consumer to deliver to
          // (simulating the behavior of Redis Streams consumer groups)
          const consumers = Array.from(consumerMap.entries());
          if (consumers.length > 0) {
            // Randomly select one consumer from the group
            const randomIndex = Math.floor(Math.random() * consumers.length);
            const [consumerName, callback] = consumers[randomIndex];
            
            // Execute the callback asynchronously
            setTimeout(() => {
              try {
                callback(event);
              } catch (err) {
                console.error(`Error in consumer ${consumerName}:`, err);
              }
            }, 0);
          }
        }
      }

      console.log(`Published event ${event.id} to stream ${streamName}`);
      return true;
    } catch (error) {
      console.error(`Failed to publish event ${event.id}:`, error);
      return false;
    }
  }

  /**
   * Subscribe to events of a particular kind
   * 
   * @param {string} kind - Event kind to subscribe to
   * @param {Function} callback - Function to call when an event is received
   * @param {Object} options - Subscription options
   * @param {string} options.groupName - Consumer group name
   * @param {string} options.consumerName - Consumer name within the group
   * @returns {Object} Subscription information
   */
  async subscribe(kind, callback, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const streamName = this.getStreamName(kind);
    const groupName = options.groupName || 'default-group';
    const consumerName = options.consumerName || `consumer-${Date.now()}`;

    try {
      // Ensure maps exist for this stream and group
      if (!this.subscribers.has(streamName)) {
        this.subscribers.set(streamName, new Map());
      }
      
      const groupMap = this.subscribers.get(streamName);
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, new Map());
      }
      
      // Add the subscriber
      groupMap.get(groupName).set(consumerName, callback);
      
      const subscriptionInfo = { streamName, groupName, consumerName };
      
      console.log(`Subscribed ${consumerName} to ${streamName} in group ${groupName}`);
      return subscriptionInfo;
    } catch (error) {
      console.error(`Failed to subscribe to ${kind}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a stream
   * 
   * @param {Object} subscriptionInfo - Subscription information returned by subscribe
   */
  async unsubscribe(subscriptionInfo) {
    const { streamName, groupName, consumerName } = subscriptionInfo;
    
    if (this.subscribers.has(streamName)) {
      const groupMap = this.subscribers.get(streamName);
      
      if (groupMap.has(groupName)) {
        const consumerMap = groupMap.get(groupName);
        
        if (consumerMap.has(consumerName)) {
          consumerMap.delete(consumerName);
          
          if (consumerMap.size === 0) {
            groupMap.delete(groupName);
          }
          
          if (groupMap.size === 0) {
            this.subscribers.delete(streamName);
          }
          
          console.log(`Unsubscribed ${consumerName} from ${streamName}`);
        }
      }
    }
  }

  /**
   * Close all connections
   */
  async close() {
    // Clear subscriber maps
    this.subscribers.clear();

    // Close FactStore connection
    if (this.factStore) {
      await this.factStore.close();
    }

    this.isInitialized = false;
    console.log('MockEventBroker closed');
  }
}

module.exports = MockEventBroker; 