/**
 * FactStore
 * 
 * The single source of truth for the entire system.
 * An append-only log of all events (facts) in the system.
 */
const { MongoClient } = require('mongodb');
const Event = require('./Event');

class FactStore {
  /**
   * Create a new FactStore
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.mongoUrl - MongoDB connection URL
   * @param {string} options.dbName - Database name
   * @param {string} options.collectionName - Collection name for events
   */
  constructor(options = {}) {
    this.mongoUrl = options.mongoUrl || process.env.MONGODB_URL || 'mongodb://localhost:27017';
    this.dbName = options.dbName || process.env.MONGODB_DB || 'agentWeb';
    this.collectionName = options.collectionName || 'events';
    this.client = null;
    this.db = null;
    this.collection = null;
  }

  /**
   * Initialize the connection to MongoDB
   */
  async initialize() {
    if (this.client) return;

    try {
      this.client = new MongoClient(this.mongoUrl);
      await this.client.connect();
      
      this.db = this.client.db(this.dbName);
      this.collection = this.db.collection(this.collectionName);
      
      // Create indexes for efficient querying
      await this.collection.createIndex({ id: 1 }, { unique: true });
      await this.collection.createIndex({ ts: 1 });
      await this.collection.createIndex({ kind: 1 });
      await this.collection.createIndex({ source: 1 });
      await this.collection.createIndex({ 'subject.projectId': 1 });

      console.log('FactStore initialized');
    } catch (error) {
      console.error('Failed to initialize FactStore:', error);
      throw error;
    }
  }

  /**
   * Append a new event to the store
   * 
   * @param {Event} event - Event to append
   * @returns {boolean} True if the event was stored successfully
   */
  async append(event) {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      // Ensure the event has a valid signature
      if (!event.verifyIntegrity()) {
        throw new Error('Event integrity check failed');
      }

      // Insert with upsert to handle idempotence
      const result = await this.collection.updateOne(
        { id: event.id },
        { $setOnInsert: event.toJSON() },
        { upsert: true }
      );

      return result.upsertedCount === 1 || result.matchedCount === 1;
    } catch (error) {
      console.error('Failed to append event:', error);
      throw error;
    }
  }

  /**
   * Get an event by its ID
   * 
   * @param {string} id - Event ID to retrieve
   * @returns {Event|null} The event or null if not found
   */
  async getById(id) {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      const doc = await this.collection.findOne({ id });
      if (!doc) return null;
      
      return Event.fromJSON(doc);
    } catch (error) {
      console.error(`Failed to get event with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Query events with filtering options
   * 
   * @param {Object} options - Query options
   * @param {string} [options.kind] - Filter by event kind
   * @param {string} [options.source] - Filter by event source
   * @param {number} [options.fromTs] - Start timestamp (inclusive)
   * @param {number} [options.toTs] - End timestamp (inclusive)
   * @param {string} [options.projectId] - Filter by project ID
   * @param {number} [options.limit] - Maximum number of events to return
   * @param {number} [options.skip] - Number of events to skip
   * @returns {Array<Event>} Array of matching events
   */
  async query(options = {}) {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      const filter = {};
      
      if (options.kind) filter.kind = options.kind;
      if (options.source) filter.source = options.source;
      
      if (options.fromTs || options.toTs) {
        filter.ts = {};
        if (options.fromTs) filter.ts.$gte = options.fromTs;
        if (options.toTs) filter.ts.$lte = options.toTs;
      }
      
      if (options.projectId) {
        filter['subject.projectId'] = options.projectId;
      }

      const cursor = this.collection.find(filter)
        .sort({ ts: 1 })
        .limit(options.limit || 0)
        .skip(options.skip || 0);

      const docs = await cursor.toArray();
      return docs.map(doc => Event.fromJSON(doc));
    } catch (error) {
      console.error('Failed to query events:', error);
      throw error;
    }
  }

  /**
   * Get events by their reference to a causal event
   * 
   * @param {string} eventId - ID of the causal event
   * @returns {Array<Event>} Array of events that were caused by the specified event
   */
  async getByCausalId(eventId) {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      const docs = await this.collection.find({
        'payload.causedBy': eventId
      }).toArray();
      
      return docs.map(doc => Event.fromJSON(doc));
    } catch (error) {
      console.error(`Failed to get events caused by ${eventId}:`, error);
      throw error;
    }
  }

  /**
   * Get the latest events, ordered by timestamp
   * 
   * @param {number} limit - Maximum number of events to return
   * @returns {Array<Event>} Array of most recent events
   */
  async getLatest(limit = 10) {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      const docs = await this.collection.find()
        .sort({ ts: -1 })
        .limit(limit)
        .toArray();
      
      return docs.map(doc => Event.fromJSON(doc));
    } catch (error) {
      console.error('Failed to get latest events:', error);
      throw error;
    }
  }

  /**
   * Close the connection to MongoDB
   */
  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
    }
  }
}

module.exports = FactStore; 