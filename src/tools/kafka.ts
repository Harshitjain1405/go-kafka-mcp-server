import { runCommand, getDockerComposeFilePath } from '../utils.js';
import { getActiveEnvironment } from '../config.js';

/**
 * Get the docker compose command (V2 or V1 fallback).
 */
function getComposeCommand(): string {
  const v2 = runCommand('docker compose version');
  if (v2.success) return 'docker compose';
  return 'docker-compose';
}

/**
 * Start local Kafka cluster via Docker Compose.
 */
export function startKafka(): string {
  const composePath = getDockerComposeFilePath();
  const cmd = getComposeCommand();
  const env = getActiveEnvironment();

  // Pass environment-specific ports to docker-compose
  const envVars = [
    `$env:KAFKA_EXTERNAL_PORT="${env.kafkaExternalPort}"`,
    `$env:KAFKA_INTERNAL_PORT="${env.kafkaInternalPort}"`,
    `$env:ZOOKEEPER_PORT="${env.zookeeperPort}"`,
    `$env:KAFKA_UI_PORT="${env.kafkaUIPort}"`,
    `$env:KAFKA_CLUSTER_NAME="${env.name}"`,
  ].join('; ');

  const result = runCommand(`${envVars}; ${cmd} -f "${composePath}" up -d`, undefined, 120000);

  if (result.success) {
    return `Kafka cluster started successfully (env: ${env.name}).\n\n` +
      `Services:\n` +
      `  - Kafka Broker: localhost:${env.kafkaExternalPort}\n` +
      `  - Zookeeper: localhost:${env.zookeeperPort}\n` +
      `  - Kafka UI: http://localhost:${env.kafkaUIPort}\n\n` +
      result.stdout;
  }
  return `Failed to start Kafka cluster.\n\nError: ${result.stderr}\n\nStdout: ${result.stdout}`;
}

/**
 * Stop local Kafka cluster.
 */
export function stopKafka(): string {
  const composePath = getDockerComposeFilePath();
  const cmd = getComposeCommand();
  const result = runCommand(`${cmd} -f "${composePath}" down`, undefined, 60000);

  if (result.success) {
    return `Kafka cluster stopped.\n${result.stdout}`;
  }
  return `Failed to stop Kafka cluster.\nError: ${result.stderr}`;
}

/**
 * Get Kafka cluster status.
 */
export function kafkaStatus(): string {
  const composePath = getDockerComposeFilePath();
  const cmd = getComposeCommand();
  const result = runCommand(`${cmd} -f "${composePath}" ps`, undefined, 15000);
  return result.success ? result.stdout : `Error: ${result.stderr}`;
}

/**
 * List Kafka topics.
 */
export function listTopics(bootstrapServer?: string): string {
  if (!bootstrapServer) bootstrapServer = getActiveEnvironment().kafkaBootstrapServers;
  const result = runCommand(
    `docker exec go-mcp-kafka kafka-topics --bootstrap-server ${bootstrapServer} --list`,
    undefined,
    15000
  );
  if (result.success) {
    const topics = result.stdout.split('\n').filter(t => t.trim());
    return `Topics (${topics.length}):\n${topics.map(t => `  - ${t}`).join('\n')}`;
  }
  return `Failed to list topics. Is Kafka running?\nError: ${result.stderr}`;
}

/**
 * Create a Kafka topic.
 */
export function createTopic(
  topic: string,
  partitions: number = 1,
  replicationFactor: number = 1,
  bootstrapServer?: string
): string {
  if (!bootstrapServer) bootstrapServer = getActiveEnvironment().kafkaBootstrapServers;
  const result = runCommand(
    `docker exec go-mcp-kafka kafka-topics --bootstrap-server ${bootstrapServer} --create --topic ${topic} --partitions ${partitions} --replication-factor ${replicationFactor}`,
    undefined,
    15000
  );
  if (result.success) {
    return `Topic '${topic}' created (partitions=${partitions}, replication=${replicationFactor}).`;
  }
  return `Failed to create topic '${topic}'.\nError: ${result.stderr}`;
}

/**
 * Delete a Kafka topic.
 */
export function deleteTopic(
  topic: string,
  bootstrapServer?: string
): string {
  if (!bootstrapServer) bootstrapServer = getActiveEnvironment().kafkaBootstrapServers;
  const result = runCommand(
    `docker exec go-mcp-kafka kafka-topics --bootstrap-server ${bootstrapServer} --delete --topic ${topic}`,
    undefined,
    15000
  );
  if (result.success) {
    return `Topic '${topic}' deleted.`;
  }
  return `Failed to delete topic '${topic}'.\nError: ${result.stderr}`;
}

/**
 * Describe a Kafka topic.
 */
export function describeTopic(
  topic: string,
  bootstrapServer?: string
): string {
  if (!bootstrapServer) bootstrapServer = getActiveEnvironment().kafkaBootstrapServers;
  const result = runCommand(
    `docker exec go-mcp-kafka kafka-topics --bootstrap-server ${bootstrapServer} --describe --topic ${topic}`,
    undefined,
    15000
  );
  if (result.success) {
    return result.stdout;
  }
  return `Failed to describe topic '${topic}'.\nError: ${result.stderr}`;
}

/**
 * Produce a message to a Kafka topic.
 */
export function produceMessage(
  topic: string,
  message: string,
  key?: string,
  bootstrapServer?: string
): string {
  if (!bootstrapServer) bootstrapServer = getActiveEnvironment().kafkaBootstrapServers;
  let cmd: string;
  if (key) {
    cmd = `echo '${key}:${message}' | docker exec -i go-mcp-kafka kafka-console-producer --bootstrap-server ${bootstrapServer} --topic ${topic} --property "parse.key=true" --property "key.separator=:"`;
  } else {
    cmd = `echo '${message}' | docker exec -i go-mcp-kafka kafka-console-producer --bootstrap-server ${bootstrapServer} --topic ${topic}`;
  }

  const result = runCommand(cmd, undefined, 15000);
  if (result.success) {
    return `Message produced to topic '${topic}'${key ? ` with key '${key}'` : ''}.`;
  }
  return `Failed to produce message.\nError: ${result.stderr}`;
}

/**
 * Consume messages from a Kafka topic.
 */
export function consumeMessages(
  topic: string,
  maxMessages: number = 10,
  fromBeginning: boolean = true,
  bootstrapServer?: string
): string {
  if (!bootstrapServer) bootstrapServer = getActiveEnvironment().kafkaBootstrapServers;
  const fromFlag = fromBeginning ? '--from-beginning' : '';
  const result = runCommand(
    `docker exec go-mcp-kafka kafka-console-consumer --bootstrap-server ${bootstrapServer} --topic ${topic} --max-messages ${maxMessages} ${fromFlag} --timeout-ms 10000`,
    undefined,
    30000
  );
  if (result.success) {
    return `Messages from '${topic}':\n${result.stdout}`;
  }
  return `Consumed output:\n${result.stdout}\n${result.stderr}`;
}

/**
 * List consumer groups.
 */
export function listConsumerGroups(bootstrapServer?: string): string {
  if (!bootstrapServer) bootstrapServer = getActiveEnvironment().kafkaBootstrapServers;
  const result = runCommand(
    `docker exec go-mcp-kafka kafka-consumer-groups --bootstrap-server ${bootstrapServer} --list`,
    undefined,
    15000
  );
  if (result.success) {
    return `Consumer Groups:\n${result.stdout}`;
  }
  return `Failed to list consumer groups.\nError: ${result.stderr}`;
}

/**
 * Describe a consumer group.
 */
export function describeConsumerGroup(
  group: string,
  bootstrapServer?: string
): string {
  if (!bootstrapServer) bootstrapServer = getActiveEnvironment().kafkaBootstrapServers;
  const result = runCommand(
    `docker exec go-mcp-kafka kafka-consumer-groups --bootstrap-server ${bootstrapServer} --describe --group ${group}`,
    undefined,
    15000
  );
  if (result.success) {
    return result.stdout;
  }
  return `Failed to describe consumer group '${group}'.\nError: ${result.stderr}`;
}
