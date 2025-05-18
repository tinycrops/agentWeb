/**
 * MongoDB indexes for the AgentWeb application
 * 
 * This script creates the required indexes for the MongoDB database.
 * It's designed to be run at startup time and during CI to ensure the indexes exist.
 * 
 * Usage:
 * node ddl/mongo-indexes.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

async function createIndexes() {
  // Get MongoDB connection details from environment variables or use defaults
  const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'agentWeb';
  const eventsCollection = 'events';
  
  console.log(`Connecting to MongoDB at ${mongoUrl}...`);
  const client = new MongoClient(mongoUrl);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(dbName);
    const collection = db.collection(eventsCollection);
    
    // Create or update indexes
    console.log('Creating indexes...');

    // Main event indexes
    const indexes = [
      { key: { id: 1 }, options: { unique: true, name: 'idx_event_id' } },
      { key: { ts: 1 }, options: { name: 'idx_event_ts' } },
      { key: { kind: 1 }, options: { name: 'idx_event_kind' } },
      { key: { source: 1 }, options: { name: 'idx_event_source' } },
      { key: { 'subject.projectId': 1 }, options: { name: 'idx_event_projectId' } },
      { key: { schemaVersion: 1 }, options: { name: 'idx_event_schemaVersion' } },
      { key: { 'payload.causedBy': 1 }, options: { name: 'idx_event_causedBy' } }
    ];
    
    // Create each index
    for (const index of indexes) {
      await collection.createIndex(index.key, index.options);
      console.log(`Created index: ${index.options.name}`);
    }
    
    // Verify indexes exist
    const indexInfo = await collection.indexes();
    console.log('\nCurrent indexes:');
    indexInfo.forEach(idx => console.log(`- ${idx.name}: ${JSON.stringify(idx.key)}`));
    
    console.log('\nIndex creation completed successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  createIndexes()
    .then(() => {
      console.log('Indexes verified successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('Failed to verify indexes:', err);
      process.exit(1);
    });
}

module.exports = { createIndexes }; 