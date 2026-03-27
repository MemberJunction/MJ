```ts
interface AgentTask {
    id: string;  // Simple agent-assigned identifier (e.g., "t1", "t2", "t3").
    title: string;  // Brief description of the work item.
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';  // Current status of the task.
    notes?: string;  // Optional context, blockers, or results for this task.
}

type AgentTaskStatus = AgentTask['status'];

interface TaskListChanges {
    upsert?: AgentTask[];  // Add new tasks or update existing ones (matched by id).
    remove?: string[];  // Remove tasks by ID.
}

interface AgentScratchpad {
    notes?: string;  // Free-form text for reasoning notes, intermediate conclusions,
    taskList?: TaskListChanges;  // Structured task tracking with upsert/remove operations.
}

interface ScratchpadSnapshot {
    notes: string;  // Current notes text, or empty string if no notes.
    tasks: AgentTask[];  // Current task list as a flat array.
}
```

The scratchpad is private working memory for loop agents — never shared with parent or sub-agents.
Use simple sequential IDs for tasks (t1, t2, t3). The full task list is injected every turn.
Notes have no hard character limit but the agent should keep them concise (injected every turn = token cost).
Task list is capped at a configurable max (default 50). Completed tasks are auto-pruned when over limit.
