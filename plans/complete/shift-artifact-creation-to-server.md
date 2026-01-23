# Shift Artifact Creation to Server-Side

## Overview

Currently, artifact creation happens on the client-side after agent runs complete. This is brittle - if the user closes their browser or disconnects, the server completes the agent work but artifacts are never created. This plan moves artifact creation and user notification to the server, ensuring results persist even if the client disconnects.

---

## Current State Analysis

### Client-Side Processing (Current - Brittle)

**Location**: `packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts`

**Flow**:
1. User sends message → Server executes agent → Returns result to client
2. Client receives result with payload
3. **Client calls `createArtifactFromPayload()` (lines 1876-1976)**
4. **Client creates 3 database records**:
   - `MJ: Artifacts` (artifact header)
   - `MJ: Artifact Versions` (version with content)
   - `MJ: Conversation Detail Artifacts` (junction linking message to artifact)
5. Client emits event → Parent component reloads artifacts

**Call Sites in message-input.component.ts**:
- Line 833: Sage chat response with payload
- Line 1210: Task graph single task completion
- Line 1309: Sub-agent invocation completion
- Line 1530: Agent continuity with payload
- Line 1639: Direct agent response with payload

**Problems**:
- ❌ If user closes browser during step 3-4: Agent work is lost
- ❌ If network disconnects during step 3-4: Partial save state (artifact created but not linked)
- ❌ If client crashes during step 3-4: No artifacts saved despite successful agent run
- ❌ No user notification when work completes while away
- ❌ User must stay connected and on the page to see results

### Task Graph Processing (Already Server-Side ✅)

**Location**: `packages/MJServer/src/services/TaskOrchestrator.ts`

**Current Flow**:
- TaskOrchestrator **already creates artifacts on the server** (lines 680-755)
- Creates artifact for each task output
- Links to conversation detail via junction table
- ✅ Persists even if client disconnects

**Good Pattern to Follow**: The TaskOrchestrator shows the right approach - artifact creation happens server-side as part of task execution.

---

## Target State

### Server-Side Processing (Target - Robust)

**Flow**:
1. User sends message → Server executes agent
2. **Server detects payload in agent result**
3. **Server creates artifact records** (if `createArtifacts` option is true)
4. **Server creates user notification** (if `createNotification` option is true)
5. **Server publishes completion event**
6. **Client receives event** → Reloads conversation → Shows artifacts + notification

**Benefits**:
- ✅ Results persist even if client disconnects
- ✅ User gets notified when work completes (even if away)
- ✅ Single source of truth for artifact creation logic
- ✅ No race conditions or partial save states
- ✅ Works for scheduled/background agent runs
- ✅ User can close browser and come back to completed work

---

## Entity Schemas

### User Notification Entity

**Entity Name**: `User Notifications`
**Class**: `UserNotificationEntity`
**Table**: `UserNotification`
**View**: `vwUserNotifications`

**Key Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ID` | uniqueidentifier | Yes | Primary key |
| `UserID` | uniqueidentifier | Yes | FK to Users - who gets the notification |
| `Title` | nvarchar(255) | No | Brief title/subject |
| `Message` | nvarchar(MAX) | No | Full notification message |
| `ResourceTypeID` | uniqueidentifier | No | FK to Resource Types (for typed navigation) |
| `ResourceRecordID` | uniqueidentifier | No | ID of specific record |
| `ResourceConfiguration` | nvarchar(MAX) | No | **JSON string for custom navigation** |
| `Unread` | bit | Yes | Default: true |
| `ReadAt` | datetime | No | When user read it |

**Location**: `packages/MJCoreEntities/src/generated/entity_subclasses.ts:55534-55708`

**Key Insight**: Use `ResourceConfiguration` for conversation navigation:
```json
{
  "type": "conversation",
  "conversationId": "uuid",
  "messageId": "uuid",
  "artifactId": "uuid",
  "versionNumber": 1
}
```

---

## Implementation Plan

### Phase 1: Add Optional Parameters to RunAIAgent

**File**: `packages/MJServer/src/resolvers/RunAIAgentResolver.ts`

#### Task 1.1: Update GraphQL Mutation Signature

**Location**: RunAIAgentResolver.ts, lines 115-130

**Add new optional parameters**:
```typescript
@Mutation(() => AIAgentRunResult)
async RunAIAgent(
    @Arg('agentId') agentId: string,
    @Arg('messages') messagesJson: string,
    @Arg('sessionId') sessionId: string,
    @Arg('conversationDetailId', { nullable: true }) conversationDetailId?: string,
    @Arg('payload', { nullable: true }) payload?: string,
    @Arg('overrideModelId', { nullable: true }) overrideModelId?: string,
    @Arg('effortLevel', { nullable: true }) effortLevel?: string,
    @Arg('streamingEnabled', { nullable: true }) streamingEnabled?: boolean,
    @Arg('createArtifacts', { nullable: true, defaultValue: false }) createArtifacts?: boolean,  // NEW
    @Arg('createNotification', { nullable: true, defaultValue: false }) createNotification?: boolean,  // NEW
    @PubSub() pubSub: PubSubEngine,
    @Ctx() { userPayload }: AppContext
): Promise<AIAgentRunResult>
```

**Rationale**:
- `createArtifacts = false` by default (opt-in, not all agent runs need artifacts)
- `createNotification = false` by default (opt-in, not all agent runs need notifications)
- Both require `conversationDetailId` to function

#### Task 1.2: Pass Parameters to executeAIAgent()

**Location**: RunAIAgentResolver.ts, line ~145

```typescript
return await this.executeAIAgent(
    p,
    agentId,
    userPayload,
    messagesJson,
    sessionId,
    pubSub,
    conversationDetailId,
    payload,
    overrideModelId,
    effortLevel,
    streamingEnabled,
    createArtifacts,      // NEW
    createNotification    // NEW
);
```

#### Task 1.3: Update executeAIAgent() Method Signature

**Location**: RunAIAgentResolver.ts, line ~265

```typescript
private async executeAIAgent(
    p: DatabaseProviderBase,
    agentId: string,
    userPayload: UserPayload,
    messagesJson: string,
    sessionId: string,
    pubSub: PubSubEngine,
    conversationDetailId?: string,
    payload?: string,
    overrideModelId?: string,
    effortLevel?: string,
    streamingEnabled?: boolean,
    createArtifacts: boolean = false,          // NEW
    createNotification: boolean = false        // NEW
): Promise<AIAgentRunResult>
```

---

### Phase 2: Implement Server-Side Artifact Creation

#### Task 2.1: Add Helper Method - findPreviousArtifactForMessage()

**Location**: RunAIAgentResolver.ts (add after line 458)

```typescript
/**
 * Find the most recent artifact for a conversation detail to determine versioning
 * Returns artifact info if exists, null if this is first artifact
 */
private async findPreviousArtifactForMessage(
    conversationDetailId: string,
    contextUser: UserInfo
): Promise<{ artifactId: string; versionNumber: number } | null> {
    try {
        const rv = new RunView();

        // Query junction table to find artifacts for this message
        const result = await rv.RunView<ConversationDetailArtifactEntity>({
            EntityName: 'MJ: Conversation Detail Artifacts',
            ExtraFilter: `ConversationDetailID='${conversationDetailId}' AND Direction='Output'`,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 1,
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success || !result.Results || result.Results.length === 0) {
            return null;
        }

        const junction = result.Results[0];

        // Load the artifact version to get version number and artifact ID
        const md = new Metadata();
        const version = await md.GetEntityObject<ArtifactVersionEntity>(
            'MJ: Artifact Versions',
            contextUser
        );

        if (!(await version.Load(junction.ArtifactVersionID))) {
            return null;
        }

        return {
            artifactId: version.ArtifactID,
            versionNumber: version.VersionNumber
        };
    } catch (error) {
        LogError(`Error finding previous artifact: ${error.message}`);
        return null;
    }
}
```

**Rationale**: This enables versioning - if the same agent runs again on the same message, create a new version instead of a new artifact.

#### Task 2.2: Add Core Method - processAgentCompletionForArtifacts()

**Location**: RunAIAgentResolver.ts (add after Task 2.1)

```typescript
/**
 * Process agent completion to create artifacts from payload
 * Called after agent run completes successfully
 *
 * @param agentRun - The completed agent run entity
 * @param payload - The payload object from agent result
 * @param contextUser - User context for database operations
 * @param conversationDetailId - Optional conversation detail ID to link artifacts to
 * @returns Artifact info if created, empty object otherwise
 */
private async processAgentCompletionForArtifacts(
    agentRun: AIAgentRunEntityExtended,
    payload: any,
    contextUser: UserInfo,
    conversationDetailId?: string
): Promise<{ artifactId?: string; versionId?: string; versionNumber?: number }> {
    // Validate inputs
    if (!payload || Object.keys(payload).length === 0) {
        LogStatus('No payload to create artifact from');
        return {};
    }

    if (!conversationDetailId) {
        LogStatus('Skipping artifact creation - no conversationDetailId provided');
        return {};
    }

    try {
        const md = new Metadata();

        // 1. Determine if creating new artifact or new version
        let artifactId: string;
        let newVersionNumber: number;

        const previousArtifact = await this.findPreviousArtifactForMessage(
            conversationDetailId,
            contextUser
        );

        if (previousArtifact) {
            // Create new version of existing artifact
            artifactId = previousArtifact.artifactId;
            newVersionNumber = previousArtifact.versionNumber + 1;
            LogStatus(`Creating version ${newVersionNumber} of existing artifact ${artifactId}`);
        } else {
            // Create new artifact header
            const artifact = await md.GetEntityObject<ArtifactEntity>(
                'MJ: Artifacts',
                contextUser
            );

            // Get agent info for naming
            await AIEngine.Instance.Config(false, contextUser);
            const agent = AIEngine.Instance.Agents.find(a => a.ID === agentRun.AgentID);
            const agentName = agent?.Name || 'Agent';

            artifact.Name = `${agentName} Payload - ${new Date().toLocaleString()}`;
            artifact.Description = `Payload returned by ${agentName}`;

            // Use agent's DefaultArtifactTypeID if available, otherwise JSON
            const defaultArtifactTypeId = (agent as any)?.DefaultArtifactTypeID;
            artifact.TypeID = defaultArtifactTypeId || 'ae674c7e-ea0d-49ea-89e4-0649f5eb20d4'; // JSON type

            artifact.UserID = contextUser.ID;
            artifact.EnvironmentID = (contextUser as any).EnvironmentID ||
                                    'F51358F3-9447-4176-B313-BF8025FD8D09';

            if (!(await artifact.Save())) {
                throw new Error('Failed to save artifact');
            }

            artifactId = artifact.ID;
            newVersionNumber = 1;
            LogStatus(`Created new artifact: ${artifact.Name} (${artifactId})`);
        }

        // 2. Create artifact version with content
        const version = await md.GetEntityObject<ArtifactVersionEntity>(
            'MJ: Artifact Versions',
            contextUser
        );
        version.ArtifactID = artifactId;
        version.VersionNumber = newVersionNumber;
        version.Content = JSON.stringify(payload, null, 2);
        version.UserID = contextUser.ID;

        if (!(await version.Save())) {
            throw new Error('Failed to save artifact version');
        }

        LogStatus(`Created artifact version ${newVersionNumber} (${version.ID})`);

        // 3. Create junction record linking artifact to conversation detail
        const junction = await md.GetEntityObject<ConversationDetailArtifactEntity>(
            'MJ: Conversation Detail Artifacts',
            contextUser
        );
        junction.ConversationDetailID = conversationDetailId;
        junction.ArtifactVersionID = version.ID;
        junction.Direction = 'Output';

        if (!(await junction.Save())) {
            throw new Error('Failed to create artifact-message association');
        }

        LogStatus(`Linked artifact to conversation detail ${conversationDetailId}`);

        return {
            artifactId,
            versionId: version.ID,
            versionNumber: newVersionNumber
        };
    } catch (error) {
        LogError(`Failed to process agent completion for artifacts: ${error.message}`);
        return {};
    }
}
```

**Rationale**:
- Mirrors the client-side logic exactly
- Handles versioning for repeated agent runs
- Gracefully fails if inputs missing
- Returns artifact info for notification creation

#### Task 2.3: Call processAgentCompletionForArtifacts() After Agent Completes

**Location**: RunAIAgentResolver.ts, after line 381 (after `publishFinalEvents()`)

```typescript
// After agent completes successfully
if (result.success && createArtifacts && conversationDetailId && result.payload) {
    const artifactInfo = await this.processAgentCompletionForArtifacts(
        result.agentRun,
        result.payload,
        currentUser,
        conversationDetailId
    );

    // Create user notification if enabled and artifact was created
    if (createNotification && artifactInfo.artifactId) {
        await this.createCompletionNotification(
            result.agentRun,
            artifactInfo,
            conversationDetailId,
            currentUser,
            pubSub
        );
    }
}
```

**Rationale**: Only creates artifacts/notifications if explicitly requested via parameters.

---

### Phase 3: Implement Server-Side Notification Creation

#### Task 3.1: Add Method - createCompletionNotification()

**Location**: RunAIAgentResolver.ts (add after Task 2.2)

```typescript
/**
 * Create a user notification for agent completion with artifact
 * Notification includes navigation link back to the conversation
 *
 * @param agentRun - The completed agent run
 * @param artifactInfo - Info about created artifact (from processAgentCompletionForArtifacts)
 * @param conversationDetailId - The conversation detail ID
 * @param contextUser - User to notify
 * @param pubSub - PubSub engine for real-time updates
 */
private async createCompletionNotification(
    agentRun: AIAgentRunEntityExtended,
    artifactInfo: { artifactId: string; versionId: string; versionNumber: number },
    conversationDetailId: string,
    contextUser: UserInfo,
    pubSub: PubSubEngine
): Promise<void> {
    try {
        const md = new Metadata();

        // Get agent info for notification message
        await AIEngine.Instance.Config(false, contextUser);
        const agent = AIEngine.Instance.Agents.find(a => a.ID === agentRun.AgentID);
        const agentName = agent?.Name || 'Agent';

        // Load conversation detail to get conversation info
        const detail = await md.GetEntityObject<ConversationDetailEntity>(
            'Conversation Details',
            contextUser
        );
        if (!(await detail.Load(conversationDetailId))) {
            throw new Error(`Failed to load conversation detail ${conversationDetailId}`);
        }

        // Create notification entity
        const notification = await md.GetEntityObject<UserNotificationEntity>(
            'User Notifications',
            contextUser
        );

        notification.UserID = contextUser.ID;
        notification.Title = `${agentName} completed your request`;

        // Craft message based on versioning
        if (artifactInfo.versionNumber > 1) {
            notification.Message = `${agentName} has finished processing and created version ${artifactInfo.versionNumber}`;
        } else {
            notification.Message = `${agentName} has finished processing and created a new artifact`;
        }

        // Store navigation configuration as JSON
        // Client will parse this to navigate to the conversation with artifact visible
        notification.ResourceConfiguration = JSON.stringify({
            type: 'conversation',
            conversationId: detail.ConversationID,
            messageId: conversationDetailId,
            artifactId: artifactInfo.artifactId,
            versionNumber: artifactInfo.versionNumber
        });

        notification.Unread = true;  // Default unread
        // ResourceTypeID and ResourceRecordID left null - using custom navigation

        if (!(await notification.Save())) {
            throw new Error('Failed to save notification');
        }

        LogStatus(`📬 Created notification ${notification.ID} for user ${contextUser.ID}`);

        // Publish real-time notification event so client updates immediately
        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            userPayload: this.SerializeUserPayload(contextUser),
            message: JSON.stringify({
                type: 'notification',
                notificationId: notification.ID,
                action: 'create',
                title: notification.Title,
                message: notification.Message
            })
        });

        LogStatus(`📡 Published notification event to client`);

    } catch (error) {
        LogError(`Failed to create completion notification: ${error.message}`);
        // Don't throw - notification failure shouldn't fail the agent run
    }
}
```

**Rationale**:
- Creates notification with custom navigation config
- Publishes real-time event so user sees notification immediately
- Gracefully fails (logs error but doesn't throw)
- Uses agent name for personalized messaging

---

### Phase 4: Update Task Graph Execution

**File**: `packages/MJServer/src/services/TaskOrchestrator.ts`

#### Task 4.1: Add createNotification Option to TaskOrchestrator Constructor

**Location**: TaskOrchestrator.ts, lines 49-54

```typescript
constructor(
    private contextUser: UserInfo,
    private pubSub?: PubSubEngine,
    private sessionId?: string,
    private userPayload?: UserPayload,
    private createNotifications: boolean = false  // NEW - default false
) {}
```

#### Task 4.2: Create Notification After Parent Task Completes

**Location**: TaskOrchestrator.ts, add to `completeParentTask()` method after line 425

**Current code** (line 402-425):
```typescript
private async completeParentTask(parentTaskId: string): Promise<void> {
    try {
        const md = new Metadata();
        const parentTask = await md.GetEntityObject<TaskEntity>('MJ: Tasks', this.contextUser);

        if (!(await parentTask.Load(parentTaskId))) {
            LogError(`Failed to load parent task ${parentTaskId}`);
            return;
        }

        parentTask.Status = 'Complete';
        parentTask.CompletedAt = new Date();
        parentTask.PercentComplete = 100;

        const saved = await parentTask.Save();
        if (!saved) {
            LogError(`Failed to save parent task ${parentTaskId}`);
        } else {
            LogStatus(`✅ Parent task ${parentTask.Name} completed`);
        }
    } catch (error) {
        LogError(`Error completing parent task: ${error}`);
    }
}
```

**Add after line 425**:
```typescript
// If notifications enabled, create user notification
if (this.createNotifications && saved) {
    await this.createTaskGraphCompletionNotification(parentTask);
}
```

#### Task 4.3: Add Method - createTaskGraphCompletionNotification()

**Location**: TaskOrchestrator.ts (add at end of class, before closing brace)

```typescript
/**
 * Create user notification for task graph completion
 * Notifies user that their multi-step workflow has completed
 */
private async createTaskGraphCompletionNotification(
    parentTask: TaskEntity
): Promise<void> {
    try {
        if (!parentTask.ConversationDetailID) {
            LogStatus('Skipping notification - no conversation detail linked');
            return;
        }

        const md = new Metadata();

        // Load conversation detail to get conversation ID
        const detail = await md.GetEntityObject<ConversationDetailEntity>(
            'Conversation Details',
            this.contextUser
        );
        if (!(await detail.Load(parentTask.ConversationDetailID))) {
            throw new Error(`Failed to load conversation detail ${parentTask.ConversationDetailID}`);
        }

        // Count child tasks and success rate
        const rv = new RunView();
        const tasksResult = await rv.RunView<TaskEntity>({
            EntityName: 'MJ: Tasks',
            ExtraFilter: `ParentID='${parentTask.ID}'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        const childTasks = tasksResult.Success ? (tasksResult.Results || []) : [];
        const successCount = childTasks.filter(t => t.Status === 'Complete').length;
        const totalCount = childTasks.length;

        // Create notification
        const notification = await md.GetEntityObject<UserNotificationEntity>(
            'User Notifications',
            this.contextUser
        );

        notification.UserID = this.contextUser.ID;
        notification.Title = `Workflow "${parentTask.Name}" completed`;
        notification.Message = `Your ${totalCount}-step workflow has finished. ${successCount} of ${totalCount} tasks completed successfully.`;

        // Navigation configuration
        notification.ResourceConfiguration = JSON.stringify({
            type: 'conversation',
            conversationId: detail.ConversationID,
            messageId: parentTask.ConversationDetailID,
            taskId: parentTask.ID  // Can be used to highlight tasks
        });

        notification.Unread = true;

        if (!(await notification.Save())) {
            throw new Error('Failed to save notification');
        }

        LogStatus(`📬 Created task graph notification ${notification.ID} for user ${this.contextUser.ID}`);

        // Publish real-time event if pubSub available
        if (this.pubSub && this.userPayload) {
            this.pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
                userPayload: this.SerializeUserPayload(this.userPayload),
                message: JSON.stringify({
                    type: 'notification',
                    notificationId: notification.ID,
                    action: 'create',
                    title: notification.Title,
                    message: notification.Message
                })
            });
        }

    } catch (error) {
        LogError(`Failed to create task graph notification: ${error.message}`);
        // Don't throw - notification failure shouldn't fail the task
    }
}

/**
 * Helper to serialize UserPayload (copied from ResolverBase if not available)
 */
private SerializeUserPayload(userPayload: UserPayload): string {
    return JSON.stringify({
        UserID: userPayload.UserID,
        Email: userPayload.Email,
        IsActive: userPayload.IsActive,
        FirstName: userPayload.FirstName,
        LastName: userPayload.LastName,
        Name: userPayload.Name,
        Roles: userPayload.Roles,
        EnvironmentID: userPayload.EnvironmentID,
        EnvironmentName: userPayload.EnvironmentName
    });
}
```

**Rationale**:
- Provides summary of workflow completion
- Shows success rate (e.g., "3 of 4 tasks completed")
- Links to conversation for easy navigation
- Uses same notification pattern as single agent runs

#### Task 4.4: Update TaskResolver to Pass createNotifications Flag

**Location**: `packages/MJServer/src/resolvers/TaskResolver.ts`

**Add parameter to ExecuteTaskGraph mutation** (line 50):
```typescript
@Mutation(() => ExecuteTaskGraphResult)
async ExecuteTaskGraph(
    @Arg('taskGraphJson') taskGraphJson: string,
    @Arg('conversationDetailId') conversationDetailId: string,
    @Arg('environmentId') environmentId: string,
    @Arg('sessionId') sessionId: string,
    @Arg('createNotifications', { nullable: true, defaultValue: false }) createNotifications?: boolean,  // NEW
    @PubSub() pubSub: PubSubEngine,
    @Ctx() { userPayload }: AppContext
): Promise<ExecuteTaskGraphResult>
```

**Pass to orchestrator** (line 81):
```typescript
const orchestrator = new TaskOrchestrator(
    currentUser,
    pubSub,
    sessionId,
    userPayload,
    createNotifications || false  // NEW
);
```

**Rationale**: Makes notifications opt-in for task graphs, matching RunAIAgent pattern.

---

### Phase 5: Update Client to Use Server-Side Creation

**File**: `packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts`

#### Task 5.1: Update GraphQL Mutation Call

**Location**: message-input.component.ts (find the GraphQL mutation call)

**Update the mutation to include new parameters**:
```typescript
const mutation = `
  mutation RunAIAgent(
    $agentId: String!,
    $messages: String!,
    $sessionId: String!,
    $conversationDetailId: String,
    $payload: String,
    $createArtifacts: Boolean,
    $createNotification: Boolean
  ) {
    RunAIAgent(
      agentId: $agentId,
      messages: $messages,
      sessionId: $sessionId,
      conversationDetailId: $conversationDetailId,
      payload: $payload,
      createArtifacts: $createArtifacts,
      createNotification: $createNotification
    ) {
      success
      errorMessage
      result
    }
  }
`;

// Call with new parameters
const variables = {
    agentId: agent.ID,
    messages: JSON.stringify(conversationMessages),
    sessionId: this.sessionId,
    conversationDetailId: conversationDetail.ID,  // Always pass this
    payload: existingPayload,
    createArtifacts: true,        // Enable server-side artifact creation
    createNotification: true      // Enable server-side notifications
};
```

#### Task 5.2: Update ExecuteTaskGraph Mutation Call

**Location**: message-input.component.ts (find ExecuteTaskGraph mutation)

**Add createNotifications parameter**:
```typescript
const mutation = `
  mutation ExecuteTaskGraph(
    $taskGraphJson: String!,
    $conversationDetailId: String!,
    $environmentId: String!,
    $sessionId: String!,
    $createNotifications: Boolean
  ) {
    ExecuteTaskGraph(
      taskGraphJson: $taskGraphJson,
      conversationDetailId: $conversationDetailId,
      environmentId: $environmentId,
      sessionId: $sessionId,
      createNotifications: $createNotifications
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
`;

const variables = {
    taskGraphJson: JSON.stringify(result.payload.taskGraph),
    conversationDetailId: userMessage.ID,
    environmentId: (this.currentUser as any).EnvironmentID,
    sessionId: this.sessionId,
    createNotifications: true  // NEW
};
```

#### Task 5.3: Remove All Client-Side createArtifactFromPayload() Calls

**Remove or comment out these calls**:

1. **Line 833** - Sage chat response:
```typescript
// REMOVE THIS:
// if (result.payload && Object.keys(result.payload).length > 0) {
//     await this.createArtifactFromPayload(result.payload, conversationManagerMessage, result.agentRun.AgentID);
// }

// Server already created artifacts - just emit event to trigger reload
if (result.payload && Object.keys(result.payload).length > 0) {
    this.artifactCreated.emit({
        artifactId: '',  // Will be fetched from reload
        versionId: '',
        versionNumber: 0,
        conversationDetailId: conversationManagerMessage.ID,
        name: ''
    });
}
```

2. **Line 1210** - Task graph single task:
```typescript
// REMOVE THIS:
// if (agentResult.payload && Object.keys(agentResult.payload).length > 0) {
//     await this.createArtifactFromPayload(...);
// }

// Server handles task artifacts - just emit reload event
this.artifactCreated.emit({
    artifactId: '',
    versionId: '',
    versionNumber: 0,
    conversationDetailId: agentResponseMessage.ID,
    name: ''
});
```

3. **Line 1309** - Sub-agent invocation:
```typescript
// REMOVE THIS:
// if (subResult.payload && Object.keys(subResult.payload).length > 0) {
//     await this.createArtifactFromPayload(...);
// }

// Server created artifacts - emit reload
this.artifactCreated.emit({
    artifactId: '',
    versionId: '',
    versionNumber: 0,
    conversationDetailId: agentResponseMessage.ID,
    name: ''
});
```

4. **Line 1530** - Agent continuity:
```typescript
// REMOVE THIS:
// if (continuityResult.payload && Object.keys(continuityResult.payload).length > 0) {
//     await this.createArtifactFromPayload(..., previousArtifactInfo);
// }

// Server handles versioning - emit reload
this.artifactCreated.emit({
    artifactId: '',
    versionId: '',
    versionNumber: 0,
    conversationDetailId: agentResponseMessage.ID,
    name: ''
});
```

5. **Line 1639** - Direct agent response:
```typescript
// REMOVE THIS:
// if (result.payload && Object.keys(result.payload).length > 0) {
//     await this.createArtifactFromPayload(...);
// }

// Server created artifacts - emit reload
this.artifactCreated.emit({
    artifactId: '',
    versionId: '',
    versionNumber: 0,
    conversationDetailId: agentResponseMessage.ID,
    name: ''
});
```

**Rationale**:
- Keep the `artifactCreated.emit()` calls - they trigger UI refresh via `reloadArtifactsForMessage()`
- Remove actual artifact creation - server handles it now
- Parent component's `onArtifactCreated()` already queries database to fetch artifacts

#### Task 5.4: Remove createArtifactFromPayload() Method Entirely

**Location**: message-input.component.ts, lines 1876-1976

**Action**: Delete the entire method - no longer needed.

**Rationale**: All artifact creation now happens server-side.

---

### Phase 6: Client-Side Notification Handling

**File**: `packages/Angular/Explorer/explorer-core/` (or conversation workspace)

#### Task 6.1: Add Notification Click Handler for Conversations

**Location**: Wherever UserNotificationsComponent is hosted

```typescript
/**
 * Handle notification click - navigate to conversation with artifact
 */
async handleNotificationClick(notification: UserNotificationEntity): Promise<void> {
    try {
        // Parse resource configuration
        if (!notification.ResourceConfiguration) {
            return;
        }

        const config = JSON.parse(notification.ResourceConfiguration);

        // Handle conversation-type notifications
        if (config.type === 'conversation') {
            // Navigate to chat route with query params
            await this.router.navigate(['/chat'], {
                queryParams: {
                    conversationId: config.conversationId,
                    messageId: config.messageId,
                    artifactId: config.artifactId,
                    versionNumber: config.versionNumber,
                    taskId: config.taskId  // Optional - for task graph notifications
                }
            });

            // Mark notification as read
            notification.Unread = false;
            notification.ReadAt = new Date();
            await notification.Save();

            LogStatus(`Navigated to conversation ${config.conversationId}`);
        }
    } catch (error) {
        LogError(`Failed to handle notification click: ${error.message}`);
    }
}
```

#### Task 6.2: Update ConversationWorkspaceComponent to Handle Query Params

**Location**: `packages/Angular/Generic/conversations/src/lib/components/workspace/conversation-workspace.component.ts`

**Add to ngOnInit or route param handler**:
```typescript
async ngOnInit() {
    // ... existing init code ...

    // Check for navigation from notification
    this.route.queryParams.subscribe(async params => {
        if (params['conversationId']) {
            // Set active conversation
            this.conversationState.setActiveConversation(params['conversationId']);

            // If artifactId provided, open artifact panel
            if (params['artifactId']) {
                this.artifactState.openArtifact(
                    params['artifactId'],
                    params['versionNumber'] ? parseInt(params['versionNumber']) : undefined
                );
            }

            // If taskId provided, open tasks panel to show specific task
            if (params['taskId']) {
                this.activeTab = 'tasks';
                // Could add task highlighting logic here
            }
        }
    });
}
```

**Rationale**: Enables deep linking from notifications to specific conversation + artifact + version.

---

### Phase 7: Reconnection Logic for In-Progress Runs

**Problem**: If user refreshes browser during an active agent run or task graph, they won't receive streaming updates anymore - the UI will show "In Progress" but no live updates.

**Solution**: The GraphQL Data Provider already handles session persistence and WebSocket reconnection automatically. We just need to ensure the conversations package properly reconnects to ongoing runs.

#### Task 7.1: Verify Session ID Persistence (Already Implemented ✅)

**Location**: `packages/GraphQLDataProvider/src/graphQLDataProvider.ts:282-323`

The GraphQL provider already:
- Stores session IDs in localStorage (URL-specific)
- Retrieves session ID on browser refresh
- Passes session ID in HTTP headers (`x-session-id`)
- Uses same session ID for WebSocket subscriptions

**No changes needed** - this is foundational infrastructure already working.

#### Task 7.2: Detect In-Progress Runs on Conversation Load

**Location**: `packages/Angular/Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.ts`

**Add to loadMessages() method** (after line 158):

```typescript
private async loadMessages(conversationId: string): Promise<void> {
    try {
        // ... existing load logic ...

        // After loading messages, check if any are in processing state
        await this.detectAndReconnectToInProgressRuns(conversationId);

    } catch (error) {
        console.error('Error loading messages:', error);
        this.messages = [];
    }
}
```

**Add new method**:

```typescript
/**
 * Detect in-progress agent runs/tasks and reconnect to their streaming updates
 * Called after loading a conversation to resume progress tracking
 */
private async detectAndReconnectToInProgressRuns(conversationId: string): Promise<void> {
    // Check for in-progress messages
    const inProgressMessages = this.messages.filter(
        m => m.Status === 'In-Progress' && m.Role === 'AI'
    );

    if (inProgressMessages.length === 0) {
        return;
    }

    // For each in-progress message, check if there's an active agent run
    for (const message of inProgressMessages) {
        if (message.AgentID) {
            // Check agent state service for this run
            const agentRun = this.agentRunsByDetailId.get(message.ID);

            if (agentRun && (agentRun.Status === 'In-Progress' || agentRun.Status === 'Running')) {
                console.log(`🔌 Reconnecting to agent run ${agentRun.ID} for message ${message.ID}`);

                // Agent state service polling will automatically pick this up
                // The WebSocket subscription is already active via PushStatusUpdates()
                // No additional action needed - just log for visibility
            }
        }
    }

    // Agent state service is already polling via startPolling() in onConversationChanged()
    // WebSocket subscription is already active via message-input component's subscribeToPushStatus()
    // Both will automatically receive updates for these in-progress runs
}
```

**Rationale**:
- Detects in-progress messages on conversation load
- Logs reconnection for debugging
- Relies on existing polling + WebSocket infrastructure
- No custom reconnection needed - infrastructure handles it

#### Task 7.3: Verify Message Input Subscription (Already Implemented ✅)

**Location**: `packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts:94-116`

The message-input component already subscribes to PushStatusUpdates:

```typescript
private subscribeToPushStatus() {
    const dataProvider = GraphQLDataProvider.Instance;
    this.pushStatusSubscription = dataProvider.PushStatusUpdates().subscribe((status: any) => {
        if (!status || !status.message) return;

        try {
            const statusObj = JSON.parse(status.message);

            // Handle task orchestrator progress
            if (statusObj.resolver === 'TaskOrchestrator') {
                this.handleTaskProgress(statusObj);
            }
        } catch (error) {
            console.error('Error parsing push status update:', error);
        }
    });
}
```

**Verification Needed**:
- Ensure this subscribes using the **persisted session ID**
- GraphQLDataProvider should automatically use stored session ID
- Should be called in `ngOnInit()` before any agent runs start

**Add logging to verify**:
```typescript
private subscribeToPushStatus() {
    const dataProvider = GraphQLDataProvider.Instance;
    const sessionId = (dataProvider as any).sessionId;  // Access internal session ID

    console.log(`📡 Subscribing to PushStatusUpdates with sessionId: ${sessionId}`);

    this.pushStatusSubscription = dataProvider.PushStatusUpdates().subscribe((status: any) => {
        // ... existing handler ...
    });
}
```

#### Task 7.4: Ensure Agent State Polling Handles Reconnection

**Location**: `packages/Angular/Generic/conversations/src/lib/services/agent-state.service.ts`

**Current implementation** already handles this correctly:

```typescript
// Polling runs every 30 seconds
// When browser refreshes, onConversationChanged() calls startPolling()
// This will detect any in-progress agent runs and keep polling until complete
```

**No changes needed** - the 30-second polling already provides reconnection.

#### Task 7.5: Add Visual Indicator for Reconnected State

**Location**: `packages/Angular/Generic/conversations/src/lib/components/message/message-item.component.html`

**Optional enhancement** - show that we reconnected to an in-progress run:

```html
<!-- Add to message header for in-progress messages -->
<span *ngIf="isTemporaryMessage || isAgentRunActive" class="reconnection-indicator" title="Tracking live progress">
  <i class="fas fa-wifi"></i>
  Connected
</span>
```

**With CSS**:
```css
.reconnection-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #D1FAE5;
  color: #065F46;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  margin-left: 4px;
}

.reconnection-indicator i {
  font-size: 9px;
  animation: pulse 2s ease-in-out infinite;
}
```

**Rationale**: Gives user confidence that they're seeing live updates, not stale data.

---

### Phase 8: Testing & Validation

#### Task 8.1: Create Test Scenarios

**Test Cases**:

1. **Single Agent Run - Normal Completion**
   - Start agent from conversation
   - Close browser mid-execution
   - Reopen → Verify artifact exists
   - Verify notification received
   - Click notification → Verify navigation works

2. **Single Agent Run - Quick Completion**
   - Start agent, stay connected
   - Verify artifact created server-side
   - Verify notification appears
   - Verify UI refreshes properly

3. **Agent Continuity - Versioning**
   - Run agent, get result
   - Run same agent again (continuity)
   - Verify version 2 created (not new artifact)
   - Verify notification shows "version 2"

4. **Task Graph - Multi-Step**
   - Start workflow with 3 tasks
   - Close browser
   - Reopen after completion
   - Verify all 3 task artifacts created
   - Verify single workflow notification
   - Verify notification shows "3 of 3 completed"

5. **Task Graph - Partial Failure**
   - Start workflow with 3 tasks, 1 fails
   - Verify notification shows "2 of 3 completed"

6. **No ConversationDetailId**
   - Call RunAIAgent without conversationDetailId
   - Verify no artifacts created (logs warning)
   - Verify no notification created

7. **Disabled Flags**
   - Call with `createArtifacts: false`
   - Verify no artifacts created
   - Call with `createNotification: false`
   - Verify no notification created

8. **Reconnection - Agent Run In Progress** ⭐ NEW
   - Start agent from conversation
   - Refresh browser mid-execution (Ctrl+R or F5)
   - Verify:
     - Message still shows as "In Progress" with purple pill
     - Live timer continues updating
     - WebSocket streaming updates resume (check console for "📡 Subscribing...")
     - Progress messages update in real-time
     - Completion happens normally
     - Artifact appears after completion
     - Notification appears

9. **Reconnection - Task Graph In Progress** ⭐ NEW
   - Start multi-task workflow
   - Refresh browser while tasks are executing
   - Verify:
     - Parent task shows "In Progress"
     - Child tasks show correct status (Pending/In Progress/Complete)
     - Task progress updates resume via WebSocket
     - Remaining tasks complete normally
     - All artifacts created
     - Final notification appears

10. **Reconnection - Network Disconnect** ⭐ NEW
    - Start agent run
    - Disable network (airplane mode)
    - Wait 30 seconds
    - Re-enable network
    - Verify:
      - Agent state polling resumes
      - Detects completion when it happens
      - Shows final result
      - No duplicate executions

#### Task 7.2: Manual Testing Checklist

- [ ] Test with browser open (happy path)
- [ ] Test with browser closed mid-execution
- [ ] Test with network disconnect mid-execution
- [ ] Test notification appears in real-time
- [ ] Test notification click navigation
- [ ] Test artifact panel opens with correct version
- [ ] Test task graph with multiple agents
- [ ] Test agent versioning (run same agent twice)
- [ ] Test without conversationDetailId (should skip gracefully)

#### Task 7.3: Monitor for Edge Cases

**Things to Watch**:
- Duplicate artifact creation (if client and server both create)
- Version number conflicts (if multiple executions in parallel)
- Notification spam (if many agents complete quickly)
- Memory leaks (notification subscriptions not cleaned up)
- Performance impact (extra database writes)

---

### Phase 8: Deployment & Rollout

#### Task 8.1: Feature Flag (Optional)

Consider adding a feature flag to toggle between client-side and server-side:

```typescript
// In config or environment
const USE_SERVER_SIDE_ARTIFACTS = true;

// In client code
if (USE_SERVER_SIDE_ARTIFACTS) {
    // New approach - server creates artifacts
    // Just emit reload event
} else {
    // Old approach - client creates artifacts
    await this.createArtifactFromPayload(...);
}
```

**Rationale**: Allows quick rollback if issues discovered.

#### Task 8.2: Migration Steps

1. **Deploy server changes** to staging
2. **Test thoroughly** with feature flag OFF
3. **Enable feature flag** for internal testing
4. **Monitor logs** for errors/warnings
5. **Validate notifications** work correctly
6. **Deploy to production** with feature flag ON
7. **Remove old client-side code** after validation period

---

## Key Design Decisions

### 1. Optional Parameters (Not Always-On)

**Decision**: Use `createArtifacts` and `createNotification` as opt-in parameters.

**Rationale**:
- Not all agent runs need artifacts (e.g., simple chat responses)
- Not all agent runs need notifications (e.g., background processes)
- Caller controls behavior based on context

### 2. Graceful Degradation

**Decision**: If artifact creation fails, log error but don't fail the agent run.

**Rationale**:
- Agent successfully executed - user should know
- Artifact is secondary to the execution success
- Better to complete with warning than fail entirely

### 3. Versioning Logic

**Decision**: Check for previous artifacts on same conversation detail to determine versioning.

**Rationale**:
- Maintains continuity when user iterates with same agent
- Prevents artifact proliferation
- Matches client-side behavior

### 4. Notification Timing

**Decision**: Create notification AFTER artifact is successfully created.

**Rationale**:
- Only notify if there's something to show
- Notification includes artifact info in navigation
- Avoids "empty" notifications

### 5. Real-Time Events

**Decision**: Publish notification via PubSub immediately after creation.

**Rationale**:
- User sees notification in real-time (if connected)
- Works even if user on different page
- Notification persists in database for later viewing

---

## File Changes Summary

### Server-Side Changes

| File | Changes | Lines |
|------|---------|-------|
| `RunAIAgentResolver.ts` | Add optional params, artifact creation, notification creation | ~200 |
| `TaskOrchestrator.ts` | Add notification creation after task graph completes | ~100 |
| `TaskResolver.ts` | Add createNotifications parameter | ~5 |

### Client-Side Changes

| File | Changes | Lines |
|------|---------|-------|
| `message-input.component.ts` | Remove createArtifactFromPayload(), update mutations | -100, +20 |
| Notification handler (TBD location) | Add conversation navigation logic | +30 |
| `conversation-workspace.component.ts` | Add query param handling | +20 |

**Total Estimated Changes**: ~475 lines (200 added server, 100 removed client, 175 modifications)

---

## Timeline Estimate

### Development
- **Phase 1-2** (Server artifact creation): 2-3 hours
- **Phase 3** (Server notifications): 1-2 hours
- **Phase 4** (Task graph notifications): 1 hour
- **Phase 5** (Client mutation updates): 1 hour
- **Phase 6** (Client notification handling): 1-2 hours

**Total Development**: 6-10 hours

### Testing
- **Phase 7** (Testing scenarios): 3-4 hours
- **Edge case validation**: 1-2 hours

**Total Testing**: 4-6 hours

### **Grand Total**: 10-16 hours

---

## Risk Assessment

### Low Risk
- ✅ Server-side code is well-isolated (new methods, optional params)
- ✅ Existing task graph already uses server-side artifacts successfully
- ✅ No schema changes needed
- ✅ Easy to feature-flag or roll back

### Medium Risk
- ⚠️ Need to ensure version number logic matches client exactly
- ⚠️ Multiple agents completing simultaneously could race
- ⚠️ Notification spam if many agents complete quickly

### Mitigation
- Add transaction isolation for version number generation
- Add debouncing for notifications (e.g., batch within 5 seconds)
- Monitor logs closely during rollout
- Keep feature flag for quick rollback

---

## Success Criteria

### Must Have
1. ✅ Artifacts created server-side when `createArtifacts=true`
2. ✅ Artifacts persist even if client disconnects
3. ✅ Notifications created when `createNotification=true`
4. ✅ Clicking notification navigates to conversation with artifact open
5. ✅ No client-side artifact creation code remains

### Should Have
1. ✅ Versioning works correctly (v2, v3, etc.)
2. ✅ Task graph creates notification with summary
3. ✅ Real-time notification updates when user connected
4. ✅ Graceful failure (logs errors, doesn't crash)

### Nice to Have
1. ✅ Feature flag for rollback capability
2. ✅ Notification batching to prevent spam
3. ✅ Deep linking to specific task in task graph
4. ✅ Migration guide for other callers of RunAIAgent

---

## Next Steps

1. **Review this plan** - confirm approach
2. **Implement Phase 1-2** - server-side artifact creation
3. **Test in isolation** - verify artifacts created correctly
4. **Implement Phase 3-4** - notifications
5. **Test notifications** - verify navigation works
6. **Implement Phase 5** - client updates
7. **Integration testing** - full end-to-end flow
8. **Deploy to staging** - validate in realistic environment
9. **Production deployment** - with monitoring

---

## Questions to Resolve

1. **Should we batch notifications?** If 5 tasks complete within 10 seconds, send 1 notification or 5?
2. **What about scheduled agents?** Should they also create notifications when complete?
3. **Error notifications?** Should we notify users when agents fail?
4. **Notification retention?** How long to keep read notifications?
5. **Mobile notifications?** Should we support push notifications via email/SMS?

---

## Appendix: Entity Relationships

```
User Notifications
├─ UserID → Users (who to notify)
├─ ResourceTypeID → Resource Types (optional, for typed navigation)
├─ ResourceRecordID → Any entity (optional, for direct record link)
└─ ResourceConfiguration → JSON string (custom navigation data)

Artifacts
├─ UserID → Users (who created it)
├─ EnvironmentID → Environments (data isolation)
└─ TypeID → Artifact Types (JSON, HTML, React, etc.)

Artifact Versions
├─ ArtifactID → Artifacts (which artifact)
├─ VersionNumber → int (sequential: 1, 2, 3...)
├─ Content → nvarchar(MAX) (the actual payload)
└─ UserID → Users (who created this version)

Conversation Detail Artifacts (Junction)
├─ ConversationDetailID → Conversation Details (which message)
├─ ArtifactVersionID → Artifact Versions (which version)
└─ Direction → 'Input' | 'Output' (flow direction)
```

---

**Plan Status**: Ready for implementation
**Complexity**: Medium
**Risk**: Low
**Impact**: High (enables disconnected execution)
