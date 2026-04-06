#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { checkAllPrerequisites, getGoKafkaEnvVars } from './tools/prerequisites.js';
import {
  loadConfig,
  getActiveEnvironment,
  setActiveEnvironment,
  upsertEnvironment,
  removeEnvironment,
  listEnvironments,
  KafkaEnvironmentConfig,
} from './config.js';
import {
  startKafka,
  stopKafka,
  kafkaStatus,
  listTopics,
  createTopic,
  deleteTopic,
  describeTopic,
  produceMessage,
  consumeMessages,
  listConsumerGroups,
  describeConsumerGroup,
} from './tools/kafka.js';
import {
  buildGoService,
  goModSetup,
  runGoService,
  runGoBinary,
  stopGoService,
  getServiceLogs,
  listGoServices,
  stopAllGoServices,
  runGoTests,
  initGoKafkaProject,
} from './tools/goservice.js';

// ── Create MCP Server ──────────────────────────────────────────────────────────

const server = new McpServer({
  name: '@hjain/go-kafka-mcp-server',
  version: '1.0.0',
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PREREQUISITE TOOLS
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  'check_prerequisites',
  'Check all prerequisites for running Go services with librdkafka on Windows (Go, GCC, pkg-config, librdkafka, Docker, Git)',
  {},
  async () => {
    const results = checkAllPrerequisites();
    const lines = results.map(r => {
      const icon = r.installed ? '✅' : '❌';
      return `${icon} **${r.name}**: ${r.installed ? r.version : 'NOT INSTALLED'}\n   ${r.details}`;
    });
    const allGood = results.every(r => r.installed);
    const summary = allGood
      ? '\n🎉 All prerequisites are met! You are ready to build and run Go services with librdkafka.'
      : '\n⚠️ Some prerequisites are missing. Please install them before proceeding.';
    return { content: [{ type: 'text', text: lines.join('\n\n') + '\n' + summary }] };
  }
);

server.tool(
  'get_env_vars',
  'Get the environment variables needed for CGO + librdkafka compilation on Windows',
  {},
  async () => {
    const env = getGoKafkaEnvVars();
    const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
    return { content: [{ type: 'text', text: `Environment variables for CGO + librdkafka:\n\n${lines.join('\n')}` }] };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
//  ENVIRONMENT MANAGEMENT TOOLS
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  'list_environments',
  'List all configured Kafka environments (pods) with their bootstrap servers and zookeeper addresses',
  {},
  async () => {
    const result = listEnvironments();
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'switch_environment',
  'Switch the active Kafka environment (pod). All subsequent Kafka operations will use this environment.',
  {
    environment: z.string().describe('Environment key to activate (e.g. "local", "pod1", "pod2")'),
  },
  async ({ environment }) => {
    const result = setActiveEnvironment(environment);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'add_environment',
  'Add or update a Kafka environment (pod) configuration with its own bootstrap server and zookeeper',
  {
    envKey: z.string().describe('Unique key for this environment (e.g. "pod1", "staging", "us-east")'),
    name: z.string().describe('Human-readable name (e.g. "Pod 1 - US East")'),
    kafkaBootstrapServers: z.string().describe('Kafka bootstrap servers (e.g. "kafka-host:9092")'),
    zookeeperConnect: z.string().describe('Zookeeper connection string (e.g. "zk-host:2181")'),
    kafkaUIPort: z.number().optional().describe('Local Kafka UI port (default: 8089)'),
    kafkaExternalPort: z.number().optional().describe('Local Kafka external port (default: 9092)'),
    kafkaInternalPort: z.number().optional().describe('Local Kafka internal port (default: 29092)'),
    zookeeperPort: z.number().optional().describe('Local Zookeeper port (default: 2181)'),
  },
  async ({ envKey, name, kafkaBootstrapServers, zookeeperConnect, kafkaUIPort, kafkaExternalPort, kafkaInternalPort, zookeeperPort }) => {
    const config: KafkaEnvironmentConfig = {
      name,
      kafkaBootstrapServers,
      zookeeperConnect,
      kafkaUIPort: kafkaUIPort ?? 8089,
      kafkaExternalPort: kafkaExternalPort ?? 9092,
      kafkaInternalPort: kafkaInternalPort ?? 29092,
      zookeeperPort: zookeeperPort ?? 2181,
    };
    const result = upsertEnvironment(envKey, config);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'remove_environment',
  'Remove a Kafka environment (pod) configuration',
  {
    envKey: z.string().describe('Environment key to remove'),
  },
  async ({ envKey }) => {
    const result = removeEnvironment(envKey);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'active_environment',
  'Show the currently active Kafka environment details',
  {},
  async () => {
    const env = getActiveEnvironment();
    const config = loadConfig();
    const text = `Active Environment: **${config.activeEnvironment}** (${env.name})\n\n` +
      `  Kafka Bootstrap: ${env.kafkaBootstrapServers}\n` +
      `  Zookeeper: ${env.zookeeperConnect}\n` +
      `  Kafka External Port: ${env.kafkaExternalPort}\n` +
      `  Kafka Internal Port: ${env.kafkaInternalPort}\n` +
      `  Zookeeper Port: ${env.zookeeperPort}\n` +
      `  Kafka UI Port: ${env.kafkaUIPort}`;
    return { content: [{ type: 'text', text }] };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
//  KAFKA MANAGEMENT TOOLS
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  'start_kafka',
  'Start a local Kafka cluster (Zookeeper + Kafka + Kafka UI) using Docker Compose',
  {},
  async () => {
    const result = startKafka();
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'stop_kafka',
  'Stop the local Kafka cluster',
  {},
  async () => {
    const result = stopKafka();
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'kafka_status',
  'Get the status of the local Kafka cluster containers',
  {},
  async () => {
    const result = kafkaStatus();
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'list_topics',
  'List all Kafka topics',
  { bootstrapServer: z.string().optional().describe('Kafka bootstrap server (default: localhost:9092)') },
  async ({ bootstrapServer }) => {
    const result = listTopics(bootstrapServer);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'create_topic',
  'Create a new Kafka topic',
  {
    topic: z.string().describe('Topic name'),
    partitions: z.number().optional().describe('Number of partitions (default: 1)'),
    replicationFactor: z.number().optional().describe('Replication factor (default: 1)'),
    bootstrapServer: z.string().optional().describe('Kafka bootstrap server (default: localhost:9092)'),
  },
  async ({ topic, partitions, replicationFactor, bootstrapServer }) => {
    const result = createTopic(topic, partitions, replicationFactor, bootstrapServer);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'delete_topic',
  'Delete a Kafka topic',
  {
    topic: z.string().describe('Topic name to delete'),
    bootstrapServer: z.string().optional().describe('Kafka bootstrap server (default: localhost:9092)'),
  },
  async ({ topic, bootstrapServer }) => {
    const result = deleteTopic(topic, bootstrapServer);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'describe_topic',
  'Describe a Kafka topic (partitions, replicas, config)',
  {
    topic: z.string().describe('Topic name'),
    bootstrapServer: z.string().optional().describe('Kafka bootstrap server (default: localhost:9092)'),
  },
  async ({ topic, bootstrapServer }) => {
    const result = describeTopic(topic, bootstrapServer);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'produce_message',
  'Produce a message to a Kafka topic',
  {
    topic: z.string().describe('Topic to produce to'),
    message: z.string().describe('Message content'),
    key: z.string().optional().describe('Optional message key'),
    bootstrapServer: z.string().optional().describe('Kafka bootstrap server (default: localhost:9092)'),
  },
  async ({ topic, message, key, bootstrapServer }) => {
    const result = produceMessage(topic, message, key, bootstrapServer);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'consume_messages',
  'Consume messages from a Kafka topic',
  {
    topic: z.string().describe('Topic to consume from'),
    maxMessages: z.number().optional().describe('Maximum number of messages (default: 10)'),
    fromBeginning: z.boolean().optional().describe('Read from beginning (default: true)'),
    bootstrapServer: z.string().optional().describe('Kafka bootstrap server (default: localhost:9092)'),
  },
  async ({ topic, maxMessages, fromBeginning, bootstrapServer }) => {
    const result = consumeMessages(topic, maxMessages, fromBeginning, bootstrapServer);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'list_consumer_groups',
  'List all Kafka consumer groups',
  { bootstrapServer: z.string().optional().describe('Kafka bootstrap server (default: localhost:9092)') },
  async ({ bootstrapServer }) => {
    const result = listConsumerGroups(bootstrapServer);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'describe_consumer_group',
  'Describe a Kafka consumer group (members, offsets, lag)',
  {
    group: z.string().describe('Consumer group name'),
    bootstrapServer: z.string().optional().describe('Kafka bootstrap server (default: localhost:9092)'),
  },
  async ({ group, bootstrapServer }) => {
    const result = describeConsumerGroup(group, bootstrapServer);
    return { content: [{ type: 'text', text: result }] };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
//  GO SERVICE TOOLS
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  'init_go_kafka_project',
  'Initialize a new Go project with confluent-kafka-go dependency and a sample main.go',
  {
    projectPath: z.string().describe('Path where the Go project will be created'),
    moduleName: z.string().describe('Go module name (e.g. github.com/myorg/myservice)'),
  },
  async ({ projectPath, moduleName }) => {
    const result = initGoKafkaProject(projectPath, moduleName);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'go_mod_setup',
  'Run go mod tidy and go mod download for a Go project (with CGO enabled for librdkafka)',
  {
    projectPath: z.string().describe('Path to the Go project'),
  },
  async ({ projectPath }) => {
    const result = goModSetup(projectPath);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'build_go_service',
  'Build a Go service with CGO enabled for librdkafka on Windows',
  {
    projectPath: z.string().describe('Path to the Go project'),
    outputName: z.string().optional().describe('Output binary name (e.g. myservice.exe)'),
    buildTags: z.string().optional().describe('Build tags (e.g. "dynamic" for dynamic linking)'),
    extraFlags: z.string().optional().describe('Extra go build flags (e.g. "-race -v")'),
  },
  async ({ projectPath, outputName, buildTags, extraFlags }) => {
    const result = buildGoService(projectPath, outputName, buildTags, extraFlags);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'run_go_service',
  'Run a Go service from source (go run) as a background process with CGO + librdkafka env',
  {
    projectPath: z.string().describe('Path to the Go project'),
    serviceName: z.string().describe('A friendly name for this service instance'),
    envVars: z.record(z.string()).optional().describe('Additional environment variables (e.g. {"KAFKA_BROKER": "localhost:9092"})'),
    args: z.string().optional().describe('Command-line arguments to pass to the service'),
  },
  async ({ projectPath, serviceName, envVars, args }) => {
    const result = runGoService(projectPath, serviceName, envVars, args);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'run_go_binary',
  'Run a compiled Go binary as a background process',
  {
    binaryPath: z.string().describe('Path to the compiled binary (.exe)'),
    serviceName: z.string().describe('A friendly name for this service instance'),
    envVars: z.record(z.string()).optional().describe('Additional environment variables'),
    args: z.string().optional().describe('Command-line arguments'),
  },
  async ({ binaryPath, serviceName, envVars, args }) => {
    const result = runGoBinary(binaryPath, serviceName, envVars, args);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'stop_service',
  'Stop a running Go service by its process ID',
  {
    processId: z.string().describe('The process ID returned when the service was started'),
  },
  async ({ processId }) => {
    const result = stopGoService(processId);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'service_logs',
  'Get recent logs from a running Go service',
  {
    processId: z.string().describe('The process ID of the service'),
    lines: z.number().optional().describe('Number of log lines to return (default: 50)'),
  },
  async ({ processId, lines }) => {
    const result = getServiceLogs(processId, lines);
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'list_services',
  'List all managed Go service processes',
  {},
  async () => {
    const result = listGoServices();
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'stop_all_services',
  'Stop all running Go services',
  {},
  async () => {
    const result = stopAllGoServices();
    return { content: [{ type: 'text', text: result }] };
  }
);

server.tool(
  'run_go_tests',
  'Run Go tests with CGO enabled for librdkafka',
  {
    projectPath: z.string().describe('Path to the Go project'),
    testPattern: z.string().optional().describe('Test name pattern to run (e.g. "TestProducer")'),
    verbose: z.boolean().optional().describe('Verbose output (default: true)'),
  },
  async ({ projectPath, testPattern, verbose }) => {
    const result = runGoTests(projectPath, testPattern, verbose);
    return { content: [{ type: 'text', text: result }] };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Go Kafka MCP Server started on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
