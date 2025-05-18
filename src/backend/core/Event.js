/**
 * Canonical Event Schema
 * 
 * All events in the system follow this structure. This is the core data model
 * that both primitive and derived facts adhere to.
 */
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class Event {
  /**
   * Create a new event
   * 
   * @param {string} source - Source of the event (github|ci|chat|agent-name)
   * @param {string} kind - Type of event (e.g., RepoCommit, PullRequest)
   * @param {Object} subject - Entity this event is about
   * @param {Object} payload - Arbitrary data associated with the event
   * @param {Object} options - Additional options
   * @param {string} [options.id] - Optional custom UUID (defaults to auto-generated)
   * @param {number} [options.ts] - Optional timestamp (defaults to current time)
   */
  constructor(source, kind, subject, payload, options = {}) {
    // Core properties
    this.id = options.id || uuidv4();
    this.ts = options.ts || Date.now();
    this.source = source;
    this.kind = kind;
    this.subject = subject;
    this.payload = payload;

    // Generate signature for integrity verification
    this.sig = this.generateSignature();
  }

  /**
   * Generate cryptographic signature for this event
   * Uses the event's content to create a hash for integrity verification
   */
  generateSignature() {
    const content = JSON.stringify({
      id: this.id,
      ts: this.ts,
      source: this.source,
      kind: this.kind,
      subject: this.subject,
      payload: this.payload
    });
    
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Verify the integrity of this event
   * @returns {boolean} True if the event has not been tampered with
   */
  verifyIntegrity() {
    const expectedSignature = this.generateSignature();
    return this.sig === expectedSignature;
  }

  /**
   * Convert event to a plain object suitable for storage/transmission
   * @returns {Object} Plain object representation of this event
   */
  toJSON() {
    return {
      id: this.id,
      ts: this.ts,
      source: this.source,
      kind: this.kind,
      subject: this.subject,
      payload: this.payload,
      sig: this.sig
    };
  }

  /**
   * Create an Event instance from a plain object
   * @param {Object} data - Plain object representation of an event
   * @returns {Event} New Event instance
   */
  static fromJSON(data) {
    const { id, ts, source, kind, subject, payload, sig } = data;
    const event = new Event(source, kind, subject, payload, { id, ts });
    
    // Override the auto-generated signature with the stored one
    event.sig = sig;
    
    return event;
  }
}

module.exports = Event; 