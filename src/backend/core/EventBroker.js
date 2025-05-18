/**
 * EventBroker
 * 
 * Pub/sub system that distributes events to interested agents.
 * Uses Redis Streams as the underlying implementation.
 */
const Redis = require('redis');
const Event = require('./Event');
const FactStore = require('./FactStore');

class EventBroker {
  /**
   * Create a new EventBroker
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.redisUrl - Redis connection URL
   * @param {FactStore} options.factStore - Reference to the FactStore
   */
  constructor(options = {}) {
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.factStore = options.factStore || new FactStore();
    this.publisher = null;
    this.subscribers = new Map();
    this.consumerGroups = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the Redis connections
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Create publisher client
      this.publisher = Redis.createClient({ url: this.redisUrl });
      await this.publisher.connect();

      // Initialize FactStore if needed
      if (!this.factStore.client) {
        await this.factStore.initialize();
      }

      this.isInitialized = true;
      console.log('EventBroker initialized');
    } catch (error) {
      console.error('Failed to initialize EventBroker:', error);
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
   * Publish an event to the appropriate Redis stream
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

      // Then publish to the appropriate Redis stream
      const streamName = this.getStreamName(event.kind);
      const eventJson = JSON.stringify(event.toJSON());

      // Add to stream with event ID as the message ID for idempotence
      await this.publisher.xAdd(
        streamName,
        '*', // Let Redis assign the ID
        { event: eventJson }
      );

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
      // Create subscriber client
      const subscriber = Redis.createClient({ url: this.redisUrl });
      await subscriber.connect();

      // Ensure the stream exists
      try {
        await this.publisher.xGroupCreate(
          streamName, 
          groupName,
          '$', // Start with only new messages
          {
            MKSTREAM: true // Create the stream if it doesn't exist
          }
        );
        console.log(`Created consumer group ${groupName} for stream ${streamName}`);
      } catch (err) {
        // Group may already exist, which is fine
        if (!err.message.includes('BUSYGROUP')) {
          throw err;
        }
      }

      // Store the subscription
      if (!this.consumerGroups.has(streamName)) {
        this.consumerGroups.set(streamName, new Map());
      }
      
      const groupMap = this.consumerGroups.get(streamName);
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, new Set());
      }
      
      groupMap.get(groupName).add(consumerName);
      
      const subscriptionInfo = { streamName, groupName, consumerName };
      this.subscribers.set(consumerName, { subscriber, callback, subscriptionInfo });

      // Start consuming
      this._consume(subscriptionInfo);

      console.log(`Subscribed ${consumerName} to ${streamName} in group ${groupName}`);
      return subscriptionInfo;
    } catch (error) {
      console.error(`Failed to subscribe to ${kind}:`, error);
      throw error;
    }
  }

  /**
   * Internal method to consume events from a stream
   * 
   * @param {Object} subscriptionInfo - Subscription information
   * @private
   */
  async _consume({ streamName, groupName, consumerName }) {
    const subscription = this.subscribers.get(consumerName);
    if (!subscription) return;

    const { subscriber, callback } = subscription;

    try {
      // Read new messages from the stream
      const response = await subscriber.xReadGroup(
        groupName,
        consumerName,
        { [streamName]: '>' }, // '>' means only new messages
        { COUNT: 10, BLOCK: 5000 } // Read up to 10 messages, block for 5 seconds
      );

      if (response) {
        for (const [stream, messages] of response) {
          for (const message of messages) {
            const [id, fields] = message;
            const eventJson = fields.event;
            
            try {
              const eventData = JSON.parse(eventJson);
              const event = Event.fromJSON(eventData);
              
              // Execute the callback
              await callback(event);
              
              // Acknowledge the message
              await subscriber.xAck(stream, groupName, id);
            } catch (err) {
              console.error(`Error processing message ${id}:`, err);
              // We don't acknowledge to allow retry
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error in consumer ${consumerName}:`, error);
    }

    // Continue consuming in a loop (unless unsubscribed)
    if (this.subscribers.has(consumerName)) {
      this._consume({ streamName, groupName, consumerName });
    }
  }

  /**
   * Unsubscribe from a stream
   * 
   * @param {Object} subscriptionInfo - Subscription information returned by subscribe
   */
  async unsubscribe(subscriptionInfo) {
    const { consumerName } = subscriptionInfo;
    
    if (this.subscribers.has(consumerName)) {
      const { subscriber, subscriptionInfo: info } = this.subscribers.get(consumerName);
      const { streamName, groupName } = info;
      
      try {
        // Close the subscriber connection
        await subscriber.quit();
        
        // Remove from our maps
        this.subscribers.delete(consumerName);
        
        const groupMap = this.consumerGroups.get(streamName);
        if (groupMap) {
          const consumers = groupMap.get(groupName);
          if (consumers) {
            consumers.delete(consumerName);
            if (consumers.size === 0) {
              groupMap.delete(groupName);
            }
          }
          if (groupMap.size === 0) {
            this.consumerGroups.delete(streamName);
          }
        }
        
        console.log(`Unsubscribed ${consumerName} from ${streamName}`);
      } catch (error) {
        console.error(`Failed to unsubscribe ${consumerName}:`, error);
      }
    }
  }

  /**
   * Close all connections
   */
  async close() {
    // Close all subscriber connections
    for (const { subscriber } of this.subscribers.values()) {
      try {
        await subscriber.quit();
      } catch (error) {
        console.error('Error closing subscriber:', error);
      }
    }

    // Clear subscriber maps
    this.subscribers.clear();
    this.consumerGroups.clear();

    // Close publisher connection
    if (this.publisher) {
      try {
        await this.publisher.quit();
        this.publisher = null;
      } catch (error) {
        console.error('Error closing publisher:', error);
      }
    }

    // Close FactStore connection
    if (this.factStore) {
      await this.factStore.close();
    }

    this.isInitialized = false;
    console.log('EventBroker closed');
  }
}

module.exports = EventBroker; 