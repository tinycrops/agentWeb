# Configuration System

AgentWeb uses a layered configuration system that provides flexibility and allows for runtime changes to certain settings.

## Configuration Sources

Configuration is loaded from multiple sources in the following order (later sources override earlier ones):

1. **Default Configuration** (`config/default.yml`): Base settings applicable to all environments.
2. **Environment Configuration** (`config/{env}.yml`): Environment-specific settings that override defaults.
3. **Feature Flags** (`config/flags.yml`): Dynamic flags for toggling features at runtime.
4. **Environment Variables**: Variables defined in `.env` file or the system environment.

## Key Configuration Files

### default.yml

Contains the base configuration for the entire application. This includes database connections, messaging, agent settings, and API configuration.

### development.yml / production.yml

Environment-specific overrides for different deployment contexts.

### flags.yml

Runtime-configurable feature flags that can be modified without restarting the application.

Example:
```yaml
agents:
  ForecastAgent: ${ENABLE_FORECAST_AGENT}  # env overrides
  GuardianAgent: true
  ProgressAgent: true
  
features:
  jsonSchemaValidation: ${ENABLE_SCHEMA_VALIDATION}
  horizontalScaling: false
```

## Accessing Configuration

The configuration is accessed through the `config` utility:

```javascript
const config = require('./util/config');

// Get a config value with a default fallback
const port = config.get('api.port', 3000);

// Get a nested value
const mongoUrl = config.get('storage.factStore.mongo.url');
```

## Hot Reloading Configuration

AgentWeb supports hot-reloading of the `flags.yml` file to change application behavior without requiring a restart.

### How Hot Reloading Works

1. A file watcher tracks changes to `flags.yml`
2. When the file is modified, configuration is reloaded
3. The system emits events that components can listen for to adapt their behavior

### Triggering a Reload

You can trigger a configuration reload in two ways:

1. Sending a SIGHUP signal to the process:
   ```bash
   node scripts/reload-config.js
   ```

2. Directly updating a flag:
   ```bash
   node scripts/reload-config.js set agents.ForecastAgent true
   ```

## Feature Flags

Feature flags allow for dynamic enabling/disabling of application components. Currently supported flags:

### Agent Flags

These toggle agent execution:

- `agents.ForecastAgent`: Enables the experimental forecast agent
- `agents.GuardianAgent`: Toggles the guardian agent
- `agents.ProgressAgent`: Toggles the progress agent
- `agents.RelationAgent`: Toggles the relation agent
- `agents.InsightAgent`: Toggles the insight agent
- `agents.NarrativeAgent`: Toggles the narrative agent

### Feature Flags

These control system-wide features:

- `features.jsonSchemaValidation`: Enables JSON schema validation for events
- `features.horizontalScaling`: Enables support for running multiple instances
- `features.archiving`: Enables automatic archiving of old events

## Environment Variables

You can also control flags through environment variables by using the `${VAR_NAME}` syntax in the YAML files:

```yaml
features:
  jsonSchemaValidation: ${ENABLE_SCHEMA_VALIDATION}
```

Then in your `.env` file:
```
ENABLE_SCHEMA_VALIDATION=true
```

## Best Practices

1. Use config.get() with default values for safer code
2. Register for configuration change events when building components that should adapt at runtime
3. Prefer the layered approach with YAML files over direct environment variable access
4. Use `.env.example` to document required environment variables 