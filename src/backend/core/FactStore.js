/**
 * FactStore
 * 
 * The single source of truth for the entire system.
 * An append-only log of all events (facts) in the system.
 */
const { MongoClient } = require('mongodb');
const Event = require('./Event');
const EventFactory = require('./EventFactory');
const { v4: uuidv4 } = require('uuid');

class FactStore {
  /**
   * Create a new FactStore
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.mongoUrl - MongoDB connection URL
   * @param {string} options.dbName - Database name
   * @param {string} options.collectionName - Collection name for events
   * @param {number} options.schemaVersion - Schema version to use
   */
  constructor(options = {}) {
    this.mongoUrl = options.mongoUrl || process.env.MONGODB_URL || 'mongodb://localhost:27017';
    this.dbName = options.dbName || process.env.MONGODB_DB || 'agentWeb';
    this.collectionName = options.collectionName || 'events';
    this.schemaVersion = options.schemaVersion || 2; // Default to v2 schema
    this.sourceId = `factstore-${Date.now()}`;
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
      await this.collection.createIndex({ schemaVersion: 1 });

      console.log(`FactStore initialized (schema v${this.schemaVersion})`);
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
      
      // Start a session for transaction
      const session = this.client.startSession();
      
      try {
        let success = false;
        
        // Use a transaction to ensure both the event and meta-event are written or neither
        await session.withTransaction(async () => {
          // Add schema version to the event
          const eventWithVersion = {
            ...event.toJSON(),
            schemaVersion: this.schemaVersion
          };
          
          // Insert with upsert to handle idempotence
          const result = await this.collection.updateOne(
            { id: event.id },
            { $setOnInsert: eventWithVersion },
            { upsert: true, session }
          );
          
          success = result.upsertedCount === 1 || result.matchedCount === 1;
          
          if (success && result.upsertedCount === 1) {
            // Only create meta-event if this is a new event
            // Create and store the EnvelopeWritten meta-event
            const metaEvent = EventFactory.createCustomEvent(
              'EnvelopeWritten',
              { eventId: event.id },
              this.sourceId,
              null,
              {
                kind: event.kind,
                source: event.source,
                ts: event.ts,
                schemaVersion: this.schemaVersion
              }
            );
            
            // Add schema version to meta-event
            const metaEventWithVersion = {
              ...metaEvent.toJSON(),
              schemaVersion: this.schemaVersion
            };
            
            await this.collection.insertOne(metaEventWithVersion, { session });
          }
        });
        
        return success;
      } finally {
        await session.endSession();
      }
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
   * @param {number} [options.schemaVersion] - Filter by schema version
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

      if (options.schemaVersion) {
        filter.schemaVersion = options.schemaVersion;
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
   * Get meta-events for a specific event
   * 
   * @param {string} eventId - Event ID to get meta-events for
   * @returns {Array<Event>} Array of meta-events
   */
  async getMetaEvents(eventId) {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      const docs = await this.collection.find({
        kind: 'EnvelopeWritten',
        'subject.eventId': eventId
      }).toArray();
      
      return docs.map(doc => Event.fromJSON(doc));
    } catch (error) {
      console.error(`Failed to get meta-events for ${eventId}:`, error);
      throw error;
    }
  }

  /**
   * Migrate events from one schema version to another
   * 
   * @param {number} fromVersion - Source schema version
   * @param {number} toVersion - Target schema version
   * @returns {number} Number of events migrated
   */
  async migrateSchema(fromVersion, toVersion) {
    if (!this.collection) {
      await this.initialize();
    }

    console.log(`Migrating events from schema v${fromVersion} to v${toVersion}`);
    
    try {
      // Find events with the source schema version
      const cursor = this.collection.find({ 
        schemaVersion: fromVersion 
      });
      
      let migratedCount = 0;
      
      // Process each event for migration
      for await (const doc of cursor) {
        // Apply migration transformations based on version
        const migratedEvent = this.applyMigration(doc, fromVersion, toVersion);
        
        // Update the event in the database
        await this.collection.updateOne(
          { id: doc.id },
          { $set: {
              ...migratedEvent,
              schemaVersion: toVersion
            }
          }
        );
        
        // Create and store migration meta-event
        const metaEvent = EventFactory.createCustomEvent(
          'SchemaMigrated',
          { eventId: doc.id },
          this.sourceId,
          null,
          {
            fromVersion,
            toVersion,
            migratedAt: Date.now()
          }
        );
        
        // Add schema version to meta-event
        const metaEventWithVersion = {
          ...metaEvent.toJSON(),
          schemaVersion: toVersion
        };
        
        await this.collection.insertOne(metaEventWithVersion);
        
        migratedCount++;
      }
      
      console.log(`Migrated ${migratedCount} events from v${fromVersion} to v${toVersion}`);
      return migratedCount;
    } catch (error) {
      console.error(`Failed to migrate schema from v${fromVersion} to v${toVersion}:`, error);
      throw error;
    }
  }

  /**
   * Apply migration transformations to an event
   * 
   * @param {Object} event - Event document to migrate
   * @param {number} fromVersion - Source schema version
   * @param {number} toVersion - Target schema version
   * @returns {Object} Migrated event
   */
  applyMigration(event, fromVersion, toVersion) {
    // Clone the event to avoid modifying the original
    const migrated = { ...event };
    
    // Apply transformations based on from/to versions
    if (fromVersion === 1 && toVersion === 2) {
      // v1 to v2 migration logic
      // For example, restructuring fields, adding new required fields, etc.
      
      // Example transformation: ensure payload is an object
      if (!migrated.payload) {
        migrated.payload = {};
      }
      
      // Example: add metadata field if not present
      if (!migrated.metadata) {
        migrated.metadata = {
          migrated: true,
          originalVersion: fromVersion
        };
      }
    }
    
    // Add more version transformation logic as needed
    
    return migrated;
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