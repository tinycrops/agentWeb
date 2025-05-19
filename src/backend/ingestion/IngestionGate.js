/**
 * IngestionGate
 * 
 * Responsible for ingesting external events and normalizing them
 * into the canonical event structure.
 */
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const EventFactory = require('../core/EventFactory');
const EventBroker = require('../core/EventBroker');
const { extractText } = require('../util/documentUtils');

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

class IngestionGate {
  /**
   * Create a new IngestionGate
   * 
   * @param {Object} options - Configuration options
   * @param {EventBroker} options.broker - Event broker to publish events to
   */
  constructor(options = {}) {
    this.broker = options.broker;
    this.router = express.Router();
    this.setupRoutes();
  }

  /**
   * Set up the Express routes for ingestion
   */
  setupRoutes() {
    // Document upload endpoint
    this.router.post('/upload', upload.single('file'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: 'No file provided'
          });
        }
        
        const { originalname, mimetype, buffer } = req.file;
        const text = await extractText(buffer, mimetype);
        const docId = uuidv4();
        const userId = req.body.userId || 'chatbot';
        
        const event = EventFactory.createDocumentUploaded(
          docId, 
          originalname, 
          mimetype, 
          text, 
          userId
        );
        
        const ok = await this.broker.publish(event);
        
        res.status(ok ? 202 : 500).json({
          success: ok,
          docId,
          message: ok ? 'Document uploaded successfully' : 'Failed to process document'
        });
      } catch (error) {
        console.error('Error processing document upload:', error);
        res.status(500).json({ 
          success: false, 
          message: 'Internal server error' 
        });
      }
    });

    // GitHub webhook endpoint
    this.router.post('/github', async (req, res) => {
      try {
        const event = req.header('X-GitHub-Event');
        const body = req.body;
        
        let result = false;
        
        switch (event) {
          case 'push':
            result = await this.handleGitHubPush(body);
            break;
          case 'pull_request':
            result = await this.handleGitHubPullRequest(body);
            break;
          default:
            console.log(`Unsupported GitHub event: ${event}`);
        }
        
        res.status(result ? 202 : 400).json({
          success: result,
          message: result ? 'Event accepted' : 'Failed to process event'
        });
      } catch (error) {
        console.error('Error processing GitHub webhook:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    });

    // CI webhook endpoint
    this.router.post('/ci', async (req, res) => {
      try {
        const body = req.body;
        const result = await this.handleCIPipeline(body);
        
        res.status(result ? 202 : 400).json({
          success: result,
          message: result ? 'Event accepted' : 'Failed to process event'
        });
      } catch (error) {
        console.error('Error processing CI webhook:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    });

    // Chat message endpoint
    this.router.post('/chat', async (req, res) => {
      try {
        const body = req.body;
        const result = await this.handleChatMessage(body);
        
        res.status(result ? 202 : 400).json({
          success: result,
          message: result ? 'Event accepted' : 'Failed to process event'
        });
      } catch (error) {
        console.error('Error processing chat message:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    });

    // Generic event injection endpoint (for testing)
    this.router.post('/event', async (req, res) => {
      try {
        const { kind, source, subject, payload } = req.body;
        
        if (!kind || !source || !subject) {
          return res.status(400).json({
            success: false,
            message: 'Missing required fields: kind, source, subject'
          });
        }
        
        const event = { kind, source, subject, payload: payload || {} };
        const result = await this.publishGenericEvent(event);
        
        res.status(result ? 202 : 400).json({
          success: result,
          message: result ? 'Event accepted' : 'Failed to publish event'
        });
      } catch (error) {
        console.error('Error processing generic event:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    });
  }

  /**
   * Handle a GitHub push event
   * 
   * @param {Object} payload - GitHub webhook payload
   * @returns {boolean} Whether the event was successfully published
   */
  async handleGitHubPush(payload) {
    try {
      const repository = payload.repository;
      const repoUrl = repository.html_url;
      const branch = payload.ref.replace('refs/heads/', '');
      
      // For each commit in the push
      for (const commit of payload.commits) {
        const rev = commit.id;
        const author = commit.author.name;
        const message = commit.message;
        const files = [
          ...commit.added,
          ...commit.modified,
          ...commit.removed
        ];
        
        const event = EventFactory.createRepoCommit(
          repoUrl,
          branch,
          rev,
          author,
          message,
          files
        );
        
        await this.broker.publish(event);
      }
      
      return true;
    } catch (error) {
      console.error('Error handling GitHub push:', error);
      return false;
    }
  }

  /**
   * Handle a GitHub pull request event
   * 
   * @param {Object} payload - GitHub webhook payload
   * @returns {boolean} Whether the event was successfully published
   */
  async handleGitHubPullRequest(payload) {
    try {
      const action = payload.action;
      
      // Only handle opened, synchronize, reopened, closed
      if (!['opened', 'synchronize', 'reopened', 'closed'].includes(action)) {
        return true; // Silently ignore other PR actions
      }
      
      const repository = payload.repository;
      const repoUrl = repository.html_url;
      const pr = payload.pull_request;
      const prNumber = pr.number;
      const title = pr.title;
      const author = pr.user.login;
      const sourceBranch = pr.head.ref;
      const targetBranch = pr.base.ref;
      
      const event = EventFactory.createPullRequest(
        repoUrl,
        prNumber,
        title,
        author,
        sourceBranch,
        targetBranch,
        { action }
      );
      
      await this.broker.publish(event);
      return true;
    } catch (error) {
      console.error('Error handling GitHub pull request:', error);
      return false;
    }
  }

  /**
   * Handle a CI pipeline event
   * 
   * @param {Object} payload - CI webhook payload
   * @returns {boolean} Whether the event was successfully published
   */
  async handleCIPipeline(payload) {
    try {
      const { repoUrl, revision, pipelineId, status } = payload;
      
      if (!repoUrl || !revision || !pipelineId || !status) {
        console.error('Missing required fields in CI payload');
        return false;
      }
      
      const event = EventFactory.createPipelineStatus(
        repoUrl,
        revision,
        pipelineId,
        status
      );
      
      await this.broker.publish(event);
      return true;
    } catch (error) {
      console.error('Error handling CI pipeline:', error);
      return false;
    }
  }

  /**
   * Handle a chat message
   * 
   * @param {Object} payload - Chat message payload
   * @returns {boolean} Whether the event was successfully published
   */
  async handleChatMessage(payload) {
    try {
      const { userId, channelId, text } = payload;
      
      if (!userId || !channelId || !text) {
        console.error('Missing required fields in chat message payload');
        return false;
      }
      
      const event = EventFactory.createChatMessage(
        userId,
        channelId,
        text
      );
      
      await this.broker.publish(event);
      return true;
    } catch (error) {
      console.error('Error handling chat message:', error);
      return false;
    }
  }

  /**
   * Publish a generic event
   * 
   * @param {Object} eventData - Raw event data
   * @returns {boolean} Whether the event was successfully published
   */
  async publishGenericEvent(eventData) {
    try {
      // Create an Event instance directly
      const { kind, source, subject, payload } = eventData;
      const event = new require('../core/Event')(source, kind, subject, payload);
      
      await this.broker.publish(event);
      return true;
    } catch (error) {
      console.error('Error publishing generic event:', error);
      return false;
    }
  }

  /**
   * Get the Express router
   * 
   * @returns {express.Router} The configured Express router
   */
  getRouter() {
    return this.router;
  }
}

module.exports = IngestionGate; 