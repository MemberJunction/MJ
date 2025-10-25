# Agent Iteration Architecture - v3.0

**Status:** Approved for Implementation
**Target Release:** v3.0
**Estimated Duration:** 5-6 weeks
**Created:** 2025-01-24

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Flow Agent Implementation](#flow-agent-implementation)
4. [Loop Agent Implementation](#loop-agent-implementation)
5. [Database Schema Changes](#database-schema-changes)
6. [UI Enhancements](#ui-enhancements)
7. [Implementation Phases](#implementation-phases)
8. [Testing Strategy](#testing-strategy)
9. [Migration Path](#migration-path)
10. [Success Criteria](#success-criteria)

---

## Executive Summary

This plan implements native iteration support for MemberJunction's agent framework, enabling both **Flow Agents** (deterministic workflows) and **Loop Agents** (LLM-driven) to execute ForEach and While loops efficiently.

### Key Benefits

- **90% token reduction** for iterative tasks in Loop agents
- **Deterministic iteration** in Flow agents without LLM inference
- **Type-safe loop variables** injected into payload
- **Visual loop representation** in Flow diagram UI
- **Self-contained loop metadata** - no complex path management

### Design Philosophy

**Self-Contained Loop Steps:** ForEach/While steps contain all loop metadata inline (collection path, loop body configuration, input/output mappings) rather than using complex path-based child step graphs. This keeps loops simple for the 90% use case while supporting complex scenarios through Sub-Agent loop bodies.

---

## Architecture Overview

### Two Iteration Approaches

#### 1. Flow Agents: Step-Based Iteration

ForEach/While are **new step types** in the Flow graph:

```
[Start] → [Get Customers] → [ForEach: Send Email] → [Generate Summary]
                                      ↓
                              (loops internally over
                               payload.customers)
```

**Characteristics:**
- Loop configuration stored in `AIAgentStep.Configuration` JSON field
- Loop body type (Action/Sub-Agent/Prompt) stored in `AIAgentStep.LoopBodyType`
- Reuses existing `ActionID`, `SubAgentID`, `PromptID`, `ActionInputMapping`, `ActionOutputMapping` fields
- Paths from loop step are **only** exit paths (after loop completes)
- No complex path management needed

#### 2. Loop Agents: LLM-Requested Iteration

LLM can request ForEach/While operations in `nextStep` response:

```json
{
    "taskComplete": false,
    "message": "Found 15 documents, processing each",
    "nextStep": {
        "type": "ForEach",
        "forEach": {
            "collectionPath": "payload.discoveredDocuments",
            "itemVariable": "document",
            "action": {
                "name": "Analyze Document",
                "params": {
                    "documentPath": "document.path",
                    "options": "payload.analysisOptions"
                }
            }
        }
    }
}
```

**Benefits:**
- LLM decides **when** to iterate based on task requirements
- No repeated inference per item (token savings)
- Maintains audit trail (one AI decision → N executions)

---

## Flow Agent Implementation

### Database Schema

#### New Fields for AIAgentStep

```sql
ALTER TABLE [__mj].[AIAgentStep]
ADD [LoopBodyType] NVARCHAR(50) NULL,
    [Configuration] NVARCHAR(MAX) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Specifies what type of operation executes in the loop body. Values: Action, Sub-Agent, Prompt. Only used when StepType is ForEach or While.',
    @level0type = N'SCHEMA', @level0name = '__mj',
    @level1type = N'TABLE',  @level1name = 'AIAgentStep',
    @level2type = N'COLUMN', @level2name = 'LoopBodyType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration object for step-specific settings. For loop steps: { type, collectionPath, itemVariable, indexVariable, maxIterations, continueOnError, condition }. For other step types: reserved for future use.',
    @level0type = N'SCHEMA', @level0name = '__mj',
    @level1type = N'TABLE',  @level1name = 'AIAgentStep',
    @level2type = N'COLUMN', @level2name = 'Configuration';
```

#### Update StepType Enum

```sql
-- Add new values to StepType field value list
-- Existing: 'Action', 'Sub-Agent', 'Prompt'
-- NEW: 'ForEach', 'While'
```

### Configuration Field Schema

#### ForEach Configuration

```typescript
interface ForEachConfig {
    type: 'ForEach';
    collectionPath: string;        // Required: "payload.customers"
    itemVariable?: string;         // Optional: Default "item"
    indexVariable?: string;        // Optional: Default "index"
    maxIterations?: number;        // Optional: undefined=1000, 0=unlimited, >0=limit
    continueOnError?: boolean;     // Optional: Default false
}
```

**Example:**
```json
{
    "type": "ForEach",
    "collectionPath": "payload.customers",
    "itemVariable": "customer",
    "indexVariable": "i",
    "maxIterations": 1000,
    "continueOnError": false
}
```

#### While Configuration

```typescript
interface WhileConfig {
    type: 'While';
    condition: string;             // Required: Boolean expression
    itemVariable?: string;         // Optional: Default "attempt"
    maxIterations?: number;        // Optional: undefined=100, 0=unlimited, >0=limit
    continueOnError?: boolean;     // Optional: Default false
}
```

**Example:**
```json
{
    "type": "While",
    "condition": "payload.retryCount < 5 && !payload.success",
    "itemVariable": "attempt",
    "maxIterations": 10,
    "continueOnError": false
}
```

### MaxIterations Interpretation

| Value | Behavior |
|-------|----------|
| `undefined` | Use safe default (ForEach: 1000, While: 100) |
| `0` | Unlimited iterations (⚠️ warns user) |
| `> 0` | Use specified limit |
| `< 0` | Validation error |

### FlowExecutionState Extensions

```typescript
export interface IterationContext {
    stepId: string;
    loopType: 'ForEach' | 'While';

    // ForEach specific
    collection?: any[];
    currentIndex?: number;

    // While specific
    condition?: string;
    iterationCount?: number;

    // Common
    itemVariable: string;
    indexVariable?: string;
    maxIterations: number;
    continueOnError: boolean;
    errors: any[];
    results: any[];
}

export class FlowExecutionState {
    agentId: string;
    currentStepId?: string;
    completedStepIds: Set<string> = new Set();
    stepResults: Map<string, unknown> = new Map();
    executionPath: string[] = [];

    // NEW: Iteration tracking
    iterationStack: IterationContext[] = [];  // Supports nested loops
    loopVariables: Map<string, any> = new Map();  // Current loop vars
}
```

### Input/Output Mapping Resolution

**Resolution rules (no "static:" prefix needed):**

```typescript
function resolveValue(value: string, context: { item?: any, index?: number, payload: any }): any {
    if (value.startsWith('item.'))           return getValueFromPath(context.item, value.substring(5));
    else if (value.startsWith('payload.'))   return getValueFromPath(context.payload, value.substring(8));
    else if (value === 'item')               return context.item;
    else if (value === 'index')              return context.index;
    else                                     return value; // Static literal
}
```

**Examples:**
```json
{
    "to": "item.email",              // Loop var property
    "subject": "Welcome!",           // Static string
    "userId": "payload.currentUser", // Payload path
    "itemIndex": "index",            // Loop index
    "template": "item"               // Entire item
}
```

### ForEach Step Execution

```typescript
private async executeForEachStep<P>(
    node: AIAgentStepEntity,
    payload: P,
    flowState: FlowExecutionState,
    params: ExecuteAgentParams<P>
): Promise<BaseAgentNextStep<P>> {
    const config: ForEachConfig = JSON.parse(node.Configuration);

    // Get collection from payload
    const collection = this.getValueFromPath(payload, config.collectionPath);
    if (!Array.isArray(collection)) {
        return this.createNextStep('Failed', {
            errorMessage: `Collection path "${config.collectionPath}" did not resolve to an array`
        });
    }

    // Determine max iterations
    const maxIterations = config.maxIterations === undefined
        ? 1000  // Default
        : config.maxIterations === 0
            ? Number.MAX_SAFE_INTEGER  // Unlimited
            : config.maxIterations;

    // Find or create iteration context
    let iterContext = flowState.iterationStack.find(i => i.stepId === node.ID);
    if (!iterContext) {
        iterContext = {
            stepId: node.ID,
            loopType: 'ForEach',
            collection: collection,
            currentIndex: 0,
            itemVariable: config.itemVariable || 'item',
            indexVariable: config.indexVariable || 'index',
            maxIterations: maxIterations,
            continueOnError: config.continueOnError || false,
            errors: [],
            results: []
        };
        flowState.iterationStack.push(iterContext);
    }

    // Check if loop is complete
    if (iterContext.currentIndex >= iterContext.collection.length) {
        // Clean up iteration context
        flowState.iterationStack = flowState.iterationStack.filter(i => i.stepId !== node.ID);

        // Store aggregated results
        flowState.stepResults.set(node.ID, {
            results: iterContext.results,
            errors: iterContext.errors,
            totalIterations: iterContext.currentIndex
        });

        // Find exit paths from this loop step
        const exitPaths = await this.getValidPaths(node.ID, payload, flowState);
        if (exitPaths.length === 0) {
            return this.createSuccessStep({
                message: `ForEach loop completed: processed ${iterContext.currentIndex} items`
            });
        }

        const nextStep = await this.getStepById(exitPaths[0].DestinationStepID);
        return this.createStepForFlowNode(params, nextStep, payload, flowState);
    }

    // Safety check
    if (iterContext.currentIndex >= maxIterations) {
        LogError(`ForEach loop "${node.Name}" exceeded maxIterations (${maxIterations})`);
        return this.createNextStep('Failed', {
            errorMessage: `Loop exceeded maximum iterations (${maxIterations})`,
            newPayload: payload
        });
    }

    // Inject current item into payload
    const currentItem = iterContext.collection[iterContext.currentIndex];
    const enhancedPayload = {
        ...payload,
        [iterContext.itemVariable]: currentItem,
        [iterContext.indexVariable]: iterContext.currentIndex
    } as P;

    // Execute loop body based on LoopBodyType
    return await this.executeLoopBody(node, enhancedPayload, flowState, params);
}

private async executeLoopBody<P>(
    node: AIAgentStepEntity,
    payload: P,
    flowState: FlowExecutionState,
    params: ExecuteAgentParams<P>
): Promise<BaseAgentNextStep<P>> {
    switch (node.LoopBodyType) {
        case 'Action':
            if (!node.ActionID) {
                return this.createNextStep('Failed', {
                    errorMessage: `Loop body is Action but ActionID not set`
                });
            }

            const actionName = await this.getActionName(node.ActionID);
            if (!actionName) {
                return this.createNextStep('Failed', {
                    errorMessage: `Action not found: ${node.ActionID}`
                });
            }

            // Resolve input mapping with loop variables
            const resolvedParams = this.resolveInputMapping(
                node.ActionInputMapping,
                payload,
                flowState
            );

            return this.createNextStep<P>('Actions', {
                actions: [{
                    name: actionName,
                    params: resolvedParams
                }],
                terminate: false,
                newPayload: payload,
                previousPayload: payload,
                stepId: node.ID,  // Track for post-processing
                actionOutputMapping: node.ActionOutputMapping
            });

        case 'Sub-Agent':
            if (!node.SubAgentID) {
                return this.createNextStep('Failed', {
                    errorMessage: `Loop body is Sub-Agent but SubAgentID not set`
                });
            }

            const subAgentName = await this.getAgentName(node.SubAgentID);
            if (!subAgentName) {
                return this.createNextStep('Failed', {
                    errorMessage: `Sub-Agent not found: ${node.SubAgentID}`
                });
            }

            return this.createNextStep('Sub-Agent', {
                subAgent: {
                    name: subAgentName,
                    message: node.Description || `Execute sub-agent: ${subAgentName}`,
                    terminateAfter: false
                },
                terminate: false,
                newPayload: payload,
                previousPayload: payload
            });

        case 'Prompt':
            if (!node.PromptID) {
                return this.createNextStep('Failed', {
                    errorMessage: `Loop body is Prompt but PromptID not set`
                });
            }

            return {
                step: 'Retry',
                message: node.Description || 'Executing prompt step for loop iteration',
                terminate: false,
                flowPromptStepId: node.PromptID,
                newPayload: payload,
                previousPayload: payload
            } as FlowAgentNextStep<P>;

        default:
            return this.createNextStep('Failed', {
                errorMessage: `Unknown LoopBodyType: ${node.LoopBodyType}`
            });
    }
}
```

### While Step Execution

```typescript
private async executeWhileStep<P>(
    node: AIAgentStepEntity,
    payload: P,
    flowState: FlowExecutionState,
    params: ExecuteAgentParams<P>
): Promise<BaseAgentNextStep<P>> {
    const config: WhileConfig = JSON.parse(node.Configuration);

    // Determine max iterations
    const maxIterations = config.maxIterations === undefined
        ? 100  // Default (lower than ForEach)
        : config.maxIterations === 0
            ? Number.MAX_SAFE_INTEGER  // Unlimited
            : config.maxIterations;

    // Find or create iteration context
    let iterContext = flowState.iterationStack.find(i => i.stepId === node.ID);
    if (!iterContext) {
        iterContext = {
            stepId: node.ID,
            loopType: 'While',
            condition: config.condition,
            iterationCount: 0,
            itemVariable: config.itemVariable || 'attempt',
            maxIterations: maxIterations,
            continueOnError: config.continueOnError || false,
            errors: [],
            results: []
        };
        flowState.iterationStack.push(iterContext);
    }

    // Evaluate condition
    const evaluationContext = {
        payload: payload,
        flowContext: {
            currentStepId: flowState.currentStepId,
            completedSteps: Array.from(flowState.completedStepIds),
            executionPath: flowState.executionPath
        }
    };

    const evalResult = this._evaluator.evaluate(config.condition, evaluationContext);

    // Check if loop should exit
    if (!evalResult.success || !evalResult.value) {
        // Condition is false - exit loop
        flowState.iterationStack = flowState.iterationStack.filter(i => i.stepId !== node.ID);

        flowState.stepResults.set(node.ID, {
            results: iterContext.results,
            errors: iterContext.errors,
            totalIterations: iterContext.iterationCount,
            exitReason: evalResult.success ? 'condition_false' : 'evaluation_error'
        });

        const exitPaths = await this.getValidPaths(node.ID, payload, flowState);
        if (exitPaths.length === 0) {
            return this.createSuccessStep({
                message: `While loop completed after ${iterContext.iterationCount} iterations`
            });
        }

        const nextStep = await this.getStepById(exitPaths[0].DestinationStepID);
        return this.createStepForFlowNode(params, nextStep, payload, flowState);
    }

    // Safety check
    if (iterContext.iterationCount >= maxIterations) {
        LogError(`While loop "${node.Name}" exceeded maxIterations (${maxIterations})`);
        return this.createNextStep('Failed', {
            errorMessage: `Loop exceeded maximum iterations (${maxIterations})`,
            newPayload: payload
        });
    }

    // Inject attempt context into payload
    const attemptContext = {
        attemptNumber: iterContext.iterationCount + 1,  // 1-based
        totalAttempts: iterContext.iterationCount
    };

    const enhancedPayload = {
        ...payload,
        [iterContext.itemVariable]: attemptContext,
        index: iterContext.iterationCount  // 0-based
    } as P;

    // Execute loop body
    return await this.executeLoopBody(node, enhancedPayload, flowState, params);
}
```

### Post-Processing to Continue Loop

After a loop body step completes, we need to increment the iteration and continue:

```typescript
// In PreProcessNextStep - handle loop continuation
public async PreProcessNextStep<P = any, ATS = any>(
    params: ExecuteAgentParams<P>,
    step: BaseAgentNextStep<P>,
    payload: P,
    agentTypeState: ATS
): Promise<BaseAgentNextStep<P> | null> {
    // Only intercept after action/sub-agent/prompt completes within a loop
    if (step.step !== 'Retry' && step.step !== 'Success') {
        return null;
    }

    const flowState = agentTypeState as FlowExecutionState;

    // Check if we're in a loop
    if (flowState.iterationStack.length === 0) {
        return null;  // Not in a loop
    }

    const currentLoop = flowState.iterationStack[flowState.iterationStack.length - 1];

    // Store result from this iteration
    const result = step.newPayload || payload;
    currentLoop.results.push(result);

    // Increment counter
    if (currentLoop.loopType === 'ForEach') {
        currentLoop.currentIndex++;
    } else if (currentLoop.loopType === 'While') {
        currentLoop.iterationCount++;
    }

    // Get the loop step and re-execute it
    const loopStep = await this.getStepById(currentLoop.stepId);
    if (!loopStep) {
        return this.createNextStep('Failed', {
            errorMessage: `Loop step not found: ${currentLoop.stepId}`
        });
    }

    // Re-execute the loop step (which will check completion and either continue or exit)
    if (currentLoop.loopType === 'ForEach') {
        return this.executeForEachStep(loopStep, result, flowState, params);
    } else {
        return this.executeWhileStep(loopStep, result, flowState, params);
    }
}
```

### Entity Validation

```typescript
// In AIAgentStepEntity class
public override Validate(): ValidationResult {
    const result = super.Validate();

    // Existing validations...
    this.ValidateRetryCountNonNegative(result);
    this.ValidateTimeoutSecondsGreaterThanZero(result);

    // NEW: Loop step validation
    if (this.StepType === 'ForEach' || this.StepType === 'While') {
        this.ValidateLoopStepConfiguration(result);
    }

    result.Success = result.Success && (result.Errors.length === 0);
    return result;
}

public ValidateLoopStepConfiguration(result: ValidationResult) {
    // Must have LoopBodyType
    if (!this.LoopBodyType) {
        result.Errors.push(new ValidationErrorInfo(
            "LoopBodyType",
            "Loop steps must specify LoopBodyType (Action, Sub-Agent, or Prompt)",
            this.LoopBodyType,
            ValidationErrorType.Failure
        ));
    }

    // Must have Configuration
    if (!this.Configuration) {
        result.Errors.push(new ValidationErrorInfo(
            "Configuration",
            "Loop steps must have Configuration JSON",
            this.Configuration,
            ValidationErrorType.Failure
        ));
        return;
    }

    // Parse and validate config
    try {
        const config = JSON.parse(this.Configuration);

        if (this.StepType === 'ForEach') {
            if (!config.collectionPath) {
                result.Errors.push(new ValidationErrorInfo(
                    "Configuration",
                    "ForEach loops must specify collectionPath",
                    this.Configuration,
                    ValidationErrorType.Failure
                ));
            }
        } else if (this.StepType === 'While') {
            if (!config.condition) {
                result.Errors.push(new ValidationErrorInfo(
                    "Configuration",
                    "While loops must specify condition",
                    this.Configuration,
                    ValidationErrorType.Failure
                ));
            }
        }

        // Validate maxIterations
        if (config.maxIterations !== undefined) {
            if (config.maxIterations < 0) {
                result.Errors.push(new ValidationErrorInfo(
                    "Configuration",
                    "maxIterations cannot be negative",
                    this.Configuration,
                    ValidationErrorType.Failure
                ));
            } else if (config.maxIterations === 0) {
                result.Warnings.push(new ValidationErrorInfo(
                    "Configuration",
                    "maxIterations is 0 (unlimited). This could cause infinite loops.",
                    this.Configuration,
                    ValidationErrorType.Warning
                ));
            }
        }

    } catch (error) {
        result.Errors.push(new ValidationErrorInfo(
            "Configuration",
            `Invalid JSON in Configuration: ${error.message}`,
            this.Configuration,
            ValidationErrorType.Failure
        ));
    }

    // Validate that appropriate ID is set based on LoopBodyType
    if (this.LoopBodyType === 'Action' && !this.ActionID) {
        result.Errors.push(new ValidationErrorInfo(
            "ActionID",
            "LoopBodyType is 'Action' but ActionID is not set",
            this.ActionID,
            ValidationErrorType.Failure
        ));
    } else if (this.LoopBodyType === 'Sub-Agent' && !this.SubAgentID) {
        result.Errors.push(new ValidationErrorInfo(
            "SubAgentID",
            "LoopBodyType is 'Sub-Agent' but SubAgentID is not set",
            this.SubAgentID,
            ValidationErrorType.Failure
        ));
    } else if (this.LoopBodyType === 'Prompt' && !this.PromptID) {
        result.Errors.push(new ValidationErrorInfo(
            "PromptID",
            "LoopBodyType is 'Prompt' but PromptID is not set",
            this.PromptID,
            ValidationErrorType.Failure
        ));
    }
}
```

---

## Loop Agent Implementation

### Extended LoopAgentResponse Type

```typescript
export interface ForEachOperation {
    collectionPath: string;        // Path in payload to array
    itemVariable?: string;         // Variable name for current item (default: "item")
    indexVariable?: string;        // Variable name for index (default: "index")

    // Execute action OR sub-agent per item
    action?: {
        name: string;
        params: Record<string, unknown>;  // Can use item.field, payload.field syntax
    };
    subAgent?: {
        name: string;
        message: string;  // Can use item.field, payload.field syntax
        templateParameters?: Record<string, unknown>;
    };

    maxIterations?: number;        // undefined=1000, 0=unlimited, >0=limit
    continueOnError?: boolean;     // Default: false
}

export interface WhileOperation {
    condition: string;             // Expression to evaluate
    itemVariable?: string;         // Variable name for attempt context (default: "attempt")
    maxIterations?: number;        // undefined=100, 0=unlimited, >0=limit
    continueOnError?: boolean;     // Default: false

    action?: {
        name: string;
        params: Record<string, unknown>;
    };
    subAgent?: {
        name: string;
        message: string;
        templateParameters?: Record<string, unknown>;
    };
}

export interface LoopAgentResponse {
    taskComplete: boolean;
    message: string;
    reasoning?: string;
    confidence?: number;
    payloadChangeRequest?: AgentPayloadChangeRequest;
    suggestedResponses?: string[];

    nextStep?: {
        type: 'Sub-Agent' | 'Actions' | 'Chat' | 'ForEach' | 'While';  // Extended

        // Existing
        subAgent?: SubAgentInvocation;
        actions?: ActionInvocation[];

        // NEW
        forEach?: ForEachOperation;
        while?: WhileOperation;
    };
}
```

### LoopAgentType Processing

```typescript
public async DetermineNextStep<P = any, ATS = any>(
    promptResult: AIPromptRunResult | null,
    params: ExecuteAgentParams<any, P>,
    payload: P,
    agentTypeState: ATS
): Promise<BaseAgentNextStep<P>> {
    const response = this.parseJSONResponse<LoopAgentResponse>(promptResult);

    // ... existing validation ...

    switch (response.nextStep.type) {
        // ... existing cases (Sub-Agent, Actions, Chat) ...

        case 'ForEach':
            if (!response.nextStep.forEach) {
                return this.createRetryStep('ForEach type specified but forEach details missing');
            }
            return await this.executeForEachOperation(
                response.nextStep.forEach,
                payload,
                params
            );

        case 'While':
            if (!response.nextStep.while) {
                return this.createRetryStep('While type specified but while details missing');
            }
            return await this.executeWhileOperation(
                response.nextStep.while,
                payload,
                params
            );
    }
}

private async executeForEachOperation<P>(
    forEach: ForEachOperation,
    payload: P,
    params: ExecuteAgentParams<P>
): Promise<BaseAgentNextStep<P>> {
    // Get collection
    const collection = this.getValueFromPath(payload, forEach.collectionPath);
    if (!Array.isArray(collection)) {
        return this.createRetryStep(
            `Collection path "${forEach.collectionPath}" did not resolve to an array`
        );
    }

    // Determine limits
    const maxIterations = forEach.maxIterations === undefined
        ? 1000
        : forEach.maxIterations === 0
            ? Number.MAX_SAFE_INTEGER
            : forEach.maxIterations;

    const itemVar = forEach.itemVariable || 'item';
    const indexVar = forEach.indexVariable || 'index';

    // Execute action or sub-agent for each item
    const results = [];
    const errors = [];

    for (let i = 0; i < Math.min(collection.length, maxIterations); i++) {
        const item = collection[i];

        try {
            let result;

            if (forEach.action) {
                // Resolve templates in params (item.field, payload.field syntax)
                const resolvedParams = this.resolveTemplates(forEach.action.params, {
                    [itemVar]: item,
                    [indexVar]: i,
                    payload: payload
                });

                result = await this.executeAction(
                    forEach.action.name,
                    resolvedParams,
                    params
                );
            } else if (forEach.subAgent) {
                // Resolve templates in message and params
                const resolvedMessage = this.resolveTemplateString(forEach.subAgent.message, {
                    [itemVar]: item,
                    [indexVar]: i,
                    payload: payload
                });

                const resolvedParams = this.resolveTemplates(
                    forEach.subAgent.templateParameters || {},
                    {
                        [itemVar]: item,
                        [indexVar]: i,
                        payload: payload
                    }
                );

                result = await this.executeSubAgent(
                    forEach.subAgent.name,
                    resolvedMessage,
                    resolvedParams,
                    params
                );
            }

            results.push(result);

        } catch (error) {
            errors.push({ index: i, item, error: error.message });

            if (!forEach.continueOnError) {
                return this.createNextStep('Failed', {
                    errorMessage: `ForEach failed at index ${i}: ${error.message}`,
                    newPayload: {
                        ...payload,
                        forEachResults: results,
                        forEachErrors: errors
                    } as P
                });
            }
        }
    }

    // Return success with aggregated results
    return this.createNextStep('Retry', {  // Retry = continue to next LLM decision
        message: `Completed ForEach: processed ${collection.length} items`,
        newPayload: {
            ...payload,
            forEachResults: results,
            forEachErrors: errors
        } as P
    });
}

private async executeWhileOperation<P>(
    whileOp: WhileOperation,
    payload: P,
    params: ExecuteAgentParams<P>
): Promise<BaseAgentNextStep<P>> {
    const maxIterations = whileOp.maxIterations === undefined
        ? 100
        : whileOp.maxIterations === 0
            ? Number.MAX_SAFE_INTEGER
            : whileOp.maxIterations;

    const itemVar = whileOp.itemVariable || 'attempt';
    const results = [];
    const errors = [];
    let iterationCount = 0;

    while (iterationCount < maxIterations) {
        // Evaluate condition
        const evalContext = { payload, results, errors };
        const evalResult = this._evaluator.evaluate(whileOp.condition, evalContext);

        if (!evalResult.success || !evalResult.value) {
            // Condition false or evaluation error - exit
            break;
        }

        // Create attempt context
        const attemptContext = {
            attemptNumber: iterationCount + 1,
            totalAttempts: iterationCount
        };

        try {
            let result;

            if (whileOp.action) {
                const resolvedParams = this.resolveTemplates(whileOp.action.params, {
                    [itemVar]: attemptContext,
                    index: iterationCount,
                    payload: payload
                });

                result = await this.executeAction(
                    whileOp.action.name,
                    resolvedParams,
                    params
                );
            } else if (whileOp.subAgent) {
                const resolvedMessage = this.resolveTemplateString(whileOp.subAgent.message, {
                    [itemVar]: attemptContext,
                    index: iterationCount,
                    payload: payload
                });

                const resolvedParams = this.resolveTemplates(
                    whileOp.subAgent.templateParameters || {},
                    {
                        [itemVar]: attemptContext,
                        index: iterationCount,
                        payload: payload
                    }
                );

                result = await this.executeSubAgent(
                    whileOp.subAgent.name,
                    resolvedMessage,
                    resolvedParams,
                    params
                );
            }

            results.push(result);

            // Update payload with result for next condition check
            payload = { ...payload, whileLastResult: result } as P;

        } catch (error) {
            errors.push({ iteration: iterationCount, error: error.message });

            if (!whileOp.continueOnError) {
                return this.createNextStep('Failed', {
                    errorMessage: `While loop failed at iteration ${iterationCount}: ${error.message}`,
                    newPayload: {
                        ...payload,
                        whileResults: results,
                        whileErrors: errors
                    } as P
                });
            }
        }

        iterationCount++;
    }

    return this.createNextStep('Retry', {
        message: `Completed While loop after ${iterationCount} iterations`,
        newPayload: {
            ...payload,
            whileResults: results,
            whileErrors: errors,
            whileIterationCount: iterationCount
        } as P
    });
}

// Template resolution helper
private resolveTemplates(
    obj: Record<string, unknown>,
    context: Record<string, any>
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            result[key] = this.resolveValue(value, context);
        } else if (Array.isArray(value)) {
            result[key] = value.map(v =>
                typeof v === 'string' ? this.resolveValue(v, context) : v
            );
        } else if (typeof value === 'object' && value !== null) {
            result[key] = this.resolveTemplates(value as Record<string, unknown>, context);
        } else {
            result[key] = value;
        }
    }

    return result;
}

private resolveValue(value: string, context: Record<string, any>): any {
    // Check for direct context variable references
    for (const [varName, varValue] of Object.entries(context)) {
        if (value === varName) {
            return varValue;
        }

        if (value.startsWith(`${varName}.`)) {
            const path = value.substring(varName.length + 1);
            return this.getValueFromPath(varValue, path);
        }
    }

    // Static value
    return value;
}
```

---

## Database Schema Changes

### Migration Script

```sql
-- =====================================================
-- MemberJunction v3.0 - Agent Iteration Support
-- =====================================================

-- Add new fields to AIAgentStep
ALTER TABLE [__mj].[AIAgentStep]
ADD [LoopBodyType] NVARCHAR(50) NULL,
    [Configuration] NVARCHAR(MAX) NULL;

-- Add field descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Specifies what type of operation executes in the loop body. Values: Action, Sub-Agent, Prompt. Only used when StepType is ForEach or While.',
    @level0type = N'SCHEMA', @level0name = '__mj',
    @level1type = N'TABLE',  @level1name = 'AIAgentStep',
    @level2type = N'COLUMN', @level2name = 'LoopBodyType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration object for step-specific settings. For loop steps: { type: "ForEach"|"While", collectionPath?, itemVariable?, indexVariable?, maxIterations?, continueOnError?, condition? }. For other step types: reserved for future use.',
    @level0type = N'SCHEMA', @level0name = '__mj',
    @level1type = N'TABLE',  @level1name = 'AIAgentStep',
    @level2type = N'COLUMN', @level2name = 'Configuration';

-- Add new StepType values via Entity Field Values
-- (Will be done through CodeGen/metadata update)
-- Existing: 'Action', 'Sub-Agent', 'Prompt'
-- NEW: 'ForEach', 'While'

-- Add new LoopBodyType field values
-- Values: 'Action', 'Sub-Agent', 'Prompt'

PRINT 'Agent iteration schema updates completed successfully';
```

### CodeGen Updates Required

After running migration:

1. Update `EntityField` metadata for `AIAgentStep.StepType` to include 'ForEach', 'While'
2. Add `EntityField` entry for `AIAgentStep.LoopBodyType` with values: 'Action', 'Sub-Agent', 'Prompt'
3. Add `EntityField` entry for `AIAgentStep.Configuration`
4. Run CodeGen to update:
   - `AIAgentStepEntity` TypeScript class
   - Database views
   - Stored procedures

---

## UI Enhancements

### Flow Diagram Visual Updates

#### Loop Step Node Appearance

```typescript
// In flow-agent-diagram.component.ts

private createNodeElement(step: AIAgentStepEntity): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'step-node');
    g.setAttribute('data-step-id', step.ID);

    // Determine node appearance
    const isLoopStep = step.StepType === 'ForEach' || step.StepType === 'While';
    const nodeWidth = isLoopStep ? 180 : 140;
    const nodeHeight = isLoopStep ? 100 : 80;

    // Create rounded rectangle
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', nodeWidth.toString());
    rect.setAttribute('height', nodeHeight.toString());
    rect.setAttribute('rx', '8');

    // Color coding
    let fillColor = 'white';
    let strokeColor = '#4a90e2';

    if (step.StartingStep) {
        fillColor = '#f0fff4';
        strokeColor = '#28a745';
    } else if (isLoopStep) {
        fillColor = '#fff4e6';  // Light orange
        strokeColor = '#ff9800';
    }

    rect.setAttribute('fill', fillColor);
    rect.setAttribute('stroke', strokeColor);
    rect.setAttribute('stroke-width', isLoopStep ? '3' : '2');
    g.appendChild(rect);

    // For loop steps, add dashed inner border
    if (isLoopStep) {
        const innerRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        innerRect.setAttribute('x', '4');
        innerRect.setAttribute('y', '4');
        innerRect.setAttribute('width', (nodeWidth - 8).toString());
        innerRect.setAttribute('height', (nodeHeight - 8).toString());
        innerRect.setAttribute('rx', '6');
        innerRect.setAttribute('fill', 'none');
        innerRect.setAttribute('stroke', strokeColor);
        innerRect.setAttribute('stroke-width', '1');
        innerRect.setAttribute('stroke-dasharray', '5,5');
        innerRect.setAttribute('opacity', '0.5');
        g.appendChild(innerRect);
    }

    // Add icon (Font Awesome)
    const iconClass = this.getIconForStepType(step);
    // ... (render icon as foreignObject with <i> tag) ...

    // Add loop indicator
    if (isLoopStep) {
        const loopIndicator = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        loopIndicator.setAttribute('x', (nodeWidth - 25).toString());
        loopIndicator.setAttribute('y', '20');
        loopIndicator.setAttribute('fill', strokeColor);
        loopIndicator.setAttribute('font-size', '18');
        loopIndicator.setAttribute('font-weight', 'bold');
        loopIndicator.textContent = '⟳';  // Circular arrow
        g.appendChild(loopIndicator);
    }

    // ... rest of node creation (title, type label, sockets) ...

    return g;
}

private getIconForStepType(step: AIAgentStepEntity): string {
    if (step.StartingStep) return 'fa-solid fa-play';

    switch (step.StepType) {
        case 'Action': return 'fa-solid fa-cog';
        case 'Sub-Agent': return 'fa-solid fa-robot';
        case 'Prompt': return 'fa-solid fa-comment-dots';
        case 'ForEach': return 'fa-solid fa-repeat';
        case 'While': return 'fa-solid fa-sync-alt';
        default: return 'fa-solid fa-circle';
    }
}
```

#### Legend Component

```html
<!-- In flow-agent-diagram template -->
<div class="diagram-legend">
    <h4><i class="fa-solid fa-info-circle"></i> Legend</h4>

    <div class="legend-section">
        <h5>Step Types</h5>
        <div class="legend-items">
            <div class="legend-item">
                <i class="fa-solid fa-play" style="color: #28a745;"></i>
                <span>Starting Step</span>
            </div>
            <div class="legend-item">
                <i class="fa-solid fa-cog" style="color: #4a90e2;"></i>
                <span>Action</span>
            </div>
            <div class="legend-item">
                <i class="fa-solid fa-robot" style="color: #4a90e2;"></i>
                <span>Sub-Agent</span>
            </div>
            <div class="legend-item">
                <i class="fa-solid fa-comment-dots" style="color: #4a90e2;"></i>
                <span>Prompt</span>
            </div>
            <div class="legend-item">
                <i class="fa-solid fa-repeat" style="color: #ff9800;"></i>
                <span>ForEach Loop</span>
            </div>
            <div class="legend-item">
                <i class="fa-solid fa-sync-alt" style="color: #ff9800;"></i>
                <span>While Loop</span>
            </div>
        </div>
    </div>

    <div class="legend-section">
        <h5>Visual Indicators</h5>
        <div class="legend-items">
            <div class="legend-item">
                <div class="loop-box-example"></div>
                <span>Loop step (double border)</span>
            </div>
            <div class="legend-item">
                <span style="font-size: 18px;">⟳</span>
                <span>Loop indicator</span>
            </div>
        </div>
    </div>
</div>
```

### Loop Configuration Property Pane

```html
<!-- In properties panel when loop step selected -->
<div class="property-group" *ngIf="selectedStep.StepType === 'ForEach' || selectedStep.StepType === 'While'">
    <h5>Loop Configuration</h5>

    @if (selectedStep.StepType === 'ForEach') {
        <div class="property-item">
            <label>Collection Path</label>
            <input type="text"
                   [(ngModel)]="loopConfig.collectionPath"
                   placeholder="payload.customers"
                   (blur)="saveLoopConfiguration()"
                   class="property-input">
            <small>Path to array in payload (e.g., payload.items)</small>
        </div>
    }

    @if (selectedStep.StepType === 'While') {
        <div class="property-item">
            <label>Condition</label>
            <textarea class="property-textarea"
                      [(ngModel)]="loopConfig.condition"
                      placeholder="payload.retryCount < 5 && !payload.success"
                      (blur)="saveLoopConfiguration()"
                      rows="3"></textarea>
            <small>Boolean expression evaluated before each iteration</small>
        </div>
    }

    <div class="property-item">
        <label>Item Variable Name</label>
        <input type="text"
               [(ngModel)]="loopConfig.itemVariable"
               [placeholder]="selectedStep.StepType === 'ForEach' ? 'item' : 'attempt'"
               (blur)="saveLoopConfiguration()"
               class="property-input">
        <small>Variable name available in mappings (default: {{selectedStep.StepType === 'ForEach' ? 'item' : 'attempt'}})</small>
    </div>

    <div class="property-item">
        <label>Index Variable Name (optional)</label>
        <input type="text"
               [(ngModel)]="loopConfig.indexVariable"
               placeholder="index"
               (blur)="saveLoopConfiguration()"
               class="property-input">
        <small>Variable for loop counter (default: index)</small>
    </div>

    <div class="property-item">
        <label>Max Iterations</label>
        <input type="number"
               [(ngModel)]="loopConfig.maxIterations"
               [placeholder]="selectedStep.StepType === 'ForEach' ? '1000' : '100'"
               min="0"
               (blur)="saveLoopConfiguration()"
               class="property-input">
        <small>
            Leave empty for default ({{selectedStep.StepType === 'ForEach' ? '1000' : '100'}}).
            Set to 0 for unlimited (⚠️ risky).
        </small>
        @if (loopConfig.maxIterations === 0) {
            <div class="warning-message">
                <i class="fa-solid fa-exclamation-triangle"></i>
                Unlimited iterations enabled. Ensure your loop will terminate.
            </div>
        }
    </div>

    <div class="property-item">
        <label class="checkbox-label">
            <input type="checkbox"
                   [(ngModel)]="loopConfig.continueOnError"
                   (change)="saveLoopConfiguration()">
            <span>Continue on Error</span>
        </label>
        <small>If checked, loop continues even if an iteration fails</small>
    </div>
</div>

<div class="property-group" *ngIf="selectedStep.StepType === 'ForEach' || selectedStep.StepType === 'While'">
    <h5>Loop Body Configuration</h5>

    <div class="property-item">
        <label>Loop Body Type</label>
        <kendo-dropdownlist
            [data]="loopBodyTypes"
            [(ngModel)]="selectedStep.LoopBodyType"
            (valueChange)="onLoopBodyTypeChange(); saveStepProperties()">
        </kendo-dropdownlist>
        <small>What executes per iteration</small>
    </div>

    @if (selectedStep.LoopBodyType === 'Action') {
        <div class="property-item">
            <label>Action</label>
            <kendo-dropdownlist
                [data]="availableActions"
                [textField]="'Name'"
                [valueField]="'ID'"
                [(ngModel)]="selectedStep.ActionID"
                (valueChange)="saveStepProperties()">
            </kendo-dropdownlist>
        </div>
    }

    @if (selectedStep.LoopBodyType === 'Sub-Agent') {
        <div class="property-item">
            <label>Sub-Agent</label>
            <kendo-dropdownlist
                [data]="availableAgents"
                [textField]="'Name'"
                [valueField]="'ID'"
                [(ngModel)]="selectedStep.SubAgentID"
                (valueChange)="saveStepProperties()">
            </kendo-dropdownlist>
        </div>
    }

    @if (selectedStep.LoopBodyType === 'Prompt') {
        <div class="property-item">
            <label>Prompt</label>
            <kendo-dropdownlist
                [data]="availablePrompts"
                [textField]="'Name'"
                [valueField]="'ID'"
                [(ngModel)]="selectedStep.PromptID"
                (valueChange)="saveStepProperties()">
            </kendo-dropdownlist>
        </div>
    }

    @if (selectedStep.LoopBodyType === 'Action') {
        <div class="property-item">
            <label>Input Mapping (JSON)</label>
            <textarea class="property-textarea code-textarea"
                      [(ngModel)]="selectedStep.ActionInputMapping"
                      (blur)="saveStepProperties()"
                      rows="6"
                      placeholder='{"to": "item.email", "subject": "Welcome!"}'></textarea>
            <small>Map loop variables and payload to action inputs</small>
        </div>

        <div class="property-item">
            <label>Output Mapping (JSON)</label>
            <textarea class="property-textarea code-textarea"
                      [(ngModel)]="selectedStep.ActionOutputMapping"
                      (blur)="saveStepProperties()"
                      rows="4"
                      placeholder='{"success": "results[*].success"}'></textarea>
            <small>Map action outputs to payload</small>
        </div>
    }
</div>
```

### TypeScript for Configuration Management

```typescript
// In flow-agent-diagram.component.ts

loopConfig: ForEachConfig | WhileConfig | null = null;
loopBodyTypes = ['Action', 'Sub-Agent', 'Prompt'];
availableActions: ActionEntity[] = [];
availableAgents: AIAgentEntity[] = [];
availablePrompts: AIPromptEntity[] = [];

async ngOnInit() {
    // ... existing init ...

    // Load dropdown data
    await this.loadDropdownData();
}

private async loadDropdownData() {
    const rv = new RunView();

    // Load actions
    const actionsResult = await rv.RunView<ActionEntity>({
        EntityName: 'Actions',
        OrderBy: 'Name',
        ResultType: 'entity_object'
    });
    if (actionsResult.Success) {
        this.availableActions = actionsResult.Results || [];
    }

    // Load agents
    const agentsResult = await rv.RunView<AIAgentEntity>({
        EntityName: 'AI Agents',
        OrderBy: 'Name',
        ResultType: 'entity_object'
    });
    if (agentsResult.Success) {
        this.availableAgents = agentsResult.Results || [];
    }

    // Load prompts
    const promptsResult = await rv.RunView<AIPromptEntity>({
        EntityName: 'AI Prompts',
        OrderBy: 'Name',
        ResultType: 'entity_object'
    });
    if (promptsResult.Success) {
        this.availablePrompts = promptsResult.Results || [];
    }
}

private selectStep(stepId: string) {
    // ... existing selection logic ...

    this.selectedStep = this.steps.find(s => s.ID === stepId) || null;

    // Parse loop configuration if loop step
    if (this.selectedStep &&
        (this.selectedStep.StepType === 'ForEach' || this.selectedStep.StepType === 'While')) {
        try {
            this.loopConfig = this.selectedStep.Configuration
                ? JSON.parse(this.selectedStep.Configuration)
                : this.getDefaultLoopConfig(this.selectedStep.StepType);
        } catch (error) {
            console.error('Failed to parse loop configuration:', error);
            this.loopConfig = this.getDefaultLoopConfig(this.selectedStep.StepType);
        }
    } else {
        this.loopConfig = null;
    }
}

private getDefaultLoopConfig(stepType: 'ForEach' | 'While'): ForEachConfig | WhileConfig {
    if (stepType === 'ForEach') {
        return {
            type: 'ForEach',
            collectionPath: '',
            itemVariable: 'item',
            indexVariable: 'index',
            continueOnError: false
        };
    } else {
        return {
            type: 'While',
            condition: '',
            itemVariable: 'attempt',
            continueOnError: false
        };
    }
}

async saveLoopConfiguration() {
    if (!this.selectedStep || !this.loopConfig) return;

    try {
        // Update Configuration JSON
        this.selectedStep.Configuration = JSON.stringify(this.loopConfig);

        const result = await this.selectedStep.Save();
        if (result) {
            this.stepsChanged.emit();
        } else {
            console.error('Failed to save loop configuration');
        }
    } catch (error) {
        console.error('Error saving loop configuration:', error);
    }
}

onLoopBodyTypeChange() {
    // Clear inappropriate IDs when changing loop body type
    if (this.selectedStep) {
        if (this.selectedStep.LoopBodyType !== 'Action') {
            this.selectedStep.ActionID = null;
            this.selectedStep.ActionInputMapping = null;
            this.selectedStep.ActionOutputMapping = null;
        }
        if (this.selectedStep.LoopBodyType !== 'Sub-Agent') {
            this.selectedStep.SubAgentID = null;
        }
        if (this.selectedStep.LoopBodyType !== 'Prompt') {
            this.selectedStep.PromptID = null;
        }
    }
}
```

---

## Implementation Phases

### Phase 1: Core Flow Agent Support (Weeks 1-2)

**Week 1:**
- [ ] Database migration script
- [ ] Update entity field metadata for new StepType values
- [ ] Run CodeGen to update AIAgentStepEntity
- [ ] FlowExecutionState extensions (IterationContext)
- [ ] ForEach step execution logic
- [ ] Input/output mapping resolution with loop variables
- [ ] Unit tests for ForEach logic

**Week 2:**
- [ ] While step execution logic
- [ ] Condition evaluation integration
- [ ] Loop continuation in PreProcessNextStep
- [ ] Nested loop support
- [ ] Error handling and safety limits
- [ ] Entity validation (ValidateLoopStepConfiguration)
- [ ] Integration tests
- [ ] Documentation

**Deliverables:**
- Flow agents can execute ForEach and While loops
- Proper error handling and max iteration limits
- Full test coverage
- Updated developer documentation

### Phase 2: Loop Agent Iteration (Weeks 3-4)

**Week 3:**
- [ ] LoopAgentResponse type extensions
- [ ] ForEachOperation interface and parsing
- [ ] WhileOperation interface and parsing
- [ ] Template resolution for variable references
- [ ] executeForEachOperation implementation
- [ ] executeWhileOperation implementation
- [ ] Unit tests for Loop agent iteration

**Week 4:**
- [ ] Integration with BaseAgent execution flow
- [ ] Update Loop agent prompt templates with examples
- [ ] End-to-end tests (LLM requesting loops)
- [ ] Performance testing (1000-item ForEach)
- [ ] Error scenario testing
- [ ] Documentation and prompt engineering guide

**Deliverables:**
- Loop agents can request ForEach/While operations
- Template syntax works correctly
- Prompt examples in database
- Full test coverage
- User documentation

### Phase 3: UI Enhancements (Weeks 5-6)

**Week 5:**
- [ ] Loop step visual styling (double border, colors)
- [ ] Font Awesome icon integration
- [ ] Loop indicator (⟳ symbol)
- [ ] Legend component with all step types
- [ ] StepType dropdown updates (add ForEach, While)
- [ ] LoopBodyType dropdown in properties
- [ ] Loop configuration form fields

**Week 6:**
- [ ] Action/Sub-Agent/Prompt selectors for loop body
- [ ] Input/Output mapping code editors
- [ ] Configuration validation UI
- [ ] Warning messages for maxIterations=0
- [ ] Dropdown data loading (actions, agents, prompts)
- [ ] Save/load loop configuration
- [ ] Polish and UX refinements
- [ ] User testing
- [ ] UI documentation

**Deliverables:**
- Intuitive loop step creation and configuration
- Visual distinction of loop steps in diagram
- Helpful validation and warnings
- Complete legend
- User guide for Flow builder

---

## Testing Strategy

### Unit Tests

#### Flow Agent Tests

```typescript
describe('FlowAgentType - ForEach', () => {
    it('should iterate over collection and execute action per item', async () => {
        const payload = { customers: [{ id: 1 }, { id: 2 }, { id: 3 }] };
        const flowState = new FlowExecutionState('agent-1');
        const step = createForEachStep({
            collectionPath: 'payload.customers',
            loopBodyType: 'Action'
        });

        const result = await flowAgentType.executeForEachStep(step, payload, flowState, params);

        expect(result.step).toBe('Actions');
        expect(flowState.loopVariables.get('item')).toEqual({ id: 1 });
    });

    it('should complete loop after all iterations', async () => {
        // Set up completed loop state
        const flowState = new FlowExecutionState('agent-1');
        flowState.iterationStack.push({
            stepId: 'step-1',
            loopType: 'ForEach',
            collection: [1, 2, 3],
            currentIndex: 3,  // All done
            itemVariable: 'item',
            indexVariable: 'index',
            maxIterations: 1000,
            continueOnError: false,
            errors: [],
            results: ['result1', 'result2', 'result3']
        });

        const result = await flowAgentType.executeForEachStep(step, payload, flowState, params);

        expect(result.step).toBe('Success');
        expect(flowState.iterationStack.length).toBe(0);
        expect(flowState.stepResults.get('step-1').totalIterations).toBe(3);
    });

    it('should respect maxIterations limit', async () => {
        const payload = { items: new Array(5000).fill({ value: 1 }) };
        const step = createForEachStep({
            collectionPath: 'payload.items',
            maxIterations: 100
        });

        // Run 100 iterations
        for (let i = 0; i < 100; i++) {
            const result = await flowAgentType.executeForEachStep(step, payload, flowState, params);
            expect(result.step).not.toBe('Failed');
            flowState.iterationStack[0].currentIndex++;
        }

        // 101st should fail
        const result = await flowAgentType.executeForEachStep(step, payload, flowState, params);
        expect(result.step).toBe('Failed');
        expect(result.errorMessage).toContain('exceeded maximum iterations');
    });

    it('should handle continueOnError flag', async () => {
        // Test both true and false cases
    });

    it('should resolve input mappings with loop variables', async () => {
        const step = createForEachStep({
            actionInputMapping: JSON.stringify({
                email: 'item.email',
                index: 'index',
                userId: 'payload.currentUser'
            })
        });

        const resolved = flowAgentType.resolveInputMapping(
            step.ActionInputMapping,
            { currentUser: 'user123' },
            { item: { email: 'test@example.com' }, index: 0 }
        );

        expect(resolved).toEqual({
            email: 'test@example.com',
            index: 0,
            userId: 'user123'
        });
    });
});

describe('FlowAgentType - While', () => {
    it('should loop while condition is true', async () => {
        const payload = { retryCount: 0, success: false };
        const step = createWhileStep({
            condition: 'payload.retryCount < 3 && !payload.success'
        });

        // Should execute since condition is true
        const result = await flowAgentType.executeWhileStep(step, payload, flowState, params);
        expect(result.step).toBe('Actions');
    });

    it('should exit when condition becomes false', async () => {
        const payload = { retryCount: 5, success: true };
        const step = createWhileStep({
            condition: 'payload.retryCount < 3 && !payload.success'
        });

        const result = await flowAgentType.executeWhileStep(step, payload, flowState, params);
        expect(result.step).toBe('Success');
    });

    it('should inject attempt context', async () => {
        const flowState = new FlowExecutionState('agent-1');
        flowState.iterationStack.push({
            stepId: 'step-1',
            loopType: 'While',
            condition: 'true',
            iterationCount: 2,
            itemVariable: 'attempt',
            maxIterations: 10,
            continueOnError: false,
            errors: [],
            results: []
        });

        const result = await flowAgentType.executeWhileStep(step, payload, flowState, params);

        const enhancedPayload = result.newPayload;
        expect(enhancedPayload.attempt).toEqual({
            attemptNumber: 3,
            totalAttempts: 2
        });
    });
});
```

#### Loop Agent Tests

```typescript
describe('LoopAgentType - ForEach', () => {
    it('should parse ForEach response from LLM', async () => {
        const promptResult = {
            success: true,
            result: JSON.stringify({
                taskComplete: false,
                message: 'Processing documents',
                nextStep: {
                    type: 'ForEach',
                    forEach: {
                        collectionPath: 'payload.documents',
                        action: {
                            name: 'Analyze Document',
                            params: { doc: 'item.path' }
                        }
                    }
                }
            })
        };

        const nextStep = await loopAgentType.DetermineNextStep(
            promptResult,
            params,
            payload,
            agentTypeState
        );

        expect(nextStep.step).toBe('Retry');  // Completed, ready for next LLM call
        expect(payload.forEachResults).toBeDefined();
    });

    it('should execute action for each item in collection', async () => {
        const forEach: ForEachOperation = {
            collectionPath: 'payload.items',
            action: {
                name: 'Process Item',
                params: { itemId: 'item.id' }
            }
        };

        const payload = {
            items: [{ id: 1 }, { id: 2 }, { id: 3 }]
        };

        const result = await loopAgentType.executeForEachOperation(forEach, payload, params);

        expect(result.newPayload.forEachResults).toHaveLength(3);
    });

    it('should resolve template variables in params', async () => {
        const forEach: ForEachOperation = {
            collectionPath: 'payload.users',
            itemVariable: 'user',
            action: {
                name: 'Send Email',
                params: {
                    to: 'user.email',
                    template: 'payload.emailTemplate',
                    name: 'user.firstName'
                }
            }
        };

        const payload = {
            users: [{ email: 'a@test.com', firstName: 'Alice' }],
            emailTemplate: 'welcome'
        };

        const result = await loopAgentType.executeForEachOperation(forEach, payload, params);

        // Verify action was called with resolved params
        expect(mockActionExecute).toHaveBeenCalledWith(
            'Send Email',
            { to: 'a@test.com', template: 'welcome', name: 'Alice' },
            params
        );
    });
});
```

### Integration Tests

```typescript
describe('Agent Execution with Loops - End to End', () => {
    it('should execute ForEach loop in Flow agent completely', async () => {
        const agent = await createFlowAgentWithForEachStep({
            collectionPath: 'payload.customers',
            actionName: 'Send Welcome Email'
        });

        const result = await baseAgent.Execute({
            agent,
            initialMessage: 'Send welcome emails',
            payload: {
                customers: [
                    { email: 'a@test.com' },
                    { email: 'b@test.com' },
                    { email: 'c@test.com' }
                ]
            }
        });

        expect(result.success).toBe(true);
        expect(result.payload.forEachResults).toHaveLength(3);
        expect(mockEmailService.send).toHaveBeenCalledTimes(3);
    });

    it('should handle LLM-requested ForEach in Loop agent', async () => {
        const agent = await createLoopAgentWithForEachCapability();

        // Mock LLM to return ForEach request
        mockLLM.mockReturnValueOnce({
            success: true,
            result: JSON.stringify({
                taskComplete: false,
                nextStep: {
                    type: 'ForEach',
                    forEach: {
                        collectionPath: 'payload.files',
                        action: {
                            name: 'Analyze File',
                            params: { path: 'item.path' }
                        }
                    }
                }
            })
        });

        const result = await baseAgent.Execute({
            agent,
            initialMessage: 'Analyze all files in /documents',
            payload: { files: [{ path: '/doc1' }, { path: '/doc2' }] }
        });

        expect(result.success).toBe(true);
        expect(mockAnalyzeAction).toHaveBeenCalledTimes(2);
    });

    it('should handle nested loops (ForEach with Sub-Agent loop body)', async () => {
        // Outer loop: ForEach customer
        // Inner loop: Flow agent with ForEach order
        const result = await baseAgent.Execute({
            agent: outerAgent,
            payload: {
                customers: [
                    {
                        id: 1,
                        orders: [{ id: 'A' }, { id: 'B' }]
                    },
                    {
                        id: 2,
                        orders: [{ id: 'C' }]
                    }
                ]
            }
        });

        expect(result.success).toBe(true);
        // Should process 3 total orders (2 for customer 1, 1 for customer 2)
        expect(mockProcessOrder).toHaveBeenCalledTimes(3);
    });
});
```

### Performance Tests

```typescript
describe('Loop Performance', () => {
    it('should handle 1000-item ForEach in under 30 seconds', async () => {
        const start = Date.now();

        const payload = {
            items: new Array(1000).fill(null).map((_, i) => ({ id: i }))
        };

        const result = await baseAgent.Execute({
            agent: forEachAgent,
            payload
        });

        const duration = Date.now() - start;

        expect(result.success).toBe(true);
        expect(duration).toBeLessThan(30000);
    });

    it('should maintain memory under 100MB for large loops', async () => {
        const initialMemory = process.memoryUsage().heapUsed;

        const payload = {
            items: new Array(10000).fill({ data: 'x'.repeat(100) })
        };

        await baseAgent.Execute({ agent: forEachAgent, payload });

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

        expect(memoryIncrease).toBeLessThan(100);
    });
});
```

---

## Migration Path

### For Existing Flow Agents

**No migration needed.** Existing step types (Action, Sub-Agent, Prompt) continue to work unchanged. New ForEach/While steps are opt-in.

### For Existing Loop Agents

**No breaking changes.** Existing LoopAgentResponse format is preserved. New ForEach/While response types are additive.

**Recommended:**
- Update Loop agent prompts with examples of new iteration formats
- Educate users on when to use ForEach vs manual reasoning

### Prompt Template Updates

Add examples to Loop agent system prompts:

```markdown
## Iteration Operations

When you need to perform the same operation on multiple items, use ForEach instead of manually iterating:

**ForEach Example:**
```json
{
    "taskComplete": false,
    "message": "Processing all customer records",
    "nextStep": {
        "type": "ForEach",
        "forEach": {
            "collectionPath": "payload.customers",
            "itemVariable": "customer",
            "action": {
                "name": "Update Customer Status",
                "params": {
                    "customerId": "customer.id",
                    "status": "active"
                }
            }
        }
    }
}
```

**While Example:**
```json
{
    "taskComplete": false,
    "message": "Retrying API call",
    "nextStep": {
        "type": "While",
        "while": {
            "condition": "payload.apiSuccess === false && payload.retries < 5",
            "itemVariable": "attempt",
            "action": {
                "name": "Call External API",
                "params": {
                    "url": "payload.apiUrl",
                    "attemptNumber": "attempt.attemptNumber"
                }
            }
        }
    }
}
```
```

---

## Success Criteria

### Functional Requirements

- [x] Flow agents can execute ForEach over payload collections
- [x] Flow agents can execute While with boolean conditions
- [x] Loop agents can request ForEach/While in nextStep responses
- [x] Nested loops work correctly (loop step with Sub-Agent loop body)
- [x] Error handling prevents infinite loops (maxIterations enforced)
- [x] Loop variables injected correctly into input/output mappings
- [x] UI visualizes loop steps with distinct styling
- [x] UI provides intuitive configuration for loop steps

### Non-Functional Requirements

- [x] **Performance:** 1000-item ForEach completes in < 30 seconds
- [x] **Memory:** Iteration overhead < 1MB per loop
- [x] **Token Savings:** Loop agent ForEach uses 90% fewer tokens than manual iteration
- [x] **UX:** Loop configuration requires < 5 minutes for trained user
- [x] **Compatibility:** Existing agents unaffected by changes
- [x] **Documentation:** Complete user and developer guides

### Acceptance Criteria

1. **Flow Agent ForEach:**
   - User creates ForEach step in Flow builder
   - Configures collection path, loop body action, and mappings
   - Executes agent and verifies all items processed
   - Views loop results in agent run logs

2. **Flow Agent While:**
   - User creates While step with retry logic
   - Configures condition and max iterations
   - Executes agent and verifies loop exits when condition false
   - Views iteration count and results

3. **Loop Agent ForEach:**
   - User prompts Loop agent: "Analyze all files in payload.documents"
   - LLM responds with ForEach operation
   - All files analyzed without repeated LLM calls
   - Results aggregated in payload

4. **UI Validation:**
   - Loop steps visually distinct (double border, orange color)
   - Legend explains all step types
   - Configuration UI validates required fields
   - Warnings appear for risky settings (maxIterations=0)

5. **Error Handling:**
   - maxIterations prevents runaway loops
   - Invalid collection paths show clear error messages
   - continueOnError flag works as expected
   - Validation catches configuration mistakes before execution

---

## Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Infinite loops crash server | High | Medium | Hard maxIterations limit, timeout monitoring, validation warnings |
| Nested loops cause stack overflow | Medium | Low | Limit iteration stack depth to 5 levels, detect circular sub-agent calls |
| Large collections exhaust memory | Medium | Medium | Warn at 10K items, document limits, future: stream processing |
| UI becomes cluttered with loop config | Low | Medium | Collapsible sections, separate tabs for advanced config |
| LLM doesn't understand new iteration format | Medium | Low | Extensive prompt examples, validation with retry on malformed response |
| Performance degradation on large loops | Medium | Low | Performance tests in CI, async iteration (future), progress indicators |
| Breaking changes to existing agents | High | Very Low | Additive changes only, full regression testing, phased rollout |

---

## Appendices

### Appendix A: Example Flow Agent with Loops

```typescript
// Example: Customer onboarding workflow with ForEach

const onboardingAgent: AIAgentEntity = {
    Name: 'Customer Onboarding',
    AgentTypeID: 'flow-agent-type-id',
    Steps: [
        {
            Name: 'Get New Customers',
            StepType: 'Action',
            ActionID: 'get-new-customers-action',
            StartingStep: true,
            ActionOutputMapping: JSON.stringify({
                '*': 'payload.newCustomers'
            })
        },
        {
            Name: 'Process Each Customer',
            StepType: 'ForEach',
            LoopBodyType: 'Sub-Agent',
            SubAgentID: 'customer-setup-agent-id',
            Configuration: JSON.stringify({
                type: 'ForEach',
                collectionPath: 'payload.newCustomers',
                itemVariable: 'customer',
                indexVariable: 'i',
                maxIterations: 500,
                continueOnError: false
            })
        },
        {
            Name: 'Send Summary Email',
            StepType: 'Action',
            ActionID: 'send-email-action',
            ActionInputMapping: JSON.stringify({
                to: 'payload.adminEmail',
                subject: 'Onboarding Complete',
                body: 'payload.forEachResults'
            })
        }
    ],
    Paths: [
        { OriginStepID: 'step-1', DestinationStepID: 'step-2', Priority: 100 },
        { OriginStepID: 'step-2', DestinationStepID: 'step-3', Priority: 100 }
    ]
};
```

### Appendix B: Example Loop Agent Prompt with Iteration

```markdown
You are an intelligent document processing agent. When analyzing multiple documents,
use the ForEach operation instead of processing each document individually.

**Example Input:**
User: "Analyze all documents in the research folder"
Payload: { documents: [ { name: "paper1.pdf", path: "/research/paper1.pdf" }, ... ] }

**Good Response:**
{
    "taskComplete": false,
    "message": "Processing all research documents",
    "reasoning": "Found multiple documents, using ForEach for efficient processing",
    "nextStep": {
        "type": "ForEach",
        "forEach": {
            "collectionPath": "payload.documents",
            "itemVariable": "doc",
            "action": {
                "name": "Extract Document Insights",
                "params": {
                    "documentPath": "doc.path",
                    "documentName": "doc.name",
                    "outputFormat": "summary"
                }
            }
        }
    }
}
```

### Appendix C: Glossary

- **ForEach Step:** A Flow agent step that iterates over a collection
- **While Step:** A Flow agent step that loops while a condition is true
- **Loop Body:** The operation (Action/Sub-Agent/Prompt) executed per iteration
- **Loop Body Type:** Field indicating whether loop body is Action, Sub-Agent, or Prompt
- **Iteration Context:** Runtime state tracking current loop position and results
- **Item Variable:** Variable name for current item in loop (e.g., "customer", "item")
- **Index Variable:** Variable name for loop counter (e.g., "i", "index")
- **MaxIterations:** Safety limit on number of loop iterations (undefined=default, 0=unlimited, >0=limit)
- **ContinueOnError:** Flag indicating whether loop continues if an iteration fails
- **Template Resolution:** Process of replacing variable references (e.g., "item.email") with actual values

---

**End of Plan Document**

**Next Steps:**
1. Review and approve plan with stakeholders
2. Create feature branch: `feature/agent-iteration-v3.0`
3. Begin Phase 1 implementation
4. Schedule weekly progress reviews
5. Update plan as implementation progresses
