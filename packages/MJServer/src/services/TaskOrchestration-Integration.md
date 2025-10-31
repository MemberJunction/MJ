# Task Orchestration Integration Guide

## Overview
This document explains how to integrate the TaskOrchestrator into the Conversation Manager agent flow.

## Components Created

1. **TaskOrchestrator** (`/services/TaskOrchestrator.ts`)
   - Creates tasks from LLM task graphs
   - Manages task dependencies
   - Executes tasks in proper order
   - Passes outputs between tasks

2. **Updated Conversation Manager Prompt** (`/metadata/prompts/templates/conversations/conversation-manager-agent.template.md`)
   - Now supports returning task graphs
   - Backward compatible with simple agent delegation

## Integration Points

### 1. Where to Add Task Orchestration Logic

When the Conversation Manager agent returns a response, check the `payloadChangeRequest.newElements` for either:

**Simple delegation (existing):**
```typescript
if (newElements.invokeAgent) {
    // Existing flow - delegate to single agent
    const agentName = newElements.invokeAgent;
    // ... invoke agent ...
}
```

**Multi-step orchestration (new):**
```typescript
if (newElements.taskGraph) {
    const taskGraph = newElements.taskGraph;

    if (taskGraph.isMultiStep) {
        // Create tasks in database
        const orchestrator = new TaskOrchestrator(contextUser);
        const taskIdMap = await orchestrator.createTasksFromGraph(
            taskGraph,
            conversationDetailId,
            environmentId
        );

        // Execute tasks (respecting dependencies)
        const results = await orchestrator.executeTasksForConversation(
            conversationDetailId
        );

        // Send results back to conversation
        // ... format and return results ...
    }
}
```

### 2. Suggested Integration Location

**Option A: In RunAIAgent Resolver**
- File: `/packages/MJServer/src/resolvers/RunAIAgentResolver.ts`
- After agent execution, check the result payload for taskGraph
- Create and execute tasks if multi-step

**Option B: In AskSkip Resolver**
- File: `/packages/MJServer/src/resolvers/AskSkipResolver.ts`
- When processing conversation manager responses
- Check for taskGraph in the response payload

**Option C: New Task Resolver (Recommended)**
- Create `/packages/MJServer/src/resolvers/TaskResolver.ts`
- Add mutation: `ExecuteTaskGraph(taskGraph, conversationDetailId, environmentId)`
- Keep task orchestration logic separate and reusable

### 3. Example Integration Code

```typescript
import { TaskOrchestrator, TaskGraphResponse } from '../services/TaskOrchestrator.js';

// In your resolver after Conversation Manager responds
async handleConversationManagerResponse(
    agentResult: ExecuteAgentResult,
    conversationDetailId: string,
    environmentId: string,
    contextUser: UserInfo
): Promise<void> {
    // Check if response contains a task graph
    if (agentResult.payload?.taskGraph) {
        const taskGraph: TaskGraphResponse = agentResult.payload.taskGraph;

        if (taskGraph.isMultiStep) {
            LogStatus(`Multi-step workflow detected: ${taskGraph.tasks.length} tasks`);

            // Create task orchestrator
            const orchestrator = new TaskOrchestrator(contextUser);

            // Create tasks and dependencies
            const taskIdMap = await orchestrator.createTasksFromGraph(
                taskGraph,
                conversationDetailId,
                environmentId
            );

            LogStatus(`Created ${taskIdMap.size} tasks with dependencies`);

            // Execute tasks in proper order
            const results = await orchestrator.executeTasksForConversation(
                conversationDetailId
            );

            // Log results
            for (const result of results) {
                if (result.success) {
                    LogStatus(`Task ${result.taskId} completed successfully`);
                } else {
                    LogError(`Task ${result.taskId} failed: ${result.error}`);
                }
            }

            // Return task completion summary to user
            return {
                success: true,
                message: `Completed ${results.filter(r => r.success).length} of ${results.length} tasks`,
                results: results
            };
        }
    }

    // Simple agent delegation (existing flow)
    if (agentResult.payload?.invokeAgent) {
        // ... existing single-agent delegation logic ...
    }
}
```

### 4. UI Integration

The existing task UI components already work with TaskEntity:
- `/packages/Angular/Generic/conversations/src/lib/components/task/task-list.component.ts`
- Tasks will automatically appear in the task list
- Users can see progress, dependencies, and results

### 5. Testing

**Test Single-Step (Backward Compatibility):**
```
User: "Analyze our sales data"
Expected: Conversation Manager delegates to Analysis Agent (existing behavior)
```

**Test Multi-Step:**
```
User: "Research associations with 5-30M revenue in USA, then create a GTM report"
Expected:
- Conversation Manager returns taskGraph
- Task 1 (Research) executes
- Task 2 (GTM Report) waits for Task 1
- Task 2 receives Task 1 output
- Both complete successfully
```

## Database Schema

No changes needed! TaskEntity and TaskDependencyEntity already exist with all required fields.

**Note:** For production, consider adding these optional columns to Task table:
- `InputPayload` NVARCHAR(MAX) - Better than embedding in Description
- `OutputPayload` NVARCHAR(MAX) - Better than embedding in Description

Current implementation uses Description field with `__TASK_METADATA__` and `__TASK_OUTPUT__` markers as a workaround.

## Future Enhancements

1. **Parallel Execution**: Modify executeTasksForConversation() to run independent tasks concurrently
2. **Progress Streaming**: Use WebSockets to stream task progress to UI
3. **Task Templates**: Save common workflows as reusable templates
4. **Error Recovery**: Add retry logic and error handling strategies
5. **Task Cancellation**: Allow users to cancel in-progress task chains
6. **Visualization**: Show task dependency graph in UI

## Questions?

- TaskOrchestrator handles all task lifecycle management
- Conversation Manager LLM determines when to use multi-step
- Existing UI components display tasks automatically
- Fully backward compatible with simple delegation

Integration should take ~1-2 hours for experienced developer familiar with the codebase.
