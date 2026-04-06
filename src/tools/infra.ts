import { runCommand, getDockerComposeFilePath } from '../utils.js';
import * as path from 'path';

/**
 * Get the docker compose command (V2 or V1 fallback).
 */
function getComposeCommand(): string {
  const v2 = runCommand('docker compose version');
  if (v2.success) return 'docker compose';
  return 'docker-compose';
}

/**
 * Get path to the cs-policy-engine infra docker-compose file.
 */
function getInfraComposeFilePath(): string {
  return path.resolve(__dirname, '..', 'docker-compose.cs-policy-engine.yml');
}

/**
 * Start all cs-policy-engine infra services (Cassandra, Vault, OpenSearch, Consul).
 */
export function startInfra(services?: string[]): string {
  const composePath = getInfraComposeFilePath();
  const cmd = getComposeCommand();
  const svcArg = services && services.length > 0 ? services.join(' ') : '';
  const result = runCommand(
    `${cmd} -f "${composePath}" up -d ${svcArg}`,
    undefined,
    180000
  );

  if (result.success) {
    const started = svcArg || 'all services (Cassandra, Vault, OpenSearch, Consul)';
    return `Infra services started: ${started}\n\n` +
      `Endpoints:\n` +
      `  - Cassandra:  localhost:9042\n` +
      `  - Vault:      http://localhost:8200 (token: dev-root-token)\n` +
      `  - OpenSearch: http://localhost:9200\n` +
      `  - Consul UI:  http://localhost:8500\n\n` +
      result.stdout;
  }
  return `Failed to start infra services.\n\nError: ${result.stderr}\n\nStdout: ${result.stdout}`;
}

/**
 * Stop all cs-policy-engine infra services.
 */
export function stopInfra(services?: string[]): string {
  const composePath = getInfraComposeFilePath();
  const cmd = getComposeCommand();
  const svcArg = services && services.length > 0 ? services.join(' ') : '';
  const result = runCommand(
    `${cmd} -f "${composePath}" down ${svcArg}`,
    undefined,
    60000
  );
  if (result.success) {
    return `Infra services stopped.\n${result.stdout}`;
  }
  return `Failed to stop infra services.\n\nError: ${result.stderr}`;
}

/**
 * Show status of cs-policy-engine infra services.
 */
export function infraStatus(): string {
  const composePath = getInfraComposeFilePath();
  const cmd = getComposeCommand();
  const result = runCommand(`${cmd} -f "${composePath}" ps`, undefined, 15000);
  return result.success ? result.stdout : `Error: ${result.stderr}`;
}

/**
 * Setup Vault dev secrets for cs-policy-engine.
 * Seeds the Vault dev server with the secrets cs-policy-engine expects.
 */
export function setupVaultSecrets(
  cassUser: string = 'cassandra',
  cassPass: string = 'cassandra',
  kafkaUser: string = '',
  kafkaPass: string = '',
  esUser: string = 'admin',
  esPass: string = 'admin'
): string {
  const results: string[] = [];

  // Enable KV v2 secrets engine if not already
  const enableKv = runCommand(
    `docker exec go-mcp-vault vault secrets enable -path=secret kv-v2`,
    undefined,
    15000
  );
  if (enableKv.success) {
    results.push('Enabled KV v2 secrets engine at secret/');
  } else if (enableKv.stderr.includes('already in use')) {
    results.push('KV v2 secrets engine already enabled at secret/');
  } else {
    results.push(`Warning: ${enableKv.stderr}`);
  }

  // Seed Cassandra secrets
  const cassResult = runCommand(
    `docker exec -e VAULT_TOKEN=dev-root-token go-mcp-vault vault kv put secret/cms/cassandra cms-database-dml-username="${cassUser}" cms-database-dml-password="${cassPass}"`,
    undefined,
    15000
  );
  results.push(cassResult.success
    ? `Cassandra secrets seeded (user=${cassUser})`
    : `Failed to seed Cassandra secrets: ${cassResult.stderr}`);

  // Seed Kafka secrets (if SASL enabled)
  if (kafkaUser && kafkaPass) {
    const kafkaResult = runCommand(
      `docker exec -e VAULT_TOKEN=dev-root-token go-mcp-vault vault kv put secret/cms/kafka kafka.sasl.username="${kafkaUser}" kafka.sasl.password="${kafkaPass}"`,
      undefined,
      15000
    );
    results.push(kafkaResult.success
      ? `Kafka SASL secrets seeded (user=${kafkaUser})`
      : `Failed to seed Kafka secrets: ${kafkaResult.stderr}`);
  }

  // Seed ES/OpenSearch secrets
  const esResult = runCommand(
    `docker exec -e VAULT_TOKEN=dev-root-token go-mcp-vault vault kv put secret/cms/elasticsearch cs-elastic-username="${esUser}" cs-elastic-password="${esPass}"`,
    undefined,
    15000
  );
  results.push(esResult.success
    ? `OpenSearch secrets seeded (user=${esUser})`
    : `Failed to seed OpenSearch secrets: ${esResult.stderr}`);

  return `Vault secret setup:\n${results.map(r => `  - ${r}`).join('\n')}`;
}

/**
 * Setup Cassandra keyspace for cs-policy-engine.
 */
export function setupCassandraKeyspace(
  keyspace: string = 'qualys_cms',
  replication: number = 1
): string {
  const cql = `CREATE KEYSPACE IF NOT EXISTS ${keyspace} WITH replication = {'class': 'SimpleStrategy', 'replication_factor': ${replication}};`;
  const result = runCommand(
    `docker exec go-mcp-cassandra cqlsh -e "${cql}"`,
    undefined,
    30000
  );
  if (result.success) {
    return `Keyspace '${keyspace}' created (replication_factor=${replication}).`;
  }
  return `Failed to create keyspace. Is Cassandra ready?\nError: ${result.stderr}\n\nHint: Cassandra takes ~30-60s to start. Check with 'infra_status'.`;
}

/**
 * Run a CQL query against the local Cassandra.
 */
export function runCqlQuery(query: string): string {
  const result = runCommand(
    `docker exec go-mcp-cassandra cqlsh -e "${query.replace(/"/g, '\\"')}"`,
    undefined,
    30000
  );
  if (result.success) {
    return result.stdout || 'Query executed successfully.';
  }
  return `CQL query failed.\nError: ${result.stderr}`;
}

/**
 * Add a key-value pair to Consul for cs-policy-engine config.
 */
export function setConsulConfig(key: string, value: string): string {
  const result = runCommand(
    `docker exec go-mcp-consul consul kv put "${key}" "${value}"`,
    undefined,
    15000
  );
  if (result.success) {
    return `Consul KV set: ${key} = ${value}`;
  }
  return `Failed to set Consul KV.\nError: ${result.stderr}`;
}

/**
 * Get a value from Consul KV store.
 */
export function getConsulConfig(key: string): string {
  const result = runCommand(
    `docker exec go-mcp-consul consul kv get "${key}"`,
    undefined,
    15000
  );
  if (result.success) {
    return `${key} = ${result.stdout}`;
  }
  return `Key not found or error.\nError: ${result.stderr}`;
}

/**
 * Generate the env vars needed to run cs-policy-engine locally.
 */
export function getPolicyEngineEnvVars(
  kafkaHost: string = 'localhost:9092',
  cassHost: string = 'localhost:9042',
  vaultAddr: string = 'http://localhost:8200',
  esService: string = 'localhost:9200'
): string {
  const envVars: Record<string, string> = {
    // Kafka
    LI_KAFKA_HOST: kafkaHost,
    LI_KAFKA_GROUP_ID: 'cms-event-consumer',
    LI_KAFKA_TOPIC: 'cs-policy-evaluation',
    LI_KAFKA_PRODUCER_TOPIC: 'cms-indexing-centralized-policy-result',

    // Cassandra
    LI_CASS_HOST: cassHost,
    LI_CASS_KEYSPACE: 'qualys_cms',
    LI_CASS_VAULT_PATH: 'secret/data/cms/cassandra',

    // Vault
    LI_VAULT_ADDRESS: vaultAddr,
    LI_VAULT_SECRET_ENGINE: 'kv-v2',
    Vault_TOKEN: 'dev-root-token',
    LI_kVV2: 'false',

    // OpenSearch
    LI_ESSERVICE: esService,
    LI_ES_VAULT_PATH: 'secret/data/cms/elasticsearch',

    // Server
    LI_PORT: '0.0.0.0:9100',
    LI_CONTEXTTIMEOUT: '30',
    LI_IDLETIMEOUT: '120',
    LI_READTIMEOUT: '1',
    LI_WRITETIMEOUT: '1',
  };

  const lines = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);
  return `Environment variables for cs-policy-engine local run:\n\n${lines.join('\n')}`;
}
