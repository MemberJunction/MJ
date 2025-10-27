# Parallel Sub-Agent Execution: Child vs. Related Agents

**Status:** Proposed
**Date:** 2025-10-15
**Author:** System Architecture Analysis

---

## Executive Summary

This plan proposes enabling **parallel execution of related sub-agents** while maintaining **sequential execution of child sub-agents**. This architectural distinction eliminates payload conflict concerns while providing significant performance improvements for workflows with independent sub-agents.

**Key Insight:** The framework already distinguishes between two types of sub-agent relationships through database schema:
1. **Child Agents** (`ParentID` set) - Share parent's payload structure
2. **Related Agents** (`AIAgentRelationship` links) - Independent payload structures

By enforcing sequential execution for child agents and enabling parallel execution for related agents, we gain performance benefits without introducing race conditions or debugging complexity.

---

## Background: Current Architecture

### Sequential Sub-Agent Execution

Currently, ALL sub-agents execute sequentially regardless of relationship type:

**Code:** [packages/AI/Agents/src/base-agent.ts:2832-3158](packages/AI/Agents/src/base-agent.ts#L2832-L3158)

```typescript
private async executeSubAgentStep<SC = any, SR = any>(
    params: ExecuteAgentParams<SC>,
    previousDecision?: BaseAgentNextStep<SR, SC>,
): Promise<BaseAgentNextStep<SR, SC>> {
    const subAgentRequest = previousDecision.subAgent; // Single object

    // Execute ONE sub-agent synchronously
    const subAgentResult = await this.ExecuteSubAgent(...);

    // Merge payload and return
    return { step: 'Retry', terminate: false, newPayload: merged };
}
```

**Execution Flow:**
```
Step 1: Execute Sub-Agent A → wait 30s
Step 2: Execute Sub-Agent B → wait 45s
Step 3: Execute Sub-Agent C → wait 25s
Total: 100s
```

### Parallel Action Execution (Existing Model)

Actions already execute in parallel successfully:

**Code:** [packages/AI/Agents/src/base-agent.ts:3172-3427](packages/AI/Agents/src/base-agent.ts#L3172-L3427)

```typescript
private async executeActionsStep(...): Promise<BaseAgentNextStep> {
    const actions: AgentAction[] = previousDecision.actions || [];

    // Execute ALL actions in parallel
    const actionPromises = actions.map(async (aa) => {
        return await this.ExecuteSingleAction(...);
    });

    const actionResults = await Promise.all(actionPromises);

    return { step: 'Retry', terminate: false, newPayload: merged };
}
```

**Why Actions Can Run in Parallel:**
- Each action operates independently
- Actions return discrete results (no shared mutable state)
- Post-processing aggregates results deterministically

---

## Problem Statement

### Performance Bottleneck

Workflows with multiple independent sub-agents suffer from sequential execution overhead:

**Example: Marketing Campaign Creation**
- Sub-Agent A: Social Media Content (20s)
- Sub-Agent B: Email Content (30s)
- Sub-Agent C: Blog Content (25s)

**Current:** 75s total (sequential)
**Potential:** 30s total (parallel) - **60% faster**

### Why Not Just Parallelize Everything?

**The Payload Conflict Problem:**

If child agents with shared payload execute in parallel:

```typescript
// RACE CONDITION - Non-deterministic result
Child Agent A: payload.campaign.budget = 10000
Child Agent B: payload.campaign.budget = 12000

// Which value wins? Depends on execution timing.
// Result: payload.campaign.budget = ??? (could be either)
```

With sequential execution, the order is deterministic:
```typescript
Step 1: Child Agent A sets budget = 10000
Step 2: Child Agent B sets budget = 12000
Result: budget = 12000 (predictable, last write wins)
```

---

## Solution: Architectural Distinction

### Two Types of Sub-Agent Relationships

The MemberJunction database schema already defines two relationship models:

#### 1. Child Agents (Parent-Child Hierarchy)

**Database:** `AIAgent.ParentID` field

```sql
-- Child agent has ParentID set
INSERT INTO [__mj].[AIAgent] (
    Name,
    ParentID,  -- ← References parent agent
    PayloadScope,
    PayloadDownstreamPaths,
    PayloadUpstreamPaths
) VALUES (
    'Social Media Optimizer',
    'parent-agent-uuid',
    'campaign.socialMedia',  -- Scoped section of parent payload
    'campaign.*,context.*',  -- What child can read
    'campaign.socialMedia.*' -- What child can write
)
```

**Characteristics:**
- **Shared Payload:** Child operates on parent's payload structure
- **Payload Scoping:** Optional restrictions via `PayloadScope`, `PayloadDownstreamPaths`, `PayloadUpstreamPaths`
- **Tight Coupling:** Child is part of parent's workflow
- **Direct Memory Access:** Like function calls with shared memory

**Use Cases:**
- Specialized processing of parent's data
- Sequential stages in a pipeline
- Operations with dependencies

**Execution Model:** ✅ **SEQUENTIAL (Keep Current Behavior)**

#### 2. Related Agents (Peer Relationships)

**Database:** `AIAgentRelationship` table

```sql
-- Related agents linked via separate relationship table
INSERT INTO [__mj].[AIAgentRelationship] (
    AgentID,           -- Parent agent
    SubAgentID,        -- Related agent (has ParentID = NULL)
    MinExecutionsPerRun,
    MaxExecutionsPerRun
) VALUES (
    'parent-agent-uuid',
    'related-agent-uuid',
    0,
    999
)

-- The related agent is independent
INSERT INTO [__mj].[AIAgent] (
    Name,
    ParentID  -- ← NULL (not a child)
) VALUES (
    'Keyword Research Agent',
    NULL
)
```

**Characteristics:**
- **Independent Payload:** Each agent has its own payload schema
- **Message Passing:** Parent sends input, receives output (like microservices)
- **Loose Coupling:** Related agents are reusable across multiple parents
- **Explicit Mapping:** Parent maps its payload → related agent input, and related agent output → parent payload

**Use Cases:**
- Independent data gathering from multiple sources
- Parallel content generation (social, email, blog)
- Multi-perspective analysis (legal, technical, brand review)
- Reusable specialist agents

**Execution Model:** ✨ **PARALLEL (New Feature)**

---

## Why This Approach Eliminates Conflicts

### Independent Payloads = Zero Conflicts

Related agents have **completely independent payload structures**:

```typescript
// Marketing Orchestrator Agent (Parent)
parentPayload = {
    campaign: {
        product: { name: "Widget Pro", price: 299 },
        target: { audience: "developers", region: "US" }
    },
    content: {
        socialMedia: null,  // Will be populated by mapping
        email: null,
        blog: null
    }
}

// Social Media Agent (Related) - Independent payload
socialAgentPayload = {
    // Input (from parent via mapping)
    productName: "Widget Pro",
    targetAudience: "developers",

    // Output (generated by agent)
    posts: [
        { platform: "Twitter", text: "...", hashtags: [...] },
        { platform: "LinkedIn", text: "...", hashtags: [...] }
    ]
}

// Email Agent (Related) - Independent payload
emailAgentPayload = {
    // Input (from parent via mapping)
    productName: "Widget Pro",
    targetAudience: "developers",

    // Output (generated by agent)
    subject: "Introducing Widget Pro",
    bodyHtml: "<html>...",
    bodyText: "..."
}
```

**Key Point:** Social and Email agents cannot conflict because they:
1. Have separate, independent payload structures
2. Don't share mutable state
3. Return outputs that parent maps sequentially (no race condition)

### Explicit Mapping is Sequential

Even though related agents execute in parallel, the **mapping back to parent payload is sequential**:

```typescript
// All related agents complete (in any order)
const results = await Promise.all([socialAgent, emailAgent, blogAgent]);

// Parent maps outputs sequentially (deterministic)
for (const result of results) {
    if (result.success && result.outputMapping) {
        parentPayload = mapSubAgentOutputToPayload(
            parentPayload,
            result.output,
            result.outputMapping
        );
    }
}

// Final parent payload:
parentPayload.content.socialMedia = socialAgentResult.posts;
parentPayload.content.email = { subject: "...", body: "..." };
parentPayload.content.blog = { title: "...", content: "..." };
```

No conflicts possible because:
- Each related agent writes to **different sections** of parent payload (via mapping)
- Mapping happens **after all agents complete** (sequential, deterministic)
- If mappings overlap, last-write-wins is explicit and predictable

---

## Implementation Design

### Type System Changes

**File:** [packages/AI/CorePlus/src/agent-types.ts](packages/AI/CorePlus/src/agent-types.ts)

#### Add Input/Output Mapping Support

```typescript
export type AgentSubAgentRequest<TContext = any> = {
    name: string;
    message: string;
    templateParameters?: Record<string, any>;

    // NEW: For related agents, specify explicit input/output mapping
    inputMapping?: {
        // Map parent payload → sub-agent input
        // e.g., { 'productName': 'payload.campaign.product.name' }
        [subAgentInputKey: string]: string;  // JSONPath to parent payload
    };

    outputMapping?: {
        // Map sub-agent output → parent payload
        // e.g., { 'payload.content.socialMedia': 'posts' }
        [parentPayloadPath: string]: string;  // Key in sub-agent output
    };
}
```

**Mapping Example:**

```json
{
  "name": "Keyword Research Agent",
  "message": "Find top keywords for our product",
  "inputMapping": {
    "query": "payload.campaign.product.name",
    "maxResults": "payload.config.maxKeywords"
  },
  "outputMapping": {
    "payload.seo.keywords": "keywords",
    "payload.seo.volumes": "searchVolumes"
  }
}
```

#### Distinguish Sequential vs. Parallel Execution

```typescript
export type BaseAgentNextStep<P = any, TContext = any> = {
    step: AIAgentRunEntityExtended['FinalStep']

    // Child agents: sequential, shared payload (existing)
    subAgent?: AgentSubAgentRequest<TContext>;

    // Related agents: parallel, independent payload (NEW)
    subAgents?: AgentSubAgentRequest<TContext>[];

    actions?: AgentAction[];
}
```

**Validation Rules:**
- `subAgent` (singular) → Must be a child agent (has `ParentID`)
- `subAgents` (plural) → Must be related agents (no `ParentID`)
- Error if LLM returns both `subAgent` AND `subAgents`

---

### Execution Logic

**File:** [packages/AI/Agents/src/base-agent.ts](packages/AI/Agents/src/base-agent.ts)

#### Keep Existing Sequential Method for Child Agents

```typescript
private async executeSubAgentStep<SC = any, SR = any>(
    params: ExecuteAgentParams<SC>,
    previousDecision?: BaseAgentNextStep<SR, SC>,
): Promise<BaseAgentNextStep<SR, SC>> {
    const subAgentRequest = previousDecision.subAgent;
    const subAgentEntity = await this.lookupSubAgent(subAgentRequest.name, params.contextUser);

    // VERIFY it's a child agent
    const isChildAgent = subAgentEntity.ParentID === this._agent.ID;
    if (!isChildAgent) {
        throw new Error(
            `Agent '${subAgentRequest.name}' is not a child of '${this._agent.Name}'. ` +
            `Use 'subAgents' array for related agents, not 'subAgent'.`
        );
    }

    // Execute with payload scoping (existing logic)
    const downstreamPayload = this._payloadManager.extractDownstreamPayload(...);
    const subAgentResult = await this.ExecuteSubAgent(..., downstreamPayload);
    const mergedPayload = this._payloadManager.mergeUpstreamPayload(...);

    return {
        step: 'Retry',
        terminate: false,
        newPayload: mergedPayload
    };
}
```

#### Create New Parallel Method for Related Agents

```typescript
private async executeSubAgentsStep<SC = any, SR = any>(
    params: ExecuteAgentParams<SC>,
    previousDecision: BaseAgentNextStep<SR, SC>,
): Promise<BaseAgentNextStep<SR, SC>> {
    const subAgents = previousDecision.subAgents || [];

    // Pre-allocate step numbers (like actions)
    let numSubAgentsProcessed = 0;
    const baseStepNumber = (this._agentRun!.Steps?.length || 0) + 1;

    // Execute all related agents in parallel
    const subAgentPromises = subAgents.map(async (subAgentRequest, index) => {
        try {
            const subAgentEntity = await this.lookupSubAgent(subAgentRequest.name, params.contextUser);

            // VERIFY it's a related agent (NOT a child)
            const isChildAgent = subAgentEntity.ParentID === this._agent.ID;
            if (isChildAgent) {
                throw new Error(
                    `Agent '${subAgentRequest.name}' is a child agent. ` +
                    `Child agents must execute sequentially using 'subAgent', not 'subAgents'.`
                );
            }

            // Create step entity with unique number
            const stepEntity = await this.createStepEntity(
                'Sub-Agents',
                config,
                baseStepNumber + numSubAgentsProcessed++,
                // ...
            );

            // Map parent payload → sub-agent input (if mapping provided)
            let subAgentInput: any = {};
            if (subAgentRequest.inputMapping) {
                subAgentInput = this.mapPayloadToSubAgentInput(
                    previousDecision.newPayload,
                    subAgentRequest.inputMapping
                );
            }

            // Execute sub-agent with independent payload
            const result = await this.ExecuteSubAgent(
                params,
                subAgentRequest,
                subAgentEntity,
                stepEntity,
                subAgentInput  // ← Independent payload, not scoped parent payload
            );

            return {
                success: true,
                subAgentName: subAgentRequest.name,
                result,
                outputMapping: subAgentRequest.outputMapping,
                stepEntity
            };
        } catch (error) {
            return {
                success: false,
                subAgentName: subAgentRequest.name,
                error: error.message,
                stepEntity
            };
        }
    });

    // Wait for all related agents (parallel execution)
    const subAgentResults = await Promise.all(subAgentPromises);

    // Map all outputs back to parent payload (sequential mapping, no conflicts)
    let mergedPayload = previousDecision.newPayload;
    for (const result of subAgentResults) {
        if (result.success && result.outputMapping) {
            mergedPayload = this.mapSubAgentOutputToPayload(
                mergedPayload,
                result.result.payload,
                result.outputMapping
            );
        }
    }

    // Check for failures
    const failures = subAgentResults.filter(r => !r.success);
    const shouldTerminate = failures.length === subAgents.length; // All failed

    return {
        step: 'Retry',
        terminate: shouldTerminate,
        newPayload: mergedPayload
    };
}
```

#### Update Dispatcher to Route to Correct Method

```typescript
protected async executeNextStep<P = any>(
    params: ExecuteAgentParams,
    config: AgentConfiguration,
    previousDecision: BaseAgentNextStep<P> | null
): Promise<BaseAgentNextStep<P>> {
    // ...existing code...

    // NEW: Check for parallel sub-agents (related agents)
    if (previousDecision?.subAgents && previousDecision.subAgents.length > 0) {
        return await this.executeSubAgentsStep(params, previousDecision);
    }

    // Existing: Single sub-agent (child agent)
    if (previousDecision?.subAgent) {
        return await this.executeSubAgentStep(params, previousDecision);
    }

    // ...rest of cases (Actions, Prompt, etc.)...
}
```

---

### Payload Mapping Helpers

**File:** [packages/AI/Agents/src/base-agent.ts](packages/AI/Agents/src/base-agent.ts)

#### Map Parent Payload to Sub-Agent Input

```typescript
/**
 * Maps parent payload to sub-agent input using JSONPath expressions
 *
 * @param parentPayload - Parent agent's full payload
 * @param inputMapping - Map of sub-agent input keys → parent payload paths
 * @returns Object with sub-agent input structure
 *
 * @example
 * const input = mapPayloadToSubAgentInput(
 *   { campaign: { product: { name: "Widget" } } },
 *   { productName: "campaign.product.name" }
 * );
 * // Returns: { productName: "Widget" }
 */
private mapPayloadToSubAgentInput(
    parentPayload: any,
    inputMapping: Record<string, string>
): any {
    const subAgentInput: any = {};

    for (const [subAgentKey, parentPath] of Object.entries(inputMapping)) {
        // Use JSONPath to extract value from parent payload
        const value = this.getValueAtPath(parentPayload, parentPath);
        this.setValueAtPath(subAgentInput, subAgentKey, value);
    }

    return subAgentInput;
}
```

#### Map Sub-Agent Output to Parent Payload

```typescript
/**
 * Maps sub-agent output back to parent payload
 *
 * @param parentPayload - Parent agent's current payload
 * @param subAgentOutput - Sub-agent's output payload
 * @param outputMapping - Map of parent payload paths → sub-agent output keys
 * @returns Updated parent payload
 *
 * @example
 * const updated = mapSubAgentOutputToPayload(
 *   { seo: {} },
 *   { keywords: ["widget", "tool"] },
 *   { "seo.keywords": "keywords" }
 * );
 * // Returns: { seo: { keywords: ["widget", "tool"] } }
 */
private mapSubAgentOutputToPayload(
    parentPayload: any,
    subAgentOutput: any,
    outputMapping: Record<string, string>
): any {
    const result = { ...parentPayload };

    for (const [parentPath, subAgentKey] of Object.entries(outputMapping)) {
        // Extract value from sub-agent output
        const value = this.getValueAtPath(subAgentOutput, subAgentKey);

        // Set value in parent payload
        this.setValueAtPath(result, parentPath, value);
    }

    return result;
}
```

#### JSONPath Utilities

```typescript
/**
 * Get value from object using dot notation path
 * Supports nested properties: "campaign.product.name"
 */
private getValueAtPath(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
    }

    return current;
}

/**
 * Set value in object using dot notation path
 * Creates intermediate objects as needed
 */
private setValueAtPath(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in current)) {
            current[parts[i]] = {};
        }
        current = current[parts[i]];
    }

    current[parts[parts.length - 1]] = value;
}
```

---

### LLM Integration

**File:** [Metadata/Prompts/templates/system/loop-agent-type-system-prompt.template.md](Metadata/Prompts/templates/system/loop-agent-type-system-prompt.template.md)

#### Update System Prompt with Clear Guidance

```markdown
## Sub-Agents ({{subAgentCount}} available)

You can invoke sub-agents in two ways depending on their relationship type:

### Child Agents (Sequential Execution Only)

Child agents share your payload structure with optional scoping. Execute ONE at a time.

**When to use:**
- Sub-agent is part of your workflow (has ParentID = your ID)
- Sub-agent reads/writes your payload directly
- Order matters or dependencies exist

**Syntax:**
```json
{
  "nextStep": {
    "type": "Sub-Agent",
    "subAgent": {
      "name": "ChildAgentName",
      "message": "Task description for child agent"
    }
  }
}
```

**Available Child Agents:**
{{#childAgents}}
- **{{Name}}**: {{Description}}
  - Scope: {{PayloadScope}}
  - Can Read: {{PayloadDownstreamPaths}}
  - Can Write: {{PayloadUpstreamPaths}}
{{/childAgents}}

---

### Related Agents (Parallel Execution Allowed)

Related agents have independent payload structures. Can execute MULTIPLE in parallel.

**When to use:**
- Sub-agents are independent (no ParentID relationship)
- Sub-agents have their own payload schemas
- No dependencies between them
- Faster execution is important

**Syntax:**
```json
{
  "nextStep": {
    "type": "Sub-Agent",
    "subAgents": [
      {
        "name": "RelatedAgent1",
        "message": "Task description",
        "inputMapping": {
          "query": "campaign.product.name",
          "context": "campaign.targetAudience"
        },
        "outputMapping": {
          "seo.keywords": "keywords",
          "seo.confidence": "confidenceScore"
        }
      },
      {
        "name": "RelatedAgent2",
        "message": "Different task",
        "inputMapping": {
          "data": "analytics.metrics"
        },
        "outputMapping": {
          "insights.trends": "identifiedTrends"
        }
      }
    ]
  }
}
```

**Input/Output Mapping:**
- `inputMapping`: Map YOUR payload → sub-agent input
  - Keys: Sub-agent's input field names
  - Values: Dot-notation path to your payload (e.g., "campaign.product.name")
- `outputMapping`: Map sub-agent output → YOUR payload
  - Keys: Dot-notation path to your payload (e.g., "seo.keywords")
  - Values: Sub-agent's output field names

**Available Related Agents:**
{{#relatedAgents}}
- **{{Name}}**: {{Description}}
  - Input Schema: {{InputSchema}}
  - Output Schema: {{OutputSchema}}
{{/relatedAgents}}

---

**Important Rules:**
1. ❌ NEVER use `subAgents` array for child agents (will error)
2. ❌ NEVER use `subAgent` singular for related agents (will error)
3. ✅ Related agents in `subAgents` array execute in PARALLEL
4. ✅ Child agents in `subAgent` singular execute SEQUENTIALLY
```

#### Update Agent Type Response Types

**File:** [packages/AI/Agents/src/agent-types/loop-agent-response-type.ts](packages/AI/Agents/src/agent-types/loop-agent-response-type.ts)

```typescript
export type LoopAgentSubAgentRequest = {
    name: string;
    message: string;

    // Optional mapping for related agents
    inputMapping?: Record<string, string>;
    outputMapping?: Record<string, string>;
}

export type LoopAgentResponse = {
    taskComplete: boolean,
    nextStep: {
        type: 'Sub-Agent' | 'Actions' | 'Chat',

        // Child agent: singular, no mapping needed
        subAgent?: LoopAgentSubAgentRequest;

        // Related agents: array, requires mapping
        subAgents?: LoopAgentSubAgentRequest[];

        actions?: AgentAction[]
    }
}
```

---

## Example Use Cases

### Use Case 1: Marketing Campaign Orchestrator

**Agent Structure:**
```
Marketing Orchestrator Agent (Parent)
├─ (Child) Budget Optimizer
│   ParentID: Marketing Orchestrator
│   PayloadScope: "campaign.budget"
│   Sequential execution (analyzes and modifies shared budget)
│
└─ (Related, Parallel) Content Generators
    ├─ Social Media Agent (independent payload)
    ├─ Email Agent (independent payload)
    └─ Blog Agent (independent payload)
```

**Step 1: Optimize Budget (Child Agent - Sequential)**

```json
{
  "taskComplete": false,
  "thinking": "First, I need to optimize the campaign budget based on constraints.",
  "nextStep": {
    "type": "Sub-Agent",
    "subAgent": {
      "name": "Budget Optimizer",
      "message": "Optimize campaign budget given constraints: max $10k, ROI target 3.0x"
    }
  }
}
```

**Step 2: Generate All Content (Related Agents - Parallel)**

```json
{
  "taskComplete": false,
  "thinking": "Budget is optimized. Now generate all content types in parallel.",
  "nextStep": {
    "type": "Sub-Agent",
    "subAgents": [
      {
        "name": "Social Media Content Generator",
        "message": "Create 3 social media posts for product launch",
        "inputMapping": {
          "productName": "campaign.product.name",
          "targetAudience": "campaign.targeting.audience",
          "brandGuidelines": "campaign.brand.guidelines",
          "budget": "campaign.budget.socialMedia"
        },
        "outputMapping": {
          "content.socialMedia.posts": "posts",
          "content.socialMedia.hashtags": "recommendedHashtags",
          "content.socialMedia.estimatedReach": "projectedReach"
        }
      },
      {
        "name": "Email Content Generator",
        "message": "Create promotional email for product launch",
        "inputMapping": {
          "productName": "campaign.product.name",
          "targetAudience": "campaign.targeting.audience",
          "tone": "campaign.brand.tone"
        },
        "outputMapping": {
          "content.email.subject": "subject",
          "content.email.bodyHtml": "bodyHtml",
          "content.email.bodyText": "bodyText",
          "content.email.previewText": "previewText"
        }
      },
      {
        "name": "Blog Content Generator",
        "message": "Write blog post announcing the product",
        "inputMapping": {
          "productName": "campaign.product.name",
          "features": "campaign.product.features",
          "targetAudience": "campaign.targeting.audience"
        },
        "outputMapping": {
          "content.blog.title": "title",
          "content.blog.content": "markdownContent",
          "content.blog.metaDescription": "metaDescription",
          "content.blog.keywords": "seoKeywords"
        }
      }
    ]
  }
}
```

**Execution Timeline:**
```
Time 0s:  Start all 3 content generators in parallel
Time 15s: Social Media Agent completes → Map to payload.content.socialMedia
Time 18s: Email Agent completes → Map to payload.content.email
Time 22s: Blog Agent completes → Map to payload.content.blog
Time 22s: All complete, ready for next step

Sequential would take: 15 + 18 + 22 = 55s
Parallel takes: max(15, 18, 22) = 22s
Performance gain: 60% faster
```

### Use Case 2: Research Analysis Pipeline

**Agent Structure:**
```
Research Coordinator Agent (Parent)
├─ (Related, Parallel) Data Collectors
│   ├─ Academic Papers Agent
│   ├─ News Articles Agent
│   └─ Social Media Trends Agent
│
└─ (Child) Research Synthesizer
    ParentID: Research Coordinator
    PayloadScope: "research"
    Sequential (analyzes collected data after parallel collection)
```

**Step 1: Parallel Data Collection (Related Agents)**

```json
{
  "taskComplete": false,
  "thinking": "Gather data from all sources in parallel for efficiency.",
  "nextStep": {
    "type": "Sub-Agent",
    "subAgents": [
      {
        "name": "Academic Papers Agent",
        "message": "Find recent academic papers on AI safety from 2024-2025",
        "inputMapping": {
          "query": "research.query",
          "yearRange": "research.timeframe",
          "maxResults": "research.limits.papers"
        },
        "outputMapping": {
          "research.sources.academic": "papers",
          "research.metadata.academicCount": "totalCount"
        }
      },
      {
        "name": "News Articles Agent",
        "message": "Find mainstream news articles discussing AI safety",
        "inputMapping": {
          "query": "research.query",
          "dateRange": "research.timeframe"
        },
        "outputMapping": {
          "research.sources.news": "articles",
          "research.metadata.newsCount": "totalCount"
        }
      },
      {
        "name": "Social Media Trends Agent",
        "message": "Analyze social media discussions about AI safety",
        "inputMapping": {
          "query": "research.query",
          "platforms": "research.socialPlatforms"
        },
        "outputMapping": {
          "research.sources.social": "trends",
          "research.metadata.socialMentions": "mentionCount"
        }
      }
    ]
  }
}
```

**Step 2: Synthesize Findings (Child Agent - Sequential)**

```json
{
  "taskComplete": false,
  "thinking": "All data collected. Now synthesize findings across sources.",
  "nextStep": {
    "type": "Sub-Agent",
    "subAgent": {
      "name": "Research Synthesizer",
      "message": "Synthesize findings from academic, news, and social media sources. Identify key themes, contradictions, and emerging consensus."
      // No mapping needed - child agent reads payload.research directly
    }
  }
}
```

**Why This Design Works:**
1. Data collection is **independent** → parallel execution (3x faster)
2. Synthesis **requires all data** → sequential execution after collection
3. Clear separation of concerns and reusable data collector agents

---

## Advantages of This Approach

### 1. Zero Payload Conflicts ✅

**Problem Eliminated:** Related agents have independent payload structures, so they cannot conflict.

```typescript
// Each agent has its own payload space
SocialAgent.payload = { posts: [...], hashtags: [...] }
EmailAgent.payload = { subject: "...", body: "..." }
BlogAgent.payload = { title: "...", content: "..." }

// Parent maps sequentially after all complete (deterministic)
parent.content.socialMedia = SocialAgent.payload.posts;
parent.content.email = EmailAgent.payload.subject;
parent.content.blog = BlogAgent.payload.title;
```

### 2. Clear Mental Model ✅

**Child Agents** = Shared memory, sequential (like function calls)
**Related Agents** = Message passing, parallel (like microservices)

Developers intuitively understand this distinction from other programming paradigms.

### 3. Type Safety & Validation ✅

```typescript
// Enforced at runtime
if (subAgent && isChildAgent) {
    executeSubAgentStep();  // Sequential
} else if (subAgents && !anyAreChildren) {
    executeSubAgentsStep(); // Parallel
} else {
    throw new Error("Invalid agent relationship for execution mode");
}
```

### 4. Reusability ✅

Related agents are truly independent:
- Can be invoked by multiple different parent agents
- Have well-defined input/output contracts (schemas)
- Don't depend on specific payload structures

### 5. Performance Without Complexity ✅

**Parallel where safe:** Related agents with independent payloads
**Sequential where needed:** Child agents with shared payloads

Best of both worlds.

### 6. Backward Compatible ✅

Existing child agents continue to work unchanged:
- Same `subAgent` singular syntax
- Same payload scoping behavior
- Same sequential execution

New feature (parallel related agents) is opt-in via `subAgents` array.

### 7. Debugging Clarity ✅

**Sequential Trace (Child Agents):**
```
Parent Agent
  Step 1: Prompt
  Step 2: Child Agent A
    A.Step 1: Prompt
    A.Step 2: Actions
  Step 3: Child Agent B
    B.Step 1: Prompt
  Step 4: Complete
```

**Parallel Trace (Related Agents):**
```
Parent Agent
  Step 1: Prompt
  Step 2A: Related Agent A (starts at T=0s)
    A.Step 1: Prompt (T=0s)
    A.Step 2: Actions (T=5s)
    A.Complete (T=15s)
  Step 2B: Related Agent B (starts at T=0s)
    B.Step 1: Prompt (T=0s)
    B.Complete (T=18s)
  Step 2C: Related Agent C (starts at T=0s)
    C.Step 1: Prompt (T=0s)
    C.Complete (T=22s)
  Step 3: All mappings complete (T=22s)
  Step 4: Continue
```

Clear distinction between parallel and sequential in logs.

---

## Implementation Checklist

### Core Infrastructure

- [ ] **Type System Updates**
  - [ ] Add `inputMapping` and `outputMapping` to `AgentSubAgentRequest`
  - [ ] Add `subAgents` array to `BaseAgentNextStep`
  - [ ] Update `LoopAgentResponse` types
  - [ ] Update `FlowAgentType` if needed

- [ ] **Execution Logic**
  - [ ] Create `executeSubAgentsStep()` method for parallel execution
  - [ ] Update `executeSubAgentStep()` with child agent validation
  - [ ] Update `executeNextStep()` dispatcher to route correctly
  - [ ] Implement mapping helpers (`mapPayloadToSubAgentInput`, `mapSubAgentOutputToPayload`)
  - [ ] Add JSONPath utilities (`getValueAtPath`, `setValueAtPath`)

- [ ] **Validation & Error Handling**
  - [ ] Validate child agent used with `subAgent` (singular)
  - [ ] Validate related agents used with `subAgents` (plural)
  - [ ] Error if LLM returns both `subAgent` and `subAgents`
  - [ ] Handle partial failures (some related agents succeed, some fail)
  - [ ] Log clear error messages for misuse

- [ ] **Step Tracking**
  - [ ] Pre-allocate unique step numbers for parallel sub-agents
  - [ ] Ensure step entities created correctly
  - [ ] Track timing for each parallel sub-agent
  - [ ] Store input/output mappings in step metadata for debugging

### LLM Integration

- [ ] **System Prompts**
  - [ ] Update loop-agent-type-system-prompt.template.md
  - [ ] Add child vs. related agent guidance
  - [ ] Provide clear syntax examples
  - [ ] Add input/output mapping documentation
  - [ ] Include when-to-use-each decision guide

- [ ] **Agent Type Implementations**
  - [ ] Update `LoopAgentType.DetermineNextStep()` to parse `subAgents` array
  - [ ] Update response validation to allow `subAgents`
  - [ ] Update `FlowAgentType` if applicable

- [ ] **Template Rendering**
  - [ ] Separate `{{#childAgents}}` and `{{#relatedAgents}}` sections in prompts
  - [ ] Include input/output schemas for related agents
  - [ ] Show payload scoping for child agents

### Database Schema

- [ ] **Add Schema Fields (Optional Enhancement)**
  - [ ] Add `InputSchema` JSON column to `AIAgent` table
  - [ ] Add `OutputSchema` JSON column to `AIAgent` table
  - [ ] Add `InputMapping` JSON column to `AIAgentRelationship` table
  - [ ] Add `OutputMapping` JSON column to `AIAgentRelationship` table
  - [ ] Run migration if adding fields

### Testing

- [ ] **Unit Tests**
  - [ ] Test `mapPayloadToSubAgentInput()` with various JSONPath expressions
  - [ ] Test `mapSubAgentOutputToPayload()` with nested structures
  - [ ] Test child agent validation (error on `subAgents` usage)
  - [ ] Test related agent validation (error on `subAgent` usage)
  - [ ] Test step number allocation for parallel agents

- [ ] **Integration Tests**
  - [ ] Test parallel execution of 3 related agents
  - [ ] Test sequential execution of child agents (no regression)
  - [ ] Test mixed workflow (parallel related agents, then sequential child agent)
  - [ ] Test partial failures (1 of 3 related agents fails)
  - [ ] Test all failures (all related agents fail → terminate)

- [ ] **Performance Tests**
  - [ ] Measure time savings: sequential vs. parallel (3 agents)
  - [ ] Verify no payload conflicts with parallel execution
  - [ ] Test with 10+ parallel agents (stress test)

- [ ] **Backward Compatibility Tests**
  - [ ] Verify existing child agents still work
  - [ ] Verify existing workflows unchanged
  - [ ] Test upgrade path (no breaking changes)

### Documentation

- [ ] **Developer Documentation**
  - [ ] Document child vs. related agent distinction
  - [ ] Provide input/output mapping examples
  - [ ] Add decision guide: "Should this be a child or related agent?"
  - [ ] Document error messages and troubleshooting

- [ ] **API Documentation**
  - [ ] Document `AgentSubAgentRequest` interface with mapping fields
  - [ ] Document `BaseAgentNextStep` with `subAgents` array
  - [ ] Update agent configuration examples

- [ ] **User Documentation**
  - [ ] Update agent design guide
  - [ ] Provide use case examples (marketing, research, multi-channel)
  - [ ] Explain when to use parallel execution

---

## Future Enhancements

### Phase 2: Pre-Configured Mappings

**Problem:** LLMs must generate mapping JSON on every invocation, which is verbose and error-prone.

**Solution:** Store mappings in `AIAgentRelationship` table:

```sql
ALTER TABLE [__mj].[AIAgentRelationship]
ADD InputMapping NVARCHAR(MAX) NULL,
    OutputMapping NVARCHAR(MAX) NULL;
```

Then LLM just specifies agent name:
```json
{
  "subAgents": [
    { "name": "Keyword Researcher", "message": "Find keywords for 'Widget Pro'" }
    // Mapping pulled from database automatically
  ]
}
```

### Phase 3: Enhanced Schema Documentation

**Problem:** LLM needs to know each related agent's input/output schema.

**Solution:** Add schema fields to `AIAgent` table:

```sql
ALTER TABLE [__mj].[AIAgent]
ADD InputSchema NVARCHAR(MAX) NULL,   -- JSON schema for agent's input
    OutputSchema NVARCHAR(MAX) NULL;  -- JSON schema for agent's output
```

Include in system prompt:
```markdown
**Available Related Agents:**
- **Keyword Research Agent**
  - Input Schema: `{ query: string, maxResults?: number }`
  - Output Schema: `{ keywords: string[], volumes: number[] }`
```

### Phase 4: Conflict Detection Utilities

**Problem:** Developers might accidentally create overlapping output mappings.

**Solution:** Add validation method:

```typescript
public validateOutputMappings(
    subAgents: AgentSubAgentRequest[]
): Array<{path: string, conflictingAgents: string[]}> {
    const pathToAgents = new Map<string, string[]>();

    for (const agent of subAgents) {
        for (const path of Object.keys(agent.outputMapping || {})) {
            if (!pathToAgents.has(path)) {
                pathToAgents.set(path, []);
            }
            pathToAgents.get(path)!.push(agent.name);
        }
    }

    return Array.from(pathToAgents.entries())
        .filter(([_, agents]) => agents.length > 1)
        .map(([path, agents]) => ({ path, conflictingAgents: agents }));
}
```

Log warnings if conflicts detected (but allow with last-write-wins behavior).

### Phase 5: Failure Handling Strategies

**Problem:** If 1 of 3 related agents fails, should parent continue with partial results?

**Solution:** Add failure strategy option:

```typescript
{
  "subAgents": [...],
  "failureStrategy": "continue-partial" | "fail-all" | "retry-failed"
}
```

Behaviors:
- `continue-partial`: Use successful results, ignore failures
- `fail-all`: If any fail, terminate parent agent
- `retry-failed`: Retry failed agents once before continuing

### Phase 6: Conditional Dependencies

**Problem:** Sometimes related agents have partial dependencies (e.g., Agent C depends on Agent A but not Agent B).

**Solution:** Add dependency graph to `subAgents`:

```typescript
{
  "subAgents": [
    { "id": "A", "name": "Agent A", ... },
    { "id": "B", "name": "Agent B", ... },
    { "id": "C", "name": "Agent C", "dependsOn": ["A"], ... }
  ]
}
```

Execute in waves:
- Wave 1: A and B (parallel)
- Wave 2: C (after A completes)

---

## Success Criteria

### Functional Requirements ✅

- [ ] Related agents execute in parallel (verified by timing logs)
- [ ] Child agents execute sequentially (no regression)
- [ ] Input mapping correctly extracts parent payload values
- [ ] Output mapping correctly writes to parent payload
- [ ] Validation prevents misuse (child with `subAgents`, related with `subAgent`)
- [ ] Step tracking creates unique step numbers for parallel agents
- [ ] Partial failures handled gracefully

### Performance Requirements ✅

- [ ] 3 related agents complete in max(T1, T2, T3), not sum(T1, T2, T3)
- [ ] No payload conflicts with parallel execution
- [ ] Overhead of mapping is negligible (< 100ms)

### Quality Requirements ✅

- [ ] Zero breaking changes to existing agents
- [ ] Clear error messages for misuse
- [ ] Comprehensive logging for debugging
- [ ] Type safety enforced throughout

### Documentation Requirements ✅

- [ ] System prompts clearly explain child vs. related agents
- [ ] Developer docs include decision guide
- [ ] API docs updated with new types
- [ ] Examples provided for common use cases

---

## Risks & Mitigations

### Risk 1: LLM Confusion Between Child and Related Agents

**Risk:** LLM might not understand when to use `subAgent` vs. `subAgents`.

**Mitigation:**
- Clear system prompt guidance with examples
- Validation errors with helpful messages
- Template shows both child and related agents separately

### Risk 2: Complex Mapping Syntax

**Risk:** Mapping JSON might be error-prone for LLMs.

**Mitigation:**
- Provide extensive examples in system prompt
- Validate mapping paths before execution
- Future enhancement: pre-configured mappings in database

### Risk 3: Debugging Parallel Execution

**Risk:** Interleaved logs from parallel agents harder to follow.

**Mitigation:**
- Step numbers clearly identify which agent
- Timestamps show execution order
- Logs grouped by agent hierarchy
- Future enhancement: visualization UI

### Risk 4: Partial Failure Scenarios

**Risk:** Unclear how to handle 1 of 3 agents failing.

**Mitigation:**
- Default behavior: continue with successful results, log failures
- Clear logging of which agents succeeded/failed
- Future enhancement: configurable failure strategies

---

## Conclusion

This proposal elegantly solves the parallel sub-agent execution problem by leveraging the existing distinction between child agents (shared payload) and related agents (independent payload). The approach:

✅ **Eliminates payload conflicts** - independent payloads cannot race
✅ **Maintains clarity** - clear mental model for developers and LLMs
✅ **Improves performance** - 40-60% faster for multi-agent workflows
✅ **Ensures safety** - validation prevents misuse
✅ **Preserves backward compatibility** - existing agents unchanged
✅ **Enables reusability** - related agents are truly independent

The implementation builds on proven patterns (parallel action execution) and requires only targeted changes to type system, execution logic, and LLM prompts. The result is a powerful capability that significantly improves performance for workflows with independent sub-agents while maintaining the safety and determinism of sequential execution for tightly coupled child agents.
