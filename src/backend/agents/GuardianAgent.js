/**
 * GuardianAgent
 * 
 * Agent responsible for monitoring runtime invariants and ensuring system integrity.
 * Subscribes to relevant events and verifies that they follow expected invariants:
 * - Progress is monotonically increasing
 * - Dependency graph remains acyclic
 * - Causal relationships point to existing events
 */
const BaseAgent = require('./BaseAgent');
const EventFactory = require('../core/EventFactory');

class GuardianAgent extends BaseAgent {
  /**
   * Create a new GuardianAgent
   * 
   * @param {Object} options - Agent configuration
   * @param {Object} options.factStore - Reference to the FactStore instance
   */
  constructor(options = {}) {
    super({
      ...options,
      name: 'GuardianAgent',
      subscribedEvents: [
        'ProjectProgressCalculated',
        'DependencyEdgeAdded',
        'EnvelopeWritten'
      ],
      snapshotInterval: options.snapshotInterval || 100
    });
    
    // Store reference to FactStore
    this.factStore = options.factStore;
    if (!this.factStore) {
      throw new Error('GuardianAgent requires a factStore instance');
    }
    
    // State variables
    this.projectProgress = new Map(); // Map<projectId, progress>
    this.dependencyGraph = new Map(); // Map<projectId, Set<dependencies>>
    this.reverseGraph = new Map(); // Map<projectId, Set<dependents>>
    this.knownEventIds = new Set(); // Set of known event IDs
    this.violations = []; // Array of violations detected
  }

  /**
   * Process an incoming event
   * 
   * @param {Event} event - Event to process
   */
  async processEvent(event) {
    // Call super to handle snapshot scheduling
    await super.processEvent(event);
    
    if (!this.shouldProcessEvent(event)) return;

    try {
      // Add event ID to known events
      this.knownEventIds.add(event.id);
      
      // Check invariants based on event kind
      switch (event.kind) {
        case 'ProjectProgressCalculated':
          await this.checkProgressMonotonicity(event);
          break;
        case 'DependencyEdgeAdded':
          await this.checkGraphAcyclicity(event);
          break;
        case 'EnvelopeWritten':
          await this.checkCausalIntegrity(event);
          break;
      }
    } catch (error) {
      console.error('Error in GuardianAgent.processEvent:', error);
      // Still attempt to report the error as a violation
      await this.reportViolation(
        'SystemError',
        `Error processing event: ${error.message}`,
        event.id,
        { error: error.stack }
      );
    }
  }

  /**
   * Check that project progress is monotonically increasing
   * 
   * @param {Event} event - ProjectProgressCalculated event
   */
  async checkProgressMonotonicity(event) {
    const { projectId } = event.subject;
    const { progress } = event.payload;
    
    // Get previous progress value
    const previousProgress = this.projectProgress.get(projectId) || 0;
    
    // Check if progress has decreased
    if (progress < previousProgress) {
      await this.reportViolation(
        'ProgressReduction',
        `Project ${projectId} progress decreased from ${previousProgress}% to ${progress}%`,
        event.id,
        {
          projectId,
          previousProgress,
          newProgress: progress
        }
      );
    } else {
      // Update tracked progress
      this.projectProgress.set(projectId, progress);
    }
  }

  /**
   * Check that the dependency graph remains acyclic
   * 
   * @param {Event} event - DependencyEdgeAdded event
   */
  async checkGraphAcyclicity(event) {
    const { sourceProjectId, targetProjectId } = event.subject;
    
    // Add the edge to the dependency graph
    if (!this.dependencyGraph.has(sourceProjectId)) {
      this.dependencyGraph.set(sourceProjectId, new Set());
    }
    this.dependencyGraph.get(sourceProjectId).add(targetProjectId);
    
    // Add to reverse graph for quick cycle detection
    if (!this.reverseGraph.has(targetProjectId)) {
      this.reverseGraph.set(targetProjectId, new Set());
    }
    this.reverseGraph.get(targetProjectId).add(sourceProjectId);
    
    // Check for cycles
    const cycle = this.detectCycle(sourceProjectId);
    if (cycle) {
      // Remove the edge that caused the cycle
      this.dependencyGraph.get(sourceProjectId).delete(targetProjectId);
      this.reverseGraph.get(targetProjectId).delete(sourceProjectId);
      
      await this.reportViolation(
        'CyclicDependency',
        `Adding dependency from ${sourceProjectId} to ${targetProjectId} would create a cycle: ${cycle.join(' -> ')}`,
        event.id,
        {
          sourceProjectId,
          targetProjectId,
          cycle
        }
      );
    }
  }

  /**
   * Check that causal references point to existing events
   * 
   * @param {Event} event - EnvelopeWritten event
   */
  async checkCausalIntegrity(event) {
    const { kind, source, ts } = event.payload;
    const evtId = event.subject.eventId;
    
    // Get the referenced event
    const referencedEvent = await this.getEventById(evtId);
    
    // Check if the event exists
    if (!referencedEvent) {
      // No violation here - this can happen during startup
      return;
    }
    
    // Check caused-by relationships (if any)
    const causedBy = referencedEvent.causedBy;
    if (causedBy && !this.knownEventIds.has(causedBy)) {
      // Try to get the causal event
      const causalEvent = await this.getEventById(causedBy);
      
      if (!causalEvent) {
        await this.reportViolation(
          'MissingCausalEvent',
          `Event ${evtId} references non-existent causal event ${causedBy}`,
          event.id,
          {
            eventId: evtId,
            causedBy
          }
        );
      } else {
        // If we found it, add it to known events
        this.knownEventIds.add(causedBy);
      }
    }
  }

  /**
   * Helper function to get an event by ID from FactStore
   * 
   * @param {string} eventId - Event ID to get
   * @returns {Event|null} The event or null if not found
   */
  async getEventById(eventId) {
    try {
      return await this.factStore.getById(eventId);
    } catch (error) {
      console.error(`Error getting event ${eventId}:`, error);
      return null;
    }
  }

  /**
   * Detect cycles in the dependency graph starting from a node
   * 
   * @param {string} startNode - Node to start from
   * @param {Set<string>} visited - Set of visited nodes (for recursion)
   * @param {Array<string>} path - Current path (for recursion)
   * @returns {Array<string>|null} Cycle path if found, null otherwise
   */
  detectCycle(startNode, visited = new Set(), path = []) {
    // If we've already visited this node in the current path, we found a cycle
    if (path.includes(startNode)) {
      return [...path, startNode];
    }
    
    // Mark as visited for this path
    visited.add(startNode);
    path.push(startNode);
    
    // Check all dependencies
    const dependencies = this.dependencyGraph.get(startNode) || new Set();
    for (const dependency of dependencies) {
      const result = this.detectCycle(dependency, visited, [...path]);
      if (result) {
        return result;
      }
    }
    
    // No cycle found in this path
    return null;
  }

  /**
   * Report a violation by creating and publishing an InvariantViolated event
   * 
   * @param {string} violationType - Type of violation
   * @param {string} message - Description of the violation
   * @param {string} causingEventId - ID of the event that caused the violation
   * @param {Object} details - Additional details about the violation
   */
  async reportViolation(violationType, message, causingEventId, details = {}) {
    console.warn(`INVARIANT VIOLATION: ${violationType} - ${message}`);
    
    // Add to violations list
    this.violations.push({
      type: violationType,
      message,
      causingEventId,
      details,
      timestamp: Date.now()
    });
    
    // Create and publish the InvariantViolated event
    const violationEvent = EventFactory.createCustomEvent(
      'InvariantViolated',
      { invariantType: violationType },
      this.id,
      causingEventId,
      {
        message,
        details,
        timestamp: Date.now()
      }
    );
    
    await this.publishEvent(violationEvent);
  }

  /**
   * Get a snapshot of the GuardianAgent's state
   * 
   * @returns {Object} Agent state
   */
  getSnapshot() {
    // Get base snapshot from parent
    const baseSnapshot = super.getSnapshot();
    
    // Add GuardianAgent-specific state
    return {
      ...baseSnapshot,
      projectProgress: Object.fromEntries(this.projectProgress),
      dependencyGraph: this.serializeGraph(this.dependencyGraph),
      reverseGraph: this.serializeGraph(this.reverseGraph),
      knownEventIds: Array.from(this.knownEventIds),
      violations: this.violations
    };
  }

  /**
   * Load a snapshot into the GuardianAgent's state
   * 
   * @param {Object} snapshot - Snapshot to load
   * @returns {boolean} Whether the snapshot was loaded successfully
   */
  loadSnapshot(snapshot) {
    // Load base snapshot from parent
    const baseResult = super.loadSnapshot(snapshot);
    
    if (!baseResult || !snapshot) return false;
    
    try {
      // Restore GuardianAgent-specific state
      if (snapshot.projectProgress) {
        this.projectProgress = new Map(Object.entries(snapshot.projectProgress));
      }
      
      if (snapshot.dependencyGraph) {
        this.dependencyGraph = this.deserializeGraph(snapshot.dependencyGraph);
      }
      
      if (snapshot.reverseGraph) {
        this.reverseGraph = this.deserializeGraph(snapshot.reverseGraph);
      }
      
      if (snapshot.knownEventIds) {
        this.knownEventIds = new Set(snapshot.knownEventIds);
      }
      
      if (snapshot.violations) {
        this.violations = snapshot.violations;
      }
      
      return true;
    } catch (error) {
      console.error('Error loading GuardianAgent snapshot:', error);
      return false;
    }
  }

  /**
   * Serialize a graph (Map<string, Set<string>>) for snapshot
   * 
   * @param {Map<string, Set<string>>} graph - Graph to serialize
   * @returns {Object} Serialized graph
   */
  serializeGraph(graph) {
    const result = {};
    for (const [key, values] of graph.entries()) {
      result[key] = Array.from(values);
    }
    return result;
  }

  /**
   * Deserialize a graph from a snapshot
   * 
   * @param {Object} serialized - Serialized graph
   * @returns {Map<string, Set<string>>} Deserialized graph
   */
  deserializeGraph(serialized) {
    const result = new Map();
    for (const [key, values] of Object.entries(serialized)) {
      result.set(key, new Set(values));
    }
    return result;
  }
}

module.exports = GuardianAgent; 