#!/usr/bin/env node

/**
 * Configuration Reload Script
 * 
 * Sends a SIGHUP signal to the running process to trigger configuration reload
 * Can be used to update feature flags without restarting the server
 */
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const yaml = require('yaml');

// Get the process ID
const getPID = () => {
  try {
    // Check if PID file exists
    const pidPath = path.join(process.cwd(), '.pid');
    
    if (fs.existsSync(pidPath)) {
      const pid = fs.readFileSync(pidPath, 'utf8').trim();
      console.log(`Found PID from file: ${pid}`);
      return pid;
    }
    
    // If no PID file, try to find it from running processes
    console.log('No PID file found, attempting to find the process...');
    
    // Different strategies for different operating systems
    if (process.platform === 'win32') {
      exec('tasklist | findstr "node"', (error, stdout, stderr) => {
        if (error) {
          console.error(`Failed to find node process: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`Error: ${stderr}`);
          return;
        }
        
        console.log('Running Node.js processes:');
        console.log(stdout);
        console.log('Please use the PID from the list above with: node scripts/reload-config.js <PID>');
      });
      
      return null;
    } else {
      // Linux/Unix
      exec('pgrep -f "node.*backend/index.js"', (error, stdout, stderr) => {
        if (error) {
          console.error(`Failed to find node process: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`Error: ${stderr}`);
          return;
        }
        
        const pid = stdout.trim();
        if (pid) {
          console.log(`Found PID: ${pid}`);
          return pid;
        } else {
          console.log('No matching process found. Please start the server first.');
          return null;
        }
      });
    }
  } catch (error) {
    console.error('Error finding PID:', error);
    return null;
  }
  
  return null;
};

// Send SIGHUP to the process
const sendSignal = (pid) => {
  if (!pid) {
    console.log('No PID provided. Usage: node scripts/reload-config.js [PID]');
    return false;
  }
  
  try {
    // On Windows, SIGHUP is not supported, so we simulate it
    if (process.platform === 'win32') {
      console.error('SIGHUP is not directly supported on Windows.');
      console.log('Options:');
      console.log('1. Use WSL or Cygwin to run the server and this script');
      console.log('2. Directly edit and save the flags.yml file (the server watches for changes)');
      return false;
    } else {
      // Send SIGHUP
      process.kill(pid, 'SIGHUP');
      console.log(`Sent SIGHUP to process ${pid}`);
      return true;
    }
  } catch (error) {
    console.error(`Failed to send signal: ${error.message}`);
    return false;
  }
};

// Update a flag in the config file
const updateFlag = (flagPath, value) => {
  try {
    const flagsFile = path.join(process.cwd(), 'config', 'flags.yml');
    
    if (!fs.existsSync(flagsFile)) {
      console.error('flags.yml file not found!');
      return false;
    }
    
    // Read the current flags
    const content = fs.readFileSync(flagsFile, 'utf8');
    const flags = yaml.parse(content);
    
    // Update the specified flag
    const parts = flagPath.split('.');
    let current = flags;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    
    // Convert value string to appropriate type
    let typedValue = value;
    if (value === 'true') typedValue = true;
    if (value === 'false') typedValue = false;
    if (!isNaN(value) && value !== '') typedValue = Number(value);
    
    // Set the value
    current[parts[parts.length - 1]] = typedValue;
    
    // Write back to file
    fs.writeFileSync(flagsFile, yaml.stringify(flags));
    console.log(`Updated ${flagPath} to ${value} in flags.yml`);
    
    return true;
  } catch (error) {
    console.error('Error updating flag:', error);
    return false;
  }
};

// Main function
const main = () => {
  const args = process.argv.slice(2);
  
  // Check for update flag command
  if (args[0] === 'set') {
    if (args.length < 3) {
      console.log('Usage: node scripts/reload-config.js set <flag.path> <value>');
      console.log('Example: node scripts/reload-config.js set agents.ForecastAgent true');
      return;
    }
    
    const flagPath = args[1];
    const value = args[2];
    
    if (updateFlag(flagPath, value)) {
      console.log('Flag updated. The server will reload automatically if it\'s watching for file changes.');
      console.log('Otherwise, run: node scripts/reload-config.js');
    }
    return;
  }
  
  // If we have an argument, use it as the PID
  const pid = args[0] || getPID();
  
  if (pid) {
    sendSignal(pid);
  }
};

main(); 