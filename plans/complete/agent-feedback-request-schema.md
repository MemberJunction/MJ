# Agent Feedback Request Schema — Human-in-the-Loop Persistence

## Problem

Agents today can request human input via the `Chat` step type in conversations, but this mechanism is brittle when agents are triggered from non-conversation surfaces (scheduled jobs, API calls, other agents). There's no standard, persistent way for an async agent to:

1. Park its work and request human input
2. Present structured questions/options to the user
3. Resume execution (via a new run) once the human responds
4. Maintain a traceable chain of runs linked by requests

The `MJ: AI Agent Requests` table already exists with basic fields, but lacks the linking, structure, and extensibility needed for a robust generic mechanism.

## Design

### Core Concept: Run Chains via Requests

Agent runs are separate, immutable audit records. Requests stitch them together:

```
Run A executes → needs input → creates Request 1 (Originating = Run A) → Run A stops
Human answers Request 1 → Run B starts → Request 1.Resuming = Run B
Run B executes → needs more input → creates Request 2 (Originating = Run B) → Run B stops
Human answers Request 2 → Run C starts → Request 2.Resuming = Run C
Run C completes successfully
```

Each run is self-contained. The full story is reconstructed by walking the request chain.

### Schema Changes

#### New Table: `AIAgentRequestType`

A global, extensible lookup for categorizing requests. Kept simple for now — no subclass logic or default schemas. We'll revisit extensibility as we exercise the system.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `ID` | uniqueidentifier | NO | NEWSEQUENTIALID() | PK |
| `Name` | nvarchar(100) | NO | | UNIQUE |
| `Description` | nvarchar(MAX) | YES | | Explains when to use this type |
| `Icon` | nvarchar(100) | YES | | Font Awesome class for UI rendering |

**Seed data:**

| Name | Description | Icon |
|------|-------------|------|
| Approval | Agent needs explicit approval to proceed with an action | fa-solid fa-check-circle |
| Information | Agent needs additional information or data from the user | fa-solid fa-info-circle |
| Choice | Agent needs the user to select from a set of options | fa-solid fa-list-check |
| Review | Agent wants the user to review output before proceeding | fa-solid fa-eye |
| Custom | Agent-defined request type with custom response schema | fa-solid fa-cog |

#### Modified Table: `AIAgentRequest` — New Columns

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `RequestTypeID` | FK → AIAgentRequestType | NO | (seed ID for "Custom") | Categorizes the request |
| `OriginatingAgentRunID` | FK → AIAgentRun | YES | NULL | The run that created this request |
| `OriginatingAgentRunStepID` | FK → AIAgentRunStep | YES | NULL | The specific step that triggered it |
| `ResumingAgentRunID` | FK → AIAgentRun | YES | NULL | The run spawned after response (null until answered) |
| `ResponseSchema` | nvarchar(MAX) | YES | NULL | JSON `AgentResponseForm` — agent's dynamic form definition |
| `ResponseData` | nvarchar(MAX) | YES | NULL | JSON structured response matching the schema |
| `Priority` | int | NO | 50 | 1–100 integer scale. Suggested ranges: 1-25 Low, 26-50 Normal, 51-75 High, 76-100 Critical |
| `ExpiresAt` | datetimeoffset | YES | NULL | Optional deadline for response |

#### Modified Table: `AIAgentRequest` — Status Expansion

Current values: `Requested`, `Approved`, `Rejected`, `Canceled`

New values added:
- **`Responded`** — Human provided information (for non-approval types like Information, Choice)
- **`Expired`** — Past the `ExpiresAt` deadline with no response

#### Modified Table: `AIAgentRun` — New Status Value

Add `AwaitingFeedback` to the status CHECK constraint. This distinguishes "run completed its work" from "run is parked waiting for human input" in dashboards and queries.

### How It Works End-to-End

1. **Agent creates request**: During execution, agent determines it needs human input. It creates an `AIAgentRequest` row with:
   - `OriginatingAgentRunID` / `OriginatingAgentRunStepID` = current run/step
   - `RequestTypeID` = appropriate type
   - `Request` = human-readable description
   - `ResponseSchema` = optional structured form (uses existing `AgentResponseForm` types from `@memberjunction/ai-core-plus`)
   - `Priority` / `ExpiresAt` as needed

2. **Agent run terminates**: The run completes with status `AwaitingFeedback`. The Chat step (or a new step type) records this.

3. **Human is notified**: A notification system (future work, out of scope for this migration) picks up new requests and routes them to the appropriate user via conversation UI, email, push notification, etc.

4. **Human responds**: Via any surface area. The response updates:
   - `Status` → `Approved` / `Rejected` / `Responded`
   - `Response` = free-text response
   - `ResponseData` = structured JSON if `ResponseSchema` was provided
   - `ResponseByUserID` / `RespondedAt`

5. **New run is spawned**: A new agent run is created with the previous run's final payload + the human's response as input context. The request's `ResumingAgentRunID` is set to the new run's ID.

6. **Chain continues**: The new run can itself create further requests, extending the chain indefinitely.

### ResponseSchema Integration

The `ResponseSchema` field stores a JSON-serialized `AgentResponseForm` (from `@memberjunction/ai-core-plus`). This is the same type system already used in `ConversationDetail.ResponseForm`, supporting:

- Text, textarea, email inputs
- Number, currency inputs with min/max/prefix/suffix
- Date, datetime, time, daterange pickers
- Slider with configurable range
- Choice types: buttongroup (2-4 options), radio (2-6), dropdown (5+), checkbox (multi-select)

This means agents can define arbitrarily complex input forms on the fly, and any UI that can render a `ResponseForm` can handle agent requests.

### Notification Integration

When an agent creates a request, a notification is sent to the target user via MJ's existing notification subsystem (`NotificationEngine`). A new notification type "Agent Feedback Request" is seeded via metadata files in `/metadata/notifications/`.

### Request Assignment — Who Gets the Notification?

The `RequestForUserID` field on `AIAgentRequest` is the explicit target. The resolution chain:

1. **Explicit**: If agent sets `RequestForUserID`, use it directly
2. **Run initiator**: If null, look up `AIAgentRun.UserID` via `OriginatingAgentRunID`
3. **Conversation fallback**: If run's `UserID` is null but `ConversationID` is set, follow `Conversation.UserID`
4. **Agent owner**: If none of the above resolves, use `AIAgent.OwnerUserID`
5. **Future**: Role-based routing (e.g., anyone with `CanRun` permission) — out of scope for now

No new schema columns needed — the existing fields already support this chain.

### Dashboard: Agent Requests Tab

A new "Requests" nav item in the AI application shows all agent requests with:
- **Status filters**: Pending (Requested), Responded, Approved, Rejected, Expired, Canceled
- **Priority sorting**: By integer priority (1-100)
- **Request type filtering**: Approval, Information, Choice, Review, Custom
- **Agent filtering**: Which agent created the request
- **Actions**: Open request detail (slide-in panel), respond, approve/reject

### Generic Agent Request Form Package

A new `@memberjunction/ng-agent-requests` package under `packages/Angular/Generic/agent-requests/` provides:
- **Panel component** (`mj-agent-request-panel`): Slide-in form for viewing and responding to requests. Displays request details, renders `ResponseSchema` as a dynamic form, and submits `ResponseData`.
- **Dialog component** (`mj-agent-request-dialog`): Thin wrapper for modal usage.

This follows the `@memberjunction/ng-credentials` pattern (panel + dialog + module).

### Notification Deep-Linking

When a user clicks a notification for an agent feedback request, the notification's `ResourceConfiguration` contains `{ "type": "agent-request", "requestId": "..." }`. The user-notifications component navigates to the AI app's Requests tab, and the request detail panel opens automatically. The same generic form is used in both the dashboard and the deep-link context.

## Implementation Steps

### Step 1: Database Migration ✅

Created `migrations/v5/V202603131600__v5.12.x_Agent_Feedback_Request_Schema.sql` with:
1. `CREATE TABLE AIAgentRequestType` (**no seed data in migration** — seed data is managed via metadata files)
2. `ALTER TABLE AIAgentRequest` to add new columns and foreign keys
3. Expand `Status` CHECK constraint on `AIAgentRequest` (dynamic constraint name lookup)
4. Expand `Status` CHECK constraint on `AIAgentRun` to include `AwaitingFeedback` (dynamic constraint name lookup)
5. All columns are nullable or have defaults so existing data is unaffected

### Step 2: Seed Data via Metadata Files ✅

Created `/metadata/agent-request-types/` directory with:
- `.mj-sync.json` — sync configuration for the `MJ: AI Agent Request Types` entity
- `.agent-request-types.json` — seed records (Approval, Information, Choice, Review, Custom)

Seed data is pushed to the database using `npx mj sync push --dir=metadata --include="agent-request-types"`. This follows the standard MJ pattern for seeding lookup/reference tables — declarative JSON in version control, not SQL INSERT statements. See the `metadata/resource-types/` folder for a comparable example.

### Step 3: Run CodeGen ✅

After migration was applied, CodeGen regenerated:
- Entity subclasses in `MJCoreEntities` — `MJAIAgentRequestTypeEntity` and new fields on `MJAIAgentRequestEntity`
- Server-side generated code (`MJServer/src/generated/generated.ts`)
- Angular form components (core-entity-forms)

### Step 4: Verify Generated Output ✅

- Confirmed `MJAIAgentRequestEntity` has all new fields: `RequestTypeID`, `ResponseSchema`, `ResponseData`, `Priority` (z.number), `ExpiresAt`, `OriginatingAgentRunID`, `OriginatingAgentRunStepID`, `ResumingAgentRunID`
- Confirmed `MJAIAgentRequestTypeEntity` is generated with `ID`, `Name`, `Description`, `Icon`
- Confirmed `AwaitingFeedback` in `AIAgentRun.Status` union type
- Built MJCoreEntities, MJServer, and Angular core-entity-forms — all compile clean

### Step 5: Notification Type Seed Data

Create "Agent Feedback Request" notification type in `/metadata/notifications/` with:
- `DefaultInApp: true`, `DefaultEmail: false`, `DefaultSMS: false`
- Icon: `fa-solid fa-comment-dots`, Color: `#FF9800` (orange for attention)
- `AllowUserPreference: true` so users can opt into email/SMS later
- `AutoExpireDays: 30`

### Step 6: Agent Requests Nav Item in AI App

Add a new nav item to the AI application metadata (`/metadata/applications/.ai-application.json`):
- Label: "Requests"
- Icon: `fa-solid fa-inbox`
- DriverClass: `AIAgentRequestsResource`
- Position: After "Agents" and before "Models"

### Step 7: Generic Agent Request Package (`@memberjunction/ng-agent-requests`)

Create `packages/Angular/Generic/agent-requests/` following the credentials pattern:
- `agent-requests.module.ts` — NgModule with all components
- `panels/agent-request-panel/` — Slide-in panel for viewing/responding to requests
- `dialogs/agent-request-dialog.component.ts` — Dialog wrapper
- `public-api.ts` — Public exports

### Step 8: Agent Requests Dashboard Resource

Create `packages/Angular/Explorer/dashboards/src/AI/components/requests/` with:
- `agent-requests-resource.component.ts` — `@RegisterClass(BaseResourceComponent, 'AIAgentRequestsResource')`
- Grid view of requests with status/priority/type filtering
- Opens the generic panel from Step 7 for request detail/response

### Step 9: Wire Into Dashboards Module

- Import `AgentRequestsModule` from `@memberjunction/ng-agent-requests` into dashboards module
- Declare and export the new resource component
- Update `public-api.ts` exports

### Step 10: Build and Verify

Build all affected packages and verify compilation:
- `@memberjunction/ng-agent-requests`
- `@memberjunction/ng-dashboards`

## Proposal: Agent Request Creation at Runtime (Last Mile)

### The Problem

The schema, UI, and notification pieces are in place, but nothing currently *creates* `AIAgentRequest` rows. When an agent's Chat step fires inside a conversation, the user sees the message directly in the chat UI — that works. But when an agent runs outside a conversation context (scheduled job, API call, A2A protocol, CLI), the Chat result has nowhere to go. We need a mechanism that intercepts "agent needs human input" and persists it as a formal request.

### How the Agent Execution Flow Works Today

1. **Loop Agent's `DetermineNextStep()`** ([loop-agent-type.ts:103-123](packages/AI/Agents/src/agent-types/loop-agent-type.ts#L103-L123)) detects `response.nextStep.type === 'Chat'`
2. **`BaseAgent.executeChatStep()`** ([base-agent.ts:6794-6816](packages/AI/Agents/src/base-agent.ts#L6794-L6816)) creates a step entity and returns `{ step: 'Chat', terminate: true, message, responseForm, actionableCommands }`
3. **Main execution loop** ([base-agent.ts:1244-1256](packages/AI/Agents/src/base-agent.ts#L1244-L1256)) sees `terminate: true`, breaks the loop
4. **`ExecuteAgentResult`** is returned to the caller with `responseForm`, `actionableCommands`, and the payload preserved

The caller today is one of:
- **`RunAIAgentResolver`** ([RunAIAgentResolver.ts](packages/MJServer/src/resolvers/RunAIAgentResolver.ts)) — conversation-based execution via GraphQL
- **`AgentService` (CLI)** ([AgentService.ts](packages/AI/AICLI/src/services/AgentService.ts)) — command-line execution
- **`AgentOperations` (A2A)** ([AgentOperations.ts](packages/AI/A2AServer/src/AgentOperations.ts)) — agent-to-agent protocol
- **Scheduler** — background scheduled runs (memory manager, cleanup, etc.)

### Proposed Design: Two-Layer Request Creation

#### Layer 1: BaseAgent Creates the Request (Framework Level)

Add request creation logic directly in `BaseAgent.executeChatStep()`. When the Chat step fires, BaseAgent:

1. Creates an `AIAgentRequest` row with:
   - `AgentID` = current agent
   - `OriginatingAgentRunID` = current run ID
   - `OriginatingAgentRunStepID` = the Chat step ID just created
   - `RequestTypeID` = derived from the Chat step's context (default: "Information"; if `responseForm` has only approve/reject buttons: "Approval")
   - `Request` = the Chat step's message text
   - `ResponseSchema` = JSON-serialized `responseForm` (if present)
   - `Priority` = from agent configuration or step metadata (default: 50)
   - `ExpiresAt` = from agent configuration (optional)
   - `RequestForUserID` = resolved via the assignment chain (see below)
   - `Status` = 'Requested'

2. Sets the agent run status to `AwaitingFeedback`

3. Returns the request ID in `ExecuteAgentResult` (new field: `feedbackRequestId?: string`)

**Why at the BaseAgent level?** Every caller (resolver, CLI, A2A, scheduler) automatically gets request creation without duplicating logic. The request is created regardless of whether there's a conversation UI to show it in.

#### Layer 2: Caller Decides What to Do (Application Level)

After `ExecuteAgentResult` comes back with `feedbackRequestId`:

- **Conversation UI (resolver)**: The existing flow continues — the Chat message appears in the conversation UI unchanged. The **resolver** (`RunAIAgentResolver`) handles syncing: after the user responds and the next agent run completes, the resolver looks up the `AIAgentRequest` by `OriginatingAgentRunID` + `Status = 'Requested'` and marks it Responded/Approved/Rejected server-side. The UI doesn't change at all — sync happens transparently in the resolver.
- **CLI**: Displays the request message, prompts for input, and submits the response immediately (or prints the request ID for async response).
- **A2A**: Returns the request as a pending task in the A2A protocol response.
- **Scheduler**: The request just sits in the database. The user gets a notification and responds via the dashboard.

#### How Request-for-User is Resolved

The `RequestForUserID` is resolved at request creation time in `BaseAgent.executeChatStep()`:

```
1. Check ExecuteAgentParams.contextUser?.ID → explicit caller
2. If null, check the current run's UserID (AIAgentRun.UserID)
3. If null, check ConversationID → Conversation.UserID
4. If null, use AIAgent.OwnerUserID (the agent's owner)
5. If ALL null → leave RequestForUserID null (system-level request, visible to admins)
```

All these values are already available in the `BaseAgent` execution context — no new DB lookups needed.

#### Notification Integration

After creating the `AIAgentRequest` row, `BaseAgent` calls `NotificationEngine.SendNotification()` with:
- `typeNameOrId`: 'Agent Feedback Request'
- `userId`: the resolved `RequestForUserID`
- `title`: `"{AgentName} needs your input"`
- `message`: the request text (truncated for notification)
- `resourceConfiguration`: `{ "type": "agent-request", "requestId": "<new-request-id>" }`

This triggers in-app notification (and email/SMS if user opted in). The deep-link in `resourceConfiguration` opens the request detail panel.

#### Response Flow and Run Resumption

When a user responds to a request (via dashboard, conversation, or API):

1. `AIAgentRequest` is updated: `Status` → Approved/Rejected/Responded, `Response`, `ResponseData`, `RespondedAt`, `ResponseByUserID`
2. A new agent run is spawned with:
   - `lastRunId` = the original run (from `OriginatingAgentRunID`)
   - `autoPopulateLastRunPayload: true` — carries forward the payload
   - The human's response injected as a user message in `conversationMessages`
   - The structured `ResponseData` (if any) injected into `data`
3. `AIAgentRequest.ResumingAgentRunID` = the new run's ID

**Who spawns the new run?** The response handler (resolver endpoint or dashboard component). This is application-level logic, not framework-level, because different surfaces may want different resume behaviors.

### Proposed Design: UI-Based Request Reassignment

#### The Problem

A user receives a request notification but:
- Doesn't know the answer → wants to forward to someone who does
- Is on vacation → wants to delegate to a colleague
- Realizes the request should go to a different role/team

#### Proposed UX Flow

1. User opens request detail panel (from dashboard or notification deep-link)
2. Clicks "Reassign" button (visible only for `Status === 'Requested'`)
3. A reassignment dialog appears with:
   - **User picker**: Search/select another user (uses existing MJ user lookup)
   - **Note field**: Optional message explaining why they're reassigning
4. On submit:
   - `RequestForUserID` is updated to the new user
   - A new notification is sent to the new assignee
   - The reassignment is logged (see below)

#### Schema Considerations

No new tables needed for basic reassignment — just update `RequestForUserID`. However, for audit trail:

**Option A: Use the existing `Comments` field** on `AIAgentRequest` to append reassignment notes. Simple but lossy (overwrites previous comments).

**Option B: Create an `AIAgentRequestHistory` table** (future) to track all state changes including reassignment. Each row captures: who, when, what changed, and why. This is the proper solution but adds scope.

**Recommendation**: Start with Option A for the initial implementation. The `Comments` field already exists and is described as "internal notes not shared with the agent." Append reassignment entries like:
```
[2026-03-13 16:00 by user@example.com] Reassigned from alice@example.com to bob@example.com — "Bob knows the billing system better"
```

When we need proper audit trail (Option B), it's a clean migration — the data model doesn't change, we just add a history table and start writing to it.

#### Permissions

- Any user who can view a request can reassign it (if they are the current `RequestForUserID`)
- Admin users can reassign any request regardless of current assignee
- The original agent owner (`AIAgent.OwnerUserID`) can always reassign

### Request Assignment Design Summary

The assignment system uses a **resolution chain** that runs at request creation time, requiring zero new schema columns:

| Priority | Source | Field Path | When It Applies |
|----------|--------|------------|-----------------|
| 1 | Explicit | Agent sets `RequestForUserID` directly | Agent knows the target user |
| 2 | Run initiator | `AIAgentRun.UserID` via `OriginatingAgentRunID` | User-initiated runs (conversation, CLI, API) |
| 3 | Conversation | `Conversation.UserID` via run's `ConversationID` | Conversation-context runs where UserID wasn't set on run |
| 4 | Agent owner | `AIAgent.OwnerUserID` | Scheduled/system runs with no user context |
| 5 | Null (admin) | `RequestForUserID` left null | Truly system-level requests, visible to admins only |

**Post-creation reassignment** is handled via the UI (dashboard panel) or API. The `RequestForUserID` field is simply updated, a notification sent to the new user, and a note appended to `Comments`.

**Future extensions** (out of scope):
- **Role-based routing**: Assign to "anyone with CanRun permission on this agent" instead of a specific user
- **Assignment rules**: Agent-level configuration for default assignment logic (e.g., "always assign to the agent owner's team")
- **Escalation**: Auto-reassign if not responded within X hours
- **Request queues**: Team-level request queues where any team member can claim a request

## Implementation Steps (Last Mile) — COMPLETED

### Step 11: BaseAgent Request Creation in `executeChatStep()` ✅

Modified `BaseAgent.executeChatStep()` to:
1. Resolve `RequestForUserID` via the assignment chain
2. Create an `AIAgentRequest` row with all linking fields
3. Set run status to `AwaitingFeedback`
4. Return `feedbackRequestId` in `ExecuteAgentResult`
5. Notification sent by resolver layer (Layer 2), not BaseAgent

### Step 12: Add `feedbackRequestId` to `ExecuteAgentResult` ✅

Added optional `feedbackRequestId?: string` field to the type in `@memberjunction/ai-core-plus`.

### Step 13: Resolver-Level Response Handling ✅

Added GraphQL mutations:
- `RespondToAgentRequest` — updates status, response, responseData
- `ReassignAgentRequest` — updates RequestForUserID, appends to Comments, sends notification

### Step 14: Dashboard Reassignment UI ✅

Added "Reassign" button to agent request panel with:
1. User search typeahead with debounced input
2. User selection list with highlight
3. Optional note field for reassignment reason
4. Updates `RequestForUserID`, sends notification to new user, appends note to `Comments`

### Step 15: Conversation-Request Sync (Resolver-Side) ✅

Added `syncFeedbackRequestFromConversation()` to `RunAIAgentResolver.executeAIAgent()`:
1. After agent execution completes, if `lastRunId` was provided (continuation run):
   - Query `AIAgentRequest` where `OriginatingAgentRunID = lastRunId` AND `Status = 'Requested'`
   - If found, update: `Status` → 'Responded', `RespondedAt` → now, `ResponseByUserID` → current user, `ResumingAgentRunID` → new run ID
2. Server-side only — conversation UI unchanged

---

## Phase 2: Assignment Strategy, Agent Categories, and UX Enhancements

### Design: Configurable Assignment Strategy

#### The Problem with Hardcoded Assignment

The current `resolveRequestForUser()` in BaseAgent walks a fixed chain (contextUser → run.UserID → conversation.UserID → agent.OwnerUserID). This doesn't support real-world routing scenarios like:
- Budget approval → finance manager, not the triggering user
- Shared team inbox → any team member can claim it
- Round-robin distribution → load-balance across a pool of users
- Department-specific routing → agents in "HR" always route to HR leads

#### JSON Blob Strategy Pattern

Instead of separate columns for each strategy variant, we use a single `nvarchar(MAX)` JSON field with a TypeScript interface at each level. This is:
- **Extensible**: New strategy types don't require migrations
- **Consistent**: Same interface at every level
- **Future-proof**: When JSONType strong-typing lands (PR #2031), these fields get automatic typed getter/setters and FK-like validation for embedded IDs

```typescript
/** Configures how agent feedback requests are assigned to users */
interface AgentRequestAssignmentStrategy {
    /** How to resolve the assignee */
    type: 'RunUser' | 'AgentOwner' | 'SpecificUser' | 'List' | 'SharedInbox';

    /** For type='SpecificUser' — specific user to assign to */
    userID?: string;

    /** For type='List' or 'SharedInbox' — MJ List (of Users entity) holding the pool */
    listID?: string;

    /** For type='List' — how to pick from the list */
    listStrategy?: 'RoundRobin' | 'LeastBusy' | 'Random';

    /** Default priority override (1-100) */
    priority?: number;

    /** Default expiration in minutes */
    expirationMinutes?: number;
}
```

**Strategy types explained:**
- `RunUser` — assign to the user who triggered the agent run (contextUser)
- `AgentOwner` — assign to the agent's OwnerUserID
- `SpecificUser` — assign to a hardcoded user (via `userID`)
- `List` — pick from an MJ List of Users using `listStrategy` (RoundRobin, LeastBusy, Random)
- `SharedInbox` — assign to null (visible to all list members), any member can claim it

**Why Lists over Roles:** MJ Lists are user-managed, flexible, and already have `Sequence` (ordering), `Status` (active tracking), and `AdditionalData` (JSON metadata per item). Roles are rigid permission constructs — Lists are operational groupings.

#### Resolution Chain (Bottom-Up, First Non-Null Wins)

```
1. ExecuteAgentParams.assignmentStrategy    (per-invocation, highest precedence)
2. AI Agent Type.AssignmentStrategy          (per-agent-type)
3. AI Agent Category.AssignmentStrategy      (walk up ParentID tree)
4. AI Agent Request Type.DefaultAssignmentStrategy  (broadest default)
5. Fallback: assign to contextUser + console.warn()
```

The old hardcoded chain is removed. If no strategy resolves at any level, we assign to `contextUser` and emit a warning in the server console. No silent fallback chains.

### Design: AI Agent Categories

#### New Table: `__mj.AIAgentCategory`

Follows the established MJ category pattern (ActionCategory, PromptCategory, etc.):

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `ID` | uniqueidentifier | NO | NEWSEQUENTIALID() | PK |
| `Name` | nvarchar(200) | NO | | UNIQUE |
| `Description` | nvarchar(MAX) | YES | | |
| `ParentID` | uniqueidentifier | YES | NULL | FK → self (recursive hierarchy) |
| `AssignmentStrategy` | nvarchar(MAX) | YES | NULL | JSON `AgentRequestAssignmentStrategy` |
| `Status` | nvarchar(20) | NO | 'Active' | CHECK: 'Active', 'Disabled', 'Pending' |

#### Modified Table: `AIAgent` — New Column

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `CategoryID` | FK → AIAgentCategory | YES | Organizational grouping (per-agent) |

#### Modified Table: `AIAgentType` — New Column

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `AssignmentStrategy` | nvarchar(MAX) | YES | JSON, overrides category default |

#### Modified Table: `AIAgentRequestType` — New Columns

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `DefaultAssignmentStrategy` | nvarchar(MAX) | YES | JSON, broadest default |
| `DefaultPriority` | int | YES | Default priority for requests of this type |
| `DefaultExpirationMinutes` | int | YES | Default TTL in minutes |
| `RequiresResponse` | bit | NO, DEFAULT 1 | Whether response is mandatory |

#### Default Categories (Shipped with MJ)

```
MJ (root)
├── Assistant               — Sage, Betty, Skip
├── Research & Analysis      — Research Agent, Query Builder, sub-agents
├── Content Creation         — Marketing Agent, Infographic, Codesmith, sub-agents
├── System                   — Memory Manager, Memory Cleanup
├── Platform Management      — User Onboarding, Agent Manager, sub-agents
└── Demo                     — Demo Loop, Demo Minimal Loop, Demo Flow
```

Managed via `/metadata/agent-categories/` with `mj sync push`. Directory ordered before `agent-types` in `.mj-sync.json`.

### Design: Agent Browser UX Enhancements

The current agent-configuration component has a left filter panel with dropdowns. Two changes:

1. **Category filter in filter panel**: Add a `TreeDropdownComponent` (from `@memberjunction/ng-trees`) as a new filter. Selecting a category filters agents to that category + descendants. This augments the existing type/status/mode filters.

2. **Tree view toggle**: Add a toggle at the top of the filter panel to switch between the current "Filters" view and a "Categories" tree view (Mac Finder-style). The tree view shows the category hierarchy using `TreeComponent`, clicking a category node shows its agents in the main content area. This is the default browsing mode.

3. **Agent form category selector**: In the agent editor/form, add a `TreeDropdownComponent` for selecting/editing the agent's category.

Note: Parent/child agent hierarchy is a separate concept (execution hierarchy). Categories are purely organizational — for browsing and finding agents.

## Implementation Steps (Phase 2)

### Step 16: Database Migration — AIAgentCategory + New Columns ✅

Created `migrations/v5/V202603131700__v5.12.x_Agent_Categories_Assignment_Strategy.sql`:
1. `CREATE TABLE __mj.AIAgentCategory` with ParentID self-FK, AssignmentStrategy JSON, Status CHECK
2. `ALTER TABLE __mj.AIAgent ADD CategoryID` (FK → AIAgentCategory) — per-agent organizational grouping
3. `ALTER TABLE __mj.AIAgentType ADD AssignmentStrategy` — strategy override at type level
4. `ALTER TABLE __mj.AIAgentRequestType ADD DefaultAssignmentStrategy, DefaultPriority, DefaultExpirationMinutes, RequiresResponse`

### Step 17: Metadata Seed — Agent Categories 🔲

Create `/metadata/agent-categories/` with `.mj-sync.json` and `.agent-categories.json`:
- Root "MJ" category + 6 sub-categories (Assistant, Research & Analysis, Content Creation, System, Platform Management, Demo)
- Update `.mj-sync.json` directoryOrder to place `agent-categories` before `agent-types`

### Step 18: Update Existing Agent Metadata with Category References 🔲

Update agents in `/metadata/agents/` to include `CategoryID` references via `@lookup:MJ: AI Agent Categories.Name=...`.

### Step 19: AgentRequestAssignmentStrategy TypeScript Interface 🔲

Create interface in `@memberjunction/ai-core-plus` (`src/assignment-strategy.ts`):
- `AgentRequestAssignmentStrategy` interface
- `resolveAssignmentStrategy()` utility function for walking the resolution chain
- Export from package public API

### Step 20: Update ExecuteAgentParams with assignmentStrategy 🔲

Add optional `assignmentStrategy?: AgentRequestAssignmentStrategy` to `ExecuteAgentParams` in `@memberjunction/ai-core-plus`.

### Step 21: Refactor BaseAgent Assignment Resolution 🔲

Replace `resolveRequestForUser()` with new `resolveAssignment()` that:
1. Walks the 5-level resolution chain
2. Implements `RunUser`, `AgentOwner`, `SpecificUser` strategies
3. Implements `List` strategy with RoundRobin/LeastBusy/Random
4. Implements `SharedInbox` strategy (null assignment)
5. Falls back to contextUser + console.warn()

### Step 22: Unit Tests for Assignment Strategy Resolution 🔲

Comprehensive tests in `@memberjunction/ai-agents` for:
- Each strategy type resolution
- Chain walk (params → type → category → requestType → fallback)
- Round-robin List resolution
- SharedInbox behavior
- Edge cases (missing fields, null strategies, empty lists)

### Step 23: Agent Browser — Category Tree Filter + Tree View Toggle 🔲

Modify `agent-filter-panel.component`:
1. Add `TreeDropdownComponent` for category filtering
2. Add toggle at top: "Filters" vs "Categories" (tree view)
3. In "Categories" mode, show `TreeComponent` with category hierarchy
4. New `category` field in `AgentFilter` interface
5. `applyFilters()` updated to filter by category + descendants

### Step 24: Agent Form — Category TreeDropdown 🔲

Add `TreeDropdownComponent` to the agent editor form for selecting/editing the agent type's category.

### Step 25: Human-in-the-Loop Guide 🔲

Create comprehensive guide at `packages/AI/Agents/HUMAN_IN_THE_LOOP.md`:
- Theory and motivation
- How it works in conversation context
- How it works in non-conversation contexts (scheduled, API, A2A)
- Request lifecycle with Mermaid diagrams
- Assignment strategy system with examples
- Categories and organizational grouping
- Code examples for agent developers
- API reference for mutations

### Step 26: Update Agents README 🔲

Add Human-in-the-Loop summary to `packages/AI/Agents/README.md` pointing to the full guide.

### Step 27: Build and Verify All Affected Packages 🔲

Build order:
1. `@memberjunction/ai-core-plus` (new interface)
2. `@memberjunction/ai-agents` (refactored resolution)
3. `@memberjunction/server` (resolver changes if any)
4. `@memberjunction/ng-trees` (verify available)
5. `@memberjunction/ng-dashboards` (agent browser UX)
6. `@memberjunction/ng-agent-requests` (verify still clean)

## Out of Scope (Future Work)

- Request Chain timeline visualization (Run → Request → Run chains)
- Request type subclass handlers with custom validation logic
- DefaultResponseSchema on request types
- Expiration enforcement (background job to mark expired requests)
- Email/SMS templates for agent feedback request notifications
- `AIAgentRequestHistory` audit trail table for tracking reassignments and state changes
- Escalation policies (auto-reassign after timeout)
- JSONType strong-typing for AssignmentStrategy fields (tracked in PR #2031)
- FK validation for embedded IDs in JSON blob strategies (via JSONType system)

## Notes

- All new columns on `AIAgentRequest` are nullable or have defaults — no breaking changes to existing data
- The `ResponseSchema` field reuses the existing `AgentResponseForm` type from `ai-core-plus` — no new type system needed
- `AIAgentRequestType` is intentionally simple for now (no DriverClass, no DefaultResponseSchema). We'll add extensibility as we learn from real usage patterns
- CodeGen will handle timestamp columns, FK indexes, stored procedures, and Angular forms automatically — none of these should be in the migration
- Seed data for `AIAgentRequestType` lives in `/metadata/agent-request-types/` and is pushed via `mj sync push`, not SQL INSERT statements
- Assignment strategy uses a JSON blob (`AgentRequestAssignmentStrategy`) at each level — extensible without migrations
- Lists (not Roles) are used for round-robin and shared inbox scenarios — more flexible, user-manageable
- No real FKs in JSON blobs for now — PR #2031 JSONType system will add framework-level FK enforcement for JSON fields
- Agent Categories follow the established MJ category pattern (ActionCategory, PromptCategory, etc.)
- Notification deep-linking uses `ResourceConfiguration` JSON with `{ "type": "agent-request", "requestId": "..." }` pattern
- Categories are organizational grouping only — not related to parent/child agent execution hierarchy
