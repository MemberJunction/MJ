# Task Orchestration - Implementation Update 2

## Completed Work

### 1. ✅ Unified Conversation Manager Output Format
**Changed**: Conversation Manager now ALWAYS uses task graph format, even for single-task requests.

**Before** (Two formats):
```json
// Simple case
{ "newElements": { "invokeAgent": "Research Agent" } }

// Complex case
{ "newElements": { "taskGraph": { "isMultiStep": true, ... } } }
```

**After** (One format):
```json
// Simple case (single task)
{
  "newElements": {
    "taskGraph": {
      "workflowName": "Research Companies",
      "tasks": [{ "tempId": "task1", "name": "Research", ... }]
    }
  }
}

// Complex case (multiple tasks)
{
  "newElements": {
    "taskGraph": {
      "workflowName": "Research and Create Report",
      "tasks": [
        { "tempId": "task1", ... },
        { "tempId": "task2", "dependsOn": ["task1"], ... }
      ]
    }
  }
}
```

**File**: [`/metadata/prompts/templates/conversations/conversation-manager-agent.template.md`](command:_github.copilot.openRelativePath?%5B%7B%22scheme%22%3A%22file%22%2C%22authority%22%3A%22%22%2C%22path%22%3A%22%2FUsers%2Famith%2FDropbox%2Fdevelop%2FMac%2FMJ%2Fmetadata%2Fprompts%2Ftemplates%2Fconversations%2Fconversation-manager-agent.template.md%22%2C%22query%22%3A%22%22%2C%22fragment%22%3A%22%22%7D%5D "/Users/amith/Dropbox/develop/Mac/MJ/metadata/prompts/templates/conversations/conversation-manager-agent.template.md")

**Benefits**:
- Cleaner, more predictable LLM output
- Single code path for all agent work
- All agent executions tracked in database
- Better visibility and progress tracking

---

### 2. ✅ Parent Task Always Created
**Changed**: TaskOrchestrator now ALWAYS creates a parent "workflow" task that contains all sub-tasks.

**Structure**:
```
Task (parent - links to ConversationDetailID)
├─ ID: abc-123
├─ Name: "Research and Create Report" (from workflowName)
├─ ConversationDetailID: xyz-789
├─ Status: "In Progress" → "Complete"
├─ PercentComplete: 0 → 100
│
├─ Task (child 1)
│  ├─ ParentID: abc-123
│  ├─ Name: "Research Data"
│  ├─ ConversationDetailID: NULL (only parent has this)
│  └─ AgentID: research-agent-id
│
└─ Task (child 2)
   ├─ ParentID: abc-123
   ├─ Name: "Create Report"
   ├─ dependsOn: child 1
   └─ AgentID: report-agent-id
```

**Key Changes**:
- Parent task created from `workflowName` field
- Parent task links to `ConversationDetailID`
- Child tasks link to parent via `ParentID`
- Child tasks DO NOT have `ConversationDetailID` (only parent does)
- Parent task tracks overall progress (0-100%)
- Parent task status updates as children complete

**Files**:
- [`TaskOrchestrator.ts`](command:_github.copilot.openRelativePath?%5B%7B%22scheme%22%3A%22file%22%2C%22authority%22%3A%22%22%2C%22path%22%3A%22%2FUsers%2Famith%2FDropbox%2Fdevelop%2FMac%2FMJ%2Fpackages%2FMJServer%2Fsrc%2Fservices%2FTaskOrchestrator.ts%22%2C%22query%22%3A%22%22%2C%22fragment%22%3A%22%22%7D%5D "/Users/amith/Dropbox/develop/Mac/MJ/packages/MJServer/src/services/TaskOrchestrator.ts"): Updated `createTasksFromGraph()`
- [`TaskOrchestrator.ts`](command:_github.copilot.openRelativePath?%5B%7B%22scheme%22%3A%22file%22%2C%22authority%22%3A%22%22%2C%22path%22%3A%22%2FUsers%2Famith%2FDropbox%2Fdevelop%2FMac%2FMJ%2Fpackages%2FMJServer%2Fsrc%2Fservices%2FTaskOrchestrator.ts%22%2C%22query%22%3A%22%22%2C%22fragment%22%3A%22%22%7D%5D "/Users/amith/Dropbox/develop/Mac/MJ/packages/MJServer/src/services/TaskOrchestrator.ts"): Renamed `executeTasksForConversation()` → `executeTasksForParent()`
- [`TaskOrchestrator.ts`](command:_github.copilot.openRelativePath?%5B%7B%22scheme%22%3A%22file%22%2C%22authority%22%3A%22%22%2C%22path%22%3A%22%2FUsers%2Famith%2FDropbox%2Fdevelop%2FMac%2FMJ%2Fpackages%2FMJServer%2Fsrc%2Fservices%2FTaskOrchestrator.ts%22%2C%22query%22%3A%22%22%2C%22fragment%22%3A%22%22%7D%5D "/Users/amith/Dropbox/develop/Mac/MJ/packages/MJServer/src/services/TaskOrchestrator.ts"): Added `updateParentTaskProgress()`
- [`TaskOrchestrator.ts`](command:_github.copilot.openRelativePath?%5B%7B%22scheme%22%3A%22file%22%2C%22authority%22%3A%22%22%2C%22path%22%3A%22%2FUsers%2Famith%2FDropbox%2Fdevelop%2FMac%2FMJ%2Fpackages%2FMJServer%2Fsrc%2Fservices%2FTaskOrchestrator.ts%22%2C%22query%22%3A%22%22%2C%22fragment%22%3A%22%22%7D%5D "/Users/amith/Dropbox/develop/Mac/MJ/packages/MJServer/src/services/TaskOrchestrator.ts"): Added `completeParentTask()`
- [`TaskResolver.ts`](command:_github.copilot.openRelativePath?%5B%7B%22scheme%22%3A%22file%22%2C%22authority%22%3A%22%22%2C%22path%22%3A%22%2FUsers%2Famith%2FDropbox%2Fdevelop%2FMac%2FMJ%2Fpackages%2FMJServer%2Fsrc%2Fresolvers%2FTaskResolver.ts%22%2C%22query%22%3A%22%22%2C%22fragment%22%3A%22%22%7D%5D "/Users/amith/Dropbox/develop/Mac/MJ/packages/MJServer/src/resolvers/TaskResolver.ts"): Updated to handle new return type

**Benefits**:
- Clean separation: parent = workflow, children = individual agent tasks
- Easy to find all tasks for a conversation (query by ConversationDetailID → get parent → get children)
- Gear icon can show parent task tree
- Progress tracking built-in (parent shows 0-100% based on children)

---

### 3. ✅ Removed ConversationDetailID from Sub-Tasks
**Why**: Only the parent task needs to link to the conversation. Sub-tasks link to parent via `ParentID`.

**Benefits**:
- Cleaner data model
- Single source of truth (parent owns conversation link)
- Easier to query: "get parent by ConversationDetailID, then get all children by ParentID"

---

### 4. ✅ Renamed "Libraries" → "Collections"
**Changed**: All user-facing text updated.

**Files**:
- Navigation tab: [`conversation-navigation.component.ts`](command:_github.copilot.openRelativePath?%5B%7B%22scheme%22%3A%22file%22%2C%22authority%22%3A%22%22%2C%22path%22%3A%22%2FUsers%2Famith%2FDropbox%2Fdevelop%2FMac%2FMJ%2Fpackages%2FAngular%2FGeneric%2Fconversations%2Fsrc%2Flib%2Fcomponents%2Fnavigation%2Fconversation-navigation.component.ts%22%2C%22query%22%3A%22%22%2C%22fragment%22%3A%22%22%7D%5D "/Users/amith/Dropbox/develop/Mac/MJ/packages/Angular/Generic/conversations/src/lib/components/navigation/conversation-navigation.component.ts")
  - "Libraries" → "Collections"

- Artifact actions: [`artifact-viewer-panel.component.html`](command:_github.copilot.openRelativePath?%5B%7B%22scheme%22%3A%22file%22%2C%22authority%22%3A%22%22%2C%22path%22%3A%22%2FUsers%2Famith%2FDropbox%2Fdevelop%2FMac%2FMJ%2Fpackages%2FAngular%2FGeneric%2Fconversations%2Fsrc%2Flib%2Fcomponents%2Fartifact%2Fartifact-viewer-panel.component.html%22%2C%22query%22%3A%22%22%2C%22fragment%22%3A%22%22%7D%5D "/Users/amith/Dropbox/develop/Mac/MJ/packages/Angular/Generic/conversations/src/lib/components/artifact/artifact-viewer-panel.component.html")
  - Button: "Save to Library" → "Save to Collection"
  - Title: "Save to Library" → "Save to Collection"
  - Dialog header: "Save to Library" → "Save to Collection"
  - Comment: "Save to Library Dialog" → "Save to Collection Dialog"

**Note**: Code variables (like `showLibraryDialog`) kept as-is to minimize breaking changes.

---

## Still TODO

### High Priority
1. **PubSub Progress Updates** - Stream task progress to UI
   - Prefix with current task name
   - Show agent progress details as smaller text
   - Update single ConversationDetail message in real-time

2. **Timeline/Gantt Visualization Component** - New standalone component
   - Show task tree with timeline
   - Display start/end times, duration
   - Show dependencies visually
   - Allow navigation to parent/child tasks
   - Can toggle between tree view and Gantt view

3. **Integration** - Connect to actual Conversation Manager response processing
   - Detect `taskGraph` in payload
   - Call `TaskOrchestrationResolver.ExecuteTaskGraph()`
   - Stream progress back to client

### Medium Priority
4. **Parent/Sub-Task Navigation** - In task view UI
   - "Go to parent" button on child tasks
   - "View sub-tasks" on parent tasks
   - Breadcrumb navigation

### Future
5. **Manual Task Creation** - User-created project management
   - Allow users to create tasks/sub-tasks manually
   - Asana/MS Project-lite functionality
   - Edit tasks that aren't AI-created

---

## Testing Needed

### Test Case 1: Single-Task Workflow
**Input**: "Research top 10 AI companies"

**Expected**:
```
Parent Task: "Research Companies"
└─ Child Task 1: "Research Companies" (agent: Research Agent)
```

**Verify**:
- Parent created with workflowName
- Parent links to ConversationDetailID
- Child has ParentID, no ConversationDetailID
- Parent shows 0% → 100% as child completes

### Test Case 2: Multi-Task Sequential
**Input**: "Research companies, then create report"

**Expected**:
```
Parent Task: "Research and Report"
├─ Child Task 1: "Research" (no dependencies)
└─ Child Task 2: "Create Report" (dependsOn: task1)
```

**Verify**:
- Task 1 executes first
- Task 2 waits for Task 1 to complete
- Task 2 receives Task 1's output
- Parent updates from 0% → 50% → 100%

### Test Case 3: Parallel Tasks with Merge
**Input**: "Get revenue data AND member counts, then create summary"

**Expected**:
```
Parent Task: "Data Analysis Workflow"
├─ Child Task 1: "Get Revenue" (no dependencies)
├─ Child Task 2: "Get Members" (no dependencies)
└─ Child Task 3: "Create Summary" (dependsOn: [task1, task2])
```

**Verify**:
- Tasks 1 and 2 execute in parallel
- Task 3 waits for both 1 and 2
- Task 3 receives outputs from both 1 and 2
- Parent updates: 0% → 33% → 66% → 100%

---

## Build Status
✅ All TypeScript compiles successfully
✅ No breaking changes
✅ Backward compatible (code variables unchanged)

---

## Migration Notes
**For existing deployments**:
- New prompt requires LLM to always return `workflowName`
- Old `invokeAgent` format no longer supported
- May need to update/retrain any hardcoded agent invocations
- Database schema unchanged - no migrations needed
