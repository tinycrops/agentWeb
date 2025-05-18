# AgentWeb

An event-driven, agent-based web application that creates a unique experience for each user.

## Architecture

The system follows an event-driven architecture with a Fact Store as the single source of truth:

- **Fact Store**: Append-only event log containing all primitive and derived facts
- **Event Broker**: Pub/sub system for distributing events to agents
- **Agents**: Specialized software components that process events and generate new insights
- **View Layer**: Materialized views of the Fact Store for efficient querying
- **API Layer**: Exposes data to the frontend via REST/GraphQL and WebSockets
- **Frontend**: SPA that visualizes the state derived from Facts

### Event Flow

1. External events (commits, messages, etc.) are ingested through the Ingestion Gate
2. Events are published to the Event Broker
3. Specialized agents subscribe to relevant events and produce derived events
4. The View Layer materializes events into queryable structures
5. The Frontend consumes these views in real-time

## Agents

The system includes the following specialized agents:

1. **ProgressAgent**: Analyzes repository commits to calculate project progress
2. **RelationAgent**: Detects dependencies between projects
3. **InsightAgent**: Generates insights based on project progress and dependencies
4. **NarrativeAgent**: Creates natural language narratives summarizing system activity

## Getting Started

### Prerequisites

- Node.js 16+
- MongoDB
- Redis

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/agentWeb.git
cd agentWeb
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (use `.env.example` as a template)

4. Start the development server:
```bash
npm run dev
```

5. Open your browser to `http://localhost:3000`

## Testing

You can simulate events using the provided test scripts:

```bash
# Simulate a repository commit
node scripts/simulate-commit.js

# Run unit tests
npm test
```

## Technology Stack

- **Backend**: Node.js with Express
- **Event Broker**: Redis Streams
- **Fact Store**: MongoDB (for development), Event-sourced DB (production)
- **API Layer**: GraphQL + WebSockets
- **Frontend**: React with Three.js for visualization

## Project Structure

```
agentWeb/
├── src/
│   ├── backend/
│   │   ├── agents/           # Specialized agents
│   │   ├── api/              # API endpoints
│   │   ├── core/             # Core components (Event, EventBroker, FactStore)
│   │   ├── ingestion/        # External event ingestion
│   │   ├── view/             # Materialized views
│   │   └── index.js          # Main entry point
│   └── frontend/             # Frontend application
├── scripts/                  # Utility scripts
├── .env                      # Environment variables
└── package.json
```

## Phases

1. **Phase 0**: Basic event ingestion and storage
2. **Phase 1**: Event-driven backbone with multiple agents
3. **Phase 2**: Real-time frontend visualization
4. **Phase 3**: Multi-agent intelligence
4. **Phase 4**: System hardening and integrations 