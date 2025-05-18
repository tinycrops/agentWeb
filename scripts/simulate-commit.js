/**
 * Test script to simulate a repository commit event
 * 
 * Usage: node scripts/simulate-commit.js
 */
const axios = require('axios');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:4000';
const NUM_COMMITS = 3;

// Sample repositories
const repositories = [
  {
    name: 'frontend',
    url: 'https://github.com/agentWeb/frontend.git'
  },
  {
    name: 'backend',
    url: 'https://github.com/agentWeb/backend.git'
  },
  {
    name: 'api-gateway',
    url: 'https://github.com/agentWeb/api-gateway.git'
  },
  {
    name: 'data-service',
    url: 'https://github.com/agentWeb/data-service.git'
  },
  {
    name: 'auth-service',
    url: 'https://github.com/agentWeb/auth-service.git'
  }
];

// Sample authors
const authors = [
  'alice',
  'bob',
  'charlie',
  'dave',
  'eve'
];

// Sample file types
const fileTypes = [
  { ext: '.js', path: 'src/components/' },
  { ext: '.js', path: 'src/utils/' },
  { ext: '.js', path: 'src/services/' },
  { ext: '.css', path: 'src/styles/' },
  { ext: '.html', path: 'public/' },
  { ext: '.json', path: 'config/' },
  { ext: '.md', path: '' }
];

// Sample manifest files (to trigger dependency detection)
const manifestFiles = [
  'package.json',
  'requirements.txt',
  'build.gradle',
  'pom.xml'
];

/**
 * Generate a random commit message
 * @returns {string} Commit message
 */
function generateCommitMessage() {
  const prefixes = [
    'Add', 'Update', 'Fix', 'Refactor', 'Optimize', 'Remove', 'Implement'
  ];
  
  const targets = [
    'login form', 'navigation', 'dashboard', 'authentication', 'data model',
    'API integration', 'error handling', 'performance', 'styling', 'documentation',
    'unit tests', 'build process', 'deployment script'
  ];
  
  const suffix = Math.random() > 0.7 ? 
    ` (resolves #${Math.floor(Math.random() * 100) + 1})` : '';
  
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const target = targets[Math.floor(Math.random() * targets.length)];
  
  return `${prefix} ${target}${suffix}`;
}

/**
 * Generate a random list of changed files
 * @returns {Object} Lists of added, modified, and removed files
 */
function generateChangedFiles() {
  const numFiles = Math.floor(Math.random() * 5) + 1;
  const added = [];
  const modified = [];
  const removed = [];
  
  // Randomly include a manifest file to trigger dependency detection
  if (Math.random() > 0.7) {
    const manifestFile = manifestFiles[Math.floor(Math.random() * manifestFiles.length)];
    modified.push(manifestFile);
  }
  
  for (let i = 0; i < numFiles; i++) {
    const fileType = fileTypes[Math.floor(Math.random() * fileTypes.length)];
    const fileName = `${fileType.path}${generateFileName()}${fileType.ext}`;
    
    const changeType = Math.random();
    if (changeType < 0.4) {
      added.push(fileName);
    } else if (changeType < 0.9) {
      modified.push(fileName);
    } else {
      removed.push(fileName);
    }
  }
  
  return { added, modified, removed };
}

/**
 * Generate a random file name
 * @returns {string} File name
 */
function generateFileName() {
  const adjectives = ['awesome', 'cool', 'super', 'fancy', 'smart', 'quick'];
  const nouns = ['component', 'service', 'utility', 'helper', 'manager', 'factory'];
  
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  
  return `${adjective}${noun}`;
}

/**
 * Generate a random commit hash
 * @returns {string} Commit hash
 */
function generateCommitHash() {
  const chars = '0123456789abcdef';
  let hash = '';
  
  for (let i = 0; i < 40; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  
  return hash;
}

/**
 * Simulate a GitHub webhook payload for a push event
 * @returns {Object} GitHub webhook payload
 */
function simulateGitHubPush() {
  // Pick a random repository
  const repository = repositories[Math.floor(Math.random() * repositories.length)];
  
  // Generate random commits
  const commits = [];
  for (let i = 0; i < NUM_COMMITS; i++) {
    const author = authors[Math.floor(Math.random() * authors.length)];
    const { added, modified, removed } = generateChangedFiles();
    
    commits.push({
      id: generateCommitHash(),
      message: generateCommitMessage(),
      author: {
        name: author,
        email: `${author}@example.com`
      },
      added,
      modified,
      removed
    });
  }
  
  // Create webhook payload
  return {
    ref: 'refs/heads/main',
    repository: {
      name: repository.name,
      html_url: repository.url
    },
    commits
  };
}

/**
 * Send a simulated GitHub webhook to the API
 */
async function sendWebhook() {
  try {
    const payload = simulateGitHubPush();
    
    console.log(`Simulating push to ${payload.repository.name} with ${payload.commits.length} commits...`);
    
    const response = await axios.post(`${API_URL}/api/ingestion/github`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push'
      }
    });
    
    console.log('API response:', response.data);
    
    if (response.data.success) {
      console.log('Simulation successful!');
    } else {
      console.error('Simulation failed:', response.data.message);
    }
  } catch (error) {
    console.error('Error sending webhook:', error.message);
    if (error.response) {
      console.error('API error:', error.response.data);
    }
  }
}

// Run the simulation
sendWebhook(); 