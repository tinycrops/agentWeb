/**
 * Configuration Manager
 * 
 * Loads and merges configuration from:
 * 1. Default configuration (config/default.yml)
 * 2. Environment-specific configuration (config/{env}.yml)
 * 3. Feature flags (config/flags.yml)
 * 4. Environment variables (replacing ${VAR_NAME} placeholders)
 */
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor() {
    this.config = {};
    this.loaded = false;
    this.flagsPath = '';
    this.flagsStats = null;
    this.setupSighupHandler();
  }

  /**
   * Setup SIGHUP handler for hot-reloading configuration
   */
  setupSighupHandler() {
    process.on('SIGHUP', () => {
      console.log('Received SIGHUP signal, reloading configuration...');
      this.reloadFlags();
    });
  }

  /**
   * Load and merge configuration
   * 
   * @param {string} env - Environment name (development, production, etc.)
   * @returns {Object} The merged configuration
   */
  load(env = process.env.NODE_ENV || 'development') {
    if (this.loaded) return this.config;

    try {
      // Load default config
      const defaultConfigPath = path.resolve(process.cwd(), 'config/default.yml');
      const defaultConfig = this.loadYamlFile(defaultConfigPath);

      // Load environment-specific config
      const envConfigPath = path.resolve(process.cwd(), `config/${env}.yml`);
      let envConfig = {};
      
      try {
        envConfig = this.loadYamlFile(envConfigPath);
      } catch (error) {
        console.warn(`No environment config found for '${env}', using defaults only`);
      }

      // Load feature flags
      this.flagsPath = path.resolve(process.cwd(), 'config/flags.yml');
      let flagsConfig = {};
      
      try {
        flagsConfig = this.loadYamlFileWithStats(this.flagsPath);
      } catch (error) {
        console.warn('No feature flags found, continuing without flags');
      }

      // Merge configurations
      this.config = this.deepMerge(defaultConfig, envConfig);
      this.config = this.deepMerge(this.config, flagsConfig);
      
      // Process environment variable placeholders
      this.processEnvVars(this.config);
      
      this.loaded = true;
      return this.config;
    } catch (error) {
      console.error('Failed to load configuration:', error);
      throw error;
    }
  }

  /**
   * Load a YAML file
   * 
   * @param {string} filePath - Path to the YAML file
   * @returns {Object} Parsed YAML content
   */
  loadYamlFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return yaml.parse(content);
  }

  /**
   * Load a YAML file and store its file stats
   * 
   * @param {string} filePath - Path to the YAML file
   * @returns {Object} Parsed YAML content
   */
  loadYamlFileWithStats(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    this.flagsStats = fs.statSync(filePath);
    return yaml.parse(content);
  }

  /**
   * Reload feature flags when triggered by SIGHUP
   */
  reloadFlags() {
    try {
      if (!this.flagsPath) {
        console.warn('No flags path set, cannot reload flags');
        return;
      }

      // Check if flags file has been modified
      const currentStats = fs.statSync(this.flagsPath);
      
      if (this.flagsStats && currentStats.mtime.getTime() === this.flagsStats.mtime.getTime()) {
        console.log('Flags file has not changed, skipping reload');
        return;
      }

      // Load new flags
      const flagsConfig = this.loadYamlFileWithStats(this.flagsPath);
      
      // Backup current flags for comparison
      const previousFlags = { 
        agents: { ...this.config.agents }, 
        features: { ...this.config.features } 
      };
      
      // Update config with new flags
      if (flagsConfig.agents) {
        this.config.agents = { ...this.config.agents, ...flagsConfig.agents };
      }
      
      if (flagsConfig.features) {
        this.config.features = { ...this.config.features, ...flagsConfig.features };
      }
      
      // Process environment variable placeholders
      this.processEnvVars(this.config);
      
      // Report changes
      console.log('Feature flags reloaded successfully');
      this.logConfigChanges(previousFlags, this.config);
      
      // Emit event for subscribers
      this.emitConfigChanged();
    } catch (error) {
      console.error('Failed to reload feature flags:', error);
    }
  }

  /**
   * Log changes in configuration after reload
   * 
   * @param {Object} previous - Previous configuration
   * @param {Object} current - Current configuration
   */
  logConfigChanges(previous, current) {
    // Log changes in agents configuration
    if (previous.agents && current.agents) {
      for (const agent in current.agents) {
        if (previous.agents[agent] !== current.agents[agent]) {
          console.log(`Agent config changed: ${agent} ${previous.agents[agent]} -> ${current.agents[agent]}`);
        }
      }
    }
    
    // Log changes in features configuration
    if (previous.features && current.features) {
      for (const feature in current.features) {
        if (previous.features[feature] !== current.features[feature]) {
          console.log(`Feature config changed: ${feature} ${previous.features[feature]} -> ${current.features[feature]}`);
        }
      }
    }
  }

  /**
   * Emit configuration changed event
   */
  emitConfigChanged() {
    // Use process events to notify subscribers
    process.emit('configChanged', this.config);
  }

  /**
   * Deep merge two objects
   * 
   * @param {Object} target - Target object
   * @param {Object} source - Source object to merge into target
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  /**
   * Check if a value is an object
   * 
   * @param {*} item - Value to check
   * @returns {boolean} Whether the value is an object
   */
  isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }

  /**
   * Process environment variable placeholders in the config
   * 
   * @param {Object} obj - Object to process
   * @param {string} path - Current path (for error reporting)
   */
  processEnvVars(obj, path = '') {
    for (const key in obj) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (this.isObject(obj[key])) {
        this.processEnvVars(obj[key], currentPath);
      } else if (typeof obj[key] === 'string') {
        const match = obj[key].match(/^\${([A-Za-z0-9_]+)}$/);
        
        if (match) {
          const envVar = match[1];
          const value = process.env[envVar];
          
          if (value === undefined) {
            console.warn(`Environment variable '${envVar}' not found for config path '${currentPath}'`);
          }
          
          // Convert 'true'/'false' strings to booleans
          if (value === 'true') {
            obj[key] = true;
          } else if (value === 'false') {
            obj[key] = false;
          } else {
            obj[key] = value !== undefined ? value : obj[key];
          }
        }
      }
    }
  }

  /**
   * Get a configuration value
   * 
   * @param {string} path - Dot-notation path to the config value
   * @param {*} defaultValue - Default value if the path doesn't exist
   * @returns {*} The configuration value
   */
  get(path, defaultValue = null) {
    if (!this.loaded) {
      this.load();
    }
    
    const parts = path.split('.');
    let current = this.config;
    
    for (const part of parts) {
      if (current === undefined || current === null) {
        return defaultValue;
      }
      
      current = current[part];
    }
    
    return current !== undefined ? current : defaultValue;
  }
  
  /**
   * Get the entire configuration object
   * 
   * @returns {Object} The entire configuration
   */
  getAll() {
    if (!this.loaded) {
      this.load();
    }
    
    return this.config;
  }

  /**
   * Register a callback that's called when configuration changes
   * 
   * @param {Function} callback - Function to call when configuration changes
   */
  onChange(callback) {
    if (typeof callback !== 'function') {
      throw new Error('onChange callback must be a function');
    }
    
    process.on('configChanged', callback);
  }
}

// Export a singleton instance
const configManager = new ConfigManager();
module.exports = configManager; 