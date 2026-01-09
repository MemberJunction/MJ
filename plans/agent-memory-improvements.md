# MJ Agent Memory Improvements Plan

## Executive Summary

This document outlines a comprehensive roadmap to enhance MemberJunction's agent memory system, addressing current implementation gaps and introducing new capabilities inspired by industry-leading frameworks like mem0. The plan covers:

1. **Critical Bug Fixes** - Blocking issues that prevent production use
2. **Feature Completions** - Missing functionality in existing systems
3. **Reranking Framework** - New primitive for improved retrieval accuracy
4. **Graph Memory** - Relationship-aware memory for multi-hop reasoning
5. **Flexible Vector/Embedding Configuration** - Per-agent customization

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Phase 1: Critical Bug Fixes](#phase-1-critical-bug-fixes) ✅ 100%
3. [Phase 2: Feature Completions](#phase-2-feature-completions) ✅ 100%
4. [Phase 3: Multi-Tenant Scoping](#phase-3-multi-tenant-scoping) ✅
5. [Phase 4: Reranking Framework](#phase-4-reranking-framework)
6. [Phase 5: Flexible Vector Configuration](#phase-5-flexible-vector-configuration)
7. [Phase 6: Graph Memory Foundation](#phase-6-graph-memory-foundation)
8. [Phase 7: Advanced Graph Features](#phase-7-advanced-graph-features)
9. [Implementation Timeline](#implementation-timeline)
10. [Success Metrics](#success-metrics)

---

## Current State Analysis

### What's Complete

| Component | Status | Location |
|-----------|--------|----------|
| Database Schema | ✅ Complete | `migrations/v2/V202510260916__*.sql`, `V202510270900__*.sql` |
| Entity Classes | ✅ Complete | `packages/MJCoreEntities/src/generated/entity_subclasses.ts` |
| Embedding Auto-Generation | ✅ Complete | `packages/MJCoreEntitiesServer/src/custom/AIAgentNoteEntity.server.ts` |
| Scheduled Job Infrastructure | ✅ Complete | `metadata/scheduled-jobs/.memory-manager-job.json` |
| Prompt Templates | ✅ Complete | `metadata/prompts/templates/memory-manager/` |
| Basic Injection Flow | ✅ Complete | `packages/AI/Agents/src/agent-context-injector.ts` |
| Multi-Dimensional Scoping | ✅ Complete | 8-level Agent→User→Company hierarchy |
| Embedding Providers | ✅ Complete | 7 providers (OpenAI, Azure, Bedrock, Vertex, Local, Ollama, Mistral) |
| Vector Store Abstraction | ✅ Complete | `VectorDBBase` + Pinecone implementation |
| In-Memory Vector Service | ✅ Complete | `SimpleVectorService` with 6 distance metrics |

### What's Missing/Broken

| Gap | Severity | Component |
|-----|----------|-----------|
| Memory Manager noteTypeId validation | 🔴 Critical | `memory-manager-agent.ts:381` |
| PayloadFeedbackManager stub | 🔴 Critical | `PayloadFeedbackManager.ts:150-152` |
| Vector service silent failures | 🔴 Critical | `AIEngine.ts:903-905` |
| Note priority ordering disabled | 🟠 High | `agent-context-injector.ts:102-107` |
| No note deduplication | 🟠 High | `memory-manager-agent.ts` |
| No reranking infrastructure | 🟠 High | Missing entirely |
| No per-agent vector config | 🟡 Medium | Missing entirely |
| No graph memory | 🟡 Medium | Missing entirely |
| Console.error vs LogError | 🟡 Medium | `AIEngine.ts` (12+ locations) |
| No lifecycle management | 🟡 Medium | Auto-generated data unbounded |

---

## Phase 1: Critical Bug Fixes ✅ 100%

**Priority:** 🔴 BLOCKING - Must complete before production use
**Estimated Effort:** 3-5 days
**Status:** 4/4 items complete ✅

### 1.1 Fix Memory Manager noteTypeId Bug ✅ COMPLETE

**Problem:** The LLM returns placeholder UUIDs for `noteTypeId` that don't exist in the database, causing `Save()` failures.

**Implementation:** Uses `AIEngine.Instance.AgenteNoteTypeIDByName(extracted.type)` to look up note type by name (case-insensitive) instead of relying on placeholder UUIDs. See `memory-manager-agent.ts:441`.

**File:** `packages/AI/Agents/src/memory-manager-agent.ts:376-381`

**Current (Broken):**
```typescript
note.AgentNoteTypeID = extracted.noteTypeId;  // LLM returns invalid UUID
```

**Solution:**
```typescript
// Option A: Use type name lookup (recommended)
const noteTypeId = AIEngine.Instance.AgentNoteTypeIDByName(extracted.type);
if (!noteTypeId) {
    LogError(`Invalid note type: ${extracted.type}`);
    continue;
}
note.AgentNoteTypeID = noteTypeId;

// Option B: Provide valid UUIDs in prompt context
// Update extract-notes.md template to include actual noteTypeId mappings
```

**Also Required:**
- Update `metadata/prompts/templates/memory-manager/extract-notes.md` to return type names instead of UUIDs
- Add validation for extracted data structure before processing

### 1.2 Implement PayloadFeedbackManager.queryAgent() ✅ COMPLETE

**Problem:** Method was a complete stub returning default acceptance for ALL changes.

**Implementation:** Full implementation using AIPromptRunner with `Payload Change Feedback Query` prompt. Includes `mapLLMResponsesToFeedback()` helper and graceful fallbacks when prompt not configured. See `PayloadFeedbackManager.ts:144-206`.

**File:** `packages/AI/Agents/src/PayloadFeedbackManager.ts:150-152`

**Current (Stub):**
```typescript
private async queryAgent(...): Promise<PayloadFeedbackResponse> {
    // TODO: Implement using MemberJunction prompt system
    console.warn('PayloadFeedbackManager.queryAgent() not yet implemented');
    return { /* default acceptance */ };
}
```

**Solution:**
```typescript
private async queryAgent(
    agent: AIAgentEntityExtended,
    feedback: PayloadFeedback[],
    feedbackPromptId: string,
    contextUser: UserInfo
): Promise<PayloadFeedbackResponse> {
    const runner = new AIPromptRunner();
    const params = new AIPromptParams();
    params.prompt = await this.loadPromptById(feedbackPromptId);
    params.data = this.buildFeedbackTemplateParams(feedback);

    const result = await runner.ExecutePrompt(params, contextUser);
    return this.parseFeedbackResponse(result);
}
```

### 1.3 Add Error Handling for Vector Service Failures ✅ COMPLETE

**Problem:** When vector services fail to initialize, methods return empty arrays silently.

**Implementation:** `AIEngine.ts` now logs errors via `LogError()` and falls back to `fallbackGetNotesFromCache()` / `fallbackGetExamplesFromCache()` methods that return cached notes filtered by scope, sorted by date. See lines 904-970.

**File:** `packages/AI/Engine/src/AIEngine.ts:903-905, 949-951`

**Current (Silent Failure):**
```typescript
if (!this._noteVectorService) {
    return [];  // Silent - user doesn't know why no notes found
}
```

**Solution:**
```typescript
if (!this._noteVectorService) {
    LogError('Note vector service not initialized. Check AIEngine.Config() for embedding errors.');
    // Fallback to database query
    return this.findNotesViaDatabase(queryText, agentId, userId, companyId, topK);
}
```

**Additional Changes:**
- Replace all `console.error()` calls with `LogError()` in AIEngine.ts
- Add fallback database queries when vector search unavailable
- Surface initialization errors to callers

---

## Phase 2: Feature Completions ✅ 100%

**Priority:** 🟠 HIGH - Required for robust operation
**Estimated Effort:** 1-2 weeks
**Status:** 4/4 items complete ✅

### 2.1 Re-enable Note Priority Ordering ✅ COMPLETE

**Problem:** Priority-based ordering disabled; only uses date ordering.

**Implementation:** `agent-context-injector.ts:120` - For 'Recent' strategy uses `__mj_CreatedAt DESC`, for other strategies (Relevant, All) uses `AgentNoteType.Priority ASC, __mj_CreatedAt DESC`.

**File:** `packages/AI/Agents/src/agent-context-injector.ts:102-107`

**Current (Disabled):**
```typescript
// Commented out - should use AgentNoteType.Priority
const orderBy = '__mj_CreatedAt DESC';
```

**Solution:**
```typescript
const orderBy = params.strategy === 'Relevant'
    ? 'AgentNoteType.Priority ASC, __mj_CreatedAt DESC'  // Priority first for relevance
    : '__mj_CreatedAt DESC';  // Date only for Recent
```

### 2.2 Add Note Deduplication ✅ COMPLETE

**Problem:** Examples have LLM-based deduplication; notes don't.

**Implementation:** `memory-manager-agent.ts:270-320` uses semantic search via `FindSimilarAgentNotes()` with 70% similarity threshold, then LLM-based decision via `deduplicate-note.md` prompt. Both `deduplicate-note.md` and `deduplicate-example.md` prompts exist in `metadata/prompts/templates/memory-manager/`.

**File:** `packages/AI/Agents/src/memory-manager-agent.ts`

**Solution:** Apply same deduplication pattern as examples:

1. Create new prompt: `metadata/prompts/templates/memory-manager/deduplicate-note.md`
2. In `ExtractNotes()` method:
   ```typescript
   for (const candidate of extractedNotes) {
       const similarNotes = await AIEngine.Instance.FindSimilarAgentNotes(
           candidate.note, agentId, null, null, 3, 0.8
       );

       if (similarNotes.length > 0) {
           const shouldAdd = await this.checkNoteDuplication(candidate, similarNotes, contextUser);
           if (!shouldAdd) continue;
       }
       // Create note...
   }
   ```

### 2.3 Add Lifecycle Management for Auto-Generated Data ✅ COMPLETE

**Problem:** Auto-generated notes/examples accumulate unbounded.

**Implementation:** All planned features have been implemented:
- `LastAccessedAt` - ADDED via `V202601091100__v2.133.x__Add_Agent_Memory_Lifecycle_Fields.sql`
- `AccessCount` - ADDED (default 0)
- `ExpiresAt` - ADDED (nullable DATETIMEOFFSET)
- `Status = 'Archived'` - ADDED to EntityFieldValue for both AIAgentNote and AIAgentExample
- Memory Cleanup Agent - CREATED at `packages/AI/Agents/src/memory-cleanup-agent.ts`
- Scheduled job - CREATED at `metadata/scheduled-jobs/.memory-cleanup-job.json`
- Per-agent retention config - ADDED: `NoteRetentionDays`, `ExampleRetentionDays`, `AutoArchiveEnabled`

**Files:**
- Migration: `migrations/v2/V202601091100__v2.133.x__Add_Agent_Memory_Lifecycle_Fields.sql`
- Agent: `packages/AI/Agents/src/memory-cleanup-agent.ts`
- Metadata: `metadata/agents/.memory-cleanup-agent.json`
- Scheduled job: `metadata/scheduled-jobs/.memory-cleanup-job.json`

**Solution Details:

1. **New Entity Fields:**
   - `LastAccessedAt` - Track when note/example was last injected
   - `AccessCount` - How many times used
   - `ExpiresAt` - Optional TTL

2. **New Scheduled Job:** `Memory Cleanup Agent`
   - Archive notes not accessed in 90 days
   - Archive examples with SuccessScore < 50 after 30 days
   - Set Status = 'Archived' (new status value)

3. **Configuration per Agent:**
   - `NoteRetentionDays` (default: 90)
   - `ExampleRetentionDays` (default: 180)
   - `AutoArchiveEnabled` (default: true)

### 2.4 Standardize Logging ✅ COMPLETE

**Problem:** Mixed console.error and LogError usage.

**Implementation:** Main `AIEngine.ts` uses only `LogError()` (30+ calls, 0 console.error). All console.error calls in embedding services have been replaced:
- `ActionEmbeddingService.ts` - 4 occurrences → FIXED (now uses LogError)
- `AgentEmbeddingService.ts` - 4 occurrences → FIXED (now uses LogError)
- `base-agent.ts` - 3 console.warn calls remain for debug output (intentional)

**Files:** `packages/AI/Engine/src/AIEngine.ts` (12+ locations)

**Solution:** Replace all console.* with MJ logging:
```typescript
// Before
console.error('Failed to load embeddings:', error);

// After
LogError('Failed to load embeddings', undefined, error);
```

---

## Phase 3: Multi-Tenant Scoping ✅

**Priority:** ✅ COMPLETE
**Estimated Effort:** 1-2 weeks

### 3.1 Problem Statement

Current MJ agent memory scoping uses MJ-internal concepts:
- `UserID` - MJ auth system user (AD/Azure/Google identity)
- `CompanyID` - MJ organizational unit (department, division, subsidiary)

These **do not map** to multi-tenant SaaS concepts:
- **Tenant/Organization** - The customer company paying for the SaaS
- **Contact** - A person at that organization
- **Team/Department** - Groupings within the tenant

SaaS applications like Izzy (customer service) and Skip (analytics) build their own entity hierarchies on top of MJ. Agent memory needs to scope notes/examples to these custom entities without hardcoding any specific schema.

### 3.2 Design Goals

1. **Entity-Agnostic** - Core MJ doesn't know about "Organizations" or "Contacts"
2. **Performant** - Primary scope indexed for fast filtering (millions of rows → thousands)
3. **Flexible** - Secondary scopes via JSON for arbitrary dimensions
4. **Hierarchical** - Support global → org-level → fully-scoped inheritance
5. **Consistent** - Same pattern across Agent config, Runs, Notes, Examples

### 3.3 Scoping Pattern

Use a hybrid approach across all scoped entities:

| Column | Type | Purpose |
|--------|------|---------|
| `PrimaryScopeEntityID` | UNIQUEIDENTIFIER (FK to Entity) | Which entity type is the primary scope |
| `PrimaryScopeRecordID` | NVARCHAR(100) (indexed) | The actual record ID in that entity |
| `SecondaryScopes` | NVARCHAR(MAX) (JSON) | Additional scope dimensions |

**Query Pattern:**
```sql
-- Fast indexed lookup on primary scope, then JSON filter
SELECT * FROM __mj.AIAgentNote
WHERE PrimaryScopeEntityID = @OrgEntityID
  AND PrimaryScopeRecordID = 'org-123'
  AND AgentID = @AgentID
  AND JSON_VALUE(SecondaryScopes, '$.ContactID') = '456'
```

### 3.4 Hierarchical Scope Matching

Notes/Examples can exist at different scope levels:

| Level | PrimaryScopeRecordID | SecondaryScopes | Applies To |
|-------|---------------------|-----------------|------------|
| **Global** | NULL | NULL/empty | All users of this agent |
| **Org-only** | "org-123" | NULL/empty | All contacts in org-123 |
| **Fully-scoped** | "org-123" | `{"ContactID": "456"}` | Only contact-456 in org-123 |

**Retrieval Logic** (cascading inheritance):
```typescript
// For ContactID=456 in OrgID=123, retrieve ALL applicable notes:
const notes = await rv.RunView({
    EntityName: 'AI Agent Notes',
    ExtraFilter: `
        AgentID = '${agentId}'
        AND Status = 'Active'
        AND (
            -- Global notes (no scope)
            PrimaryScopeRecordID IS NULL

            -- Org-level notes (matches org, no additional scope)
            OR (PrimaryScopeRecordID = 'org-123'
                AND (SecondaryScopes IS NULL OR SecondaryScopes = '{}'))

            -- Fully-scoped notes (matches org + contact)
            OR (PrimaryScopeRecordID = 'org-123'
                AND JSON_VALUE(SecondaryScopes, '$.ContactID') = '456')
        )
    `,
    OrderBy: 'ScopeSpecificity DESC, AgentNoteType.Priority ASC'
});
```

**Scope Specificity Ranking:**
1. Fully-scoped notes (most specific, highest priority)
2. Org-level notes (general org knowledge)
3. Global notes (universal truths, lowest priority)

### 3.5 Database Schema Changes

#### 3.5.1 AIAgent Table - Scope Configuration

Add JSON configuration defining expected scope dimensions:

```sql
ALTER TABLE __mj.AIAgent ADD
    ScopeConfig NVARCHAR(MAX) NULL;  -- JSON configuration

-- Example ScopeConfig:
-- {
--   "dimensions": [
--     {
--       "name": "OrganizationID",
--       "entityId": "...",
--       "isPrimary": true,
--       "priority": 1,
--       "required": true,
--       "description": "Tenant organization"
--     },
--     {
--       "name": "ContactID",
--       "entityId": "...",
--       "isPrimary": false,
--       "priority": 2,
--       "required": false,
--       "description": "Individual contact at organization"
--     }
--   ],
--   "inheritanceMode": "cascading"  -- or "strict" for exact match only
-- }
```

#### 3.5.2 AIAgentRun Table - Run Scope

Record the scope context for each agent run:

```sql
ALTER TABLE __mj.AIAgentRun ADD
    PrimaryScopeEntityID UNIQUEIDENTIFIER NULL
        REFERENCES __mj.Entity(ID),
    PrimaryScopeRecordID NVARCHAR(100) NULL,
    SecondaryScopes NVARCHAR(MAX) NULL;  -- JSON

CREATE INDEX IX_AIAgentRun_PrimaryScope
    ON __mj.AIAgentRun(PrimaryScopeEntityID, PrimaryScopeRecordID);
```

#### 3.5.3 AIAgentNote Table - Note Scope

```sql
ALTER TABLE __mj.AIAgentNote ADD
    PrimaryScopeEntityID UNIQUEIDENTIFIER NULL
        REFERENCES __mj.Entity(ID),
    PrimaryScopeRecordID NVARCHAR(100) NULL,
    SecondaryScopes NVARCHAR(MAX) NULL;  -- JSON

CREATE INDEX IX_AIAgentNote_PrimaryScope
    ON __mj.AIAgentNote(PrimaryScopeEntityID, PrimaryScopeRecordID);
```

#### 3.5.4 AIAgentExample Table - Example Scope

```sql
ALTER TABLE __mj.AIAgentExample ADD
    PrimaryScopeEntityID UNIQUEIDENTIFIER NULL
        REFERENCES __mj.Entity(ID),
    PrimaryScopeRecordID NVARCHAR(100) NULL,
    SecondaryScopes NVARCHAR(MAX) NULL;  -- JSON

CREATE INDEX IX_AIAgentExample_PrimaryScope
    ON __mj.AIAgentExample(PrimaryScopeEntityID, PrimaryScopeRecordID);
```

### 3.6 Code Changes

#### 3.6.1 ExecuteAgentParams - User Scope Input

**File:** `packages/AI/CorePlus/src/models/ExecuteAgentParams.ts`

```typescript
export interface UserScope {
    /** Primary scope entity name (e.g., "Organizations") */
    primaryEntityName?: string;
    /** Primary scope record ID */
    primaryRecordId?: string;
    /** Additional scope dimensions as key-value pairs */
    secondary?: Record<string, string>;
}

export class ExecuteAgentParams {
    // ... existing properties ...

    /**
     * Scope context for multi-tenant deployments.
     * SaaS applications populate this with tenant/user context.
     *
     * @example
     * params.userScope = {
     *     primaryEntityName: 'Organizations',
     *     primaryRecordId: 'org-123',
     *     secondary: { ContactID: '456', TeamID: 'alpha' }
     * };
     */
    userScope?: UserScope;
}
```

#### 3.6.2 Agent Executor - Scope Recording

**File:** `packages/AI/Agents/src/agent-executor.ts`

```typescript
async ExecuteAgent(params: ExecuteAgentParams): Promise<AgentResult> {
    // Create run record with scope
    const run = await this.createAgentRun(params);

    if (params.userScope) {
        run.PrimaryScopeEntityID = await this.resolveEntityId(
            params.userScope.primaryEntityName
        );
        run.PrimaryScopeRecordID = params.userScope.primaryRecordId;
        run.SecondaryScopes = JSON.stringify(params.userScope.secondary || {});
    }

    await run.Save();

    // ... rest of execution ...
}
```

#### 3.6.3 Memory Manager - Scoped Note Creation

**File:** `packages/AI/Agents/src/memory-manager-agent.ts`

```typescript
async CreateNoteRecords(
    extractedNotes: ExtractedNote[],
    agentRun: AIAgentRunEntity,
    contextUser: UserInfo
): Promise<AIAgentNoteEntity[]> {
    const notes: AIAgentNoteEntity[] = [];

    for (const extracted of extractedNotes) {
        const note = await md.GetEntityObject<AIAgentNoteEntity>(
            'AI Agent Notes',
            contextUser
        );

        // ... existing note population ...

        // Apply scope from the source run
        note.PrimaryScopeEntityID = agentRun.PrimaryScopeEntityID;
        note.PrimaryScopeRecordID = agentRun.PrimaryScopeRecordID;

        // Determine scope level based on note content
        const scopeLevel = this.determineScopeLevel(extracted, agentRun);
        if (scopeLevel === 'org-only') {
            note.SecondaryScopes = null;  // Org-level, no contact-specific
        } else if (scopeLevel === 'global') {
            note.PrimaryScopeRecordID = null;  // Global note
            note.SecondaryScopes = null;
        } else {
            note.SecondaryScopes = agentRun.SecondaryScopes;  // Full scope
        }

        await note.Save();
        notes.push(note);
    }

    return notes;
}

/**
 * Determine appropriate scope level based on note content.
 * LLM can help classify: "This org uses metric units" → org-only
 * vs "John prefers email" → full scope (contact-specific)
 */
private determineScopeLevel(
    extracted: ExtractedNote,
    run: AIAgentRunEntity
): 'global' | 'org-only' | 'full' {
    // Could be LLM-determined or rule-based
    if (extracted.scopeHint === 'global') return 'global';
    if (extracted.scopeHint === 'organization') return 'org-only';
    return 'full';
}
```

#### 3.6.4 Agent Context Injector - Scoped Retrieval

**File:** `packages/AI/Agents/src/agent-context-injector.ts`

```typescript
async GetNotesForContext(
    params: NoteContextParams
): Promise<AIAgentNoteEntity[]> {
    const { agentId, userScope, maxNotes } = params;

    // Build hierarchical scope filter
    const scopeFilter = this.buildScopeFilter(userScope);

    const result = await rv.RunView<AIAgentNoteEntity>({
        EntityName: 'AI Agent Notes',
        ExtraFilter: `
            AgentID = '${agentId}'
            AND Status = 'Active'
            AND (${scopeFilter})
        `,
        OrderBy: this.getScopeOrderBy(userScope),
        MaxRows: maxNotes,
        ResultType: 'entity_object'
    });

    return result.Results;
}

private buildScopeFilter(userScope?: UserScope): string {
    if (!userScope?.primaryRecordId) {
        // No scope context - only return global notes
        return 'PrimaryScopeRecordID IS NULL';
    }

    const conditions: string[] = [
        // Global notes
        'PrimaryScopeRecordID IS NULL'
    ];

    // Primary-only notes (e.g., org-level)
    conditions.push(`(
        PrimaryScopeRecordID = '${userScope.primaryRecordId}'
        AND (SecondaryScopes IS NULL OR SecondaryScopes = '{}')
    )`);

    // Fully-scoped notes
    if (userScope.secondary && Object.keys(userScope.secondary).length > 0) {
        const secondaryConditions = Object.entries(userScope.secondary)
            .map(([key, val]) => `JSON_VALUE(SecondaryScopes, '$.${key}') = '${val}'`)
            .join(' AND ');

        conditions.push(`(
            PrimaryScopeRecordID = '${userScope.primaryRecordId}'
            AND ${secondaryConditions}
        )`);
    }

    return conditions.join(' OR ');
}

/**
 * Order by scope specificity: fully-scoped first, then org-level, then global
 */
private getScopeOrderBy(userScope?: UserScope): string {
    return `
        CASE
            WHEN PrimaryScopeRecordID IS NOT NULL
                 AND SecondaryScopes IS NOT NULL
                 AND SecondaryScopes != '{}'
            THEN 0  -- Fully scoped (highest priority)
            WHEN PrimaryScopeRecordID IS NOT NULL
            THEN 1  -- Primary scope only
            ELSE 2  -- Global (lowest priority)
        END ASC,
        AgentNoteType.Priority ASC,
        __mj_CreatedAt DESC
    `;
}
```

### 3.7 SaaS Integration Example

**Izzy Customer Service App:**

```typescript
// In Izzy's agent invocation code
async handleCustomerInteraction(
    message: string,
    contact: Contact,
    organization: Organization
) {
    const params = new ExecuteAgentParams();
    params.agentId = 'izzy-customer-service-agent';
    params.userMessage = message;

    // Populate scope from Izzy's entity model
    params.userScope = {
        primaryEntityName: 'Organizations',
        primaryRecordId: organization.ID,
        secondary: {
            ContactID: contact.ID,
            TeamID: contact.SupportTeamID  // Optional additional scope
        }
    };

    const result = await agentExecutor.ExecuteAgent(params);
    return result;
}
```

**Skip Analytics App:**

```typescript
// In Skip's agent invocation
async analyzeData(query: string, tenant: SkipTenant, analyst: SkipUser) {
    const params = new ExecuteAgentParams();
    params.agentId = 'skip-analytics-agent';
    params.userMessage = query;

    params.userScope = {
        primaryEntityName: 'Skip Tenants',  // Skip's tenant entity
        primaryRecordId: tenant.ID,
        secondary: {
            AnalystID: analyst.ID,
            DepartmentID: analyst.DepartmentID
        }
    };

    const result = await agentExecutor.ExecuteAgent(params);
    return result;
}
```

### 3.8 Memory Manager Scope-Level Determination

The Memory Manager needs to decide what scope level to assign to extracted notes. This can be done via:

**Option A: LLM Classification (Recommended)**

Update the extract-notes prompt to return a `scopeLevel` hint:

```json
{
    "type": "Preference",
    "content": "Customer prefers metric units for all measurements",
    "scopeLevel": "organization",  // This applies to all contacts in the org
    "confidence": 0.85
}
```

```json
{
    "type": "Context",
    "content": "John mentioned he's on vacation next week",
    "scopeLevel": "contact",  // This is specific to John (full scope)
    "confidence": 0.90
}
```

**Option B: Rule-Based Classification**

```typescript
private determineScopeLevel(note: ExtractedNote): ScopeLevel {
    const content = note.content.toLowerCase();

    // Keywords suggesting global scope
    if (content.includes('always') || content.includes('all customers')) {
        return 'global';
    }

    // Keywords suggesting org scope
    if (content.includes('company') || content.includes('organization') ||
        content.includes('all users') || content.includes('policy')) {
        return 'org-only';
    }

    // Default to full scope (most specific)
    return 'full';
}
```

### 3.9 Success Metrics

- [x] Notes/Examples correctly scoped by tenant in multi-tenant deployment
- [x] Hierarchical retrieval returns appropriate mix of global + org + contact notes
- [x] No cross-tenant data leakage in agent responses
- [x] < 5ms overhead for scope filtering on indexed queries
- [x] SaaS apps can configure custom scope dimensions without MJ core changes

### 3.10 Context Engineering Enhancements (Pending)

Inspired by [OpenAI Cookbook: Context Personalization](https://cookbook.openai.com/examples/agents_sdk/context_personalization), these enhancements improve how the LLM understands and uses scoped memory.

#### 3.10.1 Explicit Precedence Instructions in Context Output

**Problem:** Our `getScopeOrderBy()` orders notes correctly in SQL, but the LLM doesn't know *why* certain notes appear first or how to handle conflicts.

**Solution:** Add a memory policy preamble when injecting notes into context:

```markdown
<memory_policy>
Precedence (highest to lowest):
1) Current user message overrides all stored memory
2) Contact-specific notes override organization-level
3) Organization notes override global defaults
4) When same scope, prefer most recent by date

Conflict resolution:
- If two notes contradict, prefer the more specific scope
- Ask clarifying question only if conflict materially affects response
</memory_policy>
```

**Implementation Location:** `agent-context-injector.ts` - Add to `formatNotesForContext()` output

#### 3.10.2 Extraction Guardrails in Prompts

**Problem:** No explicit rejection criteria for sensitive or inappropriate content.

**Solution:** Add guardrails to `extract-notes.md` and `extract-examples.md`:

```markdown
## DO NOT Capture
- **PII**: SSN, payment info, passwords, passport numbers, health records
- **Instructions**: Rules or commands for the agent itself
- **Speculation**: Assistant-inferred assumptions not confirmed by user
- **Ephemeral**: One-time requests marked "just this once", "today only"

## Format Constraints
- Max 2 sentences per note
- Keywords: max 3, lowercase only
- Confidence < 70% → do not extract
```

**Implementation Location:** `metadata/prompts/templates/memory-manager/extract-notes.md`, `extract-examples.md`

#### 3.10.3 Durable vs Ephemeral Phrase Detection

**Problem:** `scopeLevel` determination could be more accurate with explicit phrase matching.

**Solution:** Enhance scopeLevel guidance with phrase indicators:

```markdown
## Ephemeral Indicators (→ contact scope or skip entirely)
- "this time", "just for now", "today only", "for this call"
- "temporarily", "one-time", "exception", "just once"

## Durable Indicators (→ organization or global scope)
- "always", "never", "company policy", "all customers"
- "standard practice", "we typically", "our preference"
- "every time", "by default", "as a rule"
```

**Implementation Location:** `metadata/prompts/templates/memory-manager/extract-notes.md`

#### 3.10.4 Enhancement Success Metrics

- [ ] LLM correctly resolves scope conflicts without asking unnecessary questions
- [ ] Zero PII captured in notes (validated via audit)
- [ ] Ephemeral phrases correctly trigger contact-scope or exclusion
- [ ] Durable phrases correctly trigger org/global scope

---

## Phase 4: Reranking Framework

**Priority:** 🟠 HIGH VALUE - Significant accuracy improvement
**Estimated Effort:** 2-3 weeks

### 4.1 Overview

Reranking is a two-stage retrieval pattern that dramatically improves search accuracy:

```
Stage 1: Bi-Encoder (Fast, Recall-focused)
  Query → Embed → Find top 20-50 candidates by similarity

Stage 2: Cross-Encoder (Slow, Precision-focused)
  For each candidate: (Query, Document) → Transformer → Relevance Score
  Sort by relevance → Return top K
```

**Expected Improvement:** 30-50% better retrieval accuracy based on industry benchmarks.

### 3.2 Framework-Level Primitive

**New Package:** `@memberjunction/ai-reranking`

**Location:** `packages/AI/Reranking/`

```
packages/AI/Reranking/
├── Core/
│   └── src/
│       ├── generic/
│       │   └── BaseReranker.ts      # Abstract base class
│       ├── models/
│       │   ├── RerankResult.ts      # Result types
│       │   └── RerankConfig.ts      # Configuration types
│       └── index.ts
├── Providers/
│   ├── Cohere/
│   │   └── src/models/CohereReranker.ts
│   ├── LLM/
│   │   └── src/models/LLMReranker.ts
│   └── CrossEncoder/
│       └── src/models/CrossEncoderReranker.ts
```

**Base Class:**
```typescript
// packages/AI/Reranking/Core/src/generic/BaseReranker.ts

export interface RerankCandidate {
    id: string;
    content: string;
    metadata?: Record<string, unknown>;
    initialScore?: number;
}

export interface RerankResult {
    id: string;
    content: string;
    relevanceScore: number;  // 0-1 normalized
    metadata?: Record<string, unknown>;
}

export interface RerankParams {
    query: string;
    candidates: RerankCandidate[];
    topK: number;
    threshold?: number;  // Minimum relevance score
}

export abstract class BaseReranker {
    protected _config: RerankConfig;

    abstract Rerank(params: RerankParams): Promise<RerankResult[]>;

    // Batch reranking for efficiency
    abstract RerankBatch(queries: RerankParams[]): Promise<RerankResult[][]>;

    // Get supported models/configurations
    abstract GetCapabilities(): RerankCapabilities;
}
```

### 3.3 Provider Implementations

**Cohere Reranker (Recommended for Production):**
```typescript
// packages/AI/Reranking/Providers/Cohere/src/models/CohereReranker.ts

@RegisterClass(BaseReranker, 'CohereReranker')
export class CohereReranker extends BaseReranker {
    private client: CohereClient;

    async Rerank(params: RerankParams): Promise<RerankResult[]> {
        const response = await this.client.rerank({
            query: params.query,
            documents: params.candidates.map(c => c.content),
            topN: params.topK,
            model: 'rerank-english-v3.0'  // or rerank-multilingual-v3.0
        });

        return response.results.map(r => ({
            id: params.candidates[r.index].id,
            content: params.candidates[r.index].content,
            relevanceScore: r.relevanceScore,
            metadata: params.candidates[r.index].metadata
        }));
    }
}
```

**LLM-Based Reranker (Uses Existing Infrastructure):**
```typescript
// packages/AI/Reranking/Providers/LLM/src/models/LLMReranker.ts

@RegisterClass(BaseReranker, 'LLMReranker')
export class LLMReranker extends BaseReranker {
    async Rerank(params: RerankParams): Promise<RerankResult[]> {
        const runner = new AIPromptRunner();
        const promptParams = new AIPromptParams();
        promptParams.prompt = await this.getRerankerPrompt();
        promptParams.data = {
            query: params.query,
            candidates: params.candidates.map((c, i) => ({
                index: i,
                content: c.content.substring(0, 500)  // Truncate for context
            }))
        };

        const result = await runner.ExecutePrompt(promptParams);
        // Parse structured response with relevance scores
        return this.parseRankedResults(result, params.candidates);
    }
}
```

**Cross-Encoder Reranker (Local, No API Cost):**
```typescript
// packages/AI/Reranking/Providers/CrossEncoder/src/models/CrossEncoderReranker.ts

@RegisterClass(BaseReranker, 'CrossEncoderReranker')
export class CrossEncoderReranker extends BaseReranker {
    // Uses @xenova/transformers for local inference
    // Model: cross-encoder/ms-marco-MiniLM-L-6-v2

    async Rerank(params: RerankParams): Promise<RerankResult[]> {
        const model = await this.loadModel();
        const scores = await Promise.all(
            params.candidates.map(async (candidate) => {
                const score = await model.predict([params.query, candidate.content]);
                return { candidate, score: this.sigmoid(score) };
            })
        );

        return scores
            .sort((a, b) => b.score - a.score)
            .slice(0, params.topK)
            .map(s => ({
                id: s.candidate.id,
                content: s.candidate.content,
                relevanceScore: s.score,
                metadata: s.candidate.metadata
            }));
    }
}
```

### 3.4 Database Entities

**New Entity: Reranker**
```sql
CREATE TABLE __mj.Reranker (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX),
    DriverClass NVARCHAR(100) NOT NULL,  -- 'CohereReranker', 'LLMReranker', etc.
    AIVendorID UNIQUEIDENTIFIER REFERENCES __mj.AIVendor(ID),
    APIName NVARCHAR(100),  -- Model name for API calls
    DefaultThreshold DECIMAL(3,2) DEFAULT 0.5,
    MaxCandidates INT DEFAULT 100,
    IsActive BIT DEFAULT 1,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE()
);

-- Seed data
INSERT INTO __mj.Reranker (Name, Description, DriverClass, APIName) VALUES
('Cohere Rerank v3', 'Production reranker via Cohere API', 'CohereReranker', 'rerank-english-v3.0'),
('LLM Reranker', 'Uses configured LLM for reranking', 'LLMReranker', NULL),
('Cross-Encoder Local', 'Local cross-encoder model', 'CrossEncoderReranker', 'ms-marco-MiniLM-L-6-v2');
```

**New Entity: AIAgentRerankerConfiguration**
```sql
CREATE TABLE __mj.AIAgentRerankerConfiguration (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AIAgentID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.AIAgent(ID),
    RerankerID UNIQUEIDENTIFIER REFERENCES __mj.Reranker(ID),
    EnableReranking BIT DEFAULT 0,
    RetrievalMultiplier INT DEFAULT 3,  -- Retrieve 3x topK for reranking
    MinRelevanceThreshold DECIMAL(3,2) DEFAULT 0.5,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE()
);
```

### 3.5 Integration with Agent Memory

**Update AgentContextInjector:**
```typescript
// packages/AI/Agents/src/agent-context-injector.ts

export class AgentContextInjector {
    private reranker: BaseReranker | null = null;

    async GetNotesForContext(params: NoteContextParams): Promise<AIAgentNoteEntity[]> {
        // Step 1: Get initial candidates (retrieve more than needed)
        const retrievalCount = params.maxNotes * (params.rerankerConfig?.retrievalMultiplier || 3);
        const candidates = await this.getInitialNoteCandidates(params, retrievalCount);

        // Step 2: Rerank if enabled
        if (params.rerankerConfig?.enableReranking && this.reranker) {
            const reranked = await this.reranker.Rerank({
                query: params.userInput,
                candidates: candidates.map(n => ({
                    id: n.ID,
                    content: n.Note,
                    metadata: { type: n.Type, agentId: n.AgentID }
                })),
                topK: params.maxNotes,
                threshold: params.rerankerConfig.minRelevanceThreshold
            });

            // Return notes in reranked order
            return reranked.map(r => candidates.find(c => c.ID === r.id)!);
        }

        return candidates.slice(0, params.maxNotes);
    }
}
```

### 3.6 Prompt for LLM Reranker

**File:** `metadata/prompts/templates/reranking/rerank-documents.md`

```markdown
# Document Reranking

You are a relevance scoring assistant. Given a query and a list of documents,
score each document's relevance to the query.

## Query
{{query}}

## Documents
{{#each candidates}}
[{{index}}] {{content}}
{{/each}}

## Instructions
For each document, provide a relevance score from 0.0 to 1.0:
- 1.0 = Directly answers or is highly relevant to the query
- 0.7-0.9 = Contains useful related information
- 0.4-0.6 = Tangentially related
- 0.1-0.3 = Barely relevant
- 0.0 = Not relevant at all

## Output Format (JSON)
{
  "rankings": [
    {"index": 0, "score": 0.85, "reason": "Brief explanation"},
    {"index": 1, "score": 0.42, "reason": "Brief explanation"},
    ...
  ]
}
```

---

## Phase 5: Flexible Vector Configuration

**Priority:** 🟡 MEDIUM - Enables advanced use cases
**Estimated Effort:** 2-3 weeks

### 5.1 Overview

Enable per-agent configuration of:
- **Embedding Model** - Which model generates embeddings
- **Vector Store** - Where embeddings are stored/searched
- **Distance Metric** - How similarity is calculated
- **Search Parameters** - TopK, thresholds, etc.

### 5.2 Design Considerations

**Cross-Agent Note/Example Sharing:**
- Notes scoped globally (AgentID = NULL) should be searchable by all agents
- If agents use different embedding models, global notes need multiple embeddings
- **Recommendation:** Default to same embedding model across agents; allow override only for isolated agents

**Practical Deployment Pattern:**
- Most deployments will use single embedding model + single vector store
- Per-agent config is for advanced scenarios (specialized agents, multi-tenant)

### 5.3 Database Schema

**New Entity: AIAgentVectorConfiguration**
```sql
CREATE TABLE __mj.AIAgentVectorConfiguration (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AIAgentID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.AIAgent(ID),

    -- Embedding Configuration
    EmbeddingModelID UNIQUEIDENTIFIER REFERENCES __mj.AIModel(ID),
    UseGlobalEmbeddings BIT DEFAULT 1,  -- If true, inherit from system default

    -- Vector Store Configuration
    VectorDatabaseID UNIQUEIDENTIFIER REFERENCES __mj.VectorDatabase(ID),
    VectorIndexName NVARCHAR(100),  -- Namespace/index for this agent
    UseGlobalVectorStore BIT DEFAULT 1,  -- If true, use system default

    -- Search Configuration
    DistanceMetric NVARCHAR(50) DEFAULT 'cosine',  -- cosine, euclidean, dotproduct
    DefaultTopK INT DEFAULT 10,
    MinSimilarityThreshold DECIMAL(3,2) DEFAULT 0.5,

    -- Notes
    Description NVARCHAR(MAX),

    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT UQ_AIAgentVectorConfiguration_AgentID UNIQUE (AIAgentID)
);
```

**System Default Configuration Entity:**
```sql
CREATE TABLE __mj.SystemVectorConfiguration (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Name NVARCHAR(100) NOT NULL,

    -- Embedding Defaults
    DefaultEmbeddingModelID UNIQUEIDENTIFIER REFERENCES __mj.AIModel(ID),

    -- Vector Store Defaults
    DefaultVectorDatabaseID UNIQUEIDENTIFIER REFERENCES __mj.VectorDatabase(ID),
    DefaultVectorIndexName NVARCHAR(100),

    -- Search Defaults
    DefaultDistanceMetric NVARCHAR(50) DEFAULT 'cosine',
    DefaultTopK INT DEFAULT 10,
    DefaultMinSimilarity DECIMAL(3,2) DEFAULT 0.5,

    IsActive BIT DEFAULT 1,

    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE()
);
```

### 5.4 AIEngine Updates

```typescript
// packages/AI/Engine/src/AIEngine.ts

export class AIEngine extends BaseSingleton<AIEngine> {
    private _systemVectorConfig: SystemVectorConfigurationEntity | null = null;
    private _agentVectorConfigs: Map<string, AIAgentVectorConfigurationEntity> = new Map();

    /**
     * Get effective vector configuration for an agent
     * Falls back to system defaults if agent has no override or UseGlobal* is true
     */
    public GetEffectiveVectorConfig(agentId: string): EffectiveVectorConfig {
        const agentConfig = this._agentVectorConfigs.get(agentId);
        const systemConfig = this._systemVectorConfig;

        return {
            embeddingModel: (agentConfig?.UseGlobalEmbeddings !== false)
                ? this.GetModelById(systemConfig?.DefaultEmbeddingModelID)
                : this.GetModelById(agentConfig?.EmbeddingModelID),

            vectorDatabase: (agentConfig?.UseGlobalVectorStore !== false)
                ? this.GetVectorDatabaseById(systemConfig?.DefaultVectorDatabaseID)
                : this.GetVectorDatabaseById(agentConfig?.VectorDatabaseID),

            distanceMetric: agentConfig?.DistanceMetric || systemConfig?.DefaultDistanceMetric || 'cosine',
            topK: agentConfig?.DefaultTopK || systemConfig?.DefaultTopK || 10,
            minSimilarity: agentConfig?.MinSimilarityThreshold || systemConfig?.DefaultMinSimilarity || 0.5
        };
    }

    /**
     * Generate embedding using agent's configured model
     */
    public async EmbedTextForAgent(
        agentId: string,
        text: string,
        contextUser: UserInfo
    ): Promise<EmbedTextResult> {
        const config = this.GetEffectiveVectorConfig(agentId);
        return this.EmbedText(config.embeddingModel, text, contextUser);
    }
}
```

### 5.5 Multi-Embedding Support for Global Notes

When agents use different embedding models, global notes need embeddings from each model:

**New Entity: AIAgentNoteEmbedding**
```sql
CREATE TABLE __mj.AIAgentNoteEmbedding (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AIAgentNoteID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.AIAgentNote(ID),
    EmbeddingModelID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.AIModel(ID),
    EmbeddingVector NVARCHAR(MAX),  -- JSON array
    GeneratedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT UQ_NoteEmbedding_Note_Model UNIQUE (AIAgentNoteID, EmbeddingModelID)
);
```

**Logic:**
- When a global note is created, generate embedding with system default model
- When agent with different embedding model searches, check if compatible embedding exists
- If not, generate on-demand and cache in AIAgentNoteEmbedding

---

## Phase 6: Graph Memory Foundation

**Priority:** 🟡 MEDIUM - Enables relationship reasoning
**Estimated Effort:** 4-6 weeks

### 6.1 Overview

Graph memory stores **entities** and **relationships** extracted from notes/examples, enabling:
- Multi-hop reasoning ("John → manages → Sales Team → has → Q1 Deadline")
- Implicit relationship discovery
- Temporal tracking of entity changes
- Contradiction detection (conflicting relationships)

### 6.2 Framework-Level Primitive

**New Package:** `@memberjunction/ai-graph`

**Location:** `packages/AI/Graph/`

```
packages/AI/Graph/
├── Core/
│   └── src/
│       ├── generic/
│       │   └── BaseGraphStore.ts      # Abstract base class
│       ├── models/
│       │   ├── GraphEntity.ts         # Entity node types
│       │   ├── GraphRelationship.ts   # Relationship types
│       │   └── GraphQuery.ts          # Query types
│       ├── extraction/
│       │   └── EntityExtractor.ts     # LLM-based extraction
│       └── index.ts
├── Providers/
│   ├── SQL/
│   │   └── src/models/SQLGraphStore.ts     # SQL Server implementation
│   └── Neo4j/
│       └── src/models/Neo4jGraphStore.ts   # Neo4j implementation
```

### 6.3 Base Abstraction

```typescript
// packages/AI/Graph/Core/src/generic/BaseGraphStore.ts

export interface GraphEntity {
    id: string;
    type: string;  // 'Person', 'Organization', 'Project', 'Concept', etc.
    name: string;
    properties: Record<string, unknown>;
    sourceNoteIds: string[];  // Which notes mentioned this entity
    createdAt: Date;
    updatedAt: Date;
}

export interface GraphRelationship {
    id: string;
    sourceEntityId: string;
    targetEntityId: string;
    type: string;  // 'manages', 'works_on', 'prefers', 'belongs_to', etc.
    properties: Record<string, unknown>;
    confidence: number;  // 0-1
    validFrom?: Date;
    validTo?: Date;  // Temporal awareness
    sourceNoteIds: string[];
}

export interface GraphQueryResult {
    entities: GraphEntity[];
    relationships: GraphRelationship[];
    paths?: GraphPath[];  // For multi-hop queries
}

export abstract class BaseGraphStore {
    // Entity operations
    abstract CreateEntity(entity: Omit<GraphEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<GraphEntity>;
    abstract GetEntity(id: string): Promise<GraphEntity | null>;
    abstract FindEntities(query: EntityQuery): Promise<GraphEntity[]>;
    abstract UpdateEntity(id: string, updates: Partial<GraphEntity>): Promise<GraphEntity>;
    abstract DeleteEntity(id: string): Promise<boolean>;

    // Relationship operations
    abstract CreateRelationship(rel: Omit<GraphRelationship, 'id'>): Promise<GraphRelationship>;
    abstract GetRelationship(id: string): Promise<GraphRelationship | null>;
    abstract FindRelationships(query: RelationshipQuery): Promise<GraphRelationship[]>;
    abstract DeleteRelationship(id: string): Promise<boolean>;

    // Graph traversal
    abstract GetConnectedEntities(entityId: string, depth: number): Promise<GraphQueryResult>;
    abstract FindPath(sourceId: string, targetId: string, maxDepth: number): Promise<GraphPath[]>;
    abstract ExecuteQuery(query: string): Promise<GraphQueryResult>;  // Provider-specific query language

    // Semantic search on graph
    abstract FindSimilarEntities(queryText: string, topK: number): Promise<GraphEntity[]>;
}
```

### 6.4 SQL Server Implementation (Recommended Start)

Uses existing SQL Server infrastructure with recursive CTEs for traversal:

**Database Schema:**
```sql
-- Entity nodes
CREATE TABLE __mj.GraphEntity (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Type NVARCHAR(50) NOT NULL,  -- Person, Organization, Project, etc.
    Name NVARCHAR(255) NOT NULL,
    NormalizedName NVARCHAR(255) NOT NULL,  -- Lowercase for matching
    Properties NVARCHAR(MAX),  -- JSON
    EmbeddingVector NVARCHAR(MAX),  -- For semantic search
    EmbeddingModelID UNIQUEIDENTIFIER REFERENCES __mj.AIModel(ID),
    MentionCount INT DEFAULT 1,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),

    INDEX IX_GraphEntity_Type (Type),
    INDEX IX_GraphEntity_NormalizedName (NormalizedName)
);

-- Entity-to-source-note linking
CREATE TABLE __mj.GraphEntitySource (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    GraphEntityID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.GraphEntity(ID),
    AIAgentNoteID UNIQUEIDENTIFIER REFERENCES __mj.AIAgentNote(ID),
    AIAgentExampleID UNIQUEIDENTIFIER REFERENCES __mj.AIAgentExample(ID),
    ExtractedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT CK_GraphEntitySource_OneSource CHECK (
        (AIAgentNoteID IS NOT NULL AND AIAgentExampleID IS NULL) OR
        (AIAgentNoteID IS NULL AND AIAgentExampleID IS NOT NULL)
    )
);

-- Relationships between entities
CREATE TABLE __mj.GraphRelationship (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SourceEntityID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.GraphEntity(ID),
    TargetEntityID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.GraphEntity(ID),
    Type NVARCHAR(100) NOT NULL,  -- manages, works_on, prefers, etc.
    Properties NVARCHAR(MAX),  -- JSON
    Confidence DECIMAL(3,2) DEFAULT 1.0,
    ValidFrom DATETIME,
    ValidTo DATETIME,  -- NULL = currently valid
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),

    INDEX IX_GraphRelationship_Source (SourceEntityID),
    INDEX IX_GraphRelationship_Target (TargetEntityID),
    INDEX IX_GraphRelationship_Type (Type)
);
```

**SQL Traversal Example:**
```sql
-- Find all entities connected to 'John' within 2 hops
WITH EntityGraph AS (
    -- Start with John
    SELECT
        e.ID, e.Name, e.Type, 0 AS Depth
    FROM __mj.GraphEntity e
    WHERE e.NormalizedName = 'john'

    UNION ALL

    -- Traverse relationships
    SELECT
        e2.ID, e2.Name, e2.Type, eg.Depth + 1
    FROM EntityGraph eg
    JOIN __mj.GraphRelationship r ON r.SourceEntityID = eg.ID OR r.TargetEntityID = eg.ID
    JOIN __mj.GraphEntity e2 ON e2.ID = CASE
        WHEN r.SourceEntityID = eg.ID THEN r.TargetEntityID
        ELSE r.SourceEntityID
    END
    WHERE eg.Depth < 2
)
SELECT DISTINCT ID, Name, Type, MIN(Depth) AS ShortestPath
FROM EntityGraph
GROUP BY ID, Name, Type
ORDER BY ShortestPath;
```

### 6.5 Entity Extraction Service

```typescript
// packages/AI/Graph/Core/src/extraction/EntityExtractor.ts

export interface ExtractionResult {
    entities: ExtractedEntity[];
    relationships: ExtractedRelationship[];
}

export class EntityExtractor {
    private promptRunner: AIPromptRunner;

    /**
     * Extract entities and relationships from text using LLM
     */
    async ExtractFromText(
        text: string,
        existingEntities: GraphEntity[],  // For deduplication
        contextUser: UserInfo
    ): Promise<ExtractionResult> {
        const params = new AIPromptParams();
        params.prompt = await this.getExtractionPrompt();
        params.data = {
            text,
            existingEntities: existingEntities.map(e => ({
                id: e.id,
                type: e.type,
                name: e.name
            }))
        };

        const result = await this.promptRunner.ExecutePrompt(params, contextUser);
        return this.parseExtractionResult(result, existingEntities);
    }

    /**
     * Resolve extracted entities against existing graph entities
     * Uses semantic similarity + name matching
     */
    async ResolveEntities(
        extracted: ExtractedEntity[],
        graphStore: BaseGraphStore
    ): Promise<Map<ExtractedEntity, GraphEntity | null>> {
        const resolutions = new Map();

        for (const entity of extracted) {
            // Try exact name match first
            const exactMatch = await graphStore.FindEntities({
                normalizedName: entity.name.toLowerCase()
            });

            if (exactMatch.length > 0) {
                resolutions.set(entity, exactMatch[0]);
                continue;
            }

            // Try semantic similarity
            const similar = await graphStore.FindSimilarEntities(entity.name, 3);
            const bestMatch = similar.find(s => s.type === entity.type);

            resolutions.set(entity, bestMatch || null);
        }

        return resolutions;
    }
}
```

### 6.6 Integration with Memory Manager

**Update Memory Manager to extract graph entities:**

```typescript
// packages/AI/Agents/src/memory-manager-agent.ts

export class MemoryManagerAgent extends BaseAgent {
    private graphStore: BaseGraphStore;
    private entityExtractor: EntityExtractor;

    protected async ExtractNotes(...): Promise<AIAgentNoteEntity[]> {
        const notes = await this.extractNotesFromConversations(...);

        // Extract graph entities from each note
        for (const note of notes) {
            await this.extractAndStoreGraphEntities(note);
        }

        return notes;
    }

    private async extractAndStoreGraphEntities(note: AIAgentNoteEntity): Promise<void> {
        // Get existing entities for deduplication
        const existingEntities = await this.graphStore.FindEntities({ limit: 1000 });

        // Extract entities and relationships
        const extraction = await this.entityExtractor.ExtractFromText(
            note.Note,
            existingEntities,
            this.contextUser
        );

        // Resolve against existing entities
        const resolutions = await this.entityExtractor.ResolveEntities(
            extraction.entities,
            this.graphStore
        );

        // Create or update entities
        for (const [extracted, existing] of resolutions) {
            if (existing) {
                // Update mention count
                await this.graphStore.UpdateEntity(existing.id, {
                    mentionCount: existing.mentionCount + 1
                });
            } else {
                // Create new entity
                await this.graphStore.CreateEntity({
                    type: extracted.type,
                    name: extracted.name,
                    properties: extracted.properties,
                    sourceNoteIds: [note.ID]
                });
            }
        }

        // Create relationships
        for (const rel of extraction.relationships) {
            await this.graphStore.CreateRelationship({
                sourceEntityId: rel.sourceId,
                targetEntityId: rel.targetId,
                type: rel.type,
                confidence: rel.confidence,
                sourceNoteIds: [note.ID]
            });
        }
    }
}
```

### 6.7 Entity Extraction Prompt

**File:** `metadata/prompts/templates/graph/extract-entities.md`

```markdown
# Entity and Relationship Extraction

Extract entities and relationships from the following text.

## Text
{{text}}

## Existing Entities (for reference/deduplication)
{{#each existingEntities}}
- [{{type}}] {{name}} (ID: {{id}})
{{/each}}

## Entity Types
- Person: Individual people
- Organization: Companies, teams, departments
- Project: Projects, initiatives, products
- Concept: Abstract concepts, preferences, skills
- Location: Physical or virtual locations
- Event: Meetings, deadlines, milestones

## Relationship Types
- manages: Person manages Person/Team/Project
- works_on: Person works on Project
- belongs_to: Entity belongs to Organization
- prefers: Person prefers Concept/Method
- located_at: Entity located at Location
- scheduled_for: Event scheduled for Date
- related_to: General relationship

## Instructions
1. Identify all entities mentioned
2. If an entity matches an existing entity, use that ID
3. Extract relationships between entities
4. Assign confidence scores (0.0-1.0) based on how explicit the relationship is

## Output Format (JSON)
{
  "entities": [
    {
      "tempId": "e1",
      "existingId": null,  // or existing entity ID if match found
      "type": "Person",
      "name": "John Smith",
      "properties": {"role": "Manager"}
    }
  ],
  "relationships": [
    {
      "sourceId": "e1",  // tempId or existingId
      "targetId": "e2",
      "type": "manages",
      "confidence": 0.9,
      "properties": {}
    }
  ]
}
```

---

## Phase 7: Advanced Graph Features

**Priority:** 🔵 FUTURE - Enhanced capabilities
**Estimated Effort:** 6-8 weeks

### 7.1 Neo4j Integration (Optional)

For deployments requiring advanced graph capabilities:

```typescript
// packages/AI/Graph/Providers/Neo4j/src/models/Neo4jGraphStore.ts

@RegisterClass(BaseGraphStore, 'Neo4jGraphStore')
export class Neo4jGraphStore extends BaseGraphStore {
    private driver: neo4j.Driver;

    async ExecuteQuery(cypher: string): Promise<GraphQueryResult> {
        const session = this.driver.session();
        try {
            const result = await session.run(cypher);
            return this.parseNeo4jResult(result);
        } finally {
            await session.close();
        }
    }

    async GetConnectedEntities(entityId: string, depth: number): Promise<GraphQueryResult> {
        const cypher = `
            MATCH path = (start:Entity {id: $entityId})-[*1..${depth}]-(connected:Entity)
            RETURN start, connected, relationships(path) as rels
        `;
        return this.ExecuteQuery(cypher);
    }
}
```

### 7.2 Temporal Awareness

Track when relationships were valid:

```typescript
interface TemporalRelationship extends GraphRelationship {
    validFrom: Date;
    validTo: Date | null;  // null = currently valid
}

// Query: "Who managed the Sales team in Q3 2024?"
async GetRelationshipsAtTime(
    entityId: string,
    relationType: string,
    asOfDate: Date
): Promise<GraphRelationship[]> {
    return this.FindRelationships({
        targetEntityId: entityId,
        type: relationType,
        validAt: asOfDate  // validFrom <= asOfDate AND (validTo IS NULL OR validTo > asOfDate)
    });
}
```

### 7.3 Contradiction Detection

Automatically detect conflicting relationships:

```typescript
interface Contradiction {
    relationship1: GraphRelationship;
    relationship2: GraphRelationship;
    type: 'conflicting_values' | 'mutually_exclusive' | 'temporal_overlap';
    description: string;
}

async DetectContradictions(entityId: string): Promise<Contradiction[]> {
    // Example: Person can't manage two different teams at the same time
    // Example: Project can't have two different deadlines

    const relationships = await this.FindRelationships({ sourceEntityId: entityId });
    const contradictions: Contradiction[] = [];

    // Check for mutually exclusive relationships
    const exclusiveTypes = ['manages', 'reports_to', 'deadline'];
    for (const type of exclusiveTypes) {
        const ofType = relationships.filter(r => r.type === type && r.validTo === null);
        if (ofType.length > 1) {
            contradictions.push({
                relationship1: ofType[0],
                relationship2: ofType[1],
                type: 'mutually_exclusive',
                description: `Entity has multiple active '${type}' relationships`
            });
        }
    }

    return contradictions;
}
```

### 7.4 Graph-Enhanced Agent Context Injection

```typescript
// packages/AI/Agents/src/agent-context-injector.ts

async GetGraphContextForQuery(
    userInput: string,
    agentId: string,
    maxDepth: number = 2
): Promise<string> {
    // 1. Extract entities from user input
    const inputEntities = await this.entityExtractor.ExtractFromText(userInput, []);

    // 2. Find matching entities in graph
    const matchedEntities: GraphEntity[] = [];
    for (const extracted of inputEntities.entities) {
        const matches = await this.graphStore.FindSimilarEntities(extracted.name, 1);
        if (matches.length > 0) matchedEntities.push(matches[0]);
    }

    // 3. Get connected context for each matched entity
    const contexts: GraphQueryResult[] = [];
    for (const entity of matchedEntities) {
        const context = await this.graphStore.GetConnectedEntities(entity.id, maxDepth);
        contexts.push(context);
    }

    // 4. Format as natural language context
    return this.formatGraphContext(contexts);
}

private formatGraphContext(contexts: GraphQueryResult[]): string {
    const lines: string[] = ['## Related Context from Knowledge Graph\n'];

    for (const context of contexts) {
        for (const entity of context.entities) {
            const relationships = context.relationships.filter(
                r => r.sourceEntityId === entity.id || r.targetEntityId === entity.id
            );

            for (const rel of relationships) {
                const other = context.entities.find(
                    e => e.id === (rel.sourceEntityId === entity.id ? rel.targetEntityId : rel.sourceEntityId)
                );
                if (other) {
                    lines.push(`- ${entity.name} ${rel.type} ${other.name}`);
                }
            }
        }
    }

    return lines.join('\n');
}
```

---

## Implementation Timeline

```
                    2025
    Jan     Feb     Mar     Apr     May     Jun     Jul
    |-------|-------|-------|-------|-------|-------|

Phase 1: Critical Bug Fixes ✅
    [===]

Phase 2: Feature Completions ✅
    [=======]

Phase 3: Multi-Tenant Scoping ✅
        [=======]

Phase 4: Reranking Framework
                [===========]

Phase 5: Flexible Vector Config
                        [===========]

Phase 6: Graph Memory Foundation
                                [===============]

Phase 7: Advanced Graph (Future)
                                        [===============]
```

| Phase | Duration | Dependencies | Status |
|-------|----------|--------------|--------|
| Phase 1 | 3-5 days | None | ✅ Complete |
| Phase 2 | 1-2 weeks | Phase 1 | ✅ Complete |
| Phase 3 | 1-2 weeks | Phase 1, 2 | ✅ Complete |
| Phase 4 | 2-3 weeks | Phase 1 | Planned (Future) |
| Phase 5 | 2-3 weeks | Phase 1, 2 | Planned (Future) |
| Phase 6 | 4-6 weeks | Phase 1, 2, 4 | Planned (Future) |
| Phase 7 | 6-8 weeks | Phase 6 | Planned (Future) |

---

## Success Metrics

### Phase 1-2 (Stability) ✅
- [x] Memory Manager creates notes without Save() failures
- [x] All error conditions logged to MJ audit system
- [x] Zero silent failures in vector service initialization

### Phase 3 (Multi-Tenant Scoping)
- [ ] Notes/Examples correctly scoped by tenant in multi-tenant deployment
- [ ] Hierarchical retrieval returns appropriate mix of global + org + contact notes
- [ ] No cross-tenant data leakage in agent responses
- [ ] < 5ms overhead for scope filtering on indexed queries
- [ ] SaaS apps can configure custom scope dimensions without MJ core changes

### Phase 4 (Reranking)
- [ ] 30%+ improvement in retrieval accuracy (measured via A/B testing)
- [ ] Configurable per-agent reranking strategy
- [ ] <500ms added latency for reranking step

### Phase 5 (Flexible Config)
- [ ] Agents can use different embedding models without cross-contamination
- [ ] Global notes searchable by agents with different embedding models
- [ ] Clear documentation for deployment configuration

### Phase 6 (Graph Memory)
- [ ] Entity extraction from >90% of notes
- [ ] Multi-hop queries return relevant context
- [ ] Contradiction detection catches >80% of conflicting notes

### Phase 7 (Advanced)
- [ ] Neo4j integration functional for production deployments
- [ ] Temporal queries accurate across relationship history
- [ ] Graph context improves agent response quality by measurable margin

---

## Appendix: Comparison to mem0

| Capability | mem0 | MJ (Current) | MJ (After Plan) |
|------------|------|--------------|-----------------|
| Memory CRUD | ✅ Real-time | ✅ Batch | ✅ Batch + Real-time option |
| Semantic Search | ✅ 23 vector DBs | ⚠️ 2 (Pinecone + in-memory) | ✅ Extensible |
| Reranking | ✅ 7 implementations | ❌ None | ✅ 3+ implementations |
| Graph Memory | ✅ Neo4j | ❌ None | ✅ SQL + Neo4j |
| Per-User Scoping | ✅ | ✅ | ✅ |
| Per-Agent Config | ❌ | ❌ | ✅ |
| Temporal Awareness | ✅ | ⚠️ CreatedAt only | ✅ Full history |
| Contradiction Detection | ✅ | ❌ | ✅ |
| Enterprise Scoping | ⚠️ 4 levels | ✅ 8 levels | ✅ 8 levels |
| Framework Integration | ✅ 21 integrations | ✅ MJ-native | ✅ MJ-native |

---

## References

- [Pinecone: Rerankers and Two-Stage Retrieval](https://www.pinecone.io/learn/series/rag/rerankers/)
- [Neo4j: Graphiti Knowledge Graph Memory](https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/)
- [mem0 Repository](https://github.com/mem0ai/mem0)
- [OpenAI Cookbook: Search Reranking](https://cookbook.openai.com/examples/search_reranking_with_cross-encoders)
- [OpenAI Cookbook: Context Personalization](https://cookbook.openai.com/examples/agents_sdk/context_personalization) - Session/long-term memory patterns
