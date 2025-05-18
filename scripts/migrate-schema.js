#!/usr/bin/env node

/**
 * Schema Migration Script
 * 
 * This script migrates events in the FactStore from one schema version to another.
 * 
 * Usage:
 * node migrate-schema.js --from 1 --to 2
 */

require('dotenv').config();
const { program } = require('commander');
const FactStore = require('../src/backend/core/FactStore');

// Set up the command line interface
program
  .name('migrate-schema')
  .description('Migrate events from one schema version to another')
  .requiredOption('--from <version>', 'Source schema version', parseInt)
  .requiredOption('--to <version>', 'Target schema version', parseInt)
  .option('--dry-run', 'Show what would be migrated without making changes', false)
  .option('--batch-size <size>', 'Number of events to migrate in each batch', parseInt, 100);

program.parse();
const options = program.opts();

async function countEventsByVersion(factStore, version) {
  try {
    const events = await factStore.query({ 
      schemaVersion: version,
      limit: 0 // No limit to count all events
    });
    return events.length;
  } catch (error) {
    console.error(`Error counting events with schema version ${version}:`, error);
    return 0;
  }
}

async function run() {
  console.log(`Schema Migration Tool`);
  console.log(`=====================`);
  console.log(`From version: ${options.from}`);
  console.log(`To version: ${options.to}`);
  console.log(`Dry run: ${options.dryRun ? 'Yes' : 'No'}`);
  console.log(`Batch size: ${options.batchSize}`);
  console.log(`=====================`);

  // Create and initialize the FactStore
  const factStore = new FactStore({
    schemaVersion: options.to // Set target schema version
  });

  try {
    await factStore.initialize();
    
    // Count events with source version
    const sourceCount = await countEventsByVersion(factStore, options.from);
    console.log(`Found ${sourceCount} events with schema version ${options.from}`);
    
    if (sourceCount === 0) {
      console.log(`No events to migrate. Exiting.`);
      await factStore.close();
      return;
    }
    
    if (options.dryRun) {
      console.log(`Dry run mode. No events will be migrated.`);
      await factStore.close();
      return;
    }
    
    // Confirm migration
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      readline.question(`Do you want to migrate ${sourceCount} events from v${options.from} to v${options.to}? (y/N) `, resolve);
    });
    
    readline.close();
    
    if (answer.toLowerCase() !== 'y') {
      console.log(`Migration cancelled. Exiting.`);
      await factStore.close();
      return;
    }
    
    // Run the migration
    console.time('Migration completed in');
    const migratedCount = await factStore.migrateSchema(options.from, options.to);
    console.timeEnd('Migration completed in');
    
    console.log(`Successfully migrated ${migratedCount} events from v${options.from} to v${options.to}`);
    
    // Verify migration
    const remainingCount = await countEventsByVersion(factStore, options.from);
    console.log(`Remaining events with schema version ${options.from}: ${remainingCount}`);
    
    const newCount = await countEventsByVersion(factStore, options.to);
    console.log(`Events with schema version ${options.to}: ${newCount}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await factStore.close();
  }
}

// Run the migration
run().catch(error => {
  console.error('Unhandled error during migration:', error);
  process.exit(1);
}); 