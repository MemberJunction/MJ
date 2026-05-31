# Entity Designer Agent & UDT System — Implementation Plan

> **Status**: Draft v1
> **Date**: March 27, 2026
> **Supersedes**: [user-defined-tables-architecture.md](complete/user-defined-tables-architecture.md) (Jan 2025)
> **Depends On**: [runtime-schema-update-plan.md](complete/runtime-schema-update-plan.md), [schema-management-automation.md](schema-management-automation.md)
> **Branch**: TBD

---

## Executive Summary

This plan adds **Entity Designer** — a conversational AI agent that lets users create and modify database entities through natural language, delivering an AirTable-like experience within MemberJunction. It also integrates as a **sub-agent of Agent Manager**, enabling agents to create backing tables as part of their workflow design.

**Key decisions:**
- **Reuse existing infrastructure**: SchemaEngine + RuntimeSchemaManager (already built) handles all DDL, CodeGen, compile, restart
- **Agent architecture**: Mirrors Agent Manager's proven sub-agent pattern (Requirements, Designer, Validator, Builder)
- **Permissions**: MJ Authorizations system with tiered access (no access / UDT schema only / any custom schema)
- **AI Model**: Gemini 3 Flash primary, GPT-OSS-120B fallback
- **Agent Manager integration**: Agent Manager handles user conversation about tables, delegates to Entity Designer sub-agent with a fully-formed spec
- **Naming**: "Entity Designer" (user-facing name); entity naming handled automatically by CodeGen based on schema

**What's changed since Jan 2025 plan:**
- RuntimeSchemaManager is now built and operational
- Agent Manager is built with proven sub-agent pattern
- SchemaEngine has clean generic interfaces (`TableDefinition`, `ColumnDefinition`)
- Authorizations system is the right permissions model (not a custom flag)
- Gemini 3 Flash available (PowerRank 22, 1M context)

---

## 1. Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  TWO ENTRY POINTS                                               │
│                                                                  │
│  A) Standalone: User opens Entity Designer directly              │
│     User ←→ Entity Designer Agent (conversational)               │
│                                                                  │
│  B) Via Agent Manager: Agent needs a backing table               │
│     User ←→ Agent Manager ←→ Entity Designer (sub-agent)         │
│     (Agent Manager handles user dialog, delegates spec)          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  ENTITY DESIGNER AGENT (Loop Agent)                              │
│                                                                  │
│  Sub-agents:                                                     │
│  ├── Requirements Analyst  — Gathers business requirements       │
│  ├── Schema Designer       — Produces TableDefinition + markdown │
│  ├── Schema Validator      — Validates against existing schema   │
│  └── Schema Builder        — Executes RSU pipeline               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  EXISTING INFRASTRUCTURE (no new code needed)                    │
│                                                                  │
│  SchemaEngine.GenerateMigration(TableDefinition)                 │
│      ↓                                                           │
│  RuntimeSchemaManager.RunPipeline()                              │
│      ├── Execute Migration SQL                                   │
│      ├── Run CodeGen (metadata + TypeScript + Angular)            │
│      ├── Compile TypeScript                                      │
│      ├── Restart MJAPI                                           │
│      └── Git commit & PR                                         │
└─────────────────────────────────────────────────────────────────┘
```

### What We Build vs What Already Exists

| Component | Status | Notes |
|-----------|--------|-------|
| SchemaEngine (DDL generation) | **Exists** | Generic `TableDefinition` → platform SQL |
| RuntimeSchemaManager (pipeline) | **Exists** | Migration → CodeGen → Compile → Restart |
| DDLGenerator (SQL Server + Postgres) | **Exists** | Platform-aware, injection-safe |
| SchemaEvolution (ALTER TABLE diffs) | **Exists** | Non-destructive column evolution |
| SchemaValidator | **Exists** | Validates identifiers, types, constraints |
| Agent Manager (orchestrator pattern) | **Exists** | Proven sub-agent architecture |
| Authorizations system | **Exists** | Role-based Allow/Deny hierarchy |
| Entity Designer Agent | **NEW** | Loop agent with 4 sub-agents |
| Entity Designer Actions | **NEW** | Actions for RSU pipeline invocation |
| Authorization definitions | **NEW** | Schema Management auth hierarchy |
| UDT metadata tracking | **NEW** | Tracks which entities are user-defined |
| Entity Designer UI | **NEW** | Angular dashboard for visual entity management |
| Agent Manager integration | **NEW** | Sub-agent wiring + prompt updates |
| Gemini 3 Flash model upgrade | **NEW** | Prompt model reassignment |

---

## 2. Permissions Model (Authorizations)

### Authorization Hierarchy

New authorizations added to the existing `MJ: Authorizations` entity:

```
Schema Management                          (root authorization)
├── Create Entities                        (can create new UDTs)
│   ├── Create in UDT Schema               (restricted to __mj_UDT schema)
│   └── Create in Custom Schema            (can target any non-protected schema)
├── Modify Entities                        (can alter existing UDTs)
│   ├── Modify Own Entities                (only entities the user created)
│   └── Modify Any UDT Entities            (any user-defined entity)
└── Delete Entities                        (can archive/drop — future, gated)
```

### Access Tiers

| Tier | Authorizations Granted | Schema Access | Use Case |
|------|----------------------|---------------|----------|
| **None** | (no schema management auths) | No UDT access | Default for most users |
| **Basic** | Create in UDT Schema, Modify Own | `__mj_UDT` only | Business users, AirTable-like |
| **Power** | Create in Custom Schema, Modify Any UDT | Any non-protected schema | Data architects, team leads |
| **Admin** | All Schema Management | Any non-protected schema + Delete | System administrators |

### Deterministic Guards (Defense in Depth)

Authorization checks are **layered** — even if an authorization is granted, deterministic guards still block dangerous operations:

```typescript
// Layer 1: Authorization check (runtime, role-based)
const canCreate = authEvaluator.UserCanExecute(
    authInfo('Create Entities'), contextUser
);

// Layer 2: Schema blocklist (deterministic, always enforced)
const BLOCKED_SCHEMAS = ['__mj', 'sys', 'INFORMATION_SCHEMA', 'dbo'];
if (BLOCKED_SCHEMAS.includes(targetSchema.toLowerCase())) {
    throw new Error(`Schema '${targetSchema}' is protected and cannot be targeted`);
}

// Layer 3: SchemaEngine.ValidateMigrationSQL() — regex-based SQL validation
// Layer 4: DDLGenerator.ValidateIdentifier() — injection prevention
```

The `__mj` schema is **always** off-limits regardless of authorization level. The AI agent's prompts reinforce this, but the deterministic guards are the true enforcement layer.

### UDT Schema Convention

- **Default schema**: `__mj_UDT` — sandboxed, safe for all authorized users
- **Custom schemas**: User-specified (e.g., `sales`, `hr`, `projects`) — requires "Create in Custom Schema" authorization
- **Protected schemas**: `__mj`, `sys`, `INFORMATION_SCHEMA`, `dbo` — always blocked by deterministic guard
- Entity naming prefix is handled automatically by CodeGen based on schema

### Migration: Authorization Seed Data

```sql
-- New authorizations (seeded via mj-sync metadata files)
-- Root
INSERT INTO __mj.Authorization (Name, Description, IsActive)
VALUES ('Schema Management', 'Root authorization for entity designer / UDT features', 1);

-- Children (ParentID = Schema Management)
INSERT INTO __mj.Authorization (Name, ParentID, Description, IsActive)
VALUES ('Create Entities', @schemaManagementId, 'Can create new user-defined entities', 1);

-- Grandchildren
INSERT INTO __mj.Authorization (Name, ParentID, Description, IsActive)
VALUES ('Create in UDT Schema', @createEntitiesId,
        'Restricted to __mj_UDT schema only', 1);
INSERT INTO __mj.Authorization (Name, ParentID, Description, IsActive)
VALUES ('Create in Custom Schema', @createEntitiesId,
        'Can create entities in any non-protected schema', 1);
-- ... etc for Modify and Delete branches
```

> **Note**: Actual seeding uses mj-sync metadata files, not raw SQL. The SQL above is illustrative.

---

## 3. Entity Designer Agent Architecture

### Agent Hierarchy

```
Entity Designer (Loop Agent) — DriverClass: EntityDesignerAgent
├── Requirements Analyst (Loop) — DriverClass: EntityDesignerRequirementsAnalyst
├── Schema Designer (Loop)     — DriverClass: EntityDesignerSchemaDesigner
├── Schema Validator (Code)    — DriverClass: EntityDesignerSchemaValidator
└── Schema Builder (Code)      — DriverClass: EntityDesignerSchemaBuilder
```

### Sub-Agent Responsibilities

#### A. Requirements Analyst
- **Type**: Loop Agent
- **Purpose**: Gathers business requirements through conversation
- **Inputs**: User's natural language description
- **Outputs**: `payload.FunctionalRequirements` (structured markdown)
- **Key behaviors**:
  - Asks about data types, relationships, required fields
  - Discusses schema placement (UDT vs custom schema) based on user's authorization level
  - Identifies potential relationships to existing MJ entities
  - Produces a requirements document for the Schema Designer

#### B. Schema Designer
- **Type**: Loop Agent
- **Purpose**: Translates requirements into a concrete schema proposal
- **Inputs**: `payload.FunctionalRequirements`
- **Outputs**: `payload.SchemaDesign` (markdown prototype + JSON `TableDefinition`)
- **Key behaviors**:
  - Researches existing entities via "Database Research" action (same one Agent Manager uses)
  - Proposes table structure as readable markdown table:
    ```markdown
    ## Proposed: Meetup Attendees

    | Field | Type | Required | Description |
    |-------|------|----------|-------------|
    | Name | string(200) | Yes | Attendee full name |
    | Email | string(255) | Yes | Contact email |
    | Company | string(200) | No | Organization |
    | RSVPStatus | string(20) | Yes | Confirmed/Tentative/Declined |
    | DietaryRestrictions | text | No | Food preferences |

    **Schema**: `__mj_UDT`
    **Relationships**: None proposed
    ```
  - Entity Designer presents this to user for approval/iteration
  - On approval, emits the formal `TableDefinition` JSON

#### C. Schema Validator
- **Type**: Code-based Agent (deterministic)
- **Purpose**: Validates the proposed schema before execution
- **Inputs**: `payload.SchemaDesign` (TableDefinition JSON)
- **Outputs**: `payload.ValidationResult` (pass/fail + issues)
- **Checks**:
  - Authorization: Does user have permission for target schema?
  - Naming: No conflicts with existing entities/tables
  - Schema: Target schema is not protected
  - Columns: Valid types, no reserved names (ID, __mj_*)
  - Relationships: Referenced entities exist
  - Limits: Max column count, name lengths within DB limits
  - SQL safety: Passes `SchemaValidator.Validate()` from SchemaEngine

#### D. Schema Builder
- **Type**: Code-based Agent (deterministic)
- **Purpose**: Executes the RSU pipeline to create/modify the entity
- **Inputs**: Validated `TableDefinition`
- **Outputs**: `payload.BuildResult` (success/failure, entity ID, pipeline status)
- **Flow**:
  1. Convert `TableDefinition` → `RSUPipelineInput` (same as SchemaBuilder does for integrations)
  2. Call `RuntimeSchemaManager.Instance.RunPipeline(input)`
  3. Track UDT metadata (owner, source agent, creation context)
  4. Return result with new entity name and ID

### Conversation Flow (Standalone Mode)

```
User: "I need to track attendees for our monthly meetups"
    ↓
Entity Designer → Requirements Analyst
    "What information do you need per attendee? Any relationships
     to existing data (e.g., link to Users, Events)?"
    ↓
User: "Name, email, company, RSVP status, dietary needs"
    ↓
Entity Designer → Schema Designer
    Shows markdown prototype table (see above)
    "Here's what I'm proposing. Want to add or change anything?"
    ↓
User: "Looks good, but add a Notes field"
    ↓
Entity Designer → Schema Designer (iterate)
    Updated prototype with Notes field
    "Updated! Ready to create this?"
    ↓
User: "Yes, create it"
    ↓
Entity Designer → Schema Validator → Schema Builder
    "Creating your entity now... [progress updates]
     Done! 'Meetup Attendees' is ready. You can find it in
     the entity explorer."
```

### Conversation Flow (Via Agent Manager)

```
User ←→ Agent Manager (discussing agent requirements)
    Agent Manager: "This agent will need a table to store
     customer feedback data. I'm thinking:
     - CustomerName (string)
     - FeedbackText (text)
     - Sentiment (string: Positive/Neutral/Negative)
     - ReceivedAt (datetime)
     Sound good?"
    ↓
User: "Yes, add a Priority field too"
    ↓
Agent Manager: "Got it. Creating the table now..."
    ↓
Agent Manager → Entity Designer (sub-agent, autonomous)
    Passes fully-formed TableDefinition spec
    Entity Designer validates + builds (no user conversation)
    Returns entity ID + name
    ↓
Agent Manager: "Done! Created 'Customer Feedback' entity.
    I'll wire it into the agent's workflow now."
    Continues with agent creation flow
```

**Key UX principle**: When invoked via Agent Manager, the user never context-switches to Entity Designer. Agent Manager owns the conversation about what table is needed, then delegates the technical execution.

---

## 4. UDT Metadata Tracking

### Why Track UDT Provenance?

User-defined entities are first-class MJ entities after creation (same as any other), but we need to know:
- Who created it (ownership for "Modify Own" authorization)
- How it was created (standalone vs via Agent Manager)
- Whether it's eligible for modification via Entity Designer
- Lifecycle state (Active, Archived)

### Approach: Entity Settings + New Fields on Entity

Rather than a separate `UserDefinedTable` tracking table (as proposed in the Jan 2025 plan), we extend the existing `Entity` metadata with a lightweight provenance tag. This avoids a parallel tracking system.

**Option A: Entity Settings** (preferred — no schema migration needed)
- Add an EntitySetting `MJ:UDT:Owner` = UserID
- Add an EntitySetting `MJ:UDT:Source` = "EntityDesigner" | "AgentManager" | "Integration"
- Query via existing EntitySettings infrastructure

**Option B: New columns on Entity table** (stronger, requires migration)
- `CreatedByAgentID` — which agent created it (null for manual/CodeGen)
- `OwnerUserID` — who owns this entity (for authorization scoping)
- `IsUserDefined` — boolean flag for quick filtering

**Recommendation**: Start with **Option A** (EntitySettings) for speed, migrate to **Option B** if we need performant queries across many UDTs. EntitySettings are already a proven pattern in MJ.

---

## 5. Entity Modification (ALTER TABLE Support)

### Supported Modifications

Users can modify entities they have authorization for:

| Operation | Supported | RSU Pipeline Impact |
|-----------|-----------|-------------------|
| **Add columns** | Yes | ALTER TABLE ADD → CodeGen → Compile → Restart |
| **Change column nullability** | Yes | ALTER TABLE ALTER → CodeGen → Compile → Restart |
| **Change column type** (widening) | Yes, with warnings | e.g., string(100) → string(200) |
| **Change column type** (narrowing) | Cautious | Requires data compatibility check |
| **Add foreign keys** | Yes | Soft FKs via additionalSchemaInfo |
| **Remove columns** | Soft only | Hide from metadata (set `IncludeInAPI = 0`), never DROP |
| **Rename columns** | No (v1) | Too complex for automated pipeline |
| **Add CHECK constraints** | Yes | CodeGen generates EntityFieldValues |

### Modification Flow

The same Entity Designer agent handles modifications:

```
User: "Add a 'Phone' field to Meetup Attendees"
    ↓
Entity Designer loads existing entity metadata
    ↓
Schema Designer proposes ALTER:
    "I'll add: Phone (string, 50 chars, optional). Confirm?"
    ↓
User: "Yes"
    ↓
Schema Validator checks authorization (Modify Own / Modify Any)
    ↓
SchemaEvolution generates diff → ALTER TABLE ADD
    ↓
RuntimeSchemaManager.RunPipeline() executes
```

### Using Existing SchemaEvolution

The `SchemaEvolution` class in SchemaEngine already handles this:
- Compares desired `TableDefinition` vs `ExistingTableInfo` (queried from DB)
- Produces `SchemaDiff` with `AddedColumns`, `ModifiedColumns`, `RemovedColumns`
- DDLGenerator emits platform-correct ALTER TABLE statements
- Non-destructive: removed columns are commented, never dropped

---

## 6. Agent Manager Integration

### How Entity Designer Becomes a Sub-Agent

Entity Designer registers as an available sub-agent of Agent Manager, similar to how Requirements Analyst and Planning Designer work today.

**Agent Manager metadata update:**
```json
{
  "Name": "Entity Designer",
  "ParentID": "@parent:ID",
  "TypeID": "@lookup:MJ: AI Agent Types.Name=Loop",
  "DriverClass": "EntityDesignerAgent",
  "Status": "Active",
  "InvocationMode": "Any",
  "ExposeAsAction": true,
  "ExecutionOrder": 6,
  "PayloadDownstreamPaths": ["TechnicalDesign.databaseSchema"],
  "PayloadUpstreamPaths": ["EntityDesignerResult"],
  "SubAgentOutputMapping": "{\"*\": \"EntityDesignerResult\"}"
}
```

### Agent Manager Prompt Updates

The Planning Designer prompt is updated to know about Entity Designer:

```markdown
## Database Schema Creation

When the agent being designed needs a backing database table to store data:

1. **Discuss with the user** what data the agent needs to store
2. **Propose a table structure** in your TechnicalDesign document
3. **Get user approval** for the proposed schema
4. Once approved, delegate to the **Entity Designer sub-agent** with:
   - A complete TableDefinition (schema, table name, columns, types)
   - Target schema (usually __mj_UDT unless user specifies otherwise)
   - Any relationships to existing entities

The Entity Designer will handle DDL generation, CodeGen, compilation,
and server restart autonomously. You do NOT need to wait for user
interaction during Entity Designer execution.

After Entity Designer returns, reference the new entity in your
agent's action configuration.
```

### Data Flow: Agent Manager → Entity Designer

```
Agent Manager payload:
{
  "TechnicalDesign": {
    "databaseSchema": {
      "SchemaName": "__mj_UDT",
      "TableName": "CustomerFeedback",
      "EntityName": "Customer Feedback",
      "Description": "Stores customer feedback for sentiment analysis agent",
      "Columns": [
        { "Name": "CustomerName", "Type": "string", "MaxLength": 200, "IsNullable": false },
        { "Name": "FeedbackText", "Type": "text", "IsNullable": false },
        { "Name": "Sentiment", "Type": "string", "MaxLength": 20, "IsNullable": true },
        { "Name": "Priority", "Type": "integer", "IsNullable": true },
        { "Name": "ReceivedAt", "Type": "datetime", "IsNullable": false }
      ]
    }
  }
}
    ↓
Entity Designer receives via PayloadDownstreamPaths
    ↓
Validates + Builds (no user conversation needed — spec is complete)
    ↓
Returns via PayloadUpstreamPaths:
{
  "EntityDesignerResult": {
    "Success": true,
    "EntityName": "Customer Feedback",
    "EntityID": "abc-123-...",
    "SchemaName": "__mj_UDT",
    "TableName": "CustomerFeedback"
  }
}
    ↓
Agent Manager continues wiring the entity into agent actions
```

---

## 7. Gemini 3 Flash Model Upgrade

### Current State

Agent Manager prompts currently use:
- **Primary**: Qwen 3 32B via Groq (PowerRank 11)
- **Fallback**: GPT-OSS-120B via Cerebras (PowerRank 14)

### Target State

All Agent Manager + Entity Designer prompts use:
- **Primary**: Gemini 3 Flash via Google (PowerRank 22, SpeedRank 10)
- **Fallback**: GPT-OSS-120B via Cerebras (PowerRank 14)

### Why Gemini 3 Flash

- **PowerRank 22** vs current 11 — significant reasoning capability improvement
- **1M token context** — handles large schema research without truncation
- **SpeedRank 10** — comparable speed to current models
- **CostRank 3** — cost-efficient
- **Thinking levels** — supports MINIMAL/LOW/MEDIUM/HIGH thinking via EffortLevel mapping
- **GeminiLLM driver** already fully implemented with streaming support

### Prompts to Update

**Agent Manager (existing, 4 prompts):**
1. Agent Manager - Main Prompt
2. Requirements Analyst Agent - Main Prompt
3. Planning Designer Agent - Main Prompt
4. Architect Agent - Main Prompt

**Entity Designer (new, 4 prompts):**
5. Entity Designer - Main Prompt
6. Entity Requirements Analyst - Main Prompt
7. Entity Schema Designer - Main Prompt
8. Entity Schema Validator - Main Prompt (if AI-assisted, otherwise code-only)

### Model Assignment (per prompt)

```json
{
  "MJ: AI Prompt Models": [
    {
      "AIModelID": "@lookup:AI Models.Name=Gemini 3 Flash",
      "Priority": 12
    },
    {
      "AIModelID": "@lookup:AI Models.Name=GPT-OSS-120B",
      "Priority": 10
    }
  ]
}
```

### Implementation

Update `metadata/prompts/.agent-manager-prompts.json` to replace Qwen 3 32B entries with Gemini 3 Flash. Create new prompt metadata file for Entity Designer prompts. Push via `npx mj sync push --dir=metadata --include="prompts"`.

---

## 8. New Packages & Actions

### Package: `@memberjunction/entity-designer-core`

**Location**: `packages/AI/EntityDesigner/core/`

**Contents**:
- `EntityDesignerAgent` — Loop agent driver class (orchestrator)
- `EntityDesignerRequirementsAnalyst` — Requirements sub-agent driver
- `EntityDesignerSchemaDesigner` — Schema design sub-agent driver
- `EntityDesignerSchemaValidator` — Validation sub-agent driver (code-based)
- `EntityDesignerSchemaBuilder` — Builder sub-agent driver (code-based)
- `EntityDesignerSpecSync` — Tracks UDT metadata (EntitySettings writes)
- Interfaces and types for payload structure

**Dependencies**:
- `@memberjunction/schema-engine` (TableDefinition, SchemaEngine, RuntimeSchemaManager)
- `@memberjunction/ai-engine-base` (AIEngineBase for sub-agent execution)
- `@memberjunction/core` (Metadata, RunView, entity access)
- `@memberjunction/global` (BaseSingleton)

### Package: `@memberjunction/entity-designer-actions`

**Location**: `packages/AI/EntityDesigner/actions/`

**Contents**:
- `CreateEntityAction` — Action wrapping entity creation for agent use
- `ModifyEntityAction` — Action wrapping entity modification
- `ListEntitiesAction` — Action to browse/search existing entities
- `DescribeEntityAction` — Action to get detailed entity metadata

These actions are exposed to the agent framework so Entity Designer (and Agent Manager) can invoke them.

### Actions Metadata

```json
[
  {
    "Name": "Create Entity",
    "Description": "Creates a new database entity via the RSU pipeline",
    "Category": "Schema Management",
    "Type": "Code",
    "CodeClass": "CreateEntityAction",
    "CodePackage": "@memberjunction/entity-designer-actions"
  },
  {
    "Name": "Modify Entity",
    "Description": "Modifies an existing entity (add/alter columns)",
    "Category": "Schema Management",
    "Type": "Code",
    "CodeClass": "ModifyEntityAction",
    "CodePackage": "@memberjunction/entity-designer-actions"
  },
  {
    "Name": "List User Entities",
    "Description": "Lists entities available for modification by the current user",
    "Category": "Schema Management",
    "Type": "Code",
    "CodeClass": "ListEntitiesAction",
    "CodePackage": "@memberjunction/entity-designer-actions"
  },
  {
    "Name": "Describe Entity Schema",
    "Description": "Returns detailed schema information for an entity",
    "Category": "Schema Management",
    "Type": "Code",
    "CodeClass": "DescribeEntityAction",
    "CodePackage": "@memberjunction/entity-designer-actions"
  }
]
```

---

## 9. Angular UI — Entity Designer Dashboard

### Overview

A visual dashboard for managing user-defined entities, complementing the conversational agent interface. Users can also create/modify entities through this UI without using the agent.

### Component Architecture

```
EntityDesignerDashboardComponent (resource component, registered in nav)
├── EntityDesignerListComponent        — Grid of user's entities
├── EntityDesignerCreateDialogComponent — Visual entity creation wizard
├── EntityDesignerModifyDialogComponent — Visual field editor for existing entities
└── EntityDesignerProgressComponent     — RSU pipeline progress indicator
```

### Entity List View

- Grid showing all entities the user has access to modify
- Columns: Name, Schema, Field Count, Created By, Created At, Status
- Filter by: Schema, Owner, Status
- Actions: Create New, Edit, Archive
- Uses `<mj-loading>` during data load

### Create Entity Wizard (Visual Alternative to Agent)

Step-by-step wizard for users who prefer visual UI over conversation:

1. **Basics**: Entity name, description, target schema (dropdown filtered by authorization)
2. **Fields**: Add/remove/reorder fields with type pickers, nullability toggles, descriptions
3. **Relationships**: Optional FK relationships to existing entities (dropdown search)
4. **Review**: Markdown preview of proposed schema (same format as agent shows)
5. **Create**: Triggers RSU pipeline, shows progress component

### Modify Entity View

- Shows current field list with inline editing
- Add new field button (type picker, constraints)
- Toggle field visibility (soft remove via IncludeInAPI)
- Modify nullability, default values
- Preview changes before applying
- Triggers SchemaEvolution → RSU pipeline on confirm

### Progress Component

Reusable component showing RSU pipeline stages:
- Generating schema...
- Executing migration...
- Running CodeGen...
- Compiling TypeScript...
- Restarting API...
- Complete!

Uses WebSocket subscription to `RuntimeSchemaManager` status events.

### Registration

```typescript
@RegisterClass(BaseResourceComponent, 'EntityDesignerDashboard')
@Component({ ... })
export class EntityDesignerDashboardComponent extends BaseResourceComponent { }
```

Added as a nav item in the appropriate application metadata (e.g., Home app or a new "Developer Tools" app).

---

## 10. Implementation Phases

### Phase 1: Foundation — Permissions & Metadata

**Goal**: Authorization hierarchy + UDT tracking + Gemini 3 Flash upgrade

- [ ] Create authorization seed data in `metadata/authorizations/`
  - Schema Management hierarchy (root + Create + Modify + Delete branches)
  - Default role assignments (Admin gets full, no default for other roles)
- [ ] Create `__mj_UDT` schema migration
  - `CREATE SCHEMA __mj_UDT` in migration file
  - Add to SchemaEngine's allowed schemas list
- [ ] Update Agent Manager prompts to Gemini 3 Flash
  - Modify `metadata/prompts/.agent-manager-prompts.json`
  - Replace Qwen 3 32B entries with Gemini 3 Flash (Priority 12)
  - Keep GPT-OSS-120B as fallback (Priority 10)
  - Push via mj-sync
- [ ] Add deterministic schema blocklist to SchemaEngine
  - Ensure `__mj` is always blocked in `RuntimeSchemaManager.ValidateMigrationSQL()`
  - Add `__mj_UDT` to allowed schemas
  - Unit tests for blocklist enforcement

### Phase 2: Entity Designer Agent Core

**Goal**: Working conversational agent for creating entities

- [ ] Create `@memberjunction/entity-designer-core` package
  - EntityDesignerAgent (loop agent driver)
  - Requirements Analyst sub-agent driver
  - Schema Designer sub-agent driver
  - Schema Validator sub-agent (code-based)
  - Schema Builder sub-agent (code-based, calls RuntimeSchemaManager)
- [ ] Create agent metadata in `metadata/agents/`
  - Entity Designer agent definition + sub-agents
  - Agent actions (Create Entity, Modify Entity, List Entities, Describe Entity)
  - Agent prompts with Gemini 3 Flash model assignments
- [ ] Create `@memberjunction/entity-designer-actions` package
  - CreateEntityAction
  - ModifyEntityAction
  - ListEntitiesAction
  - DescribeEntityAction
- [ ] Create prompt templates in `metadata/prompts/templates/entity-designer/`
  - Main orchestrator prompt
  - Requirements Analyst prompt
  - Schema Designer prompt (with markdown prototype output format)
- [ ] Integration test: End-to-end entity creation via agent conversation
  - Test in Docker workbench with RSU enabled
  - Verify entity appears in metadata after pipeline completes

### Phase 3: Entity Modification Support

**Goal**: Users can modify existing entities they own

- [ ] Implement modify flow in Schema Designer sub-agent
  - Load existing entity metadata
  - Propose changes as markdown diff
  - Use SchemaEvolution to generate ALTER TABLE
- [ ] Implement authorization checks for modification
  - "Modify Own" checks EntitySettings UDT:Owner
  - "Modify Any UDT" checks entity is user-defined
- [ ] Add UDT provenance tracking via EntitySettings
  - Write `MJ:UDT:Owner` and `MJ:UDT:Source` on entity creation
  - Query these for authorization decisions
- [ ] Integration test: Modify entity (add column, change nullability)

### Phase 4: Agent Manager Integration

**Goal**: Agent Manager can create backing tables via Entity Designer sub-agent

- [ ] Register Entity Designer as sub-agent of Agent Manager
  - Update agent metadata with ParentID, PayloadPaths, OutputMapping
- [ ] Update Planning Designer prompt
  - Add instructions for when/how to propose database schema
  - Define payload format for passing TableDefinition to Entity Designer
- [ ] Update Agent Manager orchestrator prompt
  - Add awareness of Entity Designer capability
  - Instructions: discuss table needs with user, then delegate
- [ ] Integration test: Agent Manager creates agent + backing table in one flow

### Phase 5: Angular UI Dashboard

**Goal**: Visual entity management UI

- [ ] Create `@memberjunction/ng-entity-designer` Angular package
  - EntityDesignerDashboardComponent (resource component)
  - EntityDesignerListComponent (grid)
  - EntityDesignerCreateDialogComponent (wizard)
  - EntityDesignerModifyDialogComponent (field editor)
  - EntityDesignerProgressComponent (RSU progress)
- [ ] Register as nav item in application metadata
- [ ] Wire up RSU pipeline progress via WebSocket/polling
- [ ] End-to-end test: Create + modify entity via UI

### Phase 6: Polish & Hardening

**Goal**: Production-ready

- [ ] Rate limiting (max entities per user per day, max fields per entity)
- [ ] Comprehensive error handling and user-friendly messages
- [ ] Audit logging of all schema operations
- [ ] Documentation for end users and administrators
- [ ] Performance testing: concurrent entity creation
- [ ] Security testing: SQL injection, authorization bypass attempts

---

## 11. Security Model (Defense in Depth)

### Five Layers of Protection

```
Layer 1: Authorization System
    └─ Role-based: Does user have "Create Entities" / "Modify Entities"?
    └─ Scope-based: UDT schema only, or custom schemas?
    └─ Owner-based: For modification, is this their entity?

Layer 2: Deterministic Schema Blocklist
    └─ Hardcoded: __mj, sys, INFORMATION_SCHEMA, dbo ALWAYS blocked
    └─ Cannot be overridden by any authorization or admin role
    └─ Enforced in RuntimeSchemaManager + Entity Designer validator

Layer 3: SchemaEngine Validation
    └─ ValidateMigrationSQL() — regex blocks DDL on protected schemas
    └─ ValidateIdentifier() — prevents SQL injection in names
    └─ SchemaValidator.Validate() — structural checks on TableDefinition

Layer 4: DDL Generator Safety
    └─ QuoteIdentifier() — proper escaping for all identifiers
    └─ Type whitelist — only SchemaFieldType enum values accepted
    └─ No raw SQL passthrough — all DDL generated from typed structures

Layer 5: AI Prompt Guardrails
    └─ System prompts explicitly instruct: never target __mj schema
    └─ But this is advisory only — Layers 1-4 are the real enforcement
```

### What the AI Cannot Do (Even If Prompted)

- Create/modify tables in `__mj` schema → blocked by Layer 2 + 3
- Execute arbitrary SQL → no raw SQL path exists; all goes through TableDefinition
- Bypass authorization → checked before pipeline execution
- Inject SQL via column names → Layer 3 + 4 validate identifiers
- DROP TABLE or destructive DDL → RuntimeSchemaManager only allows CREATE/ALTER

---

## 12. Open Questions

1. **`__mj_UDT` schema creation**: Should this schema be created as part of the standard MJ install, or only when Entity Designer is first used? (Recommend: create at install time via migration)

2. **Entity archival**: When a user "deletes" an entity, should we DROP the table or just hide it from metadata? (Recommend: hide only, with optional admin-level hard delete)

3. **Cross-schema relationships**: Can a UDT entity in `__mj_UDT` have a FK to a core `__mj` entity like Users? (Recommend: yes, via soft FK — this is how integrations work already)

4. **Entity promotion**: Should we support "promoting" a UDT to a proper schema (e.g., move from `__mj_UDT` to `sales`)? (Recommend: future phase — requires data migration tooling)

5. **Concurrent RSU**: If two users create entities simultaneously, the RSU pipeline mutex serializes them. Is the wait acceptable? (Recommend: yes for v1 — RSU pipeline is ~60-120 seconds, and concurrent UDT creation is rare)

6. **Angular UI priority**: Should the visual dashboard (Phase 5) ship before or after the agent interface? (Recommend: after — agent is the primary UX, dashboard is complementary)

---

## 13. File & Metadata Inventory

### New Packages
```
packages/AI/EntityDesigner/core/           — Agent driver classes
packages/AI/EntityDesigner/actions/        — MJ Actions for schema ops
packages/Angular/Explorer/dashboards/src/EntityDesigner/  — Angular UI
```

### New Metadata Files
```
metadata/agents/.entity-designer.json                     — Agent definitions
metadata/prompts/.entity-designer-prompts.json            — Prompt definitions
metadata/prompts/templates/entity-designer/*.template.md  — Prompt templates
metadata/authorizations/.schema-management.json           — Authorization hierarchy
```

### Modified Metadata Files
```
metadata/prompts/.agent-manager-prompts.json              — Gemini 3 Flash upgrade
metadata/agents/.agent-manager.json                       — Add Entity Designer sub-agent
```

### Migrations
```
migrations/v5/VYYYYMMDDHHMM__v5.x_Create_UDT_Schema.sql  — CREATE SCHEMA __mj_UDT
migrations/v5/VYYYYMMDDHHMM__v5.x_Schema_Mgmt_Auths.sql  — Authorization seed data
```

---

## 14. Success Metrics

| Metric | Target |
|--------|--------|
| Entity creation time (agent) | < 2 minutes end-to-end |
| Entity creation time (UI wizard) | < 2 minutes end-to-end |
| Entity modification time | < 90 seconds |
| Pipeline success rate | > 95% |
| Agent conversation quality | User gets working entity in 1-3 conversation turns |
| Agent Manager handoff | Seamless — user doesn't notice sub-agent delegation |
| Security: zero unauthorized schema modifications | 100% |

---

## 15. Relationship to Prior Plans

| Prior Plan | Relationship |
|-----------|-------------|
| [user-defined-tables-architecture.md](complete/user-defined-tables-architecture.md) (Jan 2025) | **Superseded** — this plan replaces it. Key differences: uses built RSU infrastructure instead of proposed CodeGenAPI, uses Agent Manager sub-agent pattern instead of standalone agent, uses Authorizations instead of custom permission flag. |
| [runtime-schema-update-plan.md](complete/runtime-schema-update-plan.md) | **Depends on** — Entity Designer uses RSU pipeline as-is. No modifications to RSU needed. |
| [schema-management-automation.md](schema-management-automation.md) | **Depends on** — SchemaEngine interfaces are the foundation for Entity Designer's DDL generation. |
| [integration-ddl-schema-management.md](integration-ddl-schema-management.md) | **Pattern reference** — Integration's SchemaBuilder is the model for how Entity Designer wraps SchemaEngine. |

---

**Document Version**: 1.0
**Date**: March 27, 2026
**Authors**: Craig + Claude (conversation-driven design)
**Status**: Draft for Review
