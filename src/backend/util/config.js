/**
 * Configuration Manager
 * 
 * Loads and merges configuration from:
 * 1. Default configuration (config/default.yml)
 * 2. Environment-specific configuration (config/{env}.yml)
 * 3. Environment variables (replacing ${VAR_NAME} placeholders)
 */
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor() {
    this.config = {};
    this.loaded = false;
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

      // Merge configurations
      this.config = this.deepMerge(defaultConfig, envConfig);
      
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
          
          obj[key] = value !== undefined ? value : obj[key];
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
}

// Export a singleton instance
const configManager = new ConfigManager();
module.exports = configManager; 