# PRD: Enhanced Expression Context for Flow Agents (Phase 1)

**Version**: 1.0
**Date**: 2025-12-18
**Status**: Proposed
**Scope**: Phase 1 - Read-only access to `data` and `context` in Path Conditions

---

## 1. Executive Summary

This proposal outlines the first phase of enhancing the MemberJunction Flow Agent expression capabilities. The goal is to allow **Flow Agent Path Conditions** to access transient runtime parameters (`params.data`) and execution context (`params.context`) passed via `ExecuteAgentParams`.

This enhancement enables deterministic routing decisions based on runtime state (e.g., user approvals, feature flags, parent-injected context) without forcing this transient data into the persistent agent `payload`.

**Key Constraints for Phase 1:**
*   **Read-Only:** Expressions can read `data` and `context`, but cannot modify them.
*   **Path Conditions Only:** The primary target is the `getValidPaths` logic in `FlowAgentType`.
*   **Security:** `context` may contain secrets; it is exposed *only* to the secure expression evaluator for deterministic routing logic and is not exposed to LLM prompts or written to the logs/payloads.

---

## 2. Problem Statement

Currently, Flow Agent path conditions are evaluated using `SafeExpressionEvaluator` with a limited scope:
```typescript
const context = {
    payload,
    stepResult,
    flowContext: { ... }
};
```

This limitation creates significant routing challenges:
1.  **Transient State Ignored:** If a parent agent or user passes a flag like `data.isApproved = true`, the Flow Agent cannot see it in path conditions unless it is merged into the `payload`. Merging transient data into the payload pollutes the persistent state and confuses subsequent steps.
2.  **Context Unavailability:** `params.context` (often used for secrets, extensive configuration, or parent execution context) is completely inaccessible to routing logic.

**Example Scenario:**
An "Approval Flow" agent receives a `userApproval` boolean in `params.data`.
*   *Current Behavior:* The agent must execute a wasted step to read this value into the payload or pass it to an LLM to "decide" to move forward.
*   *Desired Behavior:* The agent evaluates `data.userApproval === true` in a path condition and immediately routes to the "Approved" step.

---

## 3. Proposed Solution

We will expand the evaluation context passed to `SafeExpressionEvaluator` within the `FlowAgentType` class. This involves plumbing the `ExecuteAgentParams` through to the path evaluation logic.

### 3.1 Expression Context Definition

The context object passed to `evaluate()` will be expanded to:

```typescript
interface EnhancedPathContext {
    // Existing
    payload: unknown;
    stepResult: unknown;
    flowContext: FlowExecutionContext;

    // NEW
    data: Record<string, unknown>;     // From params.data
    context: Record<string, unknown>;  // From params.context
}
```

### 3.2 Usage in Expressions

Developers will be able to write path conditions like:

*   `data.userApproval === true`
*   `context.environment === 'production'`
*   `data.retryCount < 3 && payload.status === 'pending'`

---

## 4. Technical Implementation

### 4.1 Update `getValidPaths` Signature

**File:** `packages/AI/Agents/src/agent-types/flow-agent-type.ts`

Modify `getValidPaths` to accept `ExecuteAgentParams`:
```typescript
private async getValidPaths<P>(
    stepId: string, 
    payload: unknown, 
    flowState: FlowExecutionState,
    params: ExecuteAgentParams<P> // NEW argument
): Promise<AIAgentStepPathEntity[]> {
    // ...
}
```

### 4.2 Construct Enhanced Context
Inside `getValidPaths`:

```typescript
const context = {
    payload,
    stepResult: this.getLastStepResult(flowState),
    flowContext: {
        currentStepId: flowState.currentStepId,
        completedSteps: Array.from(flowState.completedStepIds),
        executionPath: flowState.executionPath,
        stepCount: flowState.completedStepIds.size
    },
    // NEW: Map params directly
    data: params.data || {},
    context: params.context || {}
};

// Evaluate
const evalResult = this._evaluator.evaluate(path.Condition, context);
```

### 4.3 Update Call Sites

Update all invocations of `getValidPaths` to pass the `params` object:

1.  **`DetermineNextStep`**:
    ```typescript
    const paths = await this.getValidPaths(flowState.currentStepId, payload, flowState, params);
    ```

2.  **`PreProcessNextStep`**:
    ```typescript
    const paths = await this.getValidPaths(flowState.currentStepId, currentPayload, flowState, params);
    ```

---

## 5. Security Considerations

*   **Params.Context Sensitivity:** `params.context` can contain API keys or internal system state.
    *   *Mitigation:* This data is **only** passed to `SafeExpressionEvaluator`, which runs in a sandboxed execution context (using `new Function` with strict scoping). The data is NOT logged, NOT persisted to the database, and NOT included in LLM prompts by this change.
*   **Read-Only Safety:** As this is an evaluation-only change, there is no risk of the expression engine modifying the `context` or `data` objects, ensuring the integrity of the `ExecuteAgentParams` passed to subsequent agents.

---

## 6. Testing Strategy

1.  **Unit Test - Data Access:** Verify a path condition `data.flag === true` evaluates correctly when `params.data.flag` is provided.
2.  **Unit Test - Context Access:** Verify `context.env === 'prod'` works as expected.
3.  **Regression Test:** Ensure existing expressions using only `payload` continue to function without error.
4.  **Null Safety:** Verify behavior when `params.data` or `params.context` are undefined (should default to `{}`).

---

## 7. Future Phases (Out of Scope)

*   **Phase 2:** Writing to `data` via Output Mappings.
*   **Phase 3:** Enhanced `conversation` context analysis in expressions.
*   **Phase 4:** Sub-agent parameter mapping enhancements.
