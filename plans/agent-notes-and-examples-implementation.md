# Agent Notes and Examples - Implementation Plan

## Implementation Status

🔄 **IN PROGRESS** - Core functionality complete, refinements in progress
- Migration: `V202510270900__v2.112.x__Agent_Memory_Complete_Schema.sql`
- Branch: `feature/agent-memory-manager`
- Date: 2025-10-27

### Remaining Refinements

#### 1. BaseAgent.InjectContextMemory Cleanup
- [ ] Remove unused `memoryResult` local variable
- [ ] Move conversationMessages.unshift() into InjectContextMemory method itself
- [ ] Return the injected context from the method

#### 2. Memory Context in Results
- [ ] Add `memoryContext?: {notes: AIAgentNoteEntity[], examples: AIAgentExampleEntity[]}` to ExecuteAgentResult type
- [ ] Check AIAgentRun schema for appropriate field to store memory context
- [ ] Either use existing field or add new migration for MemoryContextJSON column
- [ ] Populate in BaseAgent when returning results

#### 3. Conversation Rating Performance
- [ ] Study `/Users/amith/Dropbox/develop/Mac/MJ/metadata/queries/SQL/get-conversation-complete.sql`
- [ ] Modify query to return ratings as JSON aggregate
- [ ] Update ConversationMessageRatingComponent to accept ratings as @Input
- [ ] Pass ratings from parent component instead of fetching per message

#### 4. Artifact Usage Async/Await
- [ ] Fix line 72 of artifact-use-tracking.service.ts to use await instead of .catch()
- [ ] Ensure proper error handling with try/catch

#### 5. Testing & Verification
- [ ] Test memory injection with real agent
- [ ] Verify ratings appear in conversation UI
- [ ] Test Memory Manager scheduled execution
- [ ] Verify efficient database queries (no N+1)

## Key Improvements Made During Implementation

### Performance Optimizations
1. **Zero Database Round-Trips for Semantic Search**: FindSimilarAgentNotes/Examples returns full entity objects from vector cache instead of just IDs
2. **Efficient Subquery Pattern**: LoadHighQualityConversationDetails uses EXISTS subquery instead of multiple queries
3. **First Run Processing**: Processes all history with MaxRows limit instead of arbitrary 24-hour window

### Architecture Refinements
1. **Added companyId/userId to ExecuteAgentParams**: Enables proper company-level scoping
2. **Memory Context Injection**: Properly injects notes/examples as system message in conversationMessages array
3. **Uses AgentScheduledJobDriver**: Leverages existing infrastructure instead of custom job handler
4. **ConversationDetail-Level Processing**: Works at message level instead of conversation level for granular analysis

### AI-Powered Quality Control
1. **LLM-Based Example Deduplication**: Each candidate example evaluated against similar existing examples via semantic search
2. **Smart Example Approval**: LLM decides if new example adds value or is redundant
3. **Confidence Thresholds**: Only processes notes/examples with ≥70 confidence and success scores

### Code Quality
- Zero `any` casts - all properly typed
- RunView<T> generics throughout
- Proper error handling with fallbacks
- Follows all MJ conventions

## Overview

This plan outlines the implementation of the AI Agent Memory and Example Context Framework, which enriches AI agents with contextual notes and example-based learning through multi-dimensional scoping (Agent, User, Company).

**Migration Status**: ✅ Complete - `V202510270900__v2.112.x__Agent_Memory_Complete_Schema.sql`

**Entities Available**:
- `AIAgentNoteEntity` - Notes with multi-dimensional scoping
- `AIAgentNoteTypeEntity` - Note type categorization with priority
- `AIAgentExampleEntity` - Example input/output pairs
- `AIAgentEntity` - Extended with injection configuration

---

## Additional Migrations Required

### Migration 2: Embedding Fields & IsRestricted

**File**: `V202510270900__v2.112.x__Add_Embedding_And_IsRestricted_Fields.sql`

```sql
-- Add embedding storage to notes and examples
ALTER TABLE [${flyway:defaultSchema}].[AIAgentNote] ADD
    EmbeddingVector NVARCHAR(MAX) NULL,
    EmbeddingModelID UNIQUEIDENTIFIER NULL,
    CONSTRAINT FK_AIAgentNote_EmbeddingModel
        FOREIGN KEY (EmbeddingModelID) REFERENCES [${flyway:defaultSchema}].[AIModel](ID);

ALTER TABLE [${flyway:defaultSchema}].[AIAgentExample] ADD
    EmbeddingVector NVARCHAR(MAX) NULL,
    EmbeddingModelID UNIQUEIDENTIFIER NULL,
    CONSTRAINT FK_AIAgentExample_EmbeddingModel
        FOREIGN KEY (EmbeddingModelID) REFERENCES [${flyway:defaultSchema}].[AIModel](ID);

-- Add IsRestricted field to AIAgent
ALTER TABLE [${flyway:defaultSchema}].[AIAgent] ADD
    IsRestricted BIT NOT NULL DEFAULT 0;

-- Extended properties
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of embedding vector for semantic search on Note field.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentNote',
    @level2type = N'COLUMN', @level2name = N'EmbeddingVector';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, agent is restricted to system/scheduled use only and hidden from user selection, Agent Manager, and MCP/A2A discovery.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'IsRestricted';
```

### Migration 3: ConversationDetailRating Table

**File**: `V202510270901__v2.112.x__Add_ConversationDetailRating.sql`

```sql
CREATE TABLE [${flyway:defaultSchema}].[ConversationDetailRating] (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    ConversationDetailID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    Rating INT NOT NULL CHECK (Rating BETWEEN 1 AND 10),
    Comments NVARCHAR(MAX) NULL,

    CONSTRAINT FK_ConversationDetailRating_ConversationDetail
        FOREIGN KEY (ConversationDetailID) REFERENCES [${flyway:defaultSchema}].[ConversationDetail](ID),
    CONSTRAINT FK_ConversationDetailRating_User
        FOREIGN KEY (UserID) REFERENCES [${flyway:defaultSchema}].[User](ID),
    CONSTRAINT UQ_ConversationDetailRating_User
        UNIQUE (ConversationDetailID, UserID)
);

-- Extended properties
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores per-user ratings for conversation messages, supporting multi-user conversations where each user can independently rate messages.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ConversationDetailRating';
```

### Migration 4: ArtifactUse Table

**File**: `V202510270902__v2.112.x__Add_ArtifactUse.sql`

```sql
CREATE TABLE [${flyway:defaultSchema}].[ArtifactUse] (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    ArtifactVersionID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    UsageType NVARCHAR(20) NOT NULL CHECK (UsageType IN ('Viewed', 'Opened', 'Shared', 'Saved', 'Exported')),
    UsageContext NVARCHAR(MAX) NULL,

    CONSTRAINT FK_ArtifactUse_ArtifactVersion
        FOREIGN KEY (ArtifactVersionID) REFERENCES [${flyway:defaultSchema}].[ArtifactVersion](ID),
    CONSTRAINT FK_ArtifactUse_User
        FOREIGN KEY (UserID) REFERENCES [${flyway:defaultSchema}].[User](ID)
);

-- Extended properties
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Audit trail of artifact usage for security and analytics. Tracks each time an artifact is viewed, opened, shared, saved, or exported by users.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ArtifactUse';
```

### Migration 5: Memory Manager Scheduled Job

**File**: `V202510270903__v2.112.x__Add_MemoryManager_ScheduledJob.sql`

```sql
-- Insert Memory Manager scheduled job type
INSERT INTO [${flyway:defaultSchema}].[ScheduledJobType] (ID, Name, Description, DriverClass)
VALUES (
    'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
    'Memory Manager',
    'Automatically extracts notes and examples from conversations and agent runs based on user ratings and artifact usage.',
    'MemoryManagerJobHandler'
);

-- Insert Memory Manager scheduled job (runs every 15 minutes)
INSERT INTO [${flyway:defaultSchema}].[ScheduledJob] (
    ID,
    Name,
    Description,
    TypeID,
    Status,
    Schedule,
    IntervalMinutes,
    IsActive
)
VALUES (
    'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',
    'Agent Memory Manager - Every 15 Minutes',
    'Analyzes conversations and agent runs since last execution to extract valuable notes and examples for agent memory.',
    'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
    'Active',
    'Interval',
    15,
    1
);
```

---

## Phase 1: Core Infrastructure & Server-Side Entity Enhancements

### 1.1 Server-Side Entity Subclasses with Auto-Embedding

**Location**: `packages/MJCoreEntitiesServer/src/custom/`

**Purpose**: Auto-generate embeddings when notes/examples are created or updated, following the `QueryEntity` pattern.

#### AIAgentNoteEntity Server Subclass

**File**: `AIAgentNoteEntity.server.ts`

```typescript
import { RegisterClass } from "@memberjunction/global";
import { BaseEntity } from "@memberjunction/core";
import { AIAgentNoteEntity } from "@memberjunction/core-entities";
import { EmbedTextLocalHelper } from "./util";

@RegisterClass(BaseEntity, 'AI Agent Notes')
export class AIAgentNoteEntityExtended extends AIAgentNoteEntity {
    /**
     * Override EmbedTextLocal to use helper
     */
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            // Check if Note field has changed
            const noteField = this.GetFieldByName('Note');
            const shouldGenerateEmbedding = !this.IsSaved || noteField.Dirty;

            // Generate embedding for Note field if needed
            if (shouldGenerateEmbedding && this.Note && this.Note.trim().length > 0) {
                await this.GenerateEmbeddingByFieldName("Note", "EmbeddingVector", "EmbeddingModelID");
            } else if (!this.Note || this.Note.trim().length === 0) {
                // Clear embedding if note is empty
                this.EmbeddingVector = null;
                this.EmbeddingModelID = null;
            }

            // Save using parent
            return await super.Save(options);
        } catch (e) {
            LogError('Failed to save AI Agent Note:', e);
            this.LatestResult?.Errors.push(e);
            return false;
        }
    }
}

export function LoadAIAgentNoteEntityServerSubClass() {}
```

#### AIAgentExampleEntity Server Subclass

**File**: `AIAgentExampleEntity.server.ts`

```typescript
@RegisterClass(BaseEntity, 'AI Agent Examples')
export class AIAgentExampleEntityExtended extends AIAgentExampleEntity {
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            // Check if ExampleInput field has changed
            const inputField = this.GetFieldByName('ExampleInput');
            const shouldGenerateEmbedding = !this.IsSaved || inputField.Dirty;

            // Generate embedding for ExampleInput field if needed
            if (shouldGenerateEmbedding && this.ExampleInput && this.ExampleInput.trim().length > 0) {
                await this.GenerateEmbeddingByFieldName("ExampleInput", "EmbeddingVector", "EmbeddingModelID");
            } else if (!this.ExampleInput || this.ExampleInput.trim().length === 0) {
                this.EmbeddingVector = null;
                this.EmbeddingModelID = null;
            }

            return await super.Save(options);
        } catch (e) {
            LogError('Failed to save AI Agent Example:', e);
            this.LatestResult?.Errors.push(e);
            return false;
        }
    }
}

export function LoadAIAgentExampleEntityServerSubClass() {}
```

---

### 1.2 BaseEngine Enhancements for Debouncing

**Location**: `packages/MJCore/src/generic/baseEngine.ts`

**Purpose**: Add per-config debounce time support to `BaseEnginePropertyConfig`.

**Changes**:

```typescript
export class BaseEnginePropertyConfig extends BaseInfo {
    // ... existing properties ...

    /**
     * Optional debounce time in milliseconds for this specific config.
     * If not specified, uses the engine's default EntityEventDebounceTime.
     */
    DebounceTime?: number;
}
```

**Update `DebounceIndividualBaseEntityEvent` method**:

```typescript
protected async DebounceIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
    try {
        const entityName = event.baseEntity.EntityInfo.Name.toLowerCase().trim();

        // Find matching config to get custom debounce time
        const matchingConfig = this.Configs.find(c =>
            c.EntityName?.trim().toLowerCase() === entityName
        );

        // Use config-specific debounce time or fall back to default
        const debounceTime = matchingConfig?.DebounceTime ?? this.EntityEventDebounceTime;

        if (!this._entityEventSubjects.has(entityName)) {
            const subject = new Subject<BaseEntityEvent>();
            subject.pipe(
                debounceTime(debounceTime) // Use per-config debounce
            ).subscribe(async (e) => {
                await this.ProcessEntityEvent(e);
            });
            this._entityEventSubjects.set(entityName, subject);
        }

        this._entityEventSubjects.get(entityName).next(event);

        return true;
    } catch (e) {
        LogError(e);
        return false;
    }
}
```

---

### 1.3 AIEngine Enhancements for Note/Example Embedding Cache

**Location**: `packages/AI/Engine/src/AIEngine.ts`

**Purpose**: Cache note/example embeddings in-memory and provide semantic search, following the `AgentEmbeddingService` pattern.

**New Properties**:

```typescript
export class AIEngine extends BaseEngine<AIEngine> {
    // ... existing properties ...

    private _noteVectorService: SimpleVectorService<NoteEmbeddingMetadata> | null = null;
    private _exampleVectorService: SimpleVectorService<ExampleEmbeddingMetadata> | null = null;
}
```

**Enhanced AdditionalLoading**:

```typescript
protected override async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
    // ... existing agent/action loading ...

    // Load note embeddings
    await this.LoadNoteEmbeddings();

    // Load example embeddings
    await this.LoadExampleEmbeddings();

    // Register for debounced updates (15 second debounce)
    this.Configs.push({
        EntityName: 'AI Agent Notes',
        PropertyName: '_noteCache',
        DebounceTime: 15000,
        AutoRefresh: true
    });

    this.Configs.push({
        EntityName: 'AI Agent Examples',
        PropertyName: '_exampleCache',
        DebounceTime: 15000,
        AutoRefresh: true
    });
}
```

**New Methods**:

```typescript
/**
 * Load note embeddings from database and build vector service
 */
private async LoadNoteEmbeddings(): Promise<void> {
    const rv = this.RunViewProviderToUse;
    const result = await rv.RunView<AIAgentNoteEntity>({
        EntityName: 'AI Agent Notes',
        ExtraFilter: `Status='Active' AND EmbeddingVector IS NOT NULL`,
        ResultType: 'entity_object'
    }, this._contextUser);

    if (!result.Success) {
        LogError('Failed to load agent notes:', result.ErrorMessage);
        return;
    }

    const notes = result.Results || [];
    const entries: VectorEntry<NoteEmbeddingMetadata>[] = notes.map(note => ({
        key: note.ID,
        vector: JSON.parse(note.EmbeddingVector!),
        metadata: {
            id: note.ID,
            agentId: note.AgentID,
            userId: note.UserID,
            companyId: note.CompanyID,
            type: note.Type,
            noteText: note.Note
        }
    }));

    this._noteVectorService = new SimpleVectorService<NoteEmbeddingMetadata>(entries);
}

/**
 * Find notes similar to query text using semantic search
 */
public async FindSimilarNotes(
    queryText: string,
    agentId?: string,
    userId?: string,
    companyId?: string,
    topK: number = 5,
    minSimilarity: number = 0.5
): Promise<NoteMatchResult[]> {
    if (!this._noteVectorService) {
        throw new Error('Note embeddings not loaded. Ensure AIEngine.Config() has completed.');
    }

    // Generate query embedding
    const queryEmbedding = await this.EmbedTextLocal(queryText);
    if (!queryEmbedding || !queryEmbedding.result) {
        throw new Error('Failed to generate embedding for query text');
    }

    // Search with optional filters
    const results = this._noteVectorService.search(
        queryEmbedding.result.vector,
        topK * 2 // Get more, then filter
    );

    // Filter by scope and similarity
    const filtered = results
        .filter(r => r.similarity >= minSimilarity)
        .filter(r => {
            // Apply scoping filters
            if (agentId && r.metadata.agentId && r.metadata.agentId !== agentId) return false;
            if (userId && r.metadata.userId && r.metadata.userId !== userId) return false;
            if (companyId && r.metadata.companyId && r.metadata.companyId !== companyId) return false;
            return true;
        })
        .slice(0, topK);

    return filtered.map(r => ({
        noteId: r.metadata.id,
        similarity: r.similarity,
        ...r.metadata
    }));
}

// Similar methods for examples...
```

**Override ProcessEntityEvent** to refresh embeddings:

```typescript
protected override async ProcessEntityEvent(event: BaseEntityEvent): Promise<void> {
    // Call base implementation first
    await super.ProcessEntityEvent(event);

    // Refresh embeddings if notes/examples changed
    const entityName = event.baseEntity.EntityInfo.Name.toLowerCase().trim();
    if (entityName === 'ai agent notes') {
        await this.LoadNoteEmbeddings();
    } else if (entityName === 'ai agent examples') {
        await this.LoadExampleEmbeddings();
    }
}
```

---

### 1.4 AgentContextInjector Class

**Location**: `packages/AI/Agents/src/agent-context-injector.ts`

**Purpose**: Central service for retrieving and injecting notes/examples into agent context.

**Key Methods**:

```typescript
export class AgentContextInjector {
  /**
   * Retrieve notes for a specific agent execution context
   * Implements multi-dimensional scoping and injection strategy
   */
  async GetNotesForContext(params: {
    agentId: string;
    userId?: string;
    companyId?: string;
    currentInput?: string; // For semantic search
    strategy: 'Relevant' | 'Recent' | 'All';
    maxNotes: number;
    contextUser: UserInfo;
  }): Promise<AIAgentNoteEntity[]> {
    // Use AIEngine for semantic search if strategy is 'Relevant'
    if (params.strategy === 'Relevant' && params.currentInput) {
      const matches = await AIEngine.Instance.FindSimilarNotes(
        params.currentInput,
        params.agentId,
        params.userId,
        params.companyId,
        params.maxNotes
      );

      // Load full entities by ID
      const md = new Metadata();
      const notes: AIAgentNoteEntity[] = [];
      for (const match of matches) {
        const note = await md.GetEntityObject<AIAgentNoteEntity>('AI Agent Notes', params.contextUser);
        if (await note.Load(match.noteId)) {
          notes.push(note);
        }
      }
      return notes;
    }

    // Otherwise use database query with scoping
    return await this.QueryNotesWithScoping(params);
  }

  /**
   * Query notes using multi-dimensional scoping priority
   */
  private async QueryNotesWithScoping(params: /* ... */): Promise<AIAgentNoteEntity[]> {
    // Build filter with 8-level scoping priority
    // Priority 1: AgentID + UserID + CompanyID
    // Priority 2: AgentID + UserID
    // ... etc

    const rv = new RunView();
    const result = await rv.RunView<AIAgentNoteEntity>({
      EntityName: 'AI Agent Notes',
      ExtraFilter: this.BuildScopingFilter(params),
      OrderBy: params.strategy === 'Recent' ? '__mj_CreatedAt DESC' : 'AgentNoteType.Priority ASC',
      MaxRows: params.maxNotes,
      ResultType: 'entity_object'
    }, params.contextUser);

    return result.Success ? (result.Results || []) : [];
  }

  /**
   * Format notes for injection into agent prompt
   */
  FormatNotesForInjection(notes: AIAgentNoteEntity[]): string {
    if (notes.length === 0) return '';

    const lines = [`📝 AGENT NOTES (${notes.length})`, ''];
    for (const note of notes) {
      lines.push(`[${note.Type}] ${note.Note}`);
      const scope = this.DetermineScope(note);
      if (scope) {
        lines.push(`  ${scope}`);
      }
      lines.push('');
    }
    lines.push('---');
    return lines.join('\n');
  }

  private DetermineScope(note: AIAgentNoteEntity): string {
    if (note.AgentID && note.UserID && note.CompanyID) return 'Agent + User + Company specific';
    if (note.AgentID && note.UserID) return 'Agent + User specific';
    if (note.AgentID && note.CompanyID) return 'Agent + Company specific';
    if (note.UserID && note.CompanyID) return 'User + Company specific';
    if (note.AgentID) return 'Agent-specific';
    if (note.UserID) return 'User-specific';
    if (note.CompanyID) return 'Company-wide';
    return 'Global';
  }
}
```

---

## Phase 2: BaseAgent Integration

### 2.1 Extend BaseAgent Class

**Location**: `packages/AI/CorePlus/src/base-agent.ts`

**Changes**:

```typescript
export abstract class BaseAgent {
  // ... existing code ...

  /**
   * Inject notes and examples into agent context
   * Called automatically before agent execution
   */
  protected async InjectContextMemory(
    input: string,
    userId?: string,
    companyId?: string
  ): Promise<{ notes: AIAgentNoteEntity[]; examples: AIAgentExampleEntity[] }> {
    // Load agent configuration
    const md = new Metadata();
    const agent = await md.GetEntityObject<AIAgentEntity>('AI Agents', this.contextUser);
    if (!await agent.Load(this.agentId)) {
      return { notes: [], examples: [] };
    }

    // Check if injection is enabled
    if (!agent.InjectNotes && !agent.InjectExamples) {
      return { notes: [], examples: [] };
    }

    // Use AgentContextInjector
    const injector = new AgentContextInjector();

    const notes = agent.InjectNotes
      ? await injector.GetNotesForContext({
          agentId: this.agentId,
          userId,
          companyId,
          currentInput: input,
          strategy: agent.NoteInjectionStrategy,
          maxNotes: agent.MaxNotesToInject,
          contextUser: this.contextUser
        })
      : [];

    const examples = agent.InjectExamples
      ? await injector.GetExamplesForContext({
          agentId: this.agentId,
          userId,
          companyId,
          currentInput: input,
          strategy: agent.ExampleInjectionStrategy,
          maxExamples: agent.MaxExamplesToInject,
          contextUser: this.contextUser
        })
      : [];

    // Format and prepend to system prompt
    const notesText = injector.FormatNotesForInjection(notes);
    const examplesText = injector.FormatExamplesForInjection(examples);

    if (notesText) {
      this.systemPrompt = `${notesText}\n\n${this.systemPrompt}`;
    }
    if (examplesText) {
      this.systemPrompt = `${examplesText}\n\n${this.systemPrompt}`;
    }

    return { notes, examples };
  }

  /**
   * Update Run method to call InjectContextMemory
   */
  async Run(input: AIAgentInput): Promise<AIAgentOutput> {
    const userId = input.userId || this.contextUser?.ID;
    const companyId = input.companyId || this.contextUser?.CompanyID;

    // Inject notes/examples before execution
    await this.InjectContextMemory(input.text, userId, companyId);

    // Continue with existing Run logic...
  }
}
```

---

## Phase 3: Memory Manager Agent & Scheduled Job

### 3.1 Memory Manager Agent

**Location**: `packages/AI/Agents/src/memory-manager-agent.ts`

**Purpose**: Automatically extract notes and examples from conversations/agent runs.

**Implementation**:

```typescript
export class MemoryManagerAgent extends BaseAgent {
  agentId = 'MEMORY_MANAGER_AGENT_ID'; // Fixed ID, IsRestricted = true

  /**
   * Main execution: Analyze conversations since last run
   */
  async Run(input: AIAgentInput): Promise<AIAgentOutput> {
    const lastRunTime = await this.GetLastRunTime();

    // Load conversations since last run with high ratings
    const conversations = await this.LoadHighQualityConversations(lastRunTime);

    // Load agent runs with high-usage artifacts
    const agentRuns = await this.LoadHighValueAgentRuns(lastRunTime);

    // Extract notes and examples
    const extractedNotes = await this.ExtractNotes(conversations, agentRuns);
    const extractedExamples = await this.ExtractExamples(conversations, agentRuns);

    // Create records
    await this.CreateNoteRecords(extractedNotes);
    await this.CreateExampleRecords(extractedExamples);

    return {
      success: true,
      message: `Processed ${conversations.length} conversations and ${agentRuns.length} agent runs. Created ${extractedNotes.length} notes and ${extractedExamples.length} examples.`
    };
  }

  /**
   * Load conversations with positive ratings since last run
   */
  private async LoadHighQualityConversations(since: Date): Promise<ConversationEntity[]> {
    // Query ConversationDetailRating for high ratings (8-10)
    // Join to Conversation and ConversationDetail
    // Aggregate ratings per conversation
    // Return conversations with avg rating >= 8
  }

  /**
   * Load agent runs with high-usage artifacts
   */
  private async LoadHighValueAgentRuns(since: Date): Promise<AIAgentRunEntity[]> {
    // Query ArtifactUse joined to ArtifactVersion and AIAgentRun
    // Aggregate usage counts (Shared >= 2 OR total usage >= 5)
    // Return agent runs with valuable artifacts
  }

  /**
   * Extract notes using AI analysis
   */
  private async ExtractNotes(
    conversations: ConversationEntity[],
    agentRuns: AIAgentRunEntity[]
  ): Promise<ExtractedNote[]> {
    // Use AI prompt to analyze conversations
    // Compare against existing notes to avoid redundancy
    // Return deduplicated, consolidated notes
  }

  /**
   * Extract examples from successful interactions
   */
  private async ExtractExamples(
    conversations: ConversationEntity[],
    agentRuns: AIAgentRunEntity[]
  ): Promise<ExtractedExample[]> {
    // Identify Q&A pairs with high ratings
    // Calculate success scores based on ratings + usage
    // Include both positive (Type='Example') and negative (Type='Issue') examples
  }
}
```

**AI Extraction Prompts**:

```typescript
const NOTE_EXTRACTION_PROMPT = `
Analyze these conversations and extract valuable notes for AI agent memory:

1. User preferences (how they like information presented)
2. Constraints (rules that must always be followed)
3. Contextual information (business facts, domain knowledge)
4. Known issues or limitations discovered

For each note:
- Type: Preference, Constraint, Context, or Issue
- Scope: User-specific, Company-wide, Agent-specific, or Global
- Content: Clear, actionable statement (max 200 characters)
- Confidence: 0-100 score
- Compare to existing notes: ${JSON.stringify(existingNotes)}
- Mark as "Merge" if it duplicates or updates an existing note

Only return high-confidence (>70) notes that add new value.
`;

const EXAMPLE_EXTRACTION_PROMPT = `
Extract high-quality examples from these conversations:

Criteria for good examples:
- User rating >= 8/10
- Artifact usage (Shared >= 2 OR total views >= 5)
- Clear question/answer structure
- Representative of common patterns

For each example:
- ExampleInput: The user's question/request
- ExampleOutput: The successful response
- Type: 'Example' (good outcome) or 'Issue' (mistake to avoid)
- SuccessScore: 0-100 based on ratings + usage
- Confidence: 0-100 score

Only return examples with SuccessScore >= 70.
`;
```

---

### 3.2 Scheduled Job Handler

**Location**: `packages/Scheduling/handlers/src/MemoryManagerJobHandler.ts`

**Purpose**: Execute Memory Manager agent every 15 minutes via MJ scheduling system.

```typescript
import { ScheduledJobHandlerBase } from '@memberjunction/scheduling-engine';
import { MemoryManagerAgent } from '@memberjunction/ai-agents';

export class MemoryManagerJobHandler extends ScheduledJobHandlerBase {
  async Execute(job: ScheduledJobEntity, contextUser: UserInfo): Promise<boolean> {
    try {
      const agent = new MemoryManagerAgent();
      await agent.Config(false, contextUser);

      const result = await agent.Run({
        text: 'Analyze recent conversations and extract notes/examples',
        userId: contextUser.ID,
        companyId: contextUser.CompanyID
      });

      LogStatus(`Memory Manager completed: ${result.message}`);
      return result.success;
    } catch (error) {
      LogError('Memory Manager failed:', error);
      return false;
    }
  }
}
```

---

## Phase 4: UI Components (Angular)

### 4.1 Multi-User Rating System

**Location**: `packages/Angular/Generic/conversations/src/lib/components/conversation-message-rating.component.ts`

**Purpose**: Allow multiple users to rate conversation messages independently.

**Features**:
- Show aggregate ratings: "👍 5  👎 2  (7 ratings)"
- Highlight current user's rating
- Click to toggle rating (1-10 scale or thumbs up/down)
- Tooltip showing "5 users liked this"

**Implementation**:

```typescript
@Component({
  selector: 'mj-conversation-message-rating',
  template: `
    <div class="rating-container">
      <span class="aggregate-rating">
        👍 {{ thumbsUpCount }}  👎 {{ thumbsDownCount }}  ({{ totalRatings }} ratings)
      </span>

      <div class="user-rating" [class.has-rated]="currentUserRating != null">
        <button (click)="rateThumbsUp()" [class.active]="currentUserRating >= 8">
          👍
        </button>
        <button (click)="rateThumbsDown()" [class.active]="currentUserRating <= 3">
          👎
        </button>
      </div>
    </div>
  `
})
export class ConversationMessageRatingComponent {
  @Input() conversationDetailId: string;

  thumbsUpCount = 0;
  thumbsDownCount = 0;
  totalRatings = 0;
  currentUserRating: number | null = null;

  async LoadRatings() {
    const rv = new RunView();
    const result = await rv.RunView<ConversationDetailRatingEntity>({
      EntityName: 'Conversation Detail Ratings',
      ExtraFilter: `ConversationDetailID='${this.conversationDetailId}'`
    });

    const ratings = result.Results || [];
    this.thumbsUpCount = ratings.filter(r => r.Rating >= 8).length;
    this.thumbsDownCount = ratings.filter(r => r.Rating <= 3).length;
    this.totalRatings = ratings.length;

    const currentUserRating = ratings.find(r => r.UserID === this.currentUserId);
    this.currentUserRating = currentUserRating?.Rating ?? null;
  }

  async RateThumbsUp() {
    await this.SaveRating(10);
  }

  async RateThumbsDown() {
    await this.SaveRating(1);
  }

  private async SaveRating(rating: number) {
    const md = new Metadata();
    let ratingEntity = await md.GetEntityObject<ConversationDetailRatingEntity>('Conversation Detail Ratings');

    // Try to load existing rating
    const rv = new RunView();
    const existing = await rv.RunView<ConversationDetailRatingEntity>({
      EntityName: 'Conversation Detail Ratings',
      ExtraFilter: `ConversationDetailID='${this.conversationDetailId}' AND UserID='${this.currentUserId}'`
    });

    if (existing.Success && existing.Results?.length > 0) {
      ratingEntity = existing.Results[0];
    } else {
      ratingEntity.ConversationDetailID = this.conversationDetailId;
      ratingEntity.UserID = this.currentUserId;
    }

    ratingEntity.Rating = rating;
    await ratingEntity.Save();

    await this.LoadRatings();
  }
}
```

---

### 4.2 Agent Notes Management Component

**Location**: `packages/Angular/Explorer/core-entity-forms/src/lib/ai-agent-notes/`

**Components**:
- `agent-notes-list.component.ts` - List/grid with filtering
- `agent-note-editor.component.ts` - Create/edit individual notes

**Features**:
- Filter by Type (Preference, Constraint, Context, Example, Issue)
- Filter by Scope (Agent, User, Company, Global)
- Filter by Status (Pending, Active, Revoked)
- Search by Note content
- Bulk actions (Approve, Revoke)

---

### 4.3 Agent Examples Management Component

**Location**: `packages/Angular/Explorer/core-entity-forms/src/lib/ai-agent-examples/`

**Features**:
- Filter by Agent, User, Company
- Sort by SuccessScore
- Preview injection format
- Link to source conversation/agent run

---

## Phase 5: Testing Strategy

### 5.1 Unit Tests

**Coverage**:
- AgentContextInjector scoping logic (all 8 priority levels)
- Embedding generation on Save()
- Note/Example formatting for injection
- BaseEngine per-config debounce

### 5.2 Integration Tests

**Scenarios**:
1. Create note → Trigger embedding → Verify in AIEngine cache
2. Agent with notes enabled → Run → Verify notes injected
3. Memory Manager scheduled job → Verify notes/examples created
4. Multi-user ratings → Verify aggregation

### 5.3 End-to-End Tests

**User Flows**:
1. Rate conversation highly → Wait 15 min → Verify note created
2. Create artifact, share multiple times → Verify example extracted
3. Configure agent injection → Test different strategies

---

## Implementation Timeline

### Week 1: Migrations & Server-Side Entities
- [ ] Create Migration 2-5
- [ ] Server-side entity subclasses with auto-embedding
- [ ] BaseEngine per-config debounce enhancement
- [ ] Unit tests

### Week 2: AIEngine & AgentContextInjector
- [ ] AIEngine note/example embedding cache
- [ ] FindSimilarNotes/FindSimilarExamples methods
- [ ] AgentContextInjector with scoping logic
- [ ] Integration tests

### Week 3: BaseAgent & Memory Manager
- [ ] BaseAgent InjectContextMemory integration
- [ ] Memory Manager agent implementation
- [ ] Scheduled job handler
- [ ] Test scheduled execution

### Week 4: UI Components
- [ ] Multi-user rating component
- [ ] Agent notes management UI
- [ ] Agent examples management UI
- [ ] Agent configuration panel

### Week 5: Testing & Polish
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Documentation
- [ ] Deployment

---

## Success Metrics

1. **Adoption**: 50%+ of agents have notes/examples configured
2. **Quality**: 80%+ of auto-generated notes/examples rated as useful
3. **Performance**: Note/example injection adds <200ms to agent execution
4. **Accuracy**: Semantic search retrieves relevant notes/examples 90%+ of the time
5. **Automation**: 70%+ of notes/examples generated automatically by Memory Manager

---

## Dependencies

- **Migrations**: 5 total (1 complete, 4 new)
- **CodeGen**: Will run after migrations to generate updated entities
- **Scheduling System**: `packages/Scheduling/base-engine` and handlers
- **Vector Infrastructure**: AIEngine with SimpleVectorService
- **AI Provider**: Existing MJ AI provider abstraction

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Embedding generation performance | Medium | Low | Async processing, debouncing |
| Vector cache memory usage | Medium | Medium | Monitor, add cleanup for revoked notes |
| Memory Manager extract quality | High | Medium | Iterative prompt refinement, confidence thresholds |
| Multi-dimensional scoping bugs | Medium | Low | Comprehensive unit tests |
| Scheduled job failures | Medium | Low | Error logging, retry logic, monitoring dashboard |

---

## Future Enhancements (Not in Scope)

- Note/Example versioning (track changes over time)
- Note/Example analytics dashboard (most useful, most used)
- A/B testing different injection strategies
- Machine learning for optimal note selection
- Cross-agent learning (share examples between related agents)
- User feedback loop on injected notes (were they helpful?)
