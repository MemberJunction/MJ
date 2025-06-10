# MemberJunction Agentic AI Framework

## Technical Design Document

---

## 1. Executive Summary

The MemberJunction Agentic AI Framework provides a comprehensive, metadata-driven system for developing, configuring, and deploying AI agents that leverage large language models (LLMs) and other AI capabilities. This framework is designed to abstract common AI agent functionality, enable efficient configuration without code, and provide a flexible, scalable architecture for building sophisticated AI applications.

Key features include:
- Hierarchical agent composition (conductor pattern)
- Advanced prompt management with validation and caching
- Multi-model execution with result selection
- Comprehensive logging and analytics
- Flexible model and vendor integration

This document details the technical architecture, data models, and workflows that underpin the framework.

---

## 2. Core Architecture

### 2.1 Architectural Principles

The MemberJunction Agentic AI Framework is built on the following principles:

1. **Metadata-Driven:** All configuration is stored as structured data, enabling dynamic runtime behavior without code changes.
2. **Separation of Concerns:** Clear distinction between models, vendors, prompts, and agents.
3. **Pluggable Components:** Modular design allows swapping implementations (e.g., different LLM providers).
4. **Hierarchical Composition:** Agents can be composed of other agents in a tree structure.
5. **Provider Abstraction:** Unified interface to different AI models and vendors.
6. **Operational Transparency:** Comprehensive logging and monitoring capabilities.

### 2.2 System Components

The framework consists of the following major components:

1. **Model Management Subsystem:** Handles the registration, configuration, and access to AI models and vendors.
2. **Prompt Management Subsystem:** Manages the creation, versioning, and execution of prompts.
3. **Agent Framework:** Provides the infrastructure for creating and running AI agents.
4. **Execution Engine:** Orchestrates the execution of prompts and manages the flow of data.
5. **Caching System:** Optimizes performance and reduces costs through intelligent result caching.
6. **Logging and Analytics:** Captures detailed execution data for monitoring and improvement.

### 2.3 High-Level Architecture Diagram

```
┌───────────────────────────────────────────────────────────┐
│                      Application Layer                     │
├───────────────────────────────────────────────────────────┤
│ ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐│
│ │  Agent 1  │  │  Agent 2  │  │  Agent 3  │  │ Other App ││
│ │           │  │           │  │           │  │ Integration││
│ └───────────┘  └───────────┘  └───────────┘  └───────────┘│
└───────────────────────────────────────────────────────────┘
                          ▲
                          │
┌─────────────────────────▼───────────────────────────────┐
│                   Agent Framework                        │
├───────────────────────────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐  │
│ │Hierarchical│ │ Prompt    │ │ Context   │ │ Agent     │  │
│ │Agent System│ │ Chaining  │ │Management │ │Composition│  │
│ └───────────┘ └───────────┘ └───────────┘ └───────────┘  │
└───────────────────────────────────────────────────────────┘
                          ▲
                          │
┌─────────────────────────▼───────────────────────────────┐
│                Execution Engine                          │
├───────────────────────────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐  │
│ │Prompt     │ │Model      │ │Parallel   │ │Result     │  │
│ │Execution  │ │Selection  │ │Processing │ │Selection  │  │
│ └───────────┘ └───────────┘ └───────────┘ └───────────┘  │
└───────────────────────────────────────────────────────────┘
          ▲                  ▲                   ▲
          │                  │                   │
┌─────────▼──────┐  ┌────────▼───────┐  ┌───────▼───────┐
│Prompt Management│  │Model Management│  │Cache Management│
├─────────────────┤  ├────────────────┤  ├────────────────┤
│┌─────────────┐  │  │┌─────────────┐ │  │┌─────────────┐ │
││Prompt       │  │  ││Model        │ │  ││Cache        │ │
││Repository   │  │  ││Registry     │ │  ││Strategy     │ │
│└─────────────┘  │  │└─────────────┘ │  │└─────────────┘ │
│┌─────────────┐  │  │┌─────────────┐ │  │┌─────────────┐ │
││Prompt       │  │  ││Vendor       │ │  ││Embedding    │ │
││Validation   │  │  ││Integration  │ │  ││Generation   │ │
│└─────────────┘  │  │└─────────────┘ │  │└─────────────┘ │
└─────────────────┘  └────────────────┘  └────────────────┘
          ▲                  ▲                   ▲
          │                  │                   │
┌─────────▼──────────────────▼───────────────────▼────────┐
│                      Data Layer                          │
├───────────────────────────────────────────────────────────┤
│┌───────────┐┌────────┐┌────────────┐┌────────┐┌─────────┐│
││AI Models  ││Vendors ││AI Prompts  ││Agents  ││Execution ││
││& Types    ││        ││            ││        ││Logs      ││
│└───────────┘└────────┘└────────────┘└────────┘└─────────┘│
└───────────────────────────────────────────────────────────┘
```

---

## 3. Data Models

The framework's data model is organized into several interconnected schemas that provide a rich metadata layer for configuration and execution:

### 3.1 Model and Vendor Management

#### 3.1.1 AIModelType

Defines the types of AI models available in the system.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(50) | Name of the model type (e.g., "LLM", "Image Generation") |
| Description | nvarchar(max) | Detailed description of the model type |

#### 3.1.2 AIModel

Represents a specific AI model (e.g., GPT-4, Claude 3.5 Sonnet).

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(50) | Model name (e.g., "GPT-4") |
| Description | nvarchar(max) | Detailed description of the model |
| AIModelTypeID | uniqueidentifier | References the model type |
| PowerRank | int | Relative capability ranking |
| SpeedRank | int | Relative speed ranking |
| CostRank | int | Relative cost ranking |
| IsActive | bit | Whether the model is available for use |
| ModelSelectionInsights | nvarchar(max) | Guidance for model selection |

#### 3.1.3 AIVendorTypeDefinition

Defines the types of vendors in the system.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(50) | Type name (e.g., "Model Developer", "Inference Provider") - unique |
| Description | nvarchar(max) | Detailed description of the vendor type |

#### 3.1.4 AIVendor

Represents an AI provider (e.g., OpenAI, Anthropic).

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(50) | Vendor name (e.g., "OpenAI") - unique |
| Description | nvarchar(max) | Detailed description of the vendor |

#### 3.1.5 AIVendorType

Associates vendors with their types and establishes priorities.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| VendorID | uniqueidentifier | References the vendor |
| TypeID | uniqueidentifier | References the vendor type |
| Rank | int | Priority ranking within this type |
| Status | nvarchar(20) | Status of this vendor-type association |

**Unique Constraints:** VendorID + TypeID

#### 3.1.6 AIModelVendor

Links models with vendors and includes implementation details.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| ModelID | uniqueidentifier | References the AI model |
| VendorID | uniqueidentifier | References the vendor |
| Priority | int | Priority ranking for this model-vendor combination |
| Status | nvarchar(20) | Status of this model-vendor combination |
| DriverClass | nvarchar(100) | Implementation class name |
| DriverImportPath | nvarchar(255) | Path to import the driver |
| APIName | nvarchar(100) | API-specific model identifier |
| MaxInputTokens | int | Maximum input token limit |
| MaxOutputTokens | int | Maximum output token limit |
| SupportedResponseFormats | nvarchar(100) | Formats the model can output |
| SupportsEffortLevel | bit | Whether effort level can be specified |
| SupportsStreaming | bit | Whether streaming responses are supported |
| TypeID | uniqueidentifier | References vendor type definition |

**Unique Constraints:** ModelID + VendorID + TypeID

### 3.2 Configuration Management

#### 3.2.1 AIConfiguration

Stores configurations for AI operations.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(100) | Configuration name - unique |
| Description | nvarchar(max) | Detailed description |
| IsDefault | bit | Whether this is the default configuration |
| Status | nvarchar(20) | Status of this configuration |
| DefaultPromptForContextCompressionID | uniqueidentifier | Default prompt for context compression |
| DefaultPromptForContextSummarizationID | uniqueidentifier | Default prompt for context summarization |

#### 3.2.2 AIConfigurationParam

Stores parameter values for configurations.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| ConfigurationID | uniqueidentifier | References the configuration |
| Name | nvarchar(100) | Parameter name |
| Type | nvarchar(20) | Parameter data type |
| Value | nvarchar(max) | Parameter value |
| Description | nvarchar(max) | Detailed description |

**Unique Constraints:** ConfigurationID + Name

### 3.3 Prompt Management

#### 3.3.1 AIPromptType

Defines types/categories of AI prompts.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(255) | Type name |
| Description | nvarchar(max) | Detailed description |

#### 3.3.2 AIPromptCategory

Hierarchical categorization of AI prompts.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(255) | Category name |
| ParentID | uniqueidentifier | References parent category (self-referencing) |
| Description | nvarchar(max) | Detailed description |

#### 3.3.3 AIPrompt

Defines prompts used by agents with advanced configuration options.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(255) | Prompt name |
| Description | nvarchar(max) | Detailed description |
| TemplateID | uniqueidentifier | References the template containing prompt text |
| CategoryID | uniqueidentifier | References the prompt category |
| TypeID | uniqueidentifier | References the prompt type |
| Status | nvarchar(50) | Status of the prompt |
| ResponseFormat | nvarchar(20) | Expected response format |
| ModelSpecificResponseFormat | nvarchar(max) | Model-specific format details |
| AIModelTypeID | uniqueidentifier | References the model type |
| MinPowerRank | int | Minimum power rank required |
| SelectionStrategy | nvarchar(20) | How models are selected |
| PowerPreference | nvarchar(20) | When using ByPower, which power level to prefer |
| ParallelizationMode | nvarchar(20) | How parallelization is handled |
| ParallelCount | int | Number of parallel executions |
| ParallelConfigParam | nvarchar(100) | Config parameter for parallel count |
| OutputType | nvarchar(50) | Expected output type |
| OutputExample | nvarchar(max) | Example of expected output |
| ValidationBehavior | nvarchar(50) | How validation failures are handled |
| MaxRetries | int | Maximum retry attempts |
| RetryDelayMS | int | Delay between retries |
| RetryStrategy | nvarchar(20) | Strategy for retry delays |
| ResultSelectorPromptID | uniqueidentifier | References a prompt that selects the best result |
| EnableCaching | bit | Whether to cache results |
| CacheTTLSeconds | int | Time-to-live for cached results |
| CacheMatchType | nvarchar(20) | How cache matches are determined |
| CacheSimilarityThreshold | float | Threshold for vector similarity |
| CacheMustMatchModel | bit | Whether model must match for cache hit |
| CacheMustMatchVendor | bit | Whether vendor must match for cache hit |
| CacheMustMatchAgent | bit | Whether agent must match for cache hit |
| CacheMustMatchConfig | bit | Whether config must match for cache hit |
| PromptRole | nvarchar(20) | Role of the prompt (System, User, Assistant, SystemOrUser) |
| PromptPosition | nvarchar(20) | Position of the prompt in conversation |

#### 3.3.4 AIPromptModel

Associates prompts with specific models and configurations.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| PromptID | uniqueidentifier | References the prompt |
| ModelID | uniqueidentifier | References the model |
| VendorID | uniqueidentifier | References the vendor |
| ConfigurationID | uniqueidentifier | References the configuration |
| Priority | int | Priority ranking |
| ExecutionGroup | int | Group for parallel execution |
| ModelParameters | nvarchar(max) | JSON-formatted model-specific parameters |
| Status | nvarchar(20) | Status of this prompt-model association |
| ParallelizationMode | nvarchar(20) | How this specific model handles parallelization |
| ParallelCount | int | Number of parallel executions for this model |
| ParallelConfigParam | nvarchar(100) | Config parameter for parallel count |

**Unique Constraints:** PromptID + ModelID + VendorID + ConfigurationID

### 3.4 Agent Framework

#### 3.4.1 AIAgentType

Defines types of AI agents with their system prompts and behavioral characteristics.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(100) | Type name (e.g., "Base Agent", "CustomerSupport", "DataAnalysis") |
| Description | nvarchar(max) | Detailed description of the agent type |
| SystemPromptID | uniqueidentifier | References the AI Prompt that contains system-level instructions |
| IsActive | bit | Whether this agent type is available for use |

#### 3.4.2 AIAgent

Defines AI agents in the system with hierarchical structure and type classification.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(255) | Agent name |
| Description | nvarchar(max) | Detailed description |
| LogoURL | nvarchar(255) | URL to agent logo/avatar |
| TypeID | uniqueidentifier | References AIAgentType that defines category and system-level behavior |
| ParentID | uniqueidentifier | References parent agent (self-referencing) |
| ExposeAsAction | bit | Whether to expose as an action |
| ExecutionOrder | int | Order among siblings |
| ExecutionMode | nvarchar(20) | How child agents are executed |
| EnableContextCompression | bit | Whether to compress context |
| ContextCompressionMessageThreshold | int | Number of messages that triggers compression |
| ContextCompressionPromptID | uniqueidentifier | Prompt used for compression |
| ContextCompressionMessageRetentionCount | int | Messages to keep uncompressed |

#### 3.4.3 AIAgentRun

Tracks individual execution runs of AI agents with comprehensive state management.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentID | uniqueidentifier | References the AIAgent being executed |
| ParentRunID | uniqueidentifier | References parent agent run (self-referencing for hierarchical execution) |
| Status | nvarchar(50) | Current status: Running, Completed, Paused, Failed, Cancelled |
| StartedAt | datetimeoffset(7) | When the agent run began execution |
| CompletedAt | datetimeoffset(7) | When the agent run completed (NULL while running) |
| Success | bit | Whether the execution was successful (NULL while running) |
| ErrorMessage | nvarchar(max) | Error message if the run failed |
| ConversationID | uniqueidentifier | Links to conversation or user session |
| UserID | uniqueidentifier | User context for authentication and permissions |
| Result | nvarchar(max) | Final result or output from the agent execution |
| AgentState | nvarchar(max) | JSON serialization of complete agent state for pause/resume |
| TotalTokensUsed | int | Total tokens consumed by all LLM calls |
| TotalCost | decimal(18,6) | Total estimated cost for all AI model usage |

#### 3.4.4 AIAgentRunStep

Provides step-by-step tracking of agent execution for debugging and monitoring.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentRunID | uniqueidentifier | References the parent AIAgentRun |
| StepNumber | int | Sequential step number within the run (starting from 1) |
| StepType | nvarchar(50) | Type of step: prompt, action, subagent, decision |
| StepName | nvarchar(255) | Human-readable name of what this step accomplishes |
| TargetID | uniqueidentifier | ID of the target being executed (prompt, action, agent, etc.) |
| Status | nvarchar(50) | Current execution status: Running, Completed, Failed, Cancelled |
| StartedAt | datetimeoffset(7) | When this step began execution |
| CompletedAt | datetimeoffset(7) | When this step completed (NULL while running) |
| Success | bit | Whether this step completed successfully (NULL while running) |
| ErrorMessage | nvarchar(max) | Error message if this step failed |
| InputData | nvarchar(max) | JSON serialization of input data for this step |
| OutputData | nvarchar(max) | JSON serialization of output data from this step |

#### 3.4.5 AIAgentPrompt

Associates prompts with agents.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentID | uniqueidentifier | References the agent |
| PromptID | uniqueidentifier | References the prompt |
| Purpose | nvarchar(max) | Functional purpose |
| ExecutionOrder | int | Sequence within workflow |
| ConfigurationID | uniqueidentifier | References the configuration |
| Status | nvarchar(20) | Status of this agent-prompt mapping |
| ContextBehavior | nvarchar(50) | How conversation context is filtered |
| ContextMessageCount | int | Number of messages to include |

**Unique Constraints:** AgentID + PromptID + ConfigurationID

#### 3.4.6 AIAgentModel

Associates agents with specific AI models.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentID | uniqueidentifier | References the agent |
| ModelID | uniqueidentifier | References the model |
| Active | bit | Whether this model association is active |
| Priority | int | Priority ranking for model selection |

#### 3.4.7 AIAgentAction

Links AI agents to actions they can perform.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentID | uniqueidentifier | References the agent |
| ActionID | uniqueidentifier | References the action |
| Status | nvarchar(15) | Status of this agent-action association |

#### 3.4.8 AIAgentRequest

Tracks requests made to AI agents.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentID | uniqueidentifier | References the agent |
| RequestedAt | datetime | When the request was made |
| RequestForUserID | uniqueidentifier | User who made the request |
| Status | nvarchar(20) | Status of the request |
| Request | nvarchar(max) | The actual request text |
| Response | nvarchar(max) | The agent's response |
| ResponseByUserID | uniqueidentifier | User who provided the response |
| RespondedAt | datetime | When the response was provided |
| Comments | nvarchar(max) | Additional comments |

#### 3.4.9 AIAgentLearningCycle

Tracks learning cycles for AI agents.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentID | uniqueidentifier | References the agent |
| StartedAt | datetimeoffset(7) | When the learning cycle started |
| EndedAt | datetimeoffset(7) | When the learning cycle ended |
| Status | nvarchar(20) | Status of the learning cycle |
| AgentSummary | nvarchar(max) | Summary of what the agent learned |

#### 3.4.10 AIAgentNote

Notes and annotations for AI agents.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentID | uniqueidentifier | References the agent |
| AgentNoteTypeID | uniqueidentifier | References the note type |
| Note | nvarchar(max) | The note content |
| Type | nvarchar(20) | Type of note |
| UserID | uniqueidentifier | User who created the note |

#### 3.4.11 AIAgentNoteType

Categorizes different types of agent notes.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(255) | Note type name |
| Description | nvarchar(max) | Detailed description |

### 3.5 Execution and Caching

#### 3.5.1 AIPromptRun

Tracks the execution of prompts with comprehensive metrics and agent integration.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| PromptID | uniqueidentifier | References the prompt |
| ModelID | uniqueidentifier | References the model |
| VendorID | uniqueidentifier | References the vendor |
| AgentID | uniqueidentifier | References the agent (if any) |
| AgentRunID | uniqueidentifier | References the AIAgentRun that initiated this prompt execution |
| ConfigurationID | uniqueidentifier | References the configuration |
| RunAt | datetime2(7) | Execution start time |
| CompletedAt | datetime2(7) | Execution end time |
| ExecutionTimeMS | int | Total execution time |
| Messages | nvarchar(max) | Input messages |
| Result | nvarchar(max) | Output result |
| TokensUsed | int | Total tokens used |
| TokensPrompt | int | Prompt tokens |
| TokensCompletion | int | Completion tokens |
| TotalCost | decimal(18,6) | Estimated cost |
| Success | bit | Whether execution succeeded |
| ErrorMessage | nvarchar(max) | Error message if failed |
| ParentID | uniqueidentifier | References parent run (self-referencing) |
| RunType | nvarchar(20) | Type of run (single, parallel, etc.) |
| ExecutionOrder | int | Order within a batch execution |

#### 3.5.2 AIResultCache

Caches results for reuse with vector similarity matching.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AIPromptID | uniqueidentifier | References the prompt |
| AIModelID | uniqueidentifier | References the model |
| VendorID | uniqueidentifier | References the vendor |
| AgentID | uniqueidentifier | References the agent |
| ConfigurationID | uniqueidentifier | References the configuration |
| RunAt | datetimeoffset(7) | When the result was generated |
| PromptText | nvarchar(max) | The exact prompt used |
| ResultText | nvarchar(max) | The cached result |
| Status | nvarchar(50) | Status of the cache entry |
| ExpiredOn | datetimeoffset(7) | When the entry expired |
| PromptEmbedding | varbinary(max) | Vector representation of prompt |
| PromptRunID | uniqueidentifier | References the execution that created this cache |

### 3.6 Data Context Enhancements

#### 3.6.1 DataContextItem (Enhanced)

The DataContextItem table has been enhanced with programmatic naming for improved code generation.

| Field | Type | Description |
|-------|------|-------------|
| ... | ... | (Existing fields remain unchanged) |
| CodeName | nvarchar(255) | Optional programmatic identifier following JavaScript naming conventions |

**Unique Constraints:** DataContextID + CodeName

### 3.7 Model Actions and Capabilities

#### 3.7.1 AIModelAction

Links AI models to actions they support.

| Field | Type | Description |
|-------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AIModelID | uniqueidentifier | References the AI model |
| AIActionID | uniqueidentifier | References the AI action |
| IsActive | bit | Whether this model-action link is active |

---

## 4. Key Workflows

### 4.1 Agent Execution Workflow (Enhanced)

The agent execution workflow has been significantly enhanced with decision-driven architecture and comprehensive tracking:

1. **Agent Initialization**:
   - Create AIAgentRun entry with Running status
   - Load agent configuration, type, and associated prompts
   - Initialize execution context with conversation history and parameters
   - Set up progress tracking and cancellation support

2. **Decision-Driven Execution Loop**:
   - **Context Analysis**: Agent analyzes current conversation and available resources
   - **Decision Making**: LLM-powered decision making determines next actions
   - **Action Execution**: Execute decided actions (prompts, subagents, or tools) with proper ordering
   - **Result Integration**: Incorporate results into conversation context
   - **Completion Check**: Determine if task is complete or continue iteration

3. **Step Tracking**:
   - Create AIAgentRunStep entries for each discrete action
   - Track execution order, timing, and success/failure status
   - Store input/output data for debugging and analytics
   - Handle parallel and sequential execution strategies

4. **State Management**:
   - Support for pause/resume through AgentState serialization
   - Context compression for long conversations
   - Hierarchical execution with parent-child run relationships
   - Resource tracking (tokens, cost, timing)

5. **Completion and Cleanup**:
   - Update AIAgentRun with final status and results
   - Aggregate metrics from all execution steps
   - Return comprehensive execution results

### 4.2 Prompt Execution Workflow

1. **Initialization**:
   - Client requests prompt execution with parameters
   - System resolves the prompt by ID or name
   - Execution context is created with parameters, configuration, and agent context (if any)

2. **Model Selection**:
   - Based on the prompt's SelectionStrategy:
     - Default: Use system default model
     - Specific: Use models specified in AIPromptModel
     - ByPower: Select based on PowerRank and PowerPreference

3. **Parallelization Decision**:
   - Based on the prompt's ParallelizationMode:
     - None: Execute once
     - StaticCount: Execute ParallelCount times
     - ConfigParam: Get count from configuration parameter
     - ModelSpecific: Use settings from AIPromptModel entries

4. **Cache Check** (if EnableCaching=true):
   - Generate cache key based on:
     - Prompt text and parameters
     - Model, vendor, agent, configuration (based on CacheMustMatch* settings)
   - If CacheMatchType=Exact:
     - Search for exact match in AIResultCache
   - If CacheMatchType=Vector:
     - Generate embedding for prompt
     - Find cached entries with similarity > CacheSimilarityThreshold
   - If valid cache entry found, return cached result

5. **Execution**:
   - Create AIPromptRun entry for logging
   - Format template with parameters
   - Send to model via appropriate vendor implementation
   - Record metrics (tokens, cost, timing)
   - Update AIPromptRun with results

6. **Validation** (if OutputType is specified):
   - Validate result against expected format
   - If ValidationBehavior=Strict and validation fails:
     - Retry if MaxRetries > 0
     - Otherwise, fail with validation error
   - If ValidationBehavior=Warn and validation fails:
     - Log warning but continue

7. **Result Selection** (if multiple executions):
   - If ResultSelectorPromptID is specified:
     - Execute selector prompt with all results as input
     - Return selected result
   - Otherwise, return all results to client

8. **Caching** (if EnableCaching=true):
   - Create or update AIResultCache entry with result
   - Set expiration based on CacheTTLSeconds
   - Store embedding if CacheMatchType=Vector

### 4.3 Hierarchical Agent Orchestration

1. **Agent Type Resolution**:
   - Load AIAgentType to determine system-level behavior
   - Apply type-specific system prompts and configurations
   - Initialize agent with type-appropriate capabilities

2. **Child Agent Coordination**:
   - Based on ExecutionMode:
     - Sequential: Execute child agents in ExecutionOrder sequence
     - Parallel: Execute child agents concurrently
   - For each child agent:
     - Create child AIAgentRun with ParentRunID reference
     - Pass appropriate context subset
     - Execute using recursive agent workflow
     - Track execution in AIAgentRunStep entries

3. **Context Management**:
   - If EnableContextCompression=true and message count exceeds threshold:
     - Retain ContextCompressionMessageRetentionCount recent messages
     - Use ContextCompressionPromptID to compress older messages
     - Replace compressed messages with summary

4. **Result Aggregation**:
   - Combine results from all executed prompts and child agents
   - Update parent AIAgentRun with aggregated metrics
   - Return comprehensive results to client or parent agent

### 4.4 Configuration and Deployment

1. **Agent Type Configuration**:
   - Create AIAgentType entries for different categories of agents
   - Define system prompts that provide base behavior for each type
   - Set up type-specific capabilities and constraints

2. **Agent Configuration**:
   - Create AIAgent entries with TypeID references
   - Define agent structure (parent-child relationships)
   - Associate prompts with agents (AIAgentPrompt entries)
   - Configure execution parameters (order, mode, etc.)

2. **Prompt Configuration**:
   - Create prompt templates
   - Define model selection strategy
   - Configure parallelization settings
   - Set up caching parameters
   - Define validation requirements

3. **Model Integration**:
   - Register AI models in AIModel table
   - Link models with vendors in AIModelVendor
   - Set priorities and implementation details
   - Configure driver classes and paths

4. **System Configuration**:
   - Create configurations in AIConfiguration
   - Define parameters in AIConfigurationParam
   - Set up default configurations

---

## 5. Advanced Features

### 5.1 Decision-Driven Agent Architecture

The framework now implements an advanced decision-driven architecture where agents use LLM-powered reasoning to determine their next actions:

1. **Dynamic Action Selection**:
   - Agents analyze current context and available resources
   - LLM makes strategic decisions about which actions to take
   - Support for mixed execution of prompts, tools, and subagents

2. **Execution Planning**:
   - Agents create execution plans with proper ordering
   - Support for parallel and sequential execution strategies
   - Dynamic adaptation based on results and context

3. **Comprehensive Resource Awareness**:
   - Agents have full visibility into available actions and subagents
   - Metadata-driven capability discovery
   - Intelligent resource selection based on context

### 5.2 Enhanced Factory Pattern

The framework includes an improved factory pattern for agent instantiation:

1. **Global Agent Factory**:
   - `GetAgentFactory()` function provides consistent access
   - Support for factory subclassing and customization
   - Integration with MemberJunction ClassFactory system

2. **Extensible Agent Types**:
   - Agent types can be subclassed and registered
   - Custom agents inherit full framework capabilities
   - Seamless integration with existing metadata system

### 5.3 Comprehensive Execution Tracking

The new tracking system provides detailed insights into agent execution:

1. **Run-Level Tracking**:
   - AIAgentRun entries track complete agent executions
   - Support for pause/resume through state serialization
   - Hierarchical tracking for parent-child relationships

2. **Step-Level Granularity**:
   - AIAgentRunStep entries track individual actions
   - Input/output data capture for debugging
   - Timing and success metrics for performance analysis

### 5.4 Action vs Tool Terminology

The framework has been updated to use consistent "actions" terminology:

1. **Unified Terminology**:
   - "Actions" replace "tools" throughout the system
   - Consistent naming in interfaces and documentation
   - Improved clarity for developers and users

2. **Backward Compatibility**:
   - Existing functionality remains unchanged
   - Only terminology has been updated for consistency

### 5.5 Context Compression

### 5.6 Vectorized Cache Matching

Long conversations with agents can accumulate many messages, leading to increased token usage and potential context window limitations. The framework addresses this with automatic context compression:

1. **Threshold-Based Activation**:
   - Agent defines ContextCompressionMessageThreshold
   - When conversation exceeds threshold, compression is triggered

2. **Compression Process**:
   - Recent messages (ContextCompressionMessageRetentionCount) are preserved
   - Older messages are passed to compression prompt
   - Compression prompt generates a summary
   - Summary replaces original messages

3. **Retention Strategy**:
   - System preserves key information needed for continuity
   - Special messages (e.g., system instructions) are exempt from compression

### 5.7 Parallel Model Execution

Traditional exact-match caching fails when prompts vary slightly but semantically represent the same query. The framework's vector-based cache matching addresses this:

1. **Embedding Generation**:
   - When caching a result, generate vector embedding of the prompt
   - Store embedding alongside the result in AIResultCache

2. **Similarity Matching**:
   - For new executions, generate embedding of current prompt
   - Calculate similarity with stored embeddings
   - Return cached result if similarity > CacheSimilarityThreshold

3. **Configurable Parameters**:
   - CacheMatchType determines whether to use exact or vector matching
   - CacheSimilarityThreshold controls strictness of matching
   - CacheMustMatch* fields control which attributes must match

### 5.8 Structured Output Validation

The framework supports executing prompts across multiple models in parallel to leverage the strengths of different AI models:

1. **Execution Strategies**:
   - Single model, multiple runs (for generating alternatives)
   - Multiple models, single run each (for comparing models)
   - Multiple models, multiple runs (for maximum variety)

2. **Configuration Options**:
   - Prompt-level ParallelizationMode and ParallelCount
   - Model-specific ParallelizationMode and ParallelCount
   - Configuration-driven counts via parameters

3. **Result Handling**:
   - ResultSelectorPromptID specifies a prompt that selects the best result
   - Selection can be based on quality, correctness, or custom criteria


To ensure AI outputs meet application requirements, the framework includes robust validation:

1. **Output Typing**:
   - OutputType specifies expected type (string, number, boolean, date, object)
   - For 'object' type, OutputExample provides a sample structure

2. **Validation Process**:
   - System parses AI response according to OutputType
   - For objects, validates structure against OutputExample
   - Handles validation based on ValidationBehavior setting

3. **Validation Behaviors**:
   - Strict: Fail on validation errors
   - Warn: Log warning but accept result
   - None: Skip validation

4. **Retry Logic**:
   - MaxRetries specifies number of attempts on failure
   - RetryStrategy determines backoff pattern
   - RetryDelayMS controls delay between attempts

---

## 6. Implementation Considerations

### 6.1 Technology Stack

The MemberJunction Agentic AI Framework is built with:

1. **Backend**:
   - TypeScript/Node.js for server-side logic
   - SQL Server for data storage
   - GraphQL for API interface

2. **Framework Integrations**:
   - OpenAI, Anthropic, Microsoft, and other AI provider SDKs
   - Vector database capabilities for embedding storage
   - Templating engines (Nunjucks) for prompt management

3. **Frontend Integration**:
   - Angular components for management UI
   - React components for embeddable experiences

### 6.2 Security Considerations

1. **Authentication and Authorization**:
   - All agent interactions require authentication
   - Fine-grained permission model for agent access
   - API key management for vendor integrations

2. **Data Privacy**:
   - Configurable content filtering and PII detection
   - Option to disable logging of sensitive content
   - Role-based access to execution logs

3. **AI Safety**:
   - Prompt template validation to prevent injection attacks
   - Rate limiting to prevent abuse
   - Output filtering for sensitive content

### 6.3 Performance Optimization

1. **Caching Strategy**:
   - Multi-level caching (memory, database)
   - Vector-based similarity matching for semantic cache hits
   - Configurable TTL and invalidation rules

2. **Scaling Considerations**:
   - Horizontal scaling of execution engine
   - Load balancing across vendor endpoints
   - Asynchronous processing for non-blocking operations

3. **Resource Management**:
   - Token usage tracking and budgeting
   - Adaptive model selection based on requirements
   - Cost optimization through caching and model selection

### 6.4 Extensibility

1. **Custom Model Integration**:
   - Driver interface for adding new AI models
   - Abstract provider pattern for vendor implementations
   - Configuration-driven model selection

2. **Custom Agent Development**:
   - Agent inheritance for specialized behavior
   - Extension points for pre/post processing
   - Event system for workflow customization

3. **Integration APIs**:
   - REST/GraphQL APIs for external integration
   - Webhook support for event-driven architecture
   - Streaming interfaces for real-time applications

---

## 7. Agent Development Guidelines

### 7.1 Agent Design Principles

1. **Single Responsibility**:
   - Agents should have a clear, focused purpose
   - Use composition for complex behaviors

2. **Hierarchical Structure**:
   - Design agents in a hierarchical manner
   - Parent agents coordinate, child agents specialize

3. **Context Management**:
   - Be mindful of context window limitations
   - Use compression when appropriate
   - Structure prompts to minimize token usage

4. **Error Handling**:
   - Always implement graceful fallbacks
   - Use retry logic for transient failures
   - Provide meaningful error messages

### 7.2 Prompt Engineering Best Practices

1. **Template Design**:
   - Use clear, concise language
   - Include explicit instructions
   - Provide examples for complex tasks

2. **Parameter Management**:
   - Define typed parameters
   - Include validation rules
   - Provide default values when appropriate

3. **Output Validation**:
   - Always specify expected output format
   - Provide detailed examples
   - Use structured validation for critical paths

4. **Performance Considerations**:
   - Minimize token usage
   - Enable caching when appropriate
   - Use parallelization judiciously

### 7.3 Testing and Validation

1. **Prompt Testing**:
   - Test with a variety of inputs
   - Validate outputs against expected formats
   - Measure token usage and performance

2. **Agent Testing**:
   - Test individual prompt integrations
   - Test hierarchical agent interactions
   - Validate end-to-end workflows

3. **Integration Testing**:
   - Test with actual AI models
   - Validate caching behavior
   - Test error scenarios and recovery

4. **Performance Testing**:
   - Measure response times
   - Evaluate token efficiency
   - Test under load conditions

---

## 8. Future Directions

### 8.1 Planned Enhancements

1. **Advanced Prompt Chaining**:
   - Conditional branching based on results
   - Dynamic prompt selection
   - Loop constructs for iterative refinement

2. **Learning and Adaptation**:
   - Feedback mechanisms for prompt improvement
   - A/B testing of prompt variations
   - Automated optimization based on results

3. **Multi-modal Support**:
   - Integration with image generation models
   - Voice and audio processing
   - Document processing capabilities

4. **Enhanced Developer Tools**:
   - Visual prompt builder
   - Agent composition interface
   - Debugging and monitoring dashboard

### 8.2 Research Areas

1. **Automated Reasoning**:
   - Chain-of-thought prompting techniques
   - Logical reasoning frameworks
   - Multi-agent collaborative reasoning

2. **Memory Management**:
   - Long-term memory systems
   - Hierarchical memory structures
   - Retrieval-augmented generation (RAG)

3. **Agent Autonomy**:
   - Self-improvement mechanisms
   - Autonomous task decomposition
   - Dynamic resource allocation

---

## 9. Conclusion

The MemberJunction Agentic AI Framework provides a comprehensive foundation for building sophisticated AI agents. By abstracting common functionality and providing a metadata-driven configuration approach, it enables rapid development of AI applications without sacrificing flexibility or control.

Key advantages include:

1. **Reduced Development Time**: Common AI agent patterns are already implemented.
2. **Operational Transparency**: Comprehensive logging and analytics.
3. **Cost Optimization**: Intelligent caching and model selection.
4. **Extensibility**: Modular design allows for easy customization.
5. **Future-Proofing**: Abstract interfaces that can adapt to new AI models.

As the framework continues to evolve, it will incorporate new advances in AI technology and agent architecture, ensuring that MemberJunction remains at the forefront of agentic AI development.

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Agent | An autonomous software entity that uses AI to perform tasks. |
| Prompt | A template-based instruction that guides AI model behavior. |
| Model | An AI model capable of generating text, images, or other outputs. |
| Vendor | A provider of AI infrastructure and models. |
| Configuration | A named set of parameters that control system behavior. |
| Cache | Storage of previous results to avoid redundant API calls. |
| Embedding | A vector representation of text for semantic similarity comparison. |
| Context Window | The maximum amount of text an AI model can process at once. |
| Token | The basic unit of text processing for AI models. |
| Parallelization | Running multiple prompt executions simultaneously. |

---

## Appendix B: Schema Relationship Diagram

```
AIModelType <──┐
               │
               ├── AIModel ───┐
               │              │
AIVendorTypeDefinition        │
               │              │
               ├── AIVendor ──┤
               │              │
               │              ├── AIModelVendor
               │              │
AIConfiguration ─────────────┐│
       │                     ││
       └── AIConfigurationParam
                             ││
AIPrompt ──────────────────┐ ││
    │                      │ ││
    │                      ├─┘│
    │                      │  │
    └── AIPromptModel ─────┘  │
    │                         │
    │                         │
AIAgent ───────────────┐      │
    │                  │      │
    └── AIAgentPrompt ─┘      │
    │                         │
    │                         │
    ├── AIPromptRun ──────────┘
    │
    └── AIResultCache
```

---

## Appendix C: Key Database Queries

### C.1 Resolving Available Models for a Prompt

```sql
SELECT m.ID, m.Name, mv.VendorID, v.Name AS VendorName, 
       mv.Priority, mv.DriverClass, mv.DriverImportPath
FROM __mj.AIPrompt p
JOIN __mj.AIModel m ON m.AIModelTypeID = p.AIModelTypeID
JOIN __mj.AIModelVendor mv ON mv.ModelID = m.ID
JOIN __mj.AIVendor v ON v.ID = mv.VendorID
WHERE p.ID = @promptId
  AND m.PowerRank >= p.MinPowerRank
  AND m.IsActive = 1
  AND mv.Status = 'Active'
ORDER BY 
  CASE WHEN p.SelectionStrategy = 'ByPower' AND p.PowerPreference = 'Highest' THEN m.PowerRank END DESC,
  CASE WHEN p.SelectionStrategy = 'ByPower' AND p.PowerPreference = 'Lowest' THEN m.PowerRank END ASC,
  CASE WHEN p.SelectionStrategy = 'Specific' THEN mv.Priority END DESC,
  CASE WHEN p.SelectionStrategy = 'Default' THEN mv.Priority END DESC;
```

### C.2 Finding a Cached Result with Vector Similarity

```sql
SELECT TOP 1 c.ID, c.ResultText, c.RunAt, c.ExpiredOn
FROM __mj.AIResultCache c
WHERE c.AIPromptID = @promptId
  AND c.Status = 'Active'
  AND (@matchModel = 0 OR c.AIModelID = @modelId)
  AND (@matchVendor = 0 OR c.VendorID = @vendorId)
  AND (@matchAgent = 0 OR (@agentId IS NULL AND c.AgentID IS NULL) OR c.AgentID = @agentId)
  AND (@matchConfig = 0 OR (@configId IS NULL AND c.ConfigurationID IS NULL) OR c.ConfigurationID = @configId)
  AND (c.ExpiredOn IS NULL OR c.ExpiredOn > GETUTCDATE())
ORDER BY 
  CASE WHEN @matchType = 'Exact' AND c.PromptText = @promptText THEN 1
       WHEN @matchType = 'Vector' THEN 
         dbo.VectorSimilarity(c.PromptEmbedding, @promptEmbedding)
       ELSE 0
  END DESC;
```

### C.3 Retrieving Agent Hierarchy

```sql
WITH AgentHierarchy AS (
    -- Root agent
    SELECT 
        a.ID, a.Name, a.ParentID, a.ExecutionOrder, a.ExecutionMode,
        0 AS Level
    FROM 
        __mj.AIAgent a
    WHERE 
        a.ID = @agentId
    
    UNION ALL
    
    -- Child agents
    SELECT 
        a.ID, a.Name, a.ParentID, a.ExecutionOrder, a.ExecutionMode,
        h.Level + 1
    FROM 
        __mj.AIAgent a
    JOIN 
        AgentHierarchy h ON a.ParentID = h.ID
)
SELECT 
    h.ID, h.Name, h.ParentID, h.Level, h.ExecutionOrder, h.ExecutionMode,
    ap.ID AS PromptAssociationID, ap.PromptID, ap.ExecutionOrder AS PromptOrder,
    p.Name AS PromptName
FROM 
    AgentHierarchy h
LEFT JOIN 
    __mj.AIAgentPrompt ap ON h.ID = ap.AgentID
LEFT JOIN 
    __mj.AIPrompt p ON ap.PromptID = p.ID
ORDER BY 
    h.Level, h.ExecutionOrder, ap.ExecutionOrder;
```

---

## Appendix D: Integration Examples

### D.1 Creating and Using Agents with the AgentFactory

```typescript
// Get the global agent factory instance
const factory = GetAgentFactory();

// Create a new agent from an existing agent entity in the database
async function createAgentFromEntity(agentId: string, user: UserInfo): Promise<BaseAgent> {
  const agent = await factory.CreateAgentFromEntity(agentId, user);
  return agent;
}

// Create a custom agent by extending BaseAgent
class CustomerSupportAgent extends BaseAgent {
  constructor(entity: AIAgentEntity, contextUser: UserInfo) {
    super(entity, contextUser);
  }

  protected async processDecision(decision: any, context: AgentContext): Promise<AgentResult> {
    // Custom logic for customer support specific processing
    if (decision.decision === 'escalate_to_human') {
      return await this.escalateToHuman(context);
    }
    
    // Delegate to parent for standard processing
    return await super.processDecision(decision, context);
  }

  private async escalateToHuman(context: AgentContext): Promise<AgentResult> {
    // Custom escalation logic
    return {
      success: true,
      result: 'Escalated to human support',
      metadata: {
        escalated: true,
        timestamp: new Date()
      }
    };
  }
}

// Register the custom agent type with the factory
factory.RegisterAgentClass('CustomerSupport', CustomerSupportAgent);

// Use the factory to create agents
async function useAgentFactory(user: UserInfo) {
  // Method 1: Create agent by type name
  const agent1 = await factory.CreateAgent('Base Agent', user);
  
  // Method 2: Create agent from database entity
  const agent2 = await factory.CreateAgentFromEntity('agent-uuid-here', user);
  
  // Method 3: Create custom agent type
  const agent3 = await factory.CreateAgent('CustomerSupport', user);
  
  // Execute the agent
  const result = await agent1.Execute({
    conversationMessages: [
      { role: 'user', content: 'Help me with my order status' }
    ],
    data: { orderId: '12345' }
  });
  
  return result;
}
```

### D.2 Executing an Agent with BaseAgent Framework

```typescript
async function executeAgent(agentId: string, initialContext: any, user: UserInfo): Promise<AgentResult> {
  try {
    // Get the global agent factory
    const factory = GetAgentFactory();
    
    // Create agent from entity ID
    const agent = await factory.CreateAgentFromEntity(agentId, user);
    
    // Execute the agent with context and progress tracking
    const result = await agent.Execute({
      conversationMessages: initialContext.conversation || [],
      data: initialContext.parameters || {},
      onProgress: (progress) => {
        console.log(`Step ${progress.currentStep}/${progress.totalSteps}: ${progress.message}`);
        console.log(`Progress: ${progress.percentage}%`);
      },
      onStreamingUpdate: (update) => {
        // Handle real-time updates during execution
        console.log('Streaming update:', update);
      }
    });
    
    // The agent automatically handles state tracking, metrics, and logging
    console.log(`Execution completed in ${result.metadata?.executionTimeMs}ms`);
    console.log(`Tokens used: ${result.metadata?.tokensUsed}`);
    console.log(`Cost: $${result.metadata?.cost}`);
    
    return result;
    
  } catch (error) {
    console.error('Agent execution failed:', error);
    throw error;
  }
}

// Example with cancellation support
async function executeAgentWithCancellation(agentId: string, context: any, user: UserInfo) {
  const factory = GetAgentFactory();
  const agent = await factory.CreateAgentFromEntity(agentId, user);
  
  // Create cancellation token
  const controller = new AbortController();
  
  // Set up timeout
  setTimeout(() => {
    controller.abort();
  }, 30000); // 30 second timeout
  
  try {
    const result = await agent.Execute({
      conversationMessages: context.conversation || [],
      data: context.parameters || {},
      signal: controller.signal // Pass cancellation signal
    });
    
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Agent execution was cancelled');
      // Agent state is automatically saved for potential resume
    }
    throw error;
  }
}
```

### D.3 Implementing a Custom Selector Prompt

```typescript
async function createSelectorPrompt() {
  const selectorPromptId = await promptManager.createPrompt({
    name: "Best Answer Selector",
    description: "Selects the best answer from multiple results",
    promptText: `
      You are a judge evaluating multiple responses to the same query.
      
      Original query: {{query}}
      
      Responses to evaluate:
      {{#each responses}}
      --- Response {{@index+1}} ---
      {{this}}
      {{/each}}
      
      Evaluate each response on clarity, accuracy, helpfulness, and conciseness.
      Select the best response and provide a brief explanation of why you chose it.
      
      Return your selection in this JSON format:
      {
        "selectedIndex": [index of the best response, 0-based],
        "explanation": "[your explanation]"
      }
    `,
    aiModelTypeId: AI_MODEL_TYPES.LLM,
    selectionStrategy: "Specific",  // Use a specific high-quality model
    outputType: "object",
    outputExample: {
      "selectedIndex": 0,
      "explanation": "This response was selected because..."
    },
    validationBehavior: "Strict"
  });
  
  return selectorPromptId;
}
```
