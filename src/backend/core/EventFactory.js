/**
 * EventFactory
 * 
 * Factory for creating standard event types with proper structure.
 * Ensures consistency across the system for both primitive and derived events.
 */
const Event = require('./Event');

class EventFactory {
  /**
   * Create a RepoCommit event
   * 
   * @param {string} repoUrl - URL of the repository
   * @param {string} branch - Branch name
   * @param {string} rev - Commit hash/revision
   * @param {string} author - Author of the commit
   * @param {string} message - Commit message
   * @param {Array} files - List of changed files
   * @param {Object} options - Additional options
   * @returns {Event} New RepoCommit event
   */
  static createRepoCommit(repoUrl, branch, rev, author, message, files, options = {}) {
    return new Event(
      'github', // source
      'RepoCommit', // kind
      {
        repo: repoUrl,
        branch,
        rev
      },
      {
        author,
        message,
        files,
        ...options
      }
    );
  }

  /**
   * Create a PullRequest event
   * 
   * @param {string} repoUrl - URL of the repository
   * @param {string} prNumber - Pull request number
   * @param {string} title - Title of the pull request
   * @param {string} author - Author of the pull request
   * @param {string} sourceBranch - Source branch
   * @param {string} targetBranch - Target branch
   * @param {Object} options - Additional options
   * @returns {Event} New PullRequest event
   */
  static createPullRequest(repoUrl, prNumber, title, author, sourceBranch, targetBranch, options = {}) {
    return new Event(
      'github', // source
      'PullRequest', // kind
      {
        repo: repoUrl,
        prNumber
      },
      {
        title,
        author,
        sourceBranch,
        targetBranch,
        ...options
      }
    );
  }

  /**
   * Create a PipelineStatus event
   * 
   * @param {string} repoUrl - URL of the repository
   * @param {string} rev - Commit hash/revision
   * @param {string} pipelineId - ID of the pipeline
   * @param {string} status - Status of the pipeline (success, failure, in_progress)
   * @param {Object} options - Additional options
   * @returns {Event} New PipelineStatus event
   */
  static createPipelineStatus(repoUrl, rev, pipelineId, status, options = {}) {
    return new Event(
      'ci', // source
      'PipelineStatus', // kind
      {
        repo: repoUrl,
        rev,
        pipelineId
      },
      {
        status,
        ...options
      }
    );
  }

  /**
   * Create a ChatMessage event
   * 
   * @param {string} userId - ID of the user
   * @param {string} channelId - ID of the channel
   * @param {string} text - Message text
   * @param {Object} options - Additional options
   * @returns {Event} New ChatMessage event
   */
  static createChatMessage(userId, channelId, text, options = {}) {
    return new Event(
      'chat', // source
      'ChatMessage', // kind
      {
        userId,
        channelId
      },
      {
        text,
        ...options
      }
    );
  }

  /**
   * Create a ProjectProgressCalculated event
   * 
   * @param {string} projectId - ID of the project
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} agentId - ID of the progress agent
   * @param {string} causedBy - ID of the event that caused this calculation
   * @param {Object} options - Additional options
   * @returns {Event} New ProjectProgressCalculated event
   */
  static createProjectProgressCalculated(projectId, progress, agentId, causedBy, options = {}) {
    return new Event(
      agentId, // source
      'ProjectProgressCalculated', // kind
      {
        projectId
      },
      {
        progress,
        causedBy,
        ...options
      }
    );
  }

  /**
   * Create a DependencyEdgeAdded event
   * 
   * @param {string} sourceProjectId - ID of the source project
   * @param {string} targetProjectId - ID of the target project
   * @param {string} dependencyType - Type of dependency
   * @param {string} agentId - ID of the relation agent
   * @param {string} causedBy - ID of the event that caused this edge addition
   * @param {Object} options - Additional options
   * @returns {Event} New DependencyEdgeAdded event
   */
  static createDependencyEdgeAdded(sourceProjectId, targetProjectId, dependencyType, agentId, causedBy, options = {}) {
    return new Event(
      agentId, // source
      'DependencyEdgeAdded', // kind
      {
        sourceProjectId,
        targetProjectId
      },
      {
        dependencyType,
        causedBy,
        ...options
      }
    );
  }

  /**
   * Create an InsightRaised event
   * 
   * @param {string} projectId - ID of the project
   * @param {string} message - Insight message
   * @param {string} severity - Severity level (info, warning, critical)
   * @param {string} agentId - ID of the insight agent
   * @param {string} causedBy - ID of the event that caused this insight
   * @param {Object} options - Additional options
   * @returns {Event} New InsightRaised event
   */
  static createInsightRaised(projectId, message, severity, agentId, causedBy, options = {}) {
    return new Event(
      agentId, // source
      'InsightRaised', // kind
      {
        projectId
      },
      {
        message,
        severity,
        causedBy,
        ...options
      }
    );
  }

  /**
   * Create a NarrativeGenerated event
   * 
   * @param {string} narrativeId - ID of the narrative
   * @param {string} text - Narrative text
   * @param {Array} relatedEvents - IDs of events related to this narrative
   * @param {string} agentId - ID of the narrative agent
   * @param {Object} options - Additional options
   * @returns {Event} New NarrativeGenerated event
   */
  static createNarrativeGenerated(narrativeId, text, relatedEvents, agentId, options = {}) {
    return new Event(
      agentId, // source
      'NarrativeGenerated', // kind
      {
        narrativeId
      },
      {
        text,
        relatedEvents,
        ...options
      }
    );
  }

  /**
   * Create a DocumentUploaded event
   * 
   * @param {string} docId - ID of the document
   * @param {string} fileName - Name of the uploaded file
   * @param {string} mime - MIME type of the document
   * @param {string} rawText - Extracted text content from the document
   * @param {string} userId - ID of the user who uploaded the document
   * @returns {Event} New DocumentUploaded event
   */
  static createDocumentUploaded(docId, fileName, mime, rawText, userId) {
    return new Event(
      userId ?? 'chatbot', // source
      'DocumentUploaded', // kind
      {
        docId,
        fileName,
        mime
      },
      {
        rawText
      }
    );
  }

  /**
   * Create a custom event with the specified kind
   * 
   * @param {string} kind - Event kind
   * @param {Object} subject - Event subject
   * @param {string} source - Event source/creator
   * @param {string} causedBy - ID of the event that caused this event
   * @param {Object} payload - Additional payload data
   * @returns {Event} New custom event
   */
  static createCustomEvent(kind, subject, source, causedBy, payload = {}) {
    return new Event(
      source,
      kind,
      subject,
      {
        ...payload,
        causedBy
      }
    );
  }
}

module.exports = EventFactory; 