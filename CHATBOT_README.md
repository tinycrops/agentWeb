# AgentWeb Chatbot & Document Upload

This extension adds a simple chatbot and document upload functionality to the AgentWeb system.

## Features

- **Chatbot Interface**: A web UI for sending messages and uploading documents
- **Document Upload**: Support for .txt, .md, and .pdf files
- **CLI Tool**: A command-line tool for uploading documents

## Setup Guide

### Prerequisites

- Node.js ≥ 16
- Python ≥ 3.10 (if using Python-based document processing)
- MongoDB (standalone, default port 27017)
- Redis (single instance, default port 6379)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/tinycrops/agentweb.git
   cd agentweb
   ```

2. Install dependencies:
   ```
   npm ci
   ```

3. Start the infrastructure (using Docker or native services):

   **Option A: Using Docker Compose**
   ```
   docker-compose up -d
   ```

   **Option B: Native Services**
   ```
   # Start MongoDB
   mongod --dbpath ./mongo-data

   # Start Redis (in another terminal)
   redis-server
   ```

4. Start the AgentWeb stack:
   ```
   npm run dev
   ```

   This command starts both the backend (port 3000) and frontend (port 3001).

5. Access the application:
   - Dashboard: http://localhost:3001
   - Chatbot: http://localhost:3001 (click on "Chatbot" tab)
   - API: http://localhost:3000/api

## Usage

### Web Interface

1. Open http://localhost:3001 in your browser
2. Click on the "Chatbot" tab
3. Enter your User ID or use the default "web-user"
4. You can:
   - Send text messages using the input field
   - Upload documents by clicking the "Upload Document" button

### CLI Tool

The CLI tool provides a command-line interface for uploading documents.

```
# Basic usage
node scripts/chatbot-upload.js path/to/file.txt

# Specify user ID
node scripts/chatbot-upload.js path/to/file.pdf --userId=admin

# Interactive mode
node scripts/chatbot-upload.js
> upload path/to/file.md
> user custom-user-id
> help
```

## Supported File Types

- Plain text (`.txt`)
- Markdown (`.md`)
- PDF documents (`.pdf`)

## Extending the System

You can create a dedicated document agent that subscribes to `DocumentUploaded` events and performs additional processing.

1. Create a new agent in `src/backend/agents/DocumentAgent.js`
2. Subscribe to the `DocumentUploaded` event kind
3. Add NLP or regex processing to extract insights
4. Register the agent in the backend initialization

## Troubleshooting

- **File upload fails**: Check file size limits (default 10MB)
- **PDF text extraction fails**: Ensure pdf-parse library is correctly installed
- **Cannot connect to the server**: Verify Redis and MongoDB are running

## Architecture

The document upload flow:

1. User uploads a file via web UI or CLI
2. File is sent to `/api/ingestion/upload` endpoint
3. Text is extracted using format-specific extractors
4. A `DocumentUploaded` event is created and published
5. Downstream agents can process this event
6. Materialized views are updated accordingly 