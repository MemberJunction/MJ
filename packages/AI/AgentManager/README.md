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
│       ├── agent-spec.ts               # AgentSpec class for metadata management
│       └── old/
│           └── agent-definition.interface.ts  # Legacy interfaces (deprecated)
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

## Core Classes and Interfaces

### AgentSpec Class

The `AgentSpec` class is the primary interface for working with AI agent metadata. It provides a bi-directional bridge between the simple, serializable `AgentRawSpec` format (from `@memberjunction/ai-core-plus`) and the complex MemberJunction database metadata.

**Key Features:**
- Load complete agent hierarchies from the database
- Save changes atomically with full validation
- Support for n-level agent hierarchies
- Full TypeScript type safety
- Dirty tracking for unsaved changes
- JSON serialization for APIs

**Example Usage:**

```typescript
import { AgentSpec } from '@memberjunction/ai-agent-manager';
import { UserInfo } from '@memberjunction/global';

// Load an existing agent
const spec = await AgentSpec.LoadFromDatabase('agent-uuid', contextUser);
console.log('Agent Name:', spec.spec.Name);
console.log('Actions:', spec.spec.Actions?.length);

// Create a new agent
const newAgent = new AgentSpec({
    Name: 'My New Agent',
    Description: 'Does amazing things',
    IconClass: 'fa-robot',
    InvocationMode: 'Any',
    Actions: [
        {
            AgentActionID: '',
            ActionID: 'action-uuid',
            Status: 'Active'
        }
    ]
}, contextUser);

const agentId = await newAgent.SaveToDatabase();

// Modify and save
const spec = await AgentSpec.LoadFromDatabase('agent-uuid', contextUser);
spec.spec.Description = 'Updated description';
spec.spec.MaxCostPerRun = 10.00;
spec.markDirty();
await spec.SaveToDatabase();

// Export to JSON
const jsonSpec = spec.toJSON();
```

### AgentRawSpec Interface

Defined in `@memberjunction/ai-core-plus`, the `AgentRawSpec` interface represents a complete agent specification in a simple, serializable format. It includes:

- **Core Configuration**: Name, description, icons, parent relationships
- **Payload Routing**: Downstream/upstream paths, scoping, self read/write paths
- **Validation**: Input and output payload validation with retry strategies
- **Resource Limits**: Cost, token, iteration, and time limits
- **Execution Controls**: Min/max executions, effort levels, chat handling
- **Actions**: Array of actions available to the agent
- **Sub-Agents**: Array of child and related sub-agents

See the comprehensive JSDoc in `AgentSpec` class for detailed field descriptions.

## Database Entities

The agent system uses three core entities:

1. **AIAgentEntity** - Core agent configuration and metadata
2. **AIAgentActionEntity** - Links actions to agents with execution settings
3. **AIAgentRelationshipEntity** - Defines parent-child agent relationships

The `AgentSpec` class handles all the complexity of synchronizing between these entities and the simplified `AgentRawSpec` format.

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

## Sub-Agent Types

The system supports two types of sub-agent relationships:

### Child Agents (ParentID-based)
- Uses the same payload structure as parent
- Data flow controlled by `PayloadDownstreamPaths` and `PayloadUpstreamPaths`
- Simple hierarchical relationship via `ParentID` field

### Related Agents (Relationship-based)
- Independent payload structures
- Data mapping via `SubAgentInputMapping` and `SubAgentOutputMapping`
- Context sharing via `SubAgentContextPaths`
- More flexible but requires explicit mapping configuration

## Payload Routing

Agents support sophisticated payload routing:

- **PayloadDownstreamPaths**: Controls what data flows to sub-agents (e.g., `["*"]`, `["customer.id", "campaign.*"]`)
- **PayloadUpstreamPaths**: Controls what sub-agents can write back (e.g., `["*"]`, `["analysis.results"]`)
- **PayloadSelfReadPaths**: Controls what the agent's own prompt can read
- **PayloadSelfWritePaths**: Controls what the agent's own prompt can write
- **PayloadScope**: Defines the sub-agent's operating scope within parent payload (e.g., `/PropA/SubProp1`)

## Validation Strategies

### Input Validation
- **StartingPayloadValidation**: JSON schema for input validation
- **StartingPayloadValidationMode**: `Fail` (reject) or `Warn` (log and proceed)

### Output Validation
- **FinalPayloadValidation**: JSON schema for output validation
- **FinalPayloadValidationMode**: `Fail` (reject), `Retry` (with feedback), or `Warn` (log and proceed)
- **FinalPayloadValidationMaxRetries**: Maximum retry attempts

## Resource Limits

Agents can be configured with resource limits to prevent runaway costs:

- **MaxCostPerRun**: Maximum cost in dollars
- **MaxTokensPerRun**: Maximum total tokens (input + output)
- **MaxIterationsPerRun**: Maximum prompt iterations
- **MaxTimePerRun**: Maximum time in seconds

## Development

To build the packages:

```bash
# Build core package
cd packages/AI/AgentManager/core
npm run build

# Build actions package
cd packages/AI/AgentManager/actions
npm run build

# Or from repository root
npm run build
```

## API Access

The Agent Manager can be accessed through:
- **MemberJunction Explorer UI**: Visual agent management interface
- **GraphQL API**: Programmatic access via MJAPI
- **MCP (Model Context Protocol) Server**: Integration with AI development tools

## Security

All agent management actions are restricted to the Agent Manager agent only, ensuring proper access control and audit trails. Agent ownership is tracked via `OwnerUserID`, granting full permissions (view, run, edit, delete) to the owner regardless of ACL entries.

## Legacy Code

The `/old/agent-definition.interface.ts` file contains deprecated interfaces that are being phased out in favor of the new `AgentSpec` class. New development should use `AgentSpec` exclusively.
