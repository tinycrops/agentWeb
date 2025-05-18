/**
 * MongoDB Index Creation Script
 * 
 * This script creates all required indexes for the AgentWeb application
 * Run with: node src/backend/scripts/create-mongo-indexes.js
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

// MongoDB connection settings
const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || 'agentWeb';

async function createIndexes() {
  console.log(`Creating MongoDB indexes for ${dbName} database...`);
  
  const client = new MongoClient(mongoUrl);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(dbName);
    
    // Events collection indexes
    console.log('Creating indexes for events collection...');
    const eventsCollection = db.collection('events');
    
    await eventsCollection.createIndex({ id: 1 }, { unique: true });
    await eventsCollection.createIndex({ kind: 1 });
    await eventsCollection.createIndex({ ts: 1 });
    await eventsCollection.createIndex({ source: 1 });
    await eventsCollection.createIndex({ 'subject.projectId': 1 });
    await eventsCollection.createIndex({ causedBy: 1 });
    await eventsCollection.createIndex({ schemaVersion: 1 });
    
    // Compound indexes for efficient filtering
    await eventsCollection.createIndex({ kind: 1, ts: 1 });
    await eventsCollection.createIndex({ 'subject.projectId': 1, ts: 1 });
    
    // Views collection indexes (for materialized views)
    console.log('Creating indexes for views collection...');
    const viewsCollection = db.collection('views');
    
    await viewsCollection.createIndex({ viewName: 1 });
    await viewsCollection.createIndex({ entityId: 1 });
    await viewsCollection.createIndex({ viewName: 1, entityId: 1 }, { unique: true });
    await viewsCollection.createIndex({ lastUpdated: 1 });
    
    // Snapshots collection indexes
    console.log('Creating indexes for snapshots collection...');
    const snapshotsCollection = db.collection('snapshots');
    
    await snapshotsCollection.createIndex({ agentId: 1 });
    await snapshotsCollection.createIndex({ timestamp: 1 });
    await snapshotsCollection.createIndex({ agentId: 1, timestamp: -1 });
    
    console.log('All indexes created successfully!');
  } catch (error) {
    console.error('Error creating indexes:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

// Run the function
createIndexes().catch(console.error); 