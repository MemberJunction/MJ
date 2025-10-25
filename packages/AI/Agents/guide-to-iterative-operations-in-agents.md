# Guide to Iterative Operations in MemberJunction Agents

**Version:** 2.112.0+
**Last Updated:** January 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Flow Agent Iterations](#flow-agent-iterations)
3. [Loop Agent Iterations](#loop-agent-iterations)
4. [Configuration Reference](#configuration-reference)
5. [Variable Resolution](#variable-resolution)
6. [Best Practices](#best-practices)
7. [Examples](#examples)
8. [Troubleshooting](#troubleshooting)

---

## Overview

MemberJunction agents support native iteration constructs for processing collections and implementing retry logic. Both **Flow Agents** (deterministic workflows) and **Loop Agents** (LLM-driven) can leverage ForEach and While loops.

### When to Use Iterations

✅ **Use ForEach when:**
- Processing multiple items with the same operation
- Sending bulk emails, notifications, or updates
- Analyzing multiple files or documents
- Batch data transformations

✅ **Use While when:**
- Implementing retry logic with conditions
- Polling until a condition is met
- Incremental processing with exit criteria
- Conditional workflows based on state

### Benefits

- **90% token reduction** for Loop agents (no repeated LLM inference)
- **Deterministic execution** in Flow agents
- **Type-safe loop variables** injected into payload
- **Built-in safety limits** prevent infinite loops
- **Error handling** with continue-on-error support

---

## Flow Agent Iterations

Flow agents use **loop step types** that are part of the workflow graph.

### ForEach Steps

A ForEach step iterates over a collection in the payload, executing a loop body (Action, Sub-Agent, or Prompt) for each item.

#### Configuration

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

#### Field Setup

When creating a ForEach step in the database or UI:

1. **StepType:** `'ForEach'`
2. **LoopBodyType:** `'Action'`, `'Sub-Agent'`, or `'Prompt'`
3. **ActionID/SubAgentID/PromptID:** Set based on LoopBodyType
4. **Configuration:** JSON configuration (above)
5. **ActionInputMapping:** Map loop variables to inputs
6. **ActionOutputMapping:** Collect results

#### Example: Send Email to Each Customer

```typescript
const forEachStep = await md.GetEntityObject<AIAgentStepEntity>('MJ: AI Agent Steps');
forEachStep.AgentID = agentId;
forEachStep.Name = 'Send Welcome Emails';
forEachStep.StepType = 'ForEach';
forEachStep.LoopBodyType = 'Action';
forEachStep.ActionID = sendEmailActionId;

forEachStep.Configuration = JSON.stringify({
    type: 'ForEach',
    collectionPath: 'payload.newCustomers',
    itemVariable: 'customer',
    indexVariable: 'i',
    maxIterations: 500
});

forEachStep.ActionInputMapping = JSON.stringify({
    to: 'customer.email',
    subject: 'Welcome to our service!',
    customerName: 'customer.firstName',
    position: 'i'  // Index for "You are customer #5"
});

forEachStep.ActionOutputMapping = JSON.stringify({
    success: 'results[*].success',  // Collect all successes
    '*': 'lastEmailResult'
});

await forEachStep.Save();
```

#### Execution Flow

```
1. ForEach step starts
2. Gets collection from payload.newCustomers (e.g., 3 customers)
3. Iteration 1:
   - Injects customer=customers[0], i=0 into payload
   - Executes SendEmailAction with resolved params
   - Stores result
4. Iteration 2:
   - Injects customer=customers[1], i=1
   - Executes SendEmailAction
   - Stores result
5. Iteration 3:
   - Injects customer=customers[2], i=2
   - Executes SendEmailAction
   - Stores result
6. Loop completes:
   - Aggregates results into stepResults
   - Follows exit path to next step
```

### While Steps

A While step loops while a boolean condition evaluates to true.

#### Configuration

```json
{
    "type": "While",
    "condition": "payload.apiCallSuccess === false && payload.retryCount < 5",
    "itemVariable": "attempt",
    "maxIterations": 10,
    "continueOnError": false
}
```

#### Example: Retry API Call Until Success

```typescript
const whileStep = await md.GetEntityObject<AIAgentStepEntity>('MJ: AI Agent Steps');
whileStep.AgentID = agentId;
whileStep.Name = 'Retry API Call';
whileStep.StepType = 'While';
whileStep.LoopBodyType = 'Action';
whileStep.ActionID = callApiActionId;

whileStep.Configuration = JSON.stringify({
    type: 'While',
    condition: 'payload.apiSuccess === false && payload.retries < 5',
    itemVariable: 'attempt',
    maxIterations: 5
});

whileStep.ActionInputMapping = JSON.stringify({
    url: 'payload.targetUrl',
    attemptNumber: 'attempt.attemptNumber',
    previousError: 'payload.lastError'
});

whileStep.ActionOutputMapping = JSON.stringify({
    success: 'payload.apiSuccess',
    data: 'payload.apiResult',
    error: 'payload.lastError'
});

await whileStep.Save();
```

#### While Loop Variables

The `attempt` variable (or custom itemVariable) contains:
```typescript
{
    attemptNumber: 1,  // Current attempt (1-based)
    totalAttempts: 0   // Previous attempts (0-based)
}
```

Additionally, `index` is available (0-based iteration counter).

### Loop Body Types

#### Action Loop Body
- Most common use case
- Fast execution (no LLM inference)
- Use ActionInputMapping to pass loop variables
- Use ActionOutputMapping to collect results

#### Sub-Agent Loop Body
- For complex multi-step operations per iteration
- Sub-agent can be Flow or Loop agent
- Supports nested loops
- Use for "process each order" where processing involves multiple steps

#### Prompt Loop Body
- For AI-driven processing per item
- LLM sees loop variables in payload
- Useful for analysis, classification, enrichment tasks

---

## Loop Agent Iterations

Loop agents can **request** ForEach/While operations in their LLM response, eliminating the need for repeated inference.

### ForEach in Loop Agents

#### LLM Response Structure

```json
{
    "taskComplete": false,
    "message": "Processing all discovered documents",
    "reasoning": "Found 15 documents, using ForEach for efficient processing",
    "nextStep": {
        "type": "ForEach",
        "forEach": {
            "collectionPath": "payload.documents",
            "itemVariable": "doc",
            "indexVariable": "i",
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

#### With Sub-Agent

```json
{
    "taskComplete": false,
    "message": "Processing each customer order",
    "nextStep": {
        "type": "ForEach",
        "forEach": {
            "collectionPath": "payload.orders",
            "itemVariable": "order",
            "subAgent": {
                "name": "Order Processor",
                "message": "Process order {{order.id}} for customer {{order.customerId}}",
                "templateParameters": {
                    "orderId": "order.id",
                    "items": "order.items"
                }
            }
        }
    }
}
```

### While in Loop Agents

```json
{
    "taskComplete": false,
    "message": "Retrying API call until successful",
    "nextStep": {
        "type": "While",
        "while": {
            "condition": "payload.apiSuccess === false && payload.retries < 3",
            "itemVariable": "attempt",
            "maxIterations": 5,
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

### After Iteration Completes

Loop agents receive results in the payload:

```json
{
    "forEachResults": [
        { /* result from iteration 1 */ },
        { /* result from iteration 2 */ },
        { /* result from iteration 3 */ }
    ],
    "forEachErrors": [
        // Any errors if continueOnError was true
    ]
}
```

The LLM can then process these results in the next step.

---

## Configuration Reference

### ForEach Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | string | Yes | - | Must be "ForEach" |
| `collectionPath` | string | Yes | - | Path to array in payload (e.g., "payload.items") |
| `itemVariable` | string | No | "item" | Variable name for current item |
| `indexVariable` | string | No | "index" | Variable name for loop counter |
| `maxIterations` | number | No | 1000 | Max iterations (undefined=1000, 0=unlimited, >0=limit) |
| `continueOnError` | boolean | No | false | Continue if an iteration fails |

### While Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | string | Yes | - | Must be "While" |
| `condition` | string | Yes | - | Boolean expression (e.g., "payload.count < 5") |
| `itemVariable` | string | No | "attempt" | Variable name for attempt context |
| `maxIterations` | number | No | 100 | Max iterations (undefined=100, 0=unlimited, >0=limit) |
| `continueOnError` | boolean | No | false | Continue if an iteration fails |
| `delayBetweenIterationsMs` | number | No | 0 | Delay in milliseconds between iterations (useful for polling) |

### MaxIterations Behavior

| Value | Behavior |
|-------|----------|
| `undefined` | Use safe default (ForEach: 1000, While: 100) |
| `0` | Unlimited iterations (⚠️ dangerous, use with caution) |
| `> 0` | Use specified limit |
| `< 0` | Validation error |

---

## Variable Resolution

Loop iterations inject variables into the payload that can be referenced in mappings.

### Resolution Rules

When resolving a mapping value like `"customer.email"`:

1. **Loop variable property:** `"item.field"` → `currentItem.field`
2. **Payload path:** `"payload.field"` → `payload.field`
3. **Loop variable:** `"item"` → `currentItem`
4. **Index:** `"index"` → `currentIndex`
5. **Static value:** `"Welcome!"` → `"Welcome!"`

### Available Variables

#### ForEach Loops

| Variable | Type | Description | Example Value |
|----------|------|-------------|---------------|
| `item` (or custom) | any | Current item from collection | `{ id: 1, email: 'a@test.com' }` |
| `index` (or custom) | number | 0-based loop counter | `0`, `1`, `2` |

#### While Loops

| Variable | Type | Description | Example Value |
|----------|------|-------------|---------------|
| `attempt` (or custom) | object | Attempt context | `{ attemptNumber: 1, totalAttempts: 0 }` |
| `index` | number | 0-based iteration counter | `0`, `1`, `2` |

### Example Mappings

#### ForEach Action Input Mapping

```json
{
    "recipientEmail": "customer.email",
    "recipientName": "customer.firstName",
    "subject": "Welcome to our service!",
    "customerNumber": "index",
    "userId": "payload.currentUserId",
    "templateId": "payload.emailTemplateId"
}
```

**Resolves to (iteration 0):**
```json
{
    "recipientEmail": "alice@example.com",      // From customer.email
    "recipientName": "Alice",                    // From customer.firstName
    "subject": "Welcome to our service!",        // Static
    "customerNumber": 0,                         // Loop index
    "userId": "user-123",                        // From payload
    "templateId": "template-456"                 // From payload
}
```

#### While Action Input Mapping

```json
{
    "apiUrl": "payload.targetUrl",
    "attemptNumber": "attempt.attemptNumber",
    "retryAfterSeconds": "payload.retryDelay",
    "previousError": "payload.lastError"
}
```

---

## Best Practices

### 1. Use Appropriate Defaults

```json
// Good: Use defaults for common cases
{
    "type": "ForEach",
    "collectionPath": "payload.customers"
    // itemVariable defaults to "item"
    // indexVariable defaults to "index"
}

// Only specify when you need custom names
{
    "type": "ForEach",
    "collectionPath": "payload.orders",
    "itemVariable": "order",  // Custom: more descriptive
    "indexVariable": "orderNum"
}
```

### 2. Set Safe Limits

```json
// Good: Reasonable limit for known data
{
    "type": "ForEach",
    "collectionPath": "payload.employees",
    "maxIterations": 1000  // Explicit limit
}

// Dangerous: Unlimited
{
    "type": "ForEach",
    "collectionPath": "payload.records",
    "maxIterations": 0  // ⚠️ No limit - use only if you're certain
}
```

### 3. Handle Errors Appropriately

```json
// Fail fast (default): Stop on first error
{
    "type": "ForEach",
    "collectionPath": "payload.criticalUpdates",
    "continueOnError": false  // Stop if any update fails
}

// Continue on error: Process all items
{
    "type": "ForEach",
    "collectionPath": "payload.emailRecipients",
    "continueOnError": true  // Send to all, even if some fail
}
```

### 4. Use Sub-Agents for Complex Operations

```json
// Simple: Direct action
{
    "type": "ForEach",
    "collectionPath": "payload.items",
    "LoopBodyType": "Action",
    "ActionID": "simple-update-action"
}

// Complex: Multi-step processing per item
{
    "type": "ForEach",
    "collectionPath": "payload.orders",
    "LoopBodyType": "Sub-Agent",
    "SubAgentID": "order-fulfillment-agent"  // Has its own workflow
}
```

### 5. Choose While Over ForEach for Conditionals

```json
// Bad: Using ForEach for retry logic
{
    "type": "ForEach",
    "collectionPath": "payload.retryAttempts"  // Array of [1,2,3,4,5]
}

// Good: Using While with actual condition
{
    "type": "While",
    "condition": "payload.success === false && payload.attempts < 5"
}
```

### 6. Use Delays for Polling and Rate Limiting

```json
// Polling: Check status every N seconds
{
    "type": "While",
    "condition": "payload.jobStatus === 'running'",
    "delayBetweenIterationsMs": 5000  // 5 seconds between checks
}

// Rate limiting: Respect API limits
{
    "type": "While",
    "condition": "payload.hasMorePages === true",
    "delayBetweenIterationsMs": 1000  // 1 second between API calls
}

// No delay: Immediate retries (use cautiously)
{
    "type": "While",
    "condition": "payload.validationPassed === false",
    "delayBetweenIterationsMs": 0  // No delay, immediate retry
}
```

---

## Examples

### Example 1: Customer Onboarding (ForEach with Action)

**Scenario:** Send welcome email to each new customer

```typescript
// Step 1: Get new customers (Action)
const getCustomersStep = {
    StepType: 'Action',
    ActionID: 'get-new-customers',
    ActionOutputMapping: JSON.stringify({
        '*': 'payload.newCustomers'
    })
};

// Step 2: ForEach customer, send email (ForEach)
const sendEmailsStep = {
    StepType: 'ForEach',
    LoopBodyType: 'Action',
    ActionID: 'send-email-action',
    Configuration: JSON.stringify({
        type: 'ForEach',
        collectionPath: 'payload.newCustomers',
        itemVariable: 'customer',
        maxIterations: 500
    }),
    ActionInputMapping: JSON.stringify({
        to: 'customer.email',
        subject: 'Welcome!',
        body: 'payload.emailTemplate'
    }),
    ActionOutputMapping: JSON.stringify({
        success: 'results[*].sent'
    })
};

// Step 3: Log summary (Action)
const logStep = {
    StepType: 'Action',
    ActionID: 'log-summary-action',
    ActionInputMapping: JSON.stringify({
        totalSent: 'payload.results.length',
        successCount: 'payload.results.filter(r => r.sent).length'
    })
};
```

### Example 2: Document Processing (ForEach with Sub-Agent)

**Scenario:** Analyze each document with a multi-step process

```typescript
const processDocsStep = {
    StepType: 'ForEach',
    LoopBodyType: 'Sub-Agent',
    SubAgentID: 'document-analyzer-agent',  // Flow agent with multiple steps
    Configuration: JSON.stringify({
        type: 'ForEach',
        collectionPath: 'payload.documents',
        itemVariable: 'doc',
        maxIterations: 100,
        continueOnError: true  // Continue even if one doc fails
    })
};

// The Document Analyzer sub-agent has its own workflow:
// 1. Extract text
// 2. Classify content
// 3. Generate summary
// 4. Store results
```

### Example 3: Polling for Job Completion (While with Delay)

**Scenario:** Wait for background export job to complete, checking every 3 seconds

```typescript
// Step 1: Start export job
const startExportStep = {
    StepType: 'Action',
    ActionID: 'start-data-export-action',
    ActionInputMapping: JSON.stringify({
        dataType: 'payload.exportDataType',
        format: 'CSV'
    }),
    ActionOutputMapping: JSON.stringify({
        jobId: 'payload.exportJobId',
        status: 'payload.exportStatus'  // Initially 'processing'
    })
};

// Step 2: Poll for completion
const pollStatusStep = {
    StepType: 'While',
    LoopBodyType: 'Action',
    ActionID: 'check-export-status-action',
    Configuration: JSON.stringify({
        type: 'While',
        condition: 'payload.exportStatus === "processing"',
        itemVariable: 'checkAttempt',
        delayBetweenIterationsMs: 3000,  // Check every 3 seconds
        maxIterations: 20  // Max 1 minute of polling
    }),
    ActionInputMapping: JSON.stringify({
        jobId: 'payload.exportJobId',
        attemptNumber: 'checkAttempt.attemptNumber'
    }),
    ActionOutputMapping: JSON.stringify({
        status: 'payload.exportStatus',
        downloadUrl: 'payload.exportDownloadUrl',
        error: 'payload.exportError'
    })
};

// Step 3: Process completed export (only runs when status != 'processing')
const processExportStep = {
    StepType: 'Action',
    ActionID: 'process-export-results',
    ActionInputMapping: JSON.stringify({
        downloadUrl: 'payload.exportDownloadUrl',
        wasSuccessful: 'payload.exportStatus'
    })
};
```

### Example 4: Loop Agent Requesting ForEach

**Scenario:** LLM discovers multiple files and requests batch processing

**User:** "Analyze all markdown files in the /docs folder"

**LLM Response:**
```json
{
    "taskComplete": false,
    "message": "Found 12 markdown files, processing each for analysis",
    "reasoning": "Using ForEach to efficiently analyze all documents without repeated LLM calls",
    "nextStep": {
        "type": "ForEach",
        "forEach": {
            "collectionPath": "payload.discoveredFiles",
            "itemVariable": "file",
            "action": {
                "name": "Analyze Markdown File",
                "params": {
                    "filePath": "file.path",
                    "fileName": "file.name",
                    "extractSections": "true"
                }
            },
            "maxIterations": 100,
            "continueOnError": true
        }
    }
}
```

**After ForEach completes, LLM receives:**
```json
{
    "discoveredFiles": [ /* original array */ ],
    "forEachResults": [
        { /* analysis result 1 */ },
        { /* analysis result 2 */ },
        // ... 12 total
    ],
    "forEachErrors": []  // Empty if all succeeded
}
```

**LLM Next Response:**
```json
{
    "taskComplete": true,
    "message": "Analyzed 12 documents. Found 3 with TODO items, 5 with code examples.",
    "payloadChangeRequest": {
        "updateElements": {
            "summary": {
                "totalDocs": 12,
                "docsWithTodos": 3,
                "docsWithCode": 5
            }
        }
    }
}
```

---

## Troubleshooting

### Loop Never Exits

**Problem:** While loop runs forever

**Solutions:**
- Verify condition expression is correct
- Check that action/sub-agent actually updates the payload fields referenced in condition
- Set a safe `maxIterations` limit
- Use ActionOutputMapping to update payload.success or other condition fields

### "Collection path did not resolve to an array"

**Problem:** ForEach can't find the collection

**Solutions:**
- Verify collectionPath is correct: `"payload.customers"` not `"customers"`
- Ensure previous step populated the array in payload
- Check ActionOutputMapping from previous step writes to correct path
- Test with small dataset first

### Loop Variables Not Available in Mappings

**Problem:** `"item.email"` resolves to undefined

**Solutions:**
- Verify itemVariable matches what you're referencing
- Check collection items have the expected structure
- Use index variable if you just need the counter
- Review loop body execution logs

### Exceeded Maximum Iterations

**Problem:** Loop hits maxIterations limit

**Solutions:**
- Increase maxIterations if legitimate
- Check for infinite loop condition (While)
- Verify collection size is expected (ForEach)
- Use continueOnError if some iterations are expected to fail

### Performance Issues with Large Collections

**Problem:** 10,000-item ForEach takes too long

**Solutions:**
- Consider batch processing (chunk array in previous step)
- Use Sub-Agent loop body for parallel processing (future feature)
- Optimize the loop body action itself
- Consider if all items really need processing

---

## Advanced Topics

### Nested Loops

Flow agents support nested loops through Sub-Agent loop bodies:

```
ForEach Customer (Action body)
  └─> For each customer, execute Sub-Agent
        └─> Sub-Agent is a Flow agent with:
              ForEach Order (Action body)
                └─> Process order
```

**Limits:**
- Maximum nesting depth: 5 levels
- Each loop has its own iteration context
- Loop variables from outer loops available in inner loops

### Collecting Results

#### Array Collection (Default)

```json
{
    "ActionOutputMapping": {
        "success": "results[*].success"  // Array of all successes
    }
}
```

#### Last Result Only

```json
{
    "ActionOutputMapping": {
        "*": "lastResult"  // Only keep most recent
    }
}
```

#### Indexed Results

```json
{
    "ActionOutputMapping": {
        "data": "results[index].data"  // Store at same index as iteration
    }
}
```

### Error Handling Strategies

#### Fail Fast (Critical Operations)

```json
{
    "continueOnError": false  // Stop on first error
}
```

Use when:
- Data integrity is critical
- All items must succeed
- Partial completion is worse than no completion

#### Continue On Error (Best Effort)

```json
{
    "continueOnError": true  // Process all items
}
```

Use when:
- Partial success is acceptable
- Want to process as many as possible
- Errors can be reviewed later
- Each item is independent

### Performance Optimization

1. **Batch Processing:** Chunk large collections in a previous step
2. **Lightweight Actions:** Keep loop body actions fast
3. **Caching:** Use payload to cache repeated lookups
4. **Sub-Agent Reuse:** Complex loop bodies in reusable sub-agents

---

## Migration Guide

### From Manual LLM Loops

**Before (inefficient):**
```json
// LLM executes 10 times, each time deciding to process next item
{
    "taskComplete": false,
    "message": "Processing customer 1 of 10...",
    "nextStep": {
        "type": "Actions",
        "actions": [{ "name": "Send Email", "params": {...} }]
    }
}
```

**After (efficient):**
```json
// LLM executes once, requests ForEach
{
    "taskComplete": false,
    "message": "Processing all 10 customers",
    "nextStep": {
        "type": "ForEach",
        "forEach": {
            "collectionPath": "payload.customers",
            "action": {
                "name": "Send Email",
                "params": { "to": "item.email" }
            }
        }
    }
}
```

**Token Savings:** ~90% reduction (1 LLM call instead of 10)

---

## API Reference

### TypeScript Interfaces

```typescript
// Flow Agent
interface ForEachConfig {
    type: 'ForEach';
    collectionPath: string;
    itemVariable?: string;
    indexVariable?: string;
    maxIterations?: number;
    continueOnError?: boolean;
}

interface WhileConfig {
    type: 'While';
    condition: string;
    itemVariable?: string;
    maxIterations?: number;
    continueOnError?: boolean;
}

interface IterationContext {
    stepId: string;
    loopType: 'ForEach' | 'While';
    collection?: any[];
    currentIndex?: number;
    condition?: string;
    iterationCount?: number;
    itemVariable: string;
    indexVariable?: string;
    maxIterations: number;
    continueOnError: boolean;
    errors: any[];
    results: any[];
}

// Loop Agent
interface ForEachOperation {
    collectionPath: string;
    itemVariable?: string;
    indexVariable?: string;
    maxIterations?: number;
    continueOnError?: boolean;
    action?: { name: string; params: Record<string, unknown> };
    subAgent?: { name: string; message: string; templateParameters?: Record<string, unknown> };
}

interface WhileOperation {
    condition: string;
    itemVariable?: string;
    maxIterations?: number;
    continueOnError?: boolean;
    action?: { name: string; params: Record<string, unknown> };
    subAgent?: { name: string; message: string; templateParameters?: Record<string, unknown> };
}
```

---

## Future Enhancements

Planned features for future releases:

- **Parallel ForEach:** Execute iterations concurrently (v3.3+)
- **Break/Continue:** Early exit from loops
- **Map/Filter/Reduce:** Functional collection operations
- **Loop State Persistence:** Resume loops after interruption
- **Performance Metrics:** Loop execution analytics
- **Streaming Results:** Process large collections without loading all into memory

---

## Support

For questions or issues:
- GitHub Issues: https://github.com/MemberJunction/MJ/issues
- Documentation: https://docs.memberjunction.org
- Examples: `/metadata/agents` directory in repository

---

**End of Guide**
