# Sage Agent & Conversation Flow - Current System Documentation

## Overview

This document describes the current implementation of Sage (formerly "Conversation Manager Agent") and how the conversation flow works in MemberJunction. This is based on a thorough code review conducted on 2025-10-15.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Key Components](#key-components)
3. [Message Flow Scenarios](#message-flow-scenarios)
4. [Task Graph vs Single Agent Execution](#task-graph-vs-single-agent-execution)
5. [Action Execution](#action-execution)
6. [Important Files](#important-files)
7. [Recent Changes (PR #1470)](#recent-changes-pr-1470)

---

## System Architecture

### High-Level Flow

```
User Message
    ↓
MessageInputComponent (routing logic)
    ↓
├─→ Direct @mention? → invokeAgentDirectly()
├─→ Previous agent? → checkContinuityIntent()
│       ↓
│   YES → continueWithAgent()
│   NO/UNSURE → processMessageThroughAgent() (Sage)
│
└─→ No context → processMessageThroughAgent() (Sage)
        ↓
    ConversationAgentService.processMessage()
        ↓
    GraphQLAIClient.RunAIAgent() → Server
        ↓
    AgentRunner.RunAgent() → BaseAgent.Execute()
        ↓
    Sage Evaluates & Returns Decision:
        ├─→ Chat (direct response)
        ├─→ Actions (execute Sage actions)
        ├─→ invokeAgent (single-step delegation)
        └─→ taskGraph (multi-step workflow)
```

---

## Key Components

### 1. Sage Agent Configuration

**Location**: `/metadata/agents/.sage-agent.json`

**Key Properties**:
- **Name**: Sage
- **Type**: Loop (TypeID: `@lookup:MJ: AI Agent Types.Name=Loop`)
- **ExecutionOrder**: 0 (always first)
- **ExposeAsAction**: true
- **Description**: "Ambient agent in MJ that is always present in all conversations to help the user navigate functionality in MJ, handle basic requests, and bring in other agents to delegate work to"

**Available Actions** (as of PR #1470):
1. Get Record
2. Create Record
3. Update Record
4. Delete Record
5. Web Search
6. Calculate Expression
7. Text Analyzer
8. Web Page Content
9. URL Metadata Extractor
10. Get Weather
11. **Query Scheduled Jobs** (NEW)
12. **Create Scheduled Job** (NEW)
13. **Update Scheduled Job** (NEW)
14. **Delete Scheduled Job** (NEW)
15. **Execute Scheduled Job Now** (NEW)
16. **Get Scheduled Job Statistics** (NEW)
17. **Find Best Agent** (NEW - local embedding based agent search)

**Prompt**: Links to `AI Prompts.Name=Sage - System Prompt`

---

### 2. Sage System Prompt

**Location**: `/metadata/prompts/templates/conversations/conversation-manager-agent.template.md`

**Role**: Ambient, always-present AI assistant in MemberJunction conversations

**Core Responsibilities**:

1. **Conversation Awareness**
   - Monitor all messages
   - Understand when directly addressed vs observing
   - Track conversation flow
   - Maintain awareness of active agents

2. **Smart Engagement**
   - **Respond when**:
     - Directly addressed
     - Asked direct questions
     - User needs help/guidance
     - Conversation needs clarification
     - No other agent is better suited
   - **Observe silently when**:
     - Multi-party conversations
     - Another agent already engaged
     - Productive discussions ongoing
     - Off-topic social chat

3. **Navigation & Assistance**
   - Help users discover MJ features
   - Guide to appropriate functionality
   - Explain entity relationships

4. **Agent Orchestration**
   - ALL agent invocations use task graph format
   - Can invoke single-step or multi-step workflows
   - Available agents passed as `ALL_AVAILABLE_AGENTS` variable

**Decision Framework**:

```
1. Use Agents First
   ↓ If available agent matches user request
   ↓ Return invokeAgent payload

2. When to Execute Actions (type: 'Actions')
   - Simple data queries
   - Permission checks
   - Entity lookups
   - Basic CRUD operations
   - Scheduled job management

3. When to Respond Directly (type: 'Chat')
   - Simple informational questions
   - Navigation guidance
   - Quick clarifications
   - Follow-up questions

4. When to Stay Silent (taskComplete: true, no message)
   - Multi-party conversations
   - Other agents handling requests
   - Social chatter
   - Topics outside scope
```

**Task Graph Format**:

Sage can return a task graph for multi-step workflows:

```json
{
  "newElements": {
    "taskGraph": {
      "workflowName": "Research and Analyze AI Market",
      "reasoning": "This request requires research followed by analysis",
      "tasks": [
        {
          "tempId": "task1",
          "name": "Research Data",
          "description": "Query database",
          "agentName": "Research Agent",
          "dependsOn": [],
          "inputPayload": { "query": "..." }
        },
        {
          "tempId": "task2",
          "name": "Analyze Results",
          "description": "Analyze the research data",
          "agentName": "Analysis Agent",
          "dependsOn": ["task1"],
          "inputPayload": {
            "data": "@task1.output"
          }
        }
      ]
    }
  }
}
```

---

### 3. Message Input Component

**Location**: `/packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts`

**Core Responsibility**: Handle user input and route messages to appropriate agents

**Routing Logic** (`routeMessage()` method):

```typescript
Priority 1: Direct @mention
  ├─→ handleDirectMention()
  └─→ invokeAgentDirectly()

Priority 2: Previous Agent with Intent Check
  ├─→ findLastNonSageAgentId()
  ├─→ checkContinuityIntent() [Fast LLM check: YES/NO/UNSURE]
  │     ├─→ YES: continueWithAgent()
  │     └─→ NO/UNSURE: processMessageThroughAgent() [Sage]

Priority 3: No Context
  └─→ processMessageThroughAgent() [Sage]
```

**Intent Check**:
- Uses `Check Sage Intent` prompt
- Fast inference (<500ms)
- Returns: `YES`, `NO`, or `UNSURE`
- If YES: bypasses Sage, continues with previous agent
- If NO/UNSURE: routes through Sage for evaluation

**Message Processing Flow** (`processMessageThroughAgent()`):

```typescript
1. Create AI message for Sage (Status: In-Progress)
2. Call ConversationAgentService.processMessage()
3. Sage evaluates and returns result
4. Check result type:
   ├─→ taskGraph? → handleTaskGraphExecution()
   ├─→ invokeAgent? → handleSubAgentInvocation()
   ├─→ Chat? → Display message + create artifact if payload exists
   └─→ Silent? → handleSilentObservation()
```

**Task Graph Execution** (`handleTaskGraphExecution()`):

```typescript
Single Task (taskGraph.tasks.length === 1):
  ├─→ Use direct agent execution pattern
  ├─→ Update CM message with delegation text
  └─→ Call handleSingleTaskExecution()

Multi-Step Workflow (taskGraph.tasks.length > 1):
  ├─→ Create ConversationDetail for task execution updates
  ├─→ Register for PubSub progress updates
  ├─→ Call ExecuteTaskGraph mutation (server-side)
  └─→ Handle real-time progress via PubSub
```

**Sub-Agent Invocation** (`handleSubAgentInvocation()`):

```typescript
1. Create AI response message (Status: In-Progress)
2. Add to active tasks
3. Call ConversationAgentService.invokeSubAgent()
4. Update message with result
5. Create artifact from payload if exists
6. Auto-retry once if fails
```

**Silent Observation** (`handleSilentObservation()`):

```typescript
When Sage stays silent:
  ├─→ Find last non-Sage AI message
  ├─→ Load OUTPUT artifact from that message
  ├─→ Continue with that agent, passing payload for continuity
  └─→ Create new version of artifact if agent returns payload
```

---

### 4. Conversation Agent Service

**Location**: `/packages/Angular/Generic/conversations/src/lib/services/conversation-agent.service.ts`

**Key Methods**:

#### `processMessage()`

Processes user message through Sage:

```typescript
Parameters:
  - conversationId: string
  - message: ConversationDetailEntity
  - conversationHistory: ConversationDetailEntity[]
  - conversationDetailId: string (links to agent run)
  - onProgress?: AgentExecutionProgressCallback

Flow:
  1. Build conversation messages from history
  2. Prepare ExecuteAgentParams with:
     - agent: Sage
     - conversationMessages: history
     - conversationDetailId: for linking
     - data: {
         ALL_AVAILABLE_AGENTS: [...], // Non-Sage, non-parent, Active agents
         conversationId,
         latestMessageId
       }
  3. Call GraphQLAIClient.RunAIAgent()
  4. Return ExecuteAgentResult
```

#### `invokeSubAgent()`

Invokes a specialist agent:

```typescript
Parameters:
  - agentName: string
  - conversationId: string
  - message: ConversationDetailEntity
  - conversationHistory: ConversationDetailEntity[]
  - reasoning: string (why this agent)
  - conversationDetailId: string
  - payload?: any (previous OUTPUT artifact for continuity)
  - onProgress?: AgentExecutionProgressCallback

Flow:
  1. Find agent by name in AIEngineBase.Instance.Agents
  2. Build conversation messages
  3. Prepare ExecuteAgentParams with:
     - agent: found agent
     - conversationMessages: history
     - conversationDetailId: for linking
     - data: { conversationId, latestMessageId, invocationReason }
     - payload: if provided (for iterative refinement)
  4. Call GraphQLAIClient.RunAIAgent()
  5. Return ExecuteAgentResult
```

#### `checkAgentContinuityIntent()`

Fast intent check to determine if message continues with previous agent:

```typescript
Parameters:
  - agentId: string (previous agent)
  - latestMessage: string
  - conversationHistory: ConversationDetailEntity[]

Flow:
  1. Load "Check Sage Intent" prompt
  2. Build compact context (last 10 messages)
  3. Call GraphQLAIClient.RunAIPrompt()
  4. Parse result: YES/NO/UNSURE
  5. Return decision

Purpose:
  - Avoid Sage overhead when user clearly continuing with agent
  - Fast check (<500ms)
  - Returns UNSURE on error (safer to let Sage evaluate)
```

---

### 5. Task Orchestration System

#### TaskResolver (GraphQL Mutation)

**Location**: `/packages/MJServer/src/resolvers/TaskResolver.ts`

**Mutation**: `ExecuteTaskGraph`

```graphql
mutation ExecuteTaskGraph(
  $taskGraphJson: String!
  $conversationDetailId: String!
  $environmentId: String!
  $sessionId: String!
) {
  ExecuteTaskGraph(
    taskGraphJson: $taskGraphJson
    conversationDetailId: $conversationDetailId
    environmentId: $environmentId
    sessionId: $sessionId
  ) {
    success
    errorMessage
    results {
      taskId
      success
      output
      error
    }
  }
}
```

**Flow**:
1. Parse task graph JSON
2. Validate (must have workflowName and tasks)
3. Create TaskOrchestrator with PubSub
4. Create tasks from graph (parent + children with dependencies)
5. Execute tasks for parent
6. Return results

#### TaskOrchestrator

**Location**: `/packages/MJServer/src/services/TaskOrchestrator.ts`

**Key Methods**:

##### `createTasksFromGraph()`

Creates parent and child tasks with dependencies:

```typescript
Flow:
  1. Ensure task type exists ("AI Agent Execution")
  2. Create parent workflow task (links to conversationDetailId)
  3. Deduplicate tasks by tempId
  4. For each task:
     - Create child task entity
     - Find agent by name
     - Store inputPayload in description metadata
     - Link to parent via ParentID
     - Link to conversation via ConversationDetailID
  5. Create task dependencies using TaskDependency entities
  6. Return parentTaskId and taskIdMap
```

##### `executeTasksForParent()`

Executes all tasks respecting dependencies:

```typescript
Flow:
  1. Load parent task
  2. Publish workflow start
  3. While has more tasks:
     - Find eligible tasks (pending, no incomplete dependencies)
     - For each eligible task:
       - Publish task start
       - executeTask()
       - Publish task complete/failed
       - Update parent progress
  4. Mark parent complete
  5. Publish workflow complete
```

##### `executeTask()`

Executes a single task:

```typescript
Flow:
  1. Update status to In Progress
  2. Load agent entity
  3. Build conversation messages:
     - Base: task description
     - Add dependent task outputs as markdown
     - Add inputPayload as JSON
  4. Create progress callback (publishes via PubSub)
  5. Run AgentRunner.RunAgent()
  6. If success:
     - Extract output (message or payload)
     - Update task status to Complete
     - Create artifact from output
  7. If failed:
     - Update task status to Failed
```

**Progress Updates via PubSub**:

```typescript
Task Progress:
  type: "TaskProgress"
  data: { taskName, message, percentComplete }

Agent Progress (nested):
  type: "AgentProgress"
  data: { taskName, agentStep, agentMessage }
```

These are published to `PUSH_STATUS_UPDATES_TOPIC` and filtered by sessionId.

---

### 6. GraphQLAIClient

**Location**: `/packages/GraphQLDataProvider/src/graphQLAIClient.ts`

**Key Methods**:

#### `RunAIAgent()`

Executes an agent via GraphQL:

```typescript
Parameters: ExecuteAgentParams
  - agent: AIAgentEntityExtended
  - conversationMessages: ChatMessage[]
  - data?: any
  - payload?: any
  - conversationDetailId?: string
  - onProgress?: AgentExecutionProgressCallback

Flow:
  1. Subscribe to PubSub if onProgress provided
     - Filter for resolver="RunAIAgentResolver"
     - Filter for type="ExecutionProgress"
     - Forward to onProgress callback with agentRunId
  2. Build RunAIAgent mutation
  3. Execute via GraphQLDataProvider
  4. Process result (parse JSON)
  5. Unsubscribe from PubSub
  6. Return ExecuteAgentResult
```

**PubSub Message Format**:

```json
{
  "resolver": "RunAIAgentResolver",
  "type": "ExecutionProgress",
  "status": "ok",
  "data": {
    "agentRunId": "...",
    "progress": {
      "step": "...",
      "message": "...",
      "percentage": 50,
      "metadata": { ... }
    }
  }
}
```

#### `RunAIPrompt()`

Executes a prompt via GraphQL:

```typescript
Parameters: RunAIPromptParams
  - promptId: string
  - messages?: ChatMessage[]
  - data?: any
  - temperature?, topP?, etc.

Flow:
  1. Build RunAIPrompt mutation
  2. Execute via GraphQLDataProvider
  3. Process result (parse JSON results)
  4. Return RunAIPromptResult
```

---

### 7. AgentRunner

**Location**: `/packages/AI/Agents/src/AgentRunner.ts`

**Purpose**: Thin wrapper that instantiates and executes agents

**Flow**:
```typescript
1. Ensure AIEngine configured
2. Find agent type by TypeID
3. Get driver class (agent.DriverClass || agentType.DriverClass)
4. Use ClassFactory to instantiate BaseAgent subclass
5. Call agentInstance.Execute(params)
6. Return ExecuteAgentResult
```

This ensures the correct agent class is used (e.g., `LoopAgent`, `SimpleAgent`, etc.) based on the agent type's DriverClass.

---

## Message Flow Scenarios

### Scenario 1: User sends first message in conversation

```
User: "What is the weather in New York?"
  ↓
MessageInputComponent.onSend()
  ↓
createMessageDetail() → Save to DB
  ↓
routeMessage() checks:
  - No @mention → FALSE
  - No previous agent → FALSE
  - No context → TRUE
  ↓
processMessageThroughAgent()
  ↓
Create ConversationDetail for Sage (Status: In-Progress)
  ↓
ConversationAgentService.processMessage()
  ├─→ Build conversation messages (just user message)
  ├─→ Pass ALL_AVAILABLE_AGENTS
  └─→ GraphQLAIClient.RunAIAgent()
      ↓
  Server: AgentRunner → Sage.Execute()
      ↓
  Sage evaluates:
    - Has "Get Weather" action
    - User asking about weather
    - Decision: Execute Action
      ↓
  Returns: FinalStep="Actions", payload={ action: "Get Weather", ... }
      ↓
Back to processMessageThroughAgent():
  - Check payload.taskGraph? NO
  - Check payload.invokeAgent? NO
  - Check FinalStep="Chat"? NO
  - Check FinalStep="Actions"? YES
  ↓
Sage executes Get Weather action internally
  ↓
Returns result with message
  ↓
Update Sage's ConversationDetail:
  - Message: "The weather in New York is 72°F and sunny."
  - Status: Complete
  ↓
User sees response
```

### Scenario 2: User directly mentions an agent

```
User: "@Marketing Agent create a blog post about AI"
  ↓
MessageInputComponent.onSend()
  ↓
parseMentionsFromMessage()
  ↓
routeMessage() checks:
  - Has @mention "Marketing Agent" → TRUE
  ↓
handleDirectMention()
  ↓
invokeAgentDirectly()
  ├─→ Create AI response message (Status: In-Progress)
  ├─→ Add to active tasks
  └─→ ConversationAgentService.invokeSubAgent()
      ↓
  GraphQLAIClient.RunAIAgent() for Marketing Agent
      ↓
  Agent runs, returns result
      ↓
Back to invokeAgentDirectly():
  - Update AI message with result
  - Create artifact from payload
  - Mark complete
  ↓
User sees Marketing Agent's response

NOTE: Sage is completely bypassed
```

### Scenario 3: User continues conversation with previous agent

```
Previous: Marketing Agent created blog post
User: "Make it shorter"
  ↓
MessageInputComponent.onSend()
  ↓
routeMessage() checks:
  - No @mention → FALSE
  - Previous agent exists (Marketing Agent) → TRUE
  ↓
handleAgentContinuity()
  ↓
checkContinuityIntent()
  ├─→ Load "Check Sage Intent" prompt
  ├─→ Build context: agent info + last 10 messages + new message
  ├─→ Call GraphQLAIClient.RunAIPrompt()
  └─→ Result: "YES" (user is clearly asking agent to modify its work)
  ↓
continueWithAgent()
  ├─→ Load last OUTPUT artifact from Marketing Agent
  ├─→ Parse as payload
  ├─→ Create AI response message (Status: In-Progress)
  └─→ ConversationAgentService.invokeSubAgent()
      - agentName: "Marketing Agent"
      - payload: { previousBlogPost: "..." }
      ↓
  Marketing Agent runs with previous payload
      ↓
  Returns modified blog post
      ↓
Back to continueWithAgent():
  - Update AI message
  - Create NEW VERSION of artifact (not new artifact)
  - Mark complete
  ↓
User sees updated blog post

NOTE: Sage is bypassed due to intent check
```

### Scenario 4: User message requires context switch

```
Previous: Marketing Agent created blog post
User: "What's the weather?"
  ↓
MessageInputComponent.onSend()
  ↓
routeMessage() checks:
  - No @mention → FALSE
  - Previous agent exists (Marketing Agent) → TRUE
  ↓
handleAgentContinuity()
  ↓
checkContinuityIntent()
  ├─→ Build context
  ├─→ Call GraphQLAIClient.RunAIPrompt()
  └─→ Result: "NO" (clear context shift)
  ↓
processMessageThroughAgent() [Sage evaluates]
  ↓
Sage decides:
  - User wants weather info
  - Has Get Weather action
  - Decision: Execute Action
  ↓
Returns weather info directly
  ↓
User sees Sage's response

NOTE: Sage intervenes due to context shift detection
```

### Scenario 5: Multi-step workflow via task graph

```
User: "Research AI companies and create a marketing strategy"
  ↓
MessageInputComponent.onSend()
  ↓
routeMessage() → processMessageThroughAgent()
  ↓
Sage evaluates:
  - Complex request requiring multiple agents
  - Decision: Create task graph
  ↓
Returns: payload.taskGraph = {
  workflowName: "AI Market Research & Strategy",
  tasks: [
    { tempId: "task1", agentName: "Research Agent", ... },
    { tempId: "task2", agentName: "Marketing Agent", dependsOn: ["task1"], ... }
  ]
}
  ↓
handleTaskGraphExecution()
  ↓
Update Sage's message: "📋 Setting up multi-step workflow..."
  ↓
Create new ConversationDetail for task execution
  ↓
Register for PubSub updates
  ↓
Call ExecuteTaskGraph mutation
  ↓
Server: TaskResolver → TaskOrchestrator
  ├─→ Create parent task
  ├─→ Create child tasks with dependencies
  ├─→ Execute task1 (Research Agent)
  │     ├─→ PubSub: "Task Progress: Research Agent - Starting (0%)"
  │     ├─→ PubSub: "Agent Progress: Searching database..."
  │     ├─→ Agent completes, creates artifact
  │     └─→ PubSub: "Task Progress: Research Agent - Complete (100%)"
  ├─→ Execute task2 (Marketing Agent)
  │     ├─→ Receives task1 output as input
  │     ├─→ PubSub: "Task Progress: Marketing Agent - Starting (50%)"
  │     ├─→ Agent creates marketing strategy
  │     └─→ PubSub: "Task Progress: Marketing Agent - Complete (100%)"
  └─→ Mark parent complete
  ↓
Back to handleTaskGraphExecution():
  - Receives success result
  - Updates execution message: "✅ Workflow completed"
  - Unregisters from PubSub
  ↓
User sees:
  1. Sage's delegation message
  2. Task execution message with real-time progress
  3. Artifacts from both agents
```

### Scenario 6: Sage decides to stay silent

```
Context: Multiple users chatting socially
User A: "How was your weekend?"
User B: "Great, went hiking!"
  ↓
MessageInputComponent.onSend() [for User B's message]
  ↓
processMessageThroughAgent()
  ↓
Sage evaluates:
  - Social conversation
  - Not addressed to Sage
  - No help needed
  - Decision: Observe silently
  ↓
Returns: FinalStep="Silent", message=null or empty
  ↓
handleSilentObservation()
  ├─→ Update Sage's ConversationDetail:
  │     - HiddenToUser: true
  │     - Status: Complete
  ├─→ Check if last non-Sage agent exists
  └─→ NO → Just mark user message complete
  ↓
User sees: No AI response (silent observation)

NOTE: Sage creates a hidden ConversationDetail record but doesn't display anything
```

---

## Task Graph vs Single Agent Execution

### Single Agent Execution Pattern

**Used When**:
- Direct @mention
- Intent check returns YES
- Sage returns `invokeAgent` payload
- Task graph with single task

**Characteristics**:
- Direct invocation via `invokeSubAgent()`
- Real-time progress via onProgress callback
- PubSub updates from agent execution
- Single ConversationDetail message
- Single artifact created

**Benefits**:
- Lower latency
- Real-time progress updates
- Better PubSub support
- Simpler execution model

### Task Graph Pattern

**Used When**:
- Sage returns `taskGraph` payload
- Multiple tasks with dependencies

**Characteristics**:
- Server-side orchestration
- Tasks created in database
- Dependencies tracked
- Sequential/parallel execution
- Real-time progress via PubSub (different format)
- Multiple artifacts (one per task)

**Benefits**:
- Handles complex workflows
- Dependency management
- Resumable (tasks persist in DB)
- Scalable for long-running operations

### Decision Flow in Message Input

```typescript
if (result.payload?.taskGraph) {
  if (taskGraph.tasks.length === 1) {
    // Use single agent pattern for better UX
    handleSingleTaskExecution()
  } else {
    // Use task graph pattern for orchestration
    handleTaskGraphExecution()
  }
}
```

---

## Action Execution

### How Sage Executes Actions

When Sage decides to execute an action (e.g., Get Weather, Create Record), it does so **internally** during agent execution on the server side.

**Flow**:

```
Sage.Execute() on server
  ↓
Sage evaluates → Decision: Execute Action
  ↓
Sage calls action via ActionEngine
  ↓
Action executes and returns result
  ↓
Sage includes result in response message
  ↓
Returns ExecuteAgentResult with:
  - FinalStep: "Actions" or "Chat"
  - Message: Text response with action result
  - Payload: May include structured data
```

**Example**:

```
User: "What's the weather in New York?"
  ↓
Sage decides to use "Get Weather" action
  ↓
Sage calls: ActionEngine.executeAction("Get Weather", { location: "New York" })
  ↓
Action returns: { temperature: 72, condition: "Sunny" }
  ↓
Sage formats response: "The weather in New York is 72°F and sunny."
  ↓
Returns to client
```

**Important**: The client doesn't explicitly call actions - Sage handles this internally based on its available actions and the user's request.

---

## Important Files

### Configuration & Metadata

| File | Purpose |
|------|---------|
| `/metadata/agents/.sage-agent.json` | Sage agent configuration, actions, prompts |
| `/metadata/prompts/templates/conversations/conversation-manager-agent.template.md` | Sage system prompt template |
| `/metadata/prompts/.prompts.json` | Prompt configurations (Name Conversation, Check Sage Intent) |

### UI Components (Angular)

| File | Purpose |
|------|---------|
| `/packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts` | User input, routing logic, agent invocation |
| `/packages/Angular/Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.ts` | Main chat UI, message display, artifact handling |
| `/packages/Angular/Generic/conversations/src/lib/components/message/message-list.component.ts` | Message rendering |
| `/packages/Angular/Generic/conversations/src/lib/services/conversation-agent.service.ts` | Sage & agent interaction service |
| `/packages/Angular/Generic/conversations/src/lib/services/active-tasks.service.ts` | Track in-memory running tasks |
| `/packages/Angular/Generic/conversations/src/lib/services/data-cache.service.ts` | Conversation data caching |

### Server Components

| File | Purpose |
|------|---------|
| `/packages/MJServer/src/resolvers/TaskResolver.ts` | ExecuteTaskGraph GraphQL mutation |
| `/packages/MJServer/src/services/TaskOrchestrator.ts` | Multi-step task orchestration engine |
| `/packages/GraphQLDataProvider/src/graphQLAIClient.ts` | Client for RunAIAgent/RunAIPrompt mutations |
| `/packages/AI/Agents/src/AgentRunner.ts` | Agent instantiation and execution wrapper |

### Core AI Components

| File | Purpose |
|------|---------|
| `/packages/AI/Agents/src/base-agent.ts` | Base class for all agents |
| `/packages/AI/Agents/src/loop-agent.ts` | Loop agent implementation (Sage uses this) |
| `/packages/AIEngine/src/ai-engine.ts` | AI engine singleton, agent/prompt registry |

---

## Recent Changes (PR #1470)

**Note**: Unable to fetch PR details via WebFetch, but based on code analysis, recent changes include:

### 1. Scheduled Job Actions (New)

Added 6 new actions to Sage for managing scheduled jobs:
- Query Scheduled Jobs
- Create Scheduled Job
- Update Scheduled Job
- Delete Scheduled Job
- Execute Scheduled Job Now
- Get Scheduled Job Statistics

**Location**: `.sage-agent.json` lines 174-254

**Impact**: Sage can now manage scheduled jobs directly without delegating to other agents.

### 2. Find Best Agent Action (New)

Added local embedding-based agent search:
- Action: "Find Best Agent"
- Uses local embedding models for semantic similarity

**Location**: `.sage-agent.json` lines 258-268

**Impact**: Sage can use semantic search to find the best agent for a task, improving agent selection accuracy.

### 3. Agent Local Embedding Work

Added embedding generation support:

**New Methods** in GraphQLAIClient:
```typescript
EmbedText(params: EmbedTextParams): Promise<EmbedTextResult>
```

**Parameters**:
- `textToEmbed`: string | string[]
- `modelSize`: 'small' | 'medium'

**Returns**:
- `embeddings`: number[] | number[][]
- `modelName`: string
- `vectorDimensions`: number

**Location**: `graphQLAIClient.ts` lines 585-645

**Impact**: Enables local embedding generation for similarity calculations, powering the "Find Best Agent" action.

---

## Key Architectural Decisions

### 1. Intent Check Before Sage

**Why**: Reduce latency when user is clearly continuing with an agent
- **Before**: Every message routed through Sage (adds ~2-3 seconds)
- **After**: Fast intent check (<500ms) for continuity
- **Result**: Better UX for iterative conversations

### 2. Task Graph for Single Tasks

**Why**: Maintain consistent UX and leverage existing patterns
- Single-task graphs use direct agent execution
- Multi-task graphs use server-side orchestration
- **Result**: Best of both worlds (speed + capability)

### 3. Artifact Versioning

**Why**: Track iterative refinements
- When continuing with same agent, create new version
- When switching agents, create new artifact
- **Result**: Clear history of iterations

### 4. PubSub Progress Updates

**Why**: Real-time feedback for long-running operations
- Agent progress updates
- Task progress updates
- **Result**: User sees what's happening in real-time

### 5. Silent Observation

**Why**: Sage doesn't interrupt natural conversations
- Sage can observe without responding
- Hidden ConversationDetail created for tracking
- **Result**: Less intrusive AI presence

---

## Future Enhancement Opportunities

### 1. Improve Intent Check
- Current: Single prompt check
- Opportunity: Use conversation context embedding similarity
- Benefit: More accurate continuity detection

### 2. Parallel Task Execution
- Current: Sequential execution even when no dependencies
- Opportunity: Execute independent tasks in parallel
- Benefit: Faster multi-step workflows

### 3. Smart Agent Selection
- Current: Sage manually selects agent
- Opportunity: Use "Find Best Agent" action more proactively
- Benefit: Better agent matching

### 4. Context Window Management
- Current: Last 20 messages
- Opportunity: Intelligent context summarization
- Benefit: Better long conversation handling

### 5. Artifact Diffing
- Current: Full artifact versions stored
- Opportunity: Store diffs between versions
- Benefit: Smaller storage, clearer changes

---

## Glossary

| Term | Definition |
|------|------------|
| **Sage** | The ambient AI agent in MJ conversations (formerly "Conversation Manager Agent") |
| **Loop Agent** | Agent type that can iterate and make decisions about next steps |
| **Task Graph** | Multi-step workflow definition with dependencies |
| **Intent Check** | Fast LLM check to determine if user is continuing with previous agent |
| **Sub-Agent** | Specialist agent invoked by Sage |
| **Artifact** | Structured output created by agents (stored as JSON) |
| **ConversationDetail** | Database record representing a single message in a conversation |
| **ExecuteAgentResult** | Return type from agent execution (includes agentRun, message, payload) |
| **PubSub** | Real-time message bus for progress updates |

---

## Conclusion

The current Sage + conversation flow system is sophisticated and well-architected:

✅ **Strengths**:
- Smart routing logic (intent check, @mentions, context-aware)
- Flexible execution models (single agent, task graphs, actions)
- Real-time progress updates
- Artifact versioning for iterative work
- Silent observation for natural conversations

🔧 **Opportunities**:
- Further optimize intent checking
- Parallel task execution
- Smarter agent selection using embeddings
- Better context management

This architecture provides a solid foundation for building more advanced agent orchestration and conversation management capabilities.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-15
**Author**: Code Analysis
**Status**: Current Implementation
