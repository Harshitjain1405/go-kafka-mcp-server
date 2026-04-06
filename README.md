# @hjain/go-kafka-mcp-server

An MCP (Model Context Protocol) server for running **Go services with librdkafka** locally on Windows.  
Supports **multiple Kafka environments (pods)** with configurable bootstrap servers and zookeeper per pod.

**Author:** @hjain

## Features

### Environment / Pod Management
- `list_environments` — List all configured Kafka pods with their bootstrap & zookeeper addresses
- `switch_environment` — Switch active pod (all Kafka operations use the active pod)
- `add_environment` — Add a new pod with its own Kafka bootstrap server & zookeeper
- `remove_environment` — Remove a pod configuration
- `active_environment` — Show current active pod details

### Prerequisite Checks
- `check_prerequisites` — Validates Go, GCC/MinGW, pkg-config, librdkafka, Docker, Git
- `get_env_vars` — Shows CGO + librdkafka environment variables for Windows

### Local Kafka Management (Docker)
- `start_kafka` / `stop_kafka` — Start/stop local Kafka cluster (uses active environment ports)
- `kafka_status` — Container status
- `list_topics` / `create_topic` / `delete_topic` / `describe_topic` — Topic management
- `produce_message` / `consume_messages` — Produce/consume test messages
- `list_consumer_groups` / `describe_consumer_group` — Consumer group inspection

### Go Service Management
- `init_go_kafka_project` — Scaffold a new Go project with confluent-kafka-go
- `go_mod_setup` — Run `go mod tidy` + `go mod download` with CGO env
- `build_go_service` — Build with CGO enabled for librdkafka
- `run_go_service` — Run from source (`go run`) as a background process
- `run_go_binary` — Run a compiled binary as a background process
- `stop_service` / `stop_all_services` — Stop running services
- `service_logs` — View logs from running services
- `list_services` — List all managed service processes
- `run_go_tests` — Run tests with CGO enabled

## Multi-Pod / Environment Configuration

Each pod can have its own Kafka bootstrap server and Zookeeper address. Configuration is stored in `mcp-config.json` (git-ignored — each developer maintains their own).

Copy the example to get started:
```bash
cp mcp-config.example.json mcp-config.json
```

Example config with multiple pods:
```json
{
  "activeEnvironment": "local",
  "environments": {
    "local": {
      "name": "Local Development",
      "kafkaBootstrapServers": "localhost:9092",
      "zookeeperConnect": "localhost:2181",
      "kafkaUIPort": 8089,
      "kafkaExternalPort": 9092,
      "kafkaInternalPort": 29092,
      "zookeeperPort": 2181
    },
    "pod1": {
      "name": "Pod 1",
      "kafkaBootstrapServers": "kafka-pod1.example.com:9092",
      "zookeeperConnect": "zk-pod1.example.com:2181",
      "kafkaUIPort": 8089,
      "kafkaExternalPort": 9092,
      "kafkaInternalPort": 29092,
      "zookeeperPort": 2181
    }
  }
}
```

Use `switch_environment` tool to switch between pods at runtime.

## Prerequisites

1. **Node.js** (v18+) — to run this MCP server
2. **Go** (1.21+) — https://go.dev/dl/
3. **MSYS2 + MinGW GCC** — Required for CGO/librdkafka compilation
   ```
   # Install MSYS2 from https://www.msys2.org/
   # Then in MSYS2 terminal:
   pacman -S mingw-w64-x86_64-gcc mingw-w64-x86_64-pkg-config mingw-w64-x86_64-librdkafka
   ```
   Add `C:\msys64\mingw64\bin` to your system PATH.
4. **Docker Desktop** — for running local Kafka

> **Note:** confluent-kafka-go v2 can statically link librdkafka, which may simplify the setup. The `build_go_service` tool sets up CGO environment variables automatically.

## Setup (for contributors)

```bash
git clone https://github.com/Harshitjain1405/go-kafka-mcp-server.git
cd go-kafka-mcp-server
npm install
npm run build
```

## Windsurf IDE Configuration

Add the following to your Windsurf MCP settings (`~/.codeium/windsurf/mcp_config.json` or `.windsurf/mcp_config.json`):

**Option 1 — via npx (recommended, no local clone needed):**
```json
{
  "mcpServers": {
    "go-kafka": {
      "command": "npx",
      "args": ["-y", "github:Harshitjain1405/go-kafka-mcp-server"]
    }
  }
}
```

**Option 2 — if published to npm:**
```json
{
  "mcpServers": {
    "go-kafka": {
      "command": "npx",
      "args": ["-y", "@hjain/go-kafka-mcp-server"]
    }
  }
}
```

**Option 3 — local clone (development):**
```json
{
  "mcpServers": {
    "go-kafka": {
      "command": "node",
      "args": ["<path-to>/go-kafka-mcp-server/dist/index.js"]
    }
  }
}
```

## Quick Start

1. Run `check_prerequisites` to verify your setup
2. Run `list_environments` to see configured pods
3. Run `switch_environment` to select your pod
4. Run `start_kafka` to spin up local Kafka
5. Run `init_go_kafka_project` or point to your existing Go service
6. Run `build_go_service` to compile
7. Run `run_go_service` to start
8. Use `service_logs` to monitor output
