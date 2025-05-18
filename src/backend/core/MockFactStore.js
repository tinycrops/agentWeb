/**
 * MockFactStore
 * 
 * In-memory implementation of the FactStore for development/testing
 * when MongoDB is not available.
 */
const Event = require('./Event');

class MockFactStore {
  /**
   * Create a new MockFactStore
   */
  constructor() {
    this.events = new Map(); // Map<eventId, eventData>
    this.isInitialized = false;
  }

  /**
   * Initialize the MockFactStore
   */
  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    console.log('MockFactStore initialized');
  }

  /**
   * Append a new event to the store
   * 
   * @param {Event} event - Event to append
   * @returns {boolean} True if the event was stored successfully
   */
  async append(event) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Ensure the event has a valid signature
      if (!event.verifyIntegrity()) {
        throw new Error('Event integrity check failed');
      }

      // Only insert if not already present (idempotence)
      if (!this.events.has(event.id)) {
        this.events.set(event.id, event.toJSON());
        return true;
      }
      
      return true; // Already exists, considered success
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
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const data = this.events.get(id);
      if (!data) return null;
      
      return Event.fromJSON(data);
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
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Convert to array for filtering
      let results = Array.from(this.events.values());
      
      // Apply filters
      if (options.kind) {
        results = results.filter(event => event.kind === options.kind);
      }
      
      if (options.source) {
        results = results.filter(event => event.source === options.source);
      }
      
      if (options.fromTs || options.toTs) {
        results = results.filter(event => {
          if (options.fromTs && event.ts < options.fromTs) return false;
          if (options.toTs && event.ts > options.toTs) return false;
          return true;
        });
      }
      
      if (options.projectId) {
        results = results.filter(event => 
          event.subject.projectId === options.projectId
        );
      }
      
      // Sort by timestamp
      results.sort((a, b) => a.ts - b.ts);
      
      // Apply pagination
      if (options.skip) {
        results = results.slice(options.skip);
      }
      
      if (options.limit) {
        results = results.slice(0, options.limit);
      }
      
      // Convert to Event objects
      return results.map(data => Event.fromJSON(data));
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
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const results = Array.from(this.events.values()).filter(
        event => event.payload.causedBy === eventId
      );
      
      return results.map(data => Event.fromJSON(data));
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
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const results = Array.from(this.events.values())
        .sort((a, b) => b.ts - a.ts)
        .slice(0, limit);
      
      return results.map(data => Event.fromJSON(data));
    } catch (error) {
      console.error('Failed to get latest events:', error);
      throw error;
    }
  }

  /**
   * Close the connection
   */
  async close() {
    this.isInitialized = false;
    console.log('MockFactStore closed');
  }
}

module.exports = MockFactStore; 