/**
 * RelationAgent
 * 
 * Agent responsible for detecting dependencies between projects.
 * 
 * State:
 * - projectDependencies: Graph of project dependencies
 * 
 * Input predicate:
 * - Triggered by RepoCommit and PipelineStatus events
 */
const BaseAgent = require('./BaseAgent');
const EventFactory = require('../core/EventFactory');

class RelationAgent extends BaseAgent {
  /**
   * Create a new RelationAgent
   * 
   * @param {Object} options - Agent configuration
   */
  constructor(options = {}) {
    super({
      ...options,
      name: 'RelationAgent',
      subscribedEvents: ['RepoCommit', 'PipelineStatus']
    });
    
    // State variables
    this.projectDependencies = new Map(); // Map<projectId, Set<{targetProjectId, type}>>
  }

  /**
   * Process an incoming event
   * 
   * @param {Event} event - Incoming event
   */
  async processEvent(event) {
    if (!this.shouldProcessEvent(event)) return;

    try {
      switch (event.kind) {
        case 'RepoCommit':
          await this.processRepoCommit(event);
          break;
        case 'PipelineStatus':
          await this.processPipelineStatus(event);
          break;
      }
    } catch (error) {
      console.error('Error in RelationAgent.processEvent:', error);
    }
  }

  /**
   * Process a RepoCommit event
   * 
   * @param {Event} event - RepoCommit event
   */
  async processRepoCommit(event) {
    const { repo, branch, rev } = event.subject;
    const { files } = event.payload;
    
    // Determine project ID from the repo URL
    const sourceProjectId = this.extractProjectId(repo);
    
    // Analyze files for dependencies (manifest files, imports, etc.)
    const dependencies = await this.analyzeFiles(sourceProjectId, files);
    
    // Add dependencies to the graph and publish events
    for (const { targetProjectId, dependencyType } of dependencies) {
      // Ensure the edge doesn't create a cycle (maintain acyclic property)
      if (this.wouldCreateCycle(sourceProjectId, targetProjectId)) {
        console.warn(`Dependency from ${sourceProjectId} to ${targetProjectId} would create a cycle, skipping`);
        
        // Optionally, we could emit an InsightRaised event here to alert about the cycle
        const insightEvent = EventFactory.createInsightRaised(
          sourceProjectId,
          `Detected circular dependency with ${targetProjectId}`,
          'warning',
          this.id,
          event.id
        );
        await this.publishEvent(insightEvent);
        
        continue;
      }
      
      // Add to our internal state
      this.addDependency(sourceProjectId, targetProjectId, dependencyType);
      
      // Publish DependencyEdgeAdded event
      const dependencyEvent = EventFactory.createDependencyEdgeAdded(
        sourceProjectId,
        targetProjectId,
        dependencyType,
        this.id,
        event.id
      );
      
      await this.publishEvent(dependencyEvent);
    }
  }

  /**
   * Process a PipelineStatus event
   * 
   * @param {Event} event - PipelineStatus event
   */
  async processPipelineStatus(event) {
    // For PipelineStatus events, we might detect dependencies based on build artifacts
    // or deployment order, but for this prototype we'll keep it simple
    console.log('Processing PipelineStatus event (not implemented)');
  }

  /**
   * Extract a project ID from a repository URL
   * 
   * @param {string} repoUrl - Repository URL
   * @returns {string} Project ID
   */
  extractProjectId(repoUrl) {
    // Extract the project name from the URL
    // This is a simplified implementation
    try {
      const url = new URL(repoUrl);
      const parts = url.pathname.split('/').filter(p => p);
      return parts[parts.length - 1].replace('.git', '');
    } catch (error) {
      // If not a valid URL, use the last segment of the path
      const parts = repoUrl.split('/').filter(p => p);
      return parts[parts.length - 1].replace('.git', '');
    }
  }

  /**
   * Analyze files for dependencies
   * 
   * @param {string} sourceProjectId - Source project ID
   * @param {Array<string>} files - List of files in the commit
   * @returns {Array<Object>} Dependencies found (targetProjectId, dependencyType)
   */
  async analyzeFiles(sourceProjectId, files) {
    // This is a mock implementation
    // In a real system, we would:
    // 1. Look for manifest files (package.json, pom.xml, build.gradle, etc.)
    // 2. Parse those files to find dependencies
    // 3. Match dependencies to other projects in our system
    
    // For demonstration purposes, we'll generate mock dependencies
    // based on the project ID and files
    
    const dependencies = [];
    
    // Check for manifest files
    const manifestFiles = files.filter(file => 
      file.endsWith('package.json') || 
      file.endsWith('pom.xml') || 
      file.endsWith('build.gradle') ||
      file.endsWith('requirements.txt')
    );
    
    if (manifestFiles.length > 0) {
      // Mock: Generate 0-2 dependencies with deterministic but "random" logic
      const seed = this.hashString(sourceProjectId);
      const rng = this.seededRandom(seed);
      
      const numDependencies = Math.floor(rng() * 3); // 0, 1, or 2 dependencies
      
      for (let i = 0; i < numDependencies; i++) {
        // Generate a target project ID that's not the same as source
        let targetProjectId;
        do {
          // Just some arbitrary logic to generate different project IDs
          const projectNum = Math.floor(rng() * 10) + 1;
          targetProjectId = `project-${projectNum}`;
        } while (targetProjectId === sourceProjectId);
        
        // Determine dependency type
        const typeIndex = Math.floor(rng() * 3);
        const dependencyTypes = ['imports', 'uses', 'depends-on'];
        const dependencyType = dependencyTypes[typeIndex];
        
        dependencies.push({ targetProjectId, dependencyType });
      }
    }
    
    return dependencies;
  }

  /**
   * Add a dependency to the internal graph
   * 
   * @param {string} sourceProjectId - Source project ID
   * @param {string} targetProjectId - Target project ID
   * @param {string} dependencyType - Type of dependency
   */
  addDependency(sourceProjectId, targetProjectId, dependencyType) {
    if (!this.projectDependencies.has(sourceProjectId)) {
      this.projectDependencies.set(sourceProjectId, new Set());
    }
    
    this.projectDependencies.get(sourceProjectId).add({
      targetProjectId,
      dependencyType
    });
  }

  /**
   * Check if adding an edge would create a cycle in the dependency graph
   * 
   * @param {string} sourceProjectId - Source project ID
   * @param {string} targetProjectId - Target project ID
   * @returns {boolean} True if adding the edge would create a cycle
   */
  wouldCreateCycle(sourceProjectId, targetProjectId) {
    // If they're the same, it's a self-loop
    if (sourceProjectId === targetProjectId) {
      return true;
    }
    
    // Check if target depends on source (directly or indirectly)
    const visited = new Set();
    
    const dfs = (currentId) => {
      if (currentId === sourceProjectId) {
        return true; // Found a path back to source = cycle
      }
      
      if (visited.has(currentId)) {
        return false; // Already visited, no cycle through this path
      }
      
      visited.add(currentId);
      
      const dependencies = this.projectDependencies.get(currentId);
      if (!dependencies) {
        return false; // No outgoing edges
      }
      
      for (const dep of dependencies) {
        if (dfs(dep.targetProjectId)) {
          return true; // Found a cycle
        }
      }
      
      return false;
    };
    
    return dfs(targetProjectId);
  }

  /**
   * Create a simple hash from a string
   * 
   * @param {string} str - Input string
   * @returns {number} Hash value
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * Create a seeded random number generator
   * 
   * @param {number} seed - Seed for the RNG
   * @returns {Function} Random number generator function
   */
  seededRandom(seed) {
    return function() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }
}

module.exports = RelationAgent; 