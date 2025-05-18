/**
 * Integration test for GuardianAgent
 * 
 * Tests the entire flow from RepoCommit to ProgressAgent to GuardianAgent
 */
const GuardianAgent = require('../../src/backend/agents/GuardianAgent');
const ProgressAgent = require('../../src/backend/agents/ProgressAgent');
const EventFactory = require('../../src/backend/core/EventFactory');
const MockEventBroker = require('../../src/backend/core/MockEventBroker');
const MockFactStore = require('../../src/backend/core/MockFactStore');
const EventBroker = require('../../src/backend/core/EventBroker');
const FactStore = require('../../src/backend/core/FactStore');

describe('GuardianAgent Integration', () => {
  // Test with mock components
  describe('With Mock Implementation', () => {
    let mockBroker;
    let mockFactStore;
    let guardianAgent;
    let progressAgent;
    let publishedEvents;
    
    beforeEach(async () => {
      // Set up components
      mockFactStore = new MockFactStore();
      mockBroker = new MockEventBroker({ factStore: mockFactStore });
      
      // Initialize broker and factstore
      await mockFactStore.initialize();
      await mockBroker.initialize();
      
      // Track published events
      publishedEvents = [];
      const originalPublish = mockBroker.publish;
      mockBroker.publish = jest.fn(async (event) => {
        publishedEvents.push(event);
        return originalPublish.call(mockBroker, event);
      });
      
      // Create and initialize agents
      progressAgent = new ProgressAgent({ 
        broker: mockBroker,
        id: 'test-progress-agent'
      });
      
      guardianAgent = new GuardianAgent({
        broker: mockBroker,
        factStore: mockFactStore,
        id: 'test-guardian-agent'
      });
      
      // Initialize and start agents
      await progressAgent.initialize();
      await progressAgent.start();
      
      await guardianAgent.initialize();
      await guardianAgent.start();
    });
    
    afterEach(async () => {
      // Clean up
      await progressAgent.stop();
      await guardianAgent.stop();
      await mockBroker.close();
    });
    
    test('should detect violations when progress decreases', async () => {
      // Create a commit event
      const repoCommit1 = EventFactory.createRepoCommit(
        'project-1',
        'external-source',
        null,
        { 
          completedTasks: 5,
          totalTasks: 10
        }
      );
      
      // Publish the event
      await mockBroker.publish(repoCommit1);
      
      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify that ProgressAgent created a progress event
      const progressEvents = publishedEvents.filter(e => e.kind === 'ProjectProgressCalculated');
      expect(progressEvents.length).toBe(1);
      expect(progressEvents[0].subject.projectId).toBe('project-1');
      expect(progressEvents[0].payload.progress).toBe(50);
      
      // No violations yet
      const violations = publishedEvents.filter(e => e.kind === 'InvariantViolated');
      expect(violations.length).toBe(0);
      
      // Now create a second commit with lower progress
      const repoCommit2 = EventFactory.createRepoCommit(
        'project-1',
        'external-source',
        null,
        { 
          completedTasks: 4, // Decreased from 5
          totalTasks: 10
        }
      );
      
      // Publish the event
      await mockBroker.publish(repoCommit2);
      
      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have a new progress event
      const newProgressEvents = publishedEvents.filter(e => e.kind === 'ProjectProgressCalculated');
      expect(newProgressEvents.length).toBe(2);
      
      // And a violation detected
      const newViolations = publishedEvents.filter(e => e.kind === 'InvariantViolated');
      expect(newViolations.length).toBe(1);
      expect(newViolations[0].subject.invariantType).toBe('ProgressReduction');
    });
  });
  
  // Conditional real implementation test
  // Only runs if MONGODB_URL and REDIS_URL are present in environment
  (process.env.MONGODB_URL && process.env.REDIS_URL ? describe : describe.skip)('With Real Implementation', () => {
    let broker;
    let factStore;
    let guardianAgent;
    let progressAgent;
    let publishedEvents;
    
    beforeEach(async () => {
      // Set up components with real implementations
      factStore = new FactStore({
        mongoUrl: process.env.MONGODB_URL || 'mongodb://localhost:27017',
        dbName: `test_${Date.now()}` // Use a unique DB for each test
      });
      
      broker = new EventBroker({ 
        factStore,
        redisUrl: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      
      // Initialize broker and factstore
      await factStore.initialize();
      await broker.initialize();
      
      // Track published events
      publishedEvents = [];
      const originalPublish = broker.publish;
      broker.publish = jest.fn(async (event) => {
        publishedEvents.push(event);
        return originalPublish.call(broker, event);
      });
      
      // Create and initialize agents
      progressAgent = new ProgressAgent({ 
        broker,
        id: 'test-progress-agent'
      });
      
      guardianAgent = new GuardianAgent({
        broker,
        factStore,
        id: 'test-guardian-agent'
      });
      
      // Initialize and start agents
      await progressAgent.initialize();
      await progressAgent.start();
      
      await guardianAgent.initialize();
      await guardianAgent.start();
    });
    
    afterEach(async () => {
      // Clean up
      await progressAgent.stop();
      await guardianAgent.stop();
      await broker.close();
      
      // Drop the test database
      if (factStore && factStore.client) {
        try {
          await factStore.db.dropDatabase();
          await factStore.close();
        } catch (e) {
          console.error('Error cleaning up test database:', e);
        }
      }
    });
    
    test('should detect violations when progress decreases', async () => {
      // Create a commit event
      const repoCommit1 = EventFactory.createRepoCommit(
        'project-1',
        'external-source',
        null,
        { 
          completedTasks: 5,
          totalTasks: 10
        }
      );
      
      // Publish the event
      await broker.publish(repoCommit1);
      
      // Wait for processing to complete (takes longer with real Redis/Mongo)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify that ProgressAgent created a progress event
      const progressEvents = publishedEvents.filter(e => e.kind === 'ProjectProgressCalculated');
      expect(progressEvents.length).toBe(1);
      expect(progressEvents[0].subject.projectId).toBe('project-1');
      expect(progressEvents[0].payload.progress).toBe(50);
      
      // No violations yet
      const violations = publishedEvents.filter(e => e.kind === 'InvariantViolated');
      expect(violations.length).toBe(0);
      
      // Now create a second commit with lower progress
      const repoCommit2 = EventFactory.createRepoCommit(
        'project-1',
        'external-source',
        null,
        { 
          completedTasks: 4, // Decreased from 5
          totalTasks: 10
        }
      );
      
      // Publish the event
      await broker.publish(repoCommit2);
      
      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Should have a new progress event
      const newProgressEvents = publishedEvents.filter(e => e.kind === 'ProjectProgressCalculated');
      expect(newProgressEvents.length).toBe(2);
      
      // And a violation detected
      const newViolations = publishedEvents.filter(e => e.kind === 'InvariantViolated');
      expect(newViolations.length).toBe(1);
      expect(newViolations[0].subject.invariantType).toBe('ProgressReduction');
    });
  });
}); 