# MemberJunction Agent Manager

The Agent Manager system provides a comprehensive solution for creating, managing, and orchestrating AI agents within the MemberJunction platform.

## Overview

The Agent Manager is a meta-agent system that can create and manage other agents. It uses a hierarchical architecture with specialized sub-agents to handle different aspects of agent creation:

- **Agent Manager**: Top-level orchestrator
- **Requirements Analyst**: Gathers and clarifies requirements
- **Planning Designer**: Designs agent hierarchies and selects actions
- **Prompt Designer**: Crafts effective prompts for agents

## Package Structure

```
agent-manager/
├── core/                    # Core interfaces and types
│   └── src/
│       └── interfaces/
│           └── agent-definition.interface.ts
├── actions/                 # Agent management actions
│   └── src/
│       └── actions/
│           ├── base-agent-management.action.ts
│           ├── create-agent.action.ts
│           ├── update-agent.action.ts
│           ├── list-agents.action.ts
│           └── ...
└── README.md
```

## Core Interface

All agents use the unified `AgentDefinition` interface which supports:
- N-levels of sub-agent hierarchy
- Complete lifecycle from requirements to implementation
- Markdown formatting for all documentation fields
- Recursive structure for unlimited depth

## Agent Management Actions

The system provides specialized actions restricted to the Agent Manager:
- **Create Agent**: Creates new AI agents
- **Update Agent**: Modifies existing agents
- **List Agents**: Queries agents with filtering
- **Deactivate Agent**: Soft deletes agents
- **Associate Action With Agent**: Links actions to agents
- **Create Sub Agent**: Creates child agents
- **Set Agent Prompt**: Configures agent prompts
- **Validate Agent Configuration**: Ensures proper setup
- **Export Agent Bundle**: Exports agent configurations

## Usage

The Agent Manager is configured through metadata in `/metadata/agents/` and can be accessed through:
- MemberJunction Explorer UI
- API endpoints
- MCP (Model Context Protocol) server

## Development

To build the packages:

```bash
# Build core package
cd packages/AI/agent-manager/core
npm run build

# Build actions package
cd packages/AI/agent-manager/actions
npm run build
```

## Security

All agent management actions are restricted to the Agent Manager agent only, ensuring proper access control and audit trails.