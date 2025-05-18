#!/usr/bin/env node

/**
 * Ensure MongoDB indexes script
 * 
 * This script is used to ensure that all required MongoDB indexes exist
 * before starting the application or as part of a CI check.
 */

const { createIndexes } = require('../ddl/mongo-indexes');

// Run the indexing script
createIndexes()
  .then(() => {
    console.log('All required MongoDB indexes are in place!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to ensure indexes:', error);
    process.exit(1);
  }); 