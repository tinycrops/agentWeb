#!/usr/bin/env node

/**
 * Replay Tool
 * 
 * This script allows you to replay events from the FactStore at different speeds
 * and within specific time ranges, enabling time-travel debugging and demos.
 * 
 * Usage:
 * node replay.js --from "2023-07-01T00:00:00" --to "2023-07-02T00:00:00" --speed 10
 */

require('dotenv').config();
const { program } = require('commander');
const FactStore = require('../src/backend/core/FactStore');
const EventBroker = require('../src/backend/core/EventBroker');
const fs = require('fs').promises;
const path = require('path');

// Set up the command line interface
program
  .name('replay')
  .description('Replay events from the FactStore at different speeds')
  .option('--from <timestamp>', 'Start timestamp (ISO format)', parseDate)
  .option('--to <timestamp>', 'End timestamp (ISO format)', parseDate, new Date())
  .option('--speed <factor>', 'Playback speed multiplier (1 = realtime)', parseFloat, 1)
  .option('--file <path>', 'Export events to a file instead of replaying them')
  .option('--import <path>', 'Import events from a file instead of from FactStore')
  .option('--snapshot <path>', 'Start from a specific agent snapshot file');

program.parse();
const options = program.opts();

// Parse date strings to timestamps
function parseDate(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

async function run() {
  console.log('Event Replay Tool');
  console.log('=================');
  console.log(`From: ${options.from ? options.from.toISOString() : 'Beginning'}`);
  console.log(`To: ${options.to.toISOString()}`);
  console.log(`Speed: ${options.speed}x`);
  
  if (options.file) {
    console.log(`Export file: ${options.file}`);
  }
  
  if (options.import) {
    console.log(`Import file: ${options.import}`);
  }
  
  if (options.snapshot) {
    console.log(`Snapshot file: ${options.snapshot}`);
  }
  
  console.log('=================');

  // Setup components
  let factStore = null;
  let eventBroker = null;
  let events = [];

  try {
    // Get events either from the FactStore or from a file
    if (options.import) {
      console.log(`Importing events from file: ${options.import}`);
      const data = await fs.readFile(options.import, 'utf8');
      events = JSON.parse(data);
      console.log(`Loaded ${events.length} events from file`);
    } else {
      // Initialize FactStore
      factStore = new FactStore();
      await factStore.initialize();
      
      // Query events in the specified time range
      const queryOptions = {};
      
      if (options.from) {
        queryOptions.fromTs = options.from.getTime();
      }
      
      queryOptions.toTs = options.to.getTime();
      
      console.log('Querying events...');
      events = await factStore.query(queryOptions);
      console.log(`Found ${events.length} events in the specified time range`);
    }
    
    // If exporting to a file, save and exit
    if (options.file) {
      console.log(`Exporting ${events.length} events to file: ${options.file}`);
      await fs.writeFile(options.file, JSON.stringify(events, null, 2));
      console.log('Export complete');
      return;
    }
    
    // Sort events by timestamp
    events.sort((a, b) => a.ts - b.ts);
    
    // Initialize the event broker for replay
    eventBroker = new EventBroker();
    await eventBroker.initialize();
    
    // Load snapshot if specified
    if (options.snapshot) {
      console.log(`Loading snapshot from: ${options.snapshot}`);
      // In a real implementation, this would restore agent state from the snapshot
      console.log('(Snapshot loading is a placeholder in this demo)');
    }
    
    // Start the replay
    console.log(`Starting replay at ${options.speed}x speed...`);
    console.log('Press Ctrl+C to stop');
    
    let previousTs = events[0]?.ts || Date.now();
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      
      // Calculate delay between this event and the previous one
      const delay = event.ts - previousTs;
      const scaledDelay = delay / options.speed;
      
      // Wait the appropriate amount of time
      if (scaledDelay > 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, scaledDelay));
      }
      
      // Republish the event
      await eventBroker.publish(event);
      console.log(`Replayed: ${event.kind} (${new Date(event.ts).toISOString()})`);
      
      previousTs = event.ts;
    }
    
    console.log('Replay complete');
    
  } catch (error) {
    console.error('Error during replay:', error);
    process.exit(1);
  } finally {
    // Clean up resources
    if (factStore) await factStore.close();
    if (eventBroker) await eventBroker.close();
  }
}

// Run the replay
run().catch(error => {
  console.error('Unhandled error during replay:', error);
  process.exit(1);
}); 