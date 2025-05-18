/**
 * ProgressAgent
 * 
 * Agent responsible for calculating project progress.
 * 
 * State variables:
 * - lastScannedRev: Map of project ID to last scanned revision
 * - projectProgress: Map of project ID to progress percentage
 * 
 * Input predicate:
 * - Triggered by new RepoCommit events
 */
const BaseAgent = require('./BaseAgent');
const EventFactory = require('../core/EventFactory');
const fs = require('fs').promises;
const path = require('path');

class ProgressAgent extends BaseAgent {
  /**
   * Create a new ProgressAgent
   * 
   * @param {Object} options - Agent configuration
   */
  constructor(options = {}) {
    super({
      ...options,
      name: 'ProgressAgent',
      subscribedEvents: ['RepoCommit'],
      snapshotInterval: options.snapshotInterval || 10
    });
    
    // State variables
    this.lastScannedRev = new Map(); // Map<projectId, revision>
    this.projectProgress = new Map(); // Map<projectId, progress>
  }

  /**
   * Process an incoming RepoCommit event
   * 
   * @param {Event} event - RepoCommit event
   */
  async processEvent(event) {
    // Call super to handle snapshot scheduling
    await super.processEvent(event);
    
    if (!this.shouldProcessEvent(event)) return;

    try {
      // Extract data from event
      const { repo, branch, rev } = event.subject;
      
      // Determine project ID (extract from repo URL)
      const projectId = this.extractProjectId(repo);
      
      // Check if we've already scanned this revision
      if (this.lastScannedRev.get(projectId) === rev) {
        console.log(`Already scanned revision ${rev} for project ${projectId}`);
        return;
      }

      console.log(`Processing revision ${rev} for project ${projectId}`);
      
      // Analyze the repo to determine progress
      const { completed, total } = await this.analyzeRepo(repo, rev);
      
      // Calculate progress percentage
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      
      // Ensure progress is non-decreasing (monotonic)
      const currentProgress = this.projectProgress.get(projectId) || 0;
      const newProgress = Math.max(currentProgress, progress);
      
      // Update state
      this.lastScannedRev.set(projectId, rev);
      this.projectProgress.set(projectId, newProgress);
      
      console.log(`Project ${projectId} progress: ${newProgress}% (${completed}/${total} tasks)`);
      
      // Create and publish derived event
      const progressEvent = EventFactory.createProjectProgressCalculated(
        projectId,
        newProgress,
        this.id,
        event.id,
        {
          completedTasks: completed,
          totalTasks: total,
          repo,
          branch,
          rev
        }
      );
      
      await this.publishEvent(progressEvent);
    } catch (error) {
      console.error('Error in ProgressAgent.processEvent:', error);
    }
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
   * Analyze a repository to determine progress
   * 
   * @param {string} repoUrl - Repository URL
   * @param {string} revision - Commit hash/revision
   * @returns {Object} Object with completed and total task counts
   */
  async analyzeRepo(repoUrl, revision) {
    // This is a mock implementation
    // In a real system, this would clone/checkout the repo and analyze it
    
    // For demonstration purposes, we'll simulate finding tasks in code
    // by generating random but consistent results based on the repo and revision
    
    // Deterministic "random" based on repo and revision
    const seed = this.hashString(`${repoUrl}:${revision}`);
    const rng = this.seededRandom(seed);
    
    // Generate a reasonable number of total tasks
    const totalTasks = Math.floor(rng() * 100) + 20; // 20-120 tasks
    
    // Calculate completed tasks (ensure it's non-decreasing)
    const lastRevision = this.lastScannedRev.get(this.extractProjectId(repoUrl));
    const lastProgress = this.projectProgress.get(this.extractProjectId(repoUrl)) || 0;
    const lastCompleted = lastProgress > 0 ? Math.ceil((lastProgress / 100) * totalTasks) : 0;
    
    // If this is a new commit after one we've seen, completed should be >= previous
    if (lastRevision) {
      // Add 0-5 completed tasks from the last revision
      const additionalCompleted = Math.floor(rng() * 6);
      const completed = Math.min(totalTasks, lastCompleted + additionalCompleted);
      return { completed, total: totalTasks };
    } else {
      // First time we're seeing this project, start with some baseline progress
      const completed = Math.floor(rng() * totalTasks * 0.5); // 0-50% complete
      return { completed, total: totalTasks };
    }
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

  /**
   * Get a snapshot of the ProgressAgent's state
   * 
   * @returns {Object} Agent state snapshot
   */
  getSnapshot() {
    // Get base snapshot from parent
    const baseSnapshot = super.getSnapshot();
    
    // Add ProgressAgent-specific state
    return {
      ...baseSnapshot,
      lastScannedRev: Object.fromEntries(this.lastScannedRev),
      projectProgress: Object.fromEntries(this.projectProgress)
    };
  }

  /**
   * Load a snapshot into the ProgressAgent's state
   * 
   * @param {Object} snapshot - Snapshot to load
   * @returns {boolean} Whether the snapshot was loaded successfully
   */
  loadSnapshot(snapshot) {
    // Load base snapshot from parent
    const baseResult = super.loadSnapshot(snapshot);
    
    if (!baseResult || !snapshot) return false;
    
    try {
      // Restore ProgressAgent-specific state
      if (snapshot.lastScannedRev) {
        this.lastScannedRev = new Map(Object.entries(snapshot.lastScannedRev));
      }
      
      if (snapshot.projectProgress) {
        this.projectProgress = new Map(Object.entries(snapshot.projectProgress));
      }
      
      return true;
    } catch (error) {
      console.error('Error loading ProgressAgent snapshot:', error);
      return false;
    }
  }
}

module.exports = ProgressAgent; 