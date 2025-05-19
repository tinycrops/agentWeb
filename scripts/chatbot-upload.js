#!/usr/bin/env node

/**
 * CLI script for uploading files to the AgentWeb system
 * 
 * Usage:
 *   node scripts/chatbot-upload.js path/to/file.txt
 *   node scripts/chatbot-upload.js path/to/document.pdf --userId=admin
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');
const readline = require('readline');

const API_URL = process.env.API_URL || 'http://localhost:3000/api/ingestion';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

// Process command line arguments
let userId = 'chatbot';
let args = process.argv.slice(2);

// Check for --userId flag
args = args.filter(arg => {
  if (arg.startsWith('--userId=')) {
    userId = arg.split('=')[1];
    return false;
  }
  return true;
});

/**
 * Upload a file to the ingestion API
 * 
 * @param {string} filePath - Path to the file
 */
async function uploadFile(filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File '${filePath}' does not exist`);
      return;
    }
    
    // Create FormData
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('userId', userId);
    
    console.log(`Uploading ${filePath}...`);
    
    // Send request
    const response = await axios.post(`${API_URL}/upload`, form, {
      headers: {
        ...form.getHeaders()
      }
    });
    
    if (response.status === 202) {
      console.log(`✓ HTTP ${response.status} accepted - docId: ${response.data.docId}`);
    } else {
      console.error(`✗ Upload failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error uploading file:', error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', error.response.data);
    }
  }
}

/**
 * Handle user commands
 */
function processCommand(input) {
  const parts = input.trim().split(' ');
  const command = parts[0];
  
  switch (command) {
    case 'upload':
      if (parts.length < 2) {
        console.log('Usage: upload <file-path>');
        break;
      }
      uploadFile(parts[1]);
      break;
      
    case 'user':
      if (parts.length < 2) {
        console.log(`Current user: ${userId}`);
      } else {
        userId = parts[1];
        console.log(`User set to: ${userId}`);
      }
      break;
      
    case 'exit':
    case 'quit':
      rl.close();
      break;
      
    case 'help':
      console.log('Available commands:');
      console.log('  upload <file-path>  - Upload a file to the system');
      console.log('  user [new-user-id]  - Show or change current user ID');
      console.log('  exit, quit          - Exit the program');
      console.log('  help                - Show this help message');
      break;
      
    default:
      if (input.trim()) {
        console.log(`Unknown command: ${command}`);
        console.log('Type "help" for available commands');
      }
  }
}

// Handle direct file argument
if (args.length > 0) {
  uploadFile(args[0]);
  // Don't exit, fall through to interactive mode
}

// Interactive mode
console.log('AgentWeb Chatbot Upload CLI');
console.log('Type "help" for available commands or "exit" to quit');
rl.prompt();

rl.on('line', (line) => {
  processCommand(line.trim());
  rl.prompt();
}).on('close', () => {
  console.log('Goodbye!');
  process.exit(0);
}); 