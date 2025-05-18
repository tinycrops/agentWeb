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

===
2.5-pro synopsis
===
This repository, `tinycrops/agentweb`, presents a well-structured, event-driven, agent-based system primarily focused on processing, analyzing, and deriving insights from a stream of events, likely related to software development or complex project management.

Here are the key ideas and concepts it brings to the world:

1.  **Canonical, Immutable, and Verifiable Events:**
    *   `Event.js` defines a standard event schema with an ID, timestamp, source, kind, subject, and payload.
    *   Crucially, events include a cryptographic signature (`sig`) ensuring their integrity. This is powerful for auditability and trust.
    *   This promotes the idea of "facts" as the fundamental building blocks of system knowledge.

2.  **Single Source of Truth (SSoT) for Facts:**
    *   `FactStore.js` (using MongoDB) acts as an append-only log for all events.
    *   It ensures idempotency (via upsert on event ID) and records "meta-events" (`EnvelopeWritten`) whenever a new event is stored, providing an audit trail for the fact store itself.
    *   Includes schema versioning and migration capabilities for events, which is essential for long-lived systems.

3.  **Decoupled Event-Driven Architecture (EDA):**
    *   `EventBroker.js` (using Redis Streams) facilitates a pub/sub model.
    *   Agents subscribe to specific event kinds without needing to know about other agents or event producers.
    *   The broker first ensures events are persisted in `FactStore` before publishing, guaranteeing durability.
    *   Use of Redis Streams with consumer groups allows for scalable and resilient event processing.

4.  **Agent-Based System for Distributed Intelligence:**
    *   `BaseAgent.js` provides a common framework for agents, including lifecycle management (initialize, start, stop), event subscription, and state snapshotting for resilience.
    *   Specialized agents perform distinct tasks:
        *   **`ProgressAgent`**: Calculates project progress from `RepoCommit` events.
        *   **`RelationAgent`**: Detects project dependencies from `RepoCommit` events, checking for cycles.
        *   **`InsightAgent`**: Generates higher-level insights (e.g., progress imbalances, blocked projects) from progress and dependency events.
        *   **`GuardianAgent`**: Monitors system invariants (monotonic progress, acyclic dependencies, causal event integrity) and reports violations. This acts like a system's "conscience."
        *   **`NarrativeAgent`**: Creates human-readable summaries and narratives from insights and other significant events, potentially on a schedule or triggered by critical events.

5.  **Derivation of Knowledge Hierarchy:**
    *   The system demonstrates a flow from raw, primitive events (e.g., `RepoCommit`) to derived facts (e.g., `ProjectProgressCalculated`, `DependencyEdgeAdded`), then to higher-level insights (`InsightRaised`), and finally to human-consumable narratives (`NarrativeGenerated`).

6.  **System Self-Awareness and Integrity:**
    *   The `GuardianAgent` is a standout idea, actively monitoring the health and consistency of the system's understanding of itself.
    *   The event signing and `EnvelopeWritten` meta-events contribute to this by ensuring data integrity and providing provenance.

7.  **Stateful, Resilient Agents:**
    *   The snapshotting mechanism in `BaseAgent` allows agents to persist their internal state and recover from failures, making them suitable for long-running, stateful computations.

**What it's good for:**

This system architecture is excellent for:

1.  **Software Development Intelligence / Engineering Analytics Platforms:**
    *   Tracking project progress across multiple repositories.
    *   Visualizing and understanding inter-project dependencies.
    *   Identifying bottlenecks, risks (e.g., circular dependencies, stalled dependencies), and areas for improvement in development workflows.
    *   Providing automated status updates and reports.

2.  **Complex System Monitoring and Observability:**
    *   Ingesting events from various sources (CI/CD, SCM, issue trackers, communication tools).
    *   Building a comprehensive, auditable model of a system's state and evolution over time.
    *   Proactively detecting anomalies or violations of expected behavior.

3.  **Auditable and Verifiable Data Processing:**
    *   The immutable, signed event log is ideal for systems where auditability and data provenance are critical (e.g., compliance, financial systems, secure operations).

4.  **Building "Digital Twins" or Sophisticated Simulation Environments:**
    *   The event log can serve as the historical record to replay or model system behavior. Agents can represent different actors or processes within the twin.

5.  **Foundation for AIOps or Intelligent Automation:**
    *   The insights generated could trigger automated actions or provide data for machine learning models to predict future states or recommend interventions.

6.  **Research and Development in Multi-Agent Systems:**
    *   It provides a practical, scalable backend for exploring how autonomous agents can collaborate to make sense of complex data streams.

In essence, `tinycrops/agentweb` provides a robust and extensible framework for building systems that need to understand, react to, and derive meaning from a continuous flow of events in a reliable, auditable, and scalable manner. It's particularly well-suited for domains where understanding evolving relationships, progress, and system health is key.