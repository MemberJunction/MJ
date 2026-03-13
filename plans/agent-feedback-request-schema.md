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
| `Priority` | nvarchar(20) | NO | 'Normal' | Low / Normal / High / Critical |
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

### Visualization (Future, Out of Scope for Migration)

The AI dashboard in the Explorer should eventually support:
- **Pending Requests panel**: Shows requests awaiting response, filterable by agent/priority/type
- **Request Chain timeline**: Visual timeline showing Run → Request → Run → Request → Run chains
- **Agent activity feed**: Chronological view of agent actions including request/response events

## Implementation Steps

### Step 1: Database Migration

Create migration file in `migrations/v5/` with:
1. `CREATE TABLE AIAgentRequestType` with seed data
2. `ALTER TABLE AIAgentRequest` to add new columns and foreign keys
3. Expand `Status` CHECK constraint on `AIAgentRequest`
4. Expand `Status` CHECK constraint on `AIAgentRun` to include `AwaitingFeedback`
5. All columns are nullable or have defaults so existing data is unaffected

### Step 2: Run CodeGen

After migration is applied, run CodeGen to regenerate:
- Entity subclasses in `MJCoreEntities`
- Server-side generated code
- Angular form components

### Step 3: Verify Generated Output

- Confirm `MJAIAgentRequestEntity` has new fields with proper types
- Confirm `MJAIAgentRequestTypeEntity` is generated
- Confirm new entity appears in the Angular form components
- Build affected packages to verify compilation

## Out of Scope (Future Work)

- Notification routing when requests are created
- Auto-resume logic (spawning new runs on response)
- Dashboard visualization of request chains
- Request type subclass handlers with custom validation logic
- DefaultResponseSchema on request types
- API/GraphQL mutations for responding to requests
- Expiration enforcement (background job to mark expired requests)

## Notes

- All new columns on `AIAgentRequest` are nullable or have defaults — no breaking changes to existing data
- The `ResponseSchema` field reuses the existing `AgentResponseForm` type from `ai-core-plus` — no new type system needed
- `AIAgentRequestType` is intentionally simple for now (no DriverClass, no DefaultResponseSchema). We'll add extensibility as we learn from real usage patterns
- CodeGen will handle timestamp columns, FK indexes, stored procedures, and Angular forms automatically — none of these should be in the migration
