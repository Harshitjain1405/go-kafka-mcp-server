import * as fs from 'fs';
import * as path from 'path';

export interface KafkaEnvironmentConfig {
  name: string;
  kafkaBootstrapServers: string;
  zookeeperConnect: string;
  kafkaUIPort: number;
  kafkaExternalPort: number;
  kafkaInternalPort: number;
  zookeeperPort: number;
}

export interface ServerConfig {
  activeEnvironment: string;
  environments: Record<string, KafkaEnvironmentConfig>;
}

const DEFAULT_CONFIG: ServerConfig = {
  activeEnvironment: 'local',
  environments: {
    local: {
      name: 'Local Development',
      kafkaBootstrapServers: 'localhost:9092',
      zookeeperConnect: 'localhost:2181',
      kafkaUIPort: 8089,
      kafkaExternalPort: 9092,
      kafkaInternalPort: 29092,
      zookeeperPort: 2181,
    },
  },
};

function getConfigFilePath(): string {
  return path.resolve(__dirname, '..', 'mcp-config.json');
}

/**
 * Load configuration from mcp-config.json, falling back to defaults.
 */
export function loadConfig(): ServerConfig {
  const configPath = getConfigFilePath();
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ServerConfig>;
      return {
        activeEnvironment: parsed.activeEnvironment || DEFAULT_CONFIG.activeEnvironment,
        environments: { ...DEFAULT_CONFIG.environments, ...parsed.environments },
      };
    }
  } catch {
    // Fall through to default
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration to mcp-config.json.
 */
export function saveConfig(config: ServerConfig): void {
  const configPath = getConfigFilePath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Get the active environment config.
 */
export function getActiveEnvironment(): KafkaEnvironmentConfig {
  const config = loadConfig();
  const env = config.environments[config.activeEnvironment];
  if (!env) {
    return config.environments['local'] || DEFAULT_CONFIG.environments['local'];
  }
  return env;
}

/**
 * Set the active environment.
 */
export function setActiveEnvironment(envName: string): string {
  const config = loadConfig();
  if (!config.environments[envName]) {
    return `Environment '${envName}' not found. Available: ${Object.keys(config.environments).join(', ')}`;
  }
  config.activeEnvironment = envName;
  saveConfig(config);
  return `Active environment set to '${envName}' (${config.environments[envName].name})`;
}

/**
 * Add or update an environment.
 */
export function upsertEnvironment(
  envKey: string,
  envConfig: KafkaEnvironmentConfig
): string {
  const config = loadConfig();
  const isNew = !config.environments[envKey];
  config.environments[envKey] = envConfig;
  saveConfig(config);
  return isNew
    ? `Environment '${envKey}' added.`
    : `Environment '${envKey}' updated.`;
}

/**
 * Remove an environment.
 */
export function removeEnvironment(envKey: string): string {
  const config = loadConfig();
  if (!config.environments[envKey]) {
    return `Environment '${envKey}' does not exist.`;
  }
  if (config.activeEnvironment === envKey) {
    return `Cannot remove the active environment. Switch to another environment first.`;
  }
  delete config.environments[envKey];
  saveConfig(config);
  return `Environment '${envKey}' removed.`;
}

/**
 * List all environments.
 */
export function listEnvironments(): string {
  const config = loadConfig();
  const lines = Object.entries(config.environments).map(([key, env]) => {
    const active = key === config.activeEnvironment ? ' (ACTIVE)' : '';
    return `- **${key}**${active}: ${env.name}\n  Kafka: ${env.kafkaBootstrapServers} | Zookeeper: ${env.zookeeperConnect}`;
  });
  return `Environments:\n${lines.join('\n')}`;
}
