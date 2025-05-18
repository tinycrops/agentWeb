/**
 * Unit tests for the GuardianAgent
 */
const GuardianAgent = require('../src/backend/agents/GuardianAgent');
const EventFactory = require('../src/backend/core/EventFactory');
const MockEventBroker = require('../src/backend/core/MockEventBroker');

describe('GuardianAgent', () => {
  let guardianAgent;
  let mockBroker;
  let publishedEvents;
  
  beforeEach(() => {
    // Set up a mock broker that just records published events
    mockBroker = new MockEventBroker();
    publishedEvents = [];
    
    // Mock the publish method to record events
    mockBroker.publish = jest.fn(async (event) => {
      publishedEvents.push(event);
      return true;
    });
    
    // Create the agent
    guardianAgent = new GuardianAgent({
      broker: mockBroker,
      id: 'test-guardian-agent'
    });
  });
  
  describe('Progress Monotonicity', () => {
    test('should detect decreasing progress', async () => {
      // Initialize the agent
      await guardianAgent.initialize();
      await guardianAgent.start();
      
      // First progress event (50%)
      const event1 = EventFactory.createProjectProgressCalculated(
        'project-1',
        50,
        'progress-agent',
        null,
        { completedTasks: 5, totalTasks: 10 }
      );
      
      // Process the event
      await guardianAgent.processEvent(event1);
      
      // No violations yet
      expect(publishedEvents.length).toBe(0);
      expect(guardianAgent.projectProgress.get('project-1')).toBe(50);
      
      // Second progress event with higher progress (70%)
      const event2 = EventFactory.createProjectProgressCalculated(
        'project-1',
        70,
        'progress-agent',
        null,
        { completedTasks: 7, totalTasks: 10 }
      );
      
      // Process the event
      await guardianAgent.processEvent(event2);
      
      // Still no violations
      expect(publishedEvents.length).toBe(0);
      expect(guardianAgent.projectProgress.get('project-1')).toBe(70);
      
      // Third progress event with DECREASING progress (60%)
      const event3 = EventFactory.createProjectProgressCalculated(
        'project-1',
        60,
        'progress-agent',
        null,
        { completedTasks: 6, totalTasks: 10 }
      );
      
      // Process the event
      await guardianAgent.processEvent(event3);
      
      // Should detect a violation
      expect(publishedEvents.length).toBe(1);
      expect(publishedEvents[0].kind).toBe('InvariantViolated');
      expect(publishedEvents[0].subject.invariantType).toBe('ProgressReduction');
      expect(publishedEvents[0].payload.details.previousProgress).toBe(70);
      expect(publishedEvents[0].payload.details.newProgress).toBe(60);
      
      // Progress should still be at 70% (not updated due to violation)
      expect(guardianAgent.projectProgress.get('project-1')).toBe(70);
    });
  });
  
  describe('Cyclic Dependencies', () => {
    test('should detect cyclic dependencies', async () => {
      // Initialize the agent
      await guardianAgent.initialize();
      await guardianAgent.start();
      
      // Add dependency A → B
      const event1 = EventFactory.createDependencyEdgeAdded(
        'project-A',
        'project-B',
        'relation-agent',
        null,
        { dependencyType: 'imports' }
      );
      
      await guardianAgent.processEvent(event1);
      
      // No violations yet
      expect(publishedEvents.length).toBe(0);
      
      // Add dependency B → C
      const event2 = EventFactory.createDependencyEdgeAdded(
        'project-B',
        'project-C',
        'relation-agent',
        null,
        { dependencyType: 'imports' }
      );
      
      await guardianAgent.processEvent(event2);
      
      // Still no violations
      expect(publishedEvents.length).toBe(0);
      
      // Add dependency C → A (creates a cycle A → B → C → A)
      const event3 = EventFactory.createDependencyEdgeAdded(
        'project-C',
        'project-A',
        'relation-agent',
        null,
        { dependencyType: 'imports' }
      );
      
      await guardianAgent.processEvent(event3);
      
      // Should detect a violation
      expect(publishedEvents.length).toBe(1);
      expect(publishedEvents[0].kind).toBe('InvariantViolated');
      expect(publishedEvents[0].subject.invariantType).toBe('CyclicDependency');
      
      // Check the cycle details
      const cycle = publishedEvents[0].payload.details.cycle;
      expect(cycle).toContain('project-A');
      expect(cycle).toContain('project-B');
      expect(cycle).toContain('project-C');
    });
  });
  
  describe('Snapshot Functionality', () => {
    test('should save and restore state correctly', async () => {
      // Initialize the agent
      await guardianAgent.initialize();
      
      // Add some state
      guardianAgent.projectProgress.set('project-1', 50);
      guardianAgent.projectProgress.set('project-2', 75);
      
      // Take a snapshot
      const snapshot = guardianAgent.getSnapshot();
      
      // Verify the snapshot content
      expect(snapshot.projectProgress['project-1']).toBe(50);
      expect(snapshot.projectProgress['project-2']).toBe(75);
      
      // Create a new agent
      const newAgent = new GuardianAgent({
        broker: mockBroker,
        id: 'test-guardian-agent-2'
      });
      
      // Load the snapshot
      const result = newAgent.loadSnapshot(snapshot);
      expect(result).toBe(true);
      
      // Verify the state was restored
      expect(newAgent.projectProgress.get('project-1')).toBe(50);
      expect(newAgent.projectProgress.get('project-2')).toBe(75);
    });
  });
}); 