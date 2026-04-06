import { runCommand, startProcess, stopProcess, getProcessLogs, listProcesses, stopAllProcesses, pathExists } from '../utils.js';
import { getGoKafkaEnvVars } from './prerequisites.js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Build a Go service with CGO enabled for librdkafka.
 */
export function buildGoService(
  projectPath: string,
  outputName?: string,
  buildTags?: string,
  extraFlags?: string
): string {
  if (!pathExists(projectPath)) {
    return `Error: Project path '${projectPath}' does not exist.`;
  }

  const env = getGoKafkaEnvVars();
  const envStr = Object.entries(env)
    .map(([k, v]) => `$env:${k}="${v}"`)
    .join('; ');

  let cmd = `${envStr}; go build`;

  if (buildTags) {
    cmd += ` -tags "${buildTags}"`;
  }
  if (extraFlags) {
    cmd += ` ${extraFlags}`;
  }
  if (outputName) {
    const outPath = outputName.endsWith('.exe') ? outputName : `${outputName}.exe`;
    cmd += ` -o "${outPath}"`;
  }
  cmd += ` ./...`;

  const result = runCommand(cmd, projectPath, 300000); // 5 min timeout for builds
  if (result.success) {
    return `Build successful.\n${result.stdout}`;
  }
  return `Build failed.\n\nStdout:\n${result.stdout}\n\nStderr:\n${result.stderr}`;
}

/**
 * Run `go mod tidy` and `go mod download` for a Go project.
 */
export function goModSetup(projectPath: string): string {
  if (!pathExists(projectPath)) {
    return `Error: Project path '${projectPath}' does not exist.`;
  }

  const env = getGoKafkaEnvVars();
  const envStr = Object.entries(env)
    .map(([k, v]) => `$env:${k}="${v}"`)
    .join('; ');

  const tidyResult = runCommand(`${envStr}; go mod tidy`, projectPath, 120000);
  const downloadResult = runCommand(`${envStr}; go mod download`, projectPath, 120000);

  let output = '--- go mod tidy ---\n';
  output += tidyResult.success ? `Success\n${tidyResult.stdout}` : `Failed\n${tidyResult.stderr}`;
  output += '\n\n--- go mod download ---\n';
  output += downloadResult.success ? `Success\n${downloadResult.stdout}` : `Failed\n${downloadResult.stderr}`;

  return output;
}

/**
 * Run a Go service as a background process.
 */
export function runGoService(
  projectPath: string,
  serviceName: string,
  envVars?: Record<string, string>,
  args?: string
): string {
  if (!pathExists(projectPath)) {
    return `Error: Project path '${projectPath}' does not exist.`;
  }

  const kafkaEnv = getGoKafkaEnvVars();
  const mergedEnv = { ...kafkaEnv, ...envVars };
  const envStr = Object.entries(mergedEnv)
    .map(([k, v]) => `$env:${k}="${v}"`)
    .join('; ');

  let cmd = `${envStr}; go run .`;
  if (args) {
    cmd += ` ${args}`;
  }

  const id = startProcess(serviceName, cmd, projectPath, mergedEnv);
  return `Service '${serviceName}' started with ID: ${id}\n\nUse 'service_logs' tool with this ID to view logs.\nUse 'stop_service' tool with this ID to stop the service.`;
}

/**
 * Run a compiled Go binary as a background process.
 */
export function runGoBinary(
  binaryPath: string,
  serviceName: string,
  envVars?: Record<string, string>,
  args?: string
): string {
  if (!pathExists(binaryPath)) {
    return `Error: Binary '${binaryPath}' does not exist. Build it first.`;
  }

  const kafkaEnv = getGoKafkaEnvVars();
  const mergedEnv = { ...kafkaEnv, ...envVars };

  let cmd = `"${binaryPath}"`;
  if (args) {
    cmd += ` ${args}`;
  }

  const cwd = path.dirname(binaryPath);
  const id = startProcess(serviceName, cmd, cwd, mergedEnv);
  return `Binary service '${serviceName}' started with ID: ${id}`;
}

/**
 * Stop a running Go service.
 */
export function stopGoService(processId: string): string {
  const success = stopProcess(processId);
  return success
    ? `Service ${processId} stopped.`
    : `Service ${processId} not found. It may have already exited.`;
}

/**
 * Get logs from a running Go service.
 */
export function getServiceLogs(processId: string, lines: number = 50): string {
  const logs = getProcessLogs(processId, lines);
  if (logs === null) {
    return `Service ${processId} not found.`;
  }
  if (logs.length === 0) {
    return `No logs yet for ${processId}.`;
  }
  return logs.join('\n');
}

/**
 * List all managed Go services.
 */
export function listGoServices(): string {
  const services = listProcesses();
  if (services.length === 0) {
    return 'No managed services are currently running.';
  }
  return services
    .map(s => `- ${s.name} (ID: ${s.id}) — ${s.running ? '🟢 Running' : '🔴 Stopped'}`)
    .join('\n');
}

/**
 * Stop all running Go services.
 */
export function stopAllGoServices(): string {
  const count = stopAllProcesses();
  return `Stopped ${count} service(s).`;
}

/**
 * Run Go tests with CGO enabled.
 */
export function runGoTests(
  projectPath: string,
  testPattern?: string,
  verbose: boolean = true
): string {
  if (!pathExists(projectPath)) {
    return `Error: Project path '${projectPath}' does not exist.`;
  }

  const env = getGoKafkaEnvVars();
  const envStr = Object.entries(env)
    .map(([k, v]) => `$env:${k}="${v}"`)
    .join('; ');

  let cmd = `${envStr}; go test`;
  if (verbose) cmd += ' -v';
  if (testPattern) {
    cmd += ` -run "${testPattern}"`;
  }
  cmd += ' ./...';

  const result = runCommand(cmd, projectPath, 300000);
  return `--- Test Results ---\n${result.stdout}\n${result.stderr}`;
}

/**
 * Initialize a new Go module with confluent-kafka-go dependency.
 */
export function initGoKafkaProject(
  projectPath: string,
  moduleName: string
): string {
  if (pathExists(path.join(projectPath, 'go.mod'))) {
    return `Error: go.mod already exists at '${projectPath}'. Use go_mod_setup instead.`;
  }

  // Create directory if it doesn't exist
  if (!pathExists(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true });
  }

  const env = getGoKafkaEnvVars();
  const envStr = Object.entries(env)
    .map(([k, v]) => `$env:${k}="${v}"`)
    .join('; ');

  // Init module
  const initResult = runCommand(`${envStr}; go mod init ${moduleName}`, projectPath, 30000);
  if (!initResult.success) {
    return `Failed to init module.\n${initResult.stderr}`;
  }

  // Add confluent-kafka-go
  const getResult = runCommand(
    `${envStr}; go get github.com/confluentinc/confluent-kafka-go/v2/kafka`,
    projectPath,
    120000
  );

  // Create a sample main.go
  const sampleMain = `package main

import (
\t"fmt"
\t"os"
\t"os/signal"
\t"syscall"

\t"github.com/confluentinc/confluent-kafka-go/v2/kafka"
)

func main() {
\tbroker := os.Getenv("KAFKA_BROKER")
\tif broker == "" {
\t\tbroker = "localhost:9092"
\t}

\tfmt.Printf("Connecting to Kafka broker: %s\\n", broker)

\t// Example: Create a producer
\tp, err := kafka.NewProducer(&kafka.ConfigMap{
\t\t"bootstrap.servers": broker,
\t})
\tif err != nil {
\t\tfmt.Fprintf(os.Stderr, "Failed to create producer: %s\\n", err)
\t\tos.Exit(1)
\t}
\tdefer p.Close()

\tfmt.Println("Kafka producer created successfully!")
\tfmt.Printf("librdkafka version: %s\\n", kafka.LibrdkafkaLinkInfo)

\t// Wait for shutdown signal
\tsigchan := make(chan os.Signal, 1)
\tsignal.Notify(sigchan, syscall.SIGINT, syscall.SIGTERM)
\t<-sigchan

\tfmt.Println("Shutting down...")
}
`;
  fs.writeFileSync(path.join(projectPath, 'main.go'), sampleMain, 'utf-8');

  let output = `Go Kafka project initialized at ${projectPath}\n`;
  output += `Module: ${moduleName}\n\n`;
  output += `--- go mod init ---\n${initResult.stdout}\n`;
  output += `--- go get confluent-kafka-go ---\n`;
  output += getResult.success ? getResult.stdout : `Warning: ${getResult.stderr}`;
  output += `\n\nCreated sample main.go with Kafka producer example.`;
  output += `\n\nNext steps:\n  1. Run 'start_kafka' to start local Kafka\n  2. Run 'build_go_service' to build\n  3. Run 'run_go_service' to start the service`;

  return output;
}
