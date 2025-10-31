# Task Orchestration - Quick Start Guide

## For Developers

### Using the Task Timeline Component

```typescript
import { TaskTimelineComponent } from '@memberjunction/ng-conversations';

// In your component template:
<mj-task-timeline
  [parentTaskId]="myParentTaskId"
  [currentUser]="currentUser">
</mj-task-timeline>
```

**The component will**:
- Load the parent task and all its children
- Display them in Tree or Timeline view
- Show real-time status updates
- Provide navigation between parent/children

---

### Creating a Task Graph (Server-Side)

```typescript
import { TaskOrchestrator } from '@memberjunction/server';

// Create orchestrator with PubSub for progress updates
const orchestrator = new TaskOrchestrator(
  currentUser,
  pubSub,      // Optional: for real-time progress
  sessionId,   // Optional: for PubSub
  userPayload  // Optional: for PubSub
);

// Define your task graph
const taskGraph = {
  workflowName: "Research and Report Workflow",
  reasoning: "Need to research then create report",
  tasks: [
    {
      tempId: "task1",
      name: "Research Companies",
      description: "Query database for companies",
      agentName: "Research Agent",
      dependsOn: [],
      inputPayload: { query: "AI companies" }
    },
    {
      tempId: "task2",
      name: "Create Report",
      description: "Generate report from research",
      agentName: "Report Agent",
      dependsOn: ["task1"],
      inputPayload: {
        data: "@task1.output"  // Reference previous output
      }
    }
  ]
};

// Create tasks in database
const { parentTaskId, taskIdMap } = await orchestrator.createTasksFromGraph(
  taskGraph,
  conversationDetailId,
  environmentId
);

// Execute tasks with progress updates
const results = await orchestrator.executeTasksForParent(parentTaskId);
```

---

### Calling from GraphQL

```graphql
mutation ExecuteWorkflow {
  ExecuteTaskGraph(
    taskGraphJson: "{\"workflowName\":\"My Workflow\",\"tasks\":[...]}"
    conversationDetailId: "conv-123"
    environmentId: "env-456"
    sessionId: "session-789"
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

---

### Listening to Progress Updates (Client-Side)

```typescript
// Subscribe to PubSub updates
subscription.add(
  pushStatusService.messages$.subscribe((message) => {
    const data = JSON.parse(message.message);

    if (data.resolver === 'TaskOrchestrator') {
      if (data.type === 'TaskProgress') {
        // High-level task progress
        console.log(`[${data.data.taskName}] ${data.data.message} (${data.data.percentComplete}%)`);
      } else if (data.type === 'AgentProgress') {
        // Detailed agent progress
        console.log(`  → ${data.data.agentStep}: ${data.data.agentMessage}`);
      }
    }
  })
);
```

---

## For LLM Prompt Writers

### Always Use Task Graph Format

**Even for single tasks:**
```json
{
  "newElements": {
    "taskGraph": {
      "workflowName": "Research Companies",
      "reasoning": "User wants company data",
      "tasks": [
        {
          "tempId": "task1",
          "name": "Research Top AI Companies",
          "description": "Query database for AI companies",
          "agentName": "Research Agent",
          "dependsOn": [],
          "inputPayload": {
            "query": "top AI companies",
            "limit": 10
          }
        }
      ]
    }
  }
}
```

### Sequential Tasks

```json
{
  "newElements": {
    "taskGraph": {
      "workflowName": "Research and Analyze",
      "reasoning": "User wants research followed by analysis",
      "tasks": [
        {
          "tempId": "research",
          "name": "Research Data",
          "agentName": "Research Agent",
          "dependsOn": [],
          "inputPayload": { ... }
        },
        {
          "tempId": "analyze",
          "name": "Analyze Results",
          "agentName": "Analysis Agent",
          "dependsOn": ["research"],  // ← Waits for research
          "inputPayload": {
            "data": "@research.output"  // ← Gets research output
          }
        }
      ]
    }
  }
}
```

### Parallel Tasks with Merge

```json
{
  "newElements": {
    "taskGraph": {
      "workflowName": "Parallel Data Gathering",
      "reasoning": "Can fetch revenue and members in parallel, then merge",
      "tasks": [
        {
          "tempId": "revenue",
          "name": "Get Revenue Data",
          "agentName": "Data Agent",
          "dependsOn": [],  // ← Runs immediately
          "inputPayload": { metric: "revenue" }
        },
        {
          "tempId": "members",
          "name": "Get Member Counts",
          "agentName": "Data Agent",
          "dependsOn": [],  // ← Runs in parallel with revenue
          "inputPayload": { metric: "members" }
        },
        {
          "tempId": "summary",
          "name": "Create Summary",
          "agentName": "Report Agent",
          "dependsOn": ["revenue", "members"],  // ← Waits for both
          "inputPayload": {
            "revenueData": "@revenue.output",
            "memberData": "@members.output"
          }
        }
      ]
    }
  }
}
```

---

## Common Patterns

### Pattern 1: Research → Report
```json
{
  "workflowName": "Research and Report",
  "tasks": [
    { "tempId": "research", "dependsOn": [] },
    { "tempId": "report", "dependsOn": ["research"] }
  ]
}
```

### Pattern 2: Gather → Analyze → Visualize
```json
{
  "workflowName": "Data Pipeline",
  "tasks": [
    { "tempId": "gather", "dependsOn": [] },
    { "tempId": "analyze", "dependsOn": ["gather"] },
    { "tempId": "visualize", "dependsOn": ["analyze"] }
  ]
}
```

### Pattern 3: Parallel Fetch → Merge → Process
```json
{
  "workflowName": "Multi-Source Processing",
  "tasks": [
    { "tempId": "source1", "dependsOn": [] },
    { "tempId": "source2", "dependsOn": [] },
    { "tempId": "merge", "dependsOn": ["source1", "source2"] },
    { "tempId": "process", "dependsOn": ["merge"] }
  ]
}
```

---

## Debugging

### Check Parent Task
```sql
SELECT * FROM [MJ: Tasks]
WHERE ConversationDetailID = 'your-conv-id'
AND ParentID IS NULL
```

### Check Child Tasks
```sql
SELECT * FROM [MJ: Tasks]
WHERE ParentID = 'parent-task-id'
ORDER BY StartedAt
```

### Check Dependencies
```sql
SELECT
  t1.Name AS DependentTask,
  t2.Name AS RequiredTask,
  td.DependencyType
FROM [MJ: Task Dependencies] td
JOIN [MJ: Tasks] t1 ON td.TaskID = t1.ID
JOIN [MJ: Tasks] t2 ON td.DependsOnTaskID = t2.ID
WHERE t1.ParentID = 'parent-task-id'
```

### Check Progress
```sql
SELECT
  Name,
  Status,
  PercentComplete,
  StartedAt,
  CompletedAt,
  DATEDIFF(second, StartedAt, COALESCE(CompletedAt, GETDATE())) AS DurationSeconds
FROM [MJ: Tasks]
WHERE ParentID = 'parent-task-id'
ORDER BY StartedAt
```

---

## Tips & Best Practices

### 1. Naming
- **workflowName**: Short, descriptive name for the overall workflow
- **task names**: Action-oriented (e.g., "Research Companies", not "Research")
- **tempId**: Simple IDs like "task1", "task2" or descriptive like "research", "analyze"

### 2. Dependencies
- Use empty `dependsOn: []` for tasks that can start immediately
- Use `dependsOn: ["task1"]` for sequential dependencies
- Use `dependsOn: ["task1", "task2"]` to wait for multiple tasks

### 3. Payload Passing
- Reference prior task outputs with `@taskId.output`
- You can reference multiple outputs in one task
- Outputs are merged into the input payload automatically

### 4. Error Handling
- If a task fails, dependent tasks will NOT execute
- Parent task status will reflect failure
- Check `results` array for individual task errors

### 5. Performance
- Parallel tasks execute simultaneously (as long as no dependencies)
- Sequential tasks execute one after another
- Consider parallelizing independent operations

---

## FAQ

**Q: Do I need to create tasks manually?**
A: No, TaskOrchestrator creates them automatically from the task graph.

**Q: Can I update a running task?**
A: Not recommended. Let TaskOrchestrator manage task lifecycle.

**Q: How do I view task progress in the UI?**
A: Use the TaskTimelineComponent with the parent task ID.

**Q: Can tasks be nested beyond parent/child?**
A: Currently one level (parent → children). Multi-level nesting is future work.

**Q: What if I don't provide PubSub?**
A: Tasks will still execute, but no real-time progress updates will be sent.

**Q: Can I cancel a running workflow?**
A: Not yet implemented. Future enhancement.

---

## Support

For issues or questions:
1. Check the comprehensive docs: `/TASK_ORCHESTRATION_COMPLETE.md`
2. Review the integration guide: `/packages/MJServer/src/services/TaskOrchestration-Integration.md`
3. Examine test scenarios in the complete docs
4. Check the database to see task status and dependencies

---

**Happy Orchestrating!** 🎵
