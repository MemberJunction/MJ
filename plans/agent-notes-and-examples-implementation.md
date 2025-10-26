# Agent Notes and Examples - Implementation Plan

## Overview

This plan outlines the implementation of the AI Agent Memory and Example Context Framework, which enriches AI agents with contextual notes and example-based learning through multi-dimensional scoping (Agent, User, Company).

**Migration Status**: ✅ Complete - `V202510260916__v2.111.x__Enhance_AI_Agent_Notes_And_Add_Examples.sql`

**Entities Available**:
- `AIAgentNoteEntity` - Notes with multi-dimensional scoping
- `AIAgentNoteTypeEntity` - Note type categorization with priority
- `AIAgentExampleEntity` - Example input/output pairs
- `AIAgentEntity` - Extended with injection configuration

---

## Phase 1: Core Infrastructure

### 1.1 AgentContextInjector Class

**Location**: `packages/AI/CorePlus/src/agent-context-injector.ts`

**Purpose**: Central service for retrieving and injecting notes/examples into agent context.

**Key Methods**:

```typescript
export class AgentContextInjector {
  /**
   * Retrieve notes for a specific agent execution context
   * Implements multi-dimensional scoping and injection strategy
   */
  async getNotesForContext(params: {
    agentId: string;
    userId?: string;
    companyId?: string;
    currentInput?: string; // For semantic search
    strategy: 'Relevant' | 'Recent' | 'All';
    maxNotes: number;
    contextUser: UserInfo;
  }): Promise<AIAgentNoteEntity[]>;

  /**
   * Retrieve examples for a specific agent execution context
   */
  async getExamplesForContext(params: {
    agentId: string;
    userId?: string;
    companyId?: string;
    currentInput?: string; // For semantic search
    strategy: 'Semantic' | 'Recent' | 'Rated';
    maxExamples: number;
    contextUser: UserInfo;
  }): Promise<AIAgentExampleEntity[]>;

  /**
   * Format notes/examples for injection into agent prompt
   */
  formatNotesForInjection(notes: AIAgentNoteEntity[]): string;
  formatExamplesForInjection(examples: AIAgentExampleEntity[]): string;
}
```

**Scoping Priority Logic**:
```typescript
// Query notes in priority order (most specific to least specific)
// Priority 1: AgentID + UserID + CompanyID (all 3 populated)
// Priority 2: AgentID + UserID (company-agnostic user preference)
// Priority 3: AgentID + CompanyID (company-wide agent setting)
// Priority 4: UserID + CompanyID (user preferences across all agents in company)
// Priority 5: AgentID only (agent-specific, all users/companies)
// Priority 6: UserID only (user preference across all agents/companies)
// Priority 7: CompanyID only (company-wide across all agents/users)
// Priority 8: All NULL (global/system-wide notes)
```

**Injection Strategy Implementations**:

- **Relevant** (Notes): Use vector search on `Note` field, find semantically similar to `currentInput`
- **Recent** (Notes): Order by `__mj_CreatedAt DESC`
- **All** (Notes): Include all matching scope, up to `maxNotes`
- **Semantic** (Examples): Use vector search on `ExampleInput` field, find similar to `currentInput`
- **Recent** (Examples): Order by `__mj_CreatedAt DESC`
- **Rated** (Examples): Order by `SuccessScore DESC`

---

### 1.2 Vector Search Integration

**Location**: `packages/AI/CorePlus/src/vector-search-helper.ts`

**Purpose**: Leverage MJ's existing vector infrastructure for semantic note/example search.

**Key Methods**:

```typescript
export class VectorSearchHelper {
  /**
   * Index a note's text in the vector store
   */
  async indexNote(note: AIAgentNoteEntity): Promise<void>;

  /**
   * Index an example's input in the vector store
   */
  async indexExample(example: AIAgentExampleEntity): Promise<void>;

  /**
   * Search for semantically similar notes
   */
  async searchSimilarNotes(params: {
    queryText: string;
    agentId: string;
    userId?: string;
    companyId?: string;
    maxResults: number;
    contextUser: UserInfo;
  }): Promise<AIAgentNoteEntity[]>;

  /**
   * Search for semantically similar examples
   */
  async searchSimilarExamples(params: {
    queryText: string;
    agentId: string;
    userId?: string;
    companyId?: string;
    maxResults: number;
    contextUser: UserInfo;
  }): Promise<AIAgentExampleEntity[]>;
}
```

**Vector Store Configuration**:
- Use existing `AIVectorStoreEntity` and `AIVectorIndexEntity`
- Store metadata: `{ type: 'note' | 'example', id: string, agentId: string, userId?: string, companyId?: string }`
- Index on save/update of notes/examples
- Remove from index when Status = 'Revoked'

---

## Phase 2: BaseAgent Integration

### 2.1 Extend BaseAgent Class

**Location**: `packages/AI/CorePlus/src/base-agent.ts`

**Changes**:

```typescript
export abstract class BaseAgent {
  // ... existing code ...

  /**
   * New method: Inject notes and examples into agent context
   * Called automatically before agent execution
   */
  protected async injectContextMemory(
    input: string,
    userId?: string,
    companyId?: string
  ): Promise<{ notes: AIAgentNoteEntity[]; examples: AIAgentExampleEntity[] }> {
    // 1. Load agent configuration
    const agent = await this.loadAgentConfig();

    // 2. Check if injection is enabled
    if (!agent.InjectNotes && !agent.InjectExamples) {
      return { notes: [], examples: [] };
    }

    // 3. Use AgentContextInjector to retrieve notes/examples
    const injector = new AgentContextInjector();
    const notes = agent.InjectNotes
      ? await injector.getNotesForContext({
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
      ? await injector.getExamplesForContext({
          agentId: this.agentId,
          userId,
          companyId,
          currentInput: input,
          strategy: agent.ExampleInjectionStrategy,
          maxExamples: agent.MaxExamplesToInject,
          contextUser: this.contextUser
        })
      : [];

    // 4. Format and prepend to system prompt
    const notesText = injector.formatNotesForInjection(notes);
    const examplesText = injector.formatExamplesForInjection(examples);

    if (notesText) {
      this.systemPrompt = `${notesText}\n\n${this.systemPrompt}`;
    }
    if (examplesText) {
      this.systemPrompt = `${examplesText}\n\n${this.systemPrompt}`;
    }

    return { notes, examples };
  }

  /**
   * Update Run method to call injectContextMemory
   */
  async Run(input: AIAgentInput): Promise<AIAgentOutput> {
    // Extract userId and companyId from input or context
    const userId = input.userId || this.contextUser?.ID;
    const companyId = input.companyId || this.contextUser?.CompanyID;

    // Inject notes/examples before execution
    await this.injectContextMemory(input.text, userId, companyId);

    // Continue with existing Run logic...
  }
}
```

**Prompt Formatting Examples**:

```
📝 AGENT NOTES (3)

[Constraint] Never include PII in responses
  Applies to all users in this company

[Preference] User prefers bullet points over paragraphs
  User-specific preference

[Context] Company fiscal year starts April 1
  Company-wide context

---

💡 RELEVANT EXAMPLES (2)

Example 1:
Q: Show me sales data for Q1
A: Here's the Q1 data (April-June):
   • Total Sales: $1.2M
   • Top Product: Widget Pro
   • Growth: +15% vs Q4

Example 2:
Q: What were our top performers?
A: Top 5 products by revenue:
   1. Widget Pro - $450K
   2. Gadget Plus - $320K
   ...

---
```

---

## Phase 3: Auto-Curation Agent

### 3.1 Memory Manager Agent

**Location**: `packages/AI/Agents/src/memory-manager-agent.ts`

**Purpose**: Automatically extract notes and examples from successful agent runs and conversations.

**Implementation**:

```typescript
export class MemoryManagerAgent extends BaseAgent {
  agentId = 'MEMORY_MANAGER_AGENT_ID'; // Fixed agent ID

  /**
   * Analyze a conversation and extract potential notes/examples
   */
  async analyzeConversation(params: {
    conversationId: string;
    agentId?: string; // If conversation involved a specific agent
    contextUser: UserInfo;
  }): Promise<{
    notes: Array<{ type: string; content: string; noteTypeId: string }>;
    examples: Array<{ input: string; output: string; successScore: number }>;
  }>;

  /**
   * Analyze an agent run and extract learnings
   */
  async analyzeAgentRun(params: {
    agentRunId: string;
    contextUser: UserInfo;
  }): Promise<{
    notes: Array<{ type: string; content: string; noteTypeId: string }>;
    examples: Array<{ input: string; output: string; successScore: number }>;
  }>;

  /**
   * Create note records from analysis
   */
  async createNotesFromAnalysis(/* ... */): Promise<AIAgentNoteEntity[]>;

  /**
   * Create example records from analysis
   */
  async createExamplesFromAnalysis(/* ... */): Promise<AIAgentExampleEntity[]>;
}
```

**Trigger Points**:
1. **Manual Trigger**: User action in UI ("Save as Note", "Save as Example")
2. **Automatic Trigger**: After successful agent run with user feedback score > 80
3. **Scheduled Trigger**: Nightly batch process to analyze recent high-quality conversations

**AI Prompt for Extraction**:
```
Analyze this conversation and extract:
1. User preferences (how they like information presented)
2. Constraints (rules or requirements mentioned)
3. Contextual information (facts about their business/domain)
4. Successful interaction patterns (question/answer pairs that worked well)
5. Known issues or limitations discovered

For each finding, provide:
- Type: Preference, Constraint, Context, Example, or Issue
- Scope: User-specific, Company-wide, or Global
- Content: Clear, concise description
- Confidence: 0-100 score
```

---

## Phase 4: UI Components (Angular)

### 4.1 Agent Notes Management Component

**Location**: `packages/Angular/Explorer/core-entity-forms/src/lib/ai-agent-notes/`

**Components**:
- `agent-notes-list.component.ts` - List/grid of notes with filtering
- `agent-note-editor.component.ts` - Create/edit individual notes
- `agent-note-type-manager.component.ts` - Manage note types

**Features**:
- Filter by Type (Preference, Constraint, Context, Example, Issue)
- Filter by Scope (Agent, User, Company, Global)
- Filter by Status (Pending, Active, Revoked)
- Search by Note content
- Inline editing
- Bulk actions (Approve, Revoke)

### 4.2 Agent Examples Management Component

**Location**: `packages/Angular/Explorer/core-entity-forms/src/lib/ai-agent-examples/`

**Components**:
- `agent-examples-list.component.ts` - List/grid of examples
- `agent-example-editor.component.ts` - Create/edit examples with input/output pairs
- `example-preview.component.ts` - Preview how example will appear in context

**Features**:
- Filter by Agent, User, Company
- Filter by Type and Status
- Sort by SuccessScore
- Test example injection (preview)
- Link to source conversation/agent run

### 4.3 Agent Configuration Panel

**Location**: `packages/Angular/Explorer/core-entity-forms/src/lib/ai-agents/agent-config-panel.component.ts`

**Purpose**: Configure note/example injection settings on AIAgent entity form.

**Fields**:
- ✓ InjectNotes (checkbox)
- MaxNotesToInject (number input, 1-20)
- NoteInjectionStrategy (dropdown: Relevant, Recent, All)
- ✓ InjectExamples (checkbox)
- MaxExamplesToInject (number input, 1-10)
- ExampleInjectionStrategy (dropdown: Semantic, Recent, Rated)

**Preview Button**: Show sample injection output with current settings

---

## Phase 5: Integration Points

### 5.1 Conversation UI Integration

**Location**: `packages/Angular/Generic/conversations/`

**Changes**:
- Add "Save as Note" button to conversation messages
- Add "Save as Example" button to successful Q&A pairs
- Quick-create note/example modal
- Auto-populate from message content

### 5.2 Agent Run Viewer Integration

**Location**: Wherever agent runs are displayed

**Changes**:
- Show which notes/examples were injected for each run
- Link to view/edit those notes/examples
- Button to "Extract learnings from this run" (triggers MemoryManagerAgent)

---

## Phase 6: Testing Strategy

### 6.1 Unit Tests

**Coverage**:
- AgentContextInjector scoping logic (all 8 priority levels)
- VectorSearchHelper indexing and search
- Note/Example formatting for injection
- Strategy implementations (Relevant, Recent, All, Semantic, Rated)

### 6.2 Integration Tests

**Scenarios**:
1. Agent with notes enabled, various scoping combinations
2. Agent with examples enabled, semantic search vs. recent vs. rated
3. Mixed scoping (user + company notes, agent-specific examples)
4. MemoryManagerAgent extraction accuracy

### 6.3 End-to-End Tests

**User Flows**:
1. Create note manually → Run agent → Verify note appears in context
2. Have conversation → Extract as example → Run similar query → Verify example used
3. Configure injection settings → Test different strategies
4. Create company-wide constraint → Verify all users in company see it

---

## Phase 7: Performance Considerations

### 7.1 Caching Strategy

- Cache agent configuration (InjectNotes, strategies, etc.) for 5 minutes
- Cache note/example results for same input within 1 minute
- Invalidate cache on note/example create/update/delete

### 7.2 Vector Index Optimization

- Batch index updates (don't block on save)
- Background job for re-indexing
- Monitor vector search performance, adjust if >500ms

### 7.3 Query Optimization

- Add indexes on (AgentID, UserID, CompanyID, Status) for fast scoping queries
- Add index on (Type, Status, __mj_CreatedAt) for filtering

---

## Implementation Order

### Week 1: Core Infrastructure
- [ ] AgentContextInjector class with scoping logic
- [ ] VectorSearchHelper class
- [ ] Unit tests for scoping priority

### Week 2: BaseAgent Integration
- [ ] Extend BaseAgent with injectContextMemory
- [ ] Prompt formatting utilities
- [ ] Integration tests

### Week 3: Auto-Curation Agent
- [ ] MemoryManagerAgent implementation
- [ ] Extraction prompts and logic
- [ ] Test with sample conversations

### Week 4: UI Components
- [ ] Agent notes management UI
- [ ] Agent examples management UI
- [ ] Agent configuration panel

### Week 5: Integration & Polish
- [ ] Conversation UI integration
- [ ] Agent run viewer updates
- [ ] End-to-end testing
- [ ] Performance optimization

---

## Success Metrics

1. **Adoption**: 50%+ of agents have notes/examples configured
2. **Quality**: 80%+ of auto-generated notes/examples rated as useful
3. **Performance**: Note/example injection adds <200ms to agent execution
4. **Accuracy**: Semantic search retrieves relevant notes/examples 90%+ of the time

---

## Open Questions / Decisions Needed

1. **Default Note Types**: Should we pre-populate AIAgentNoteType with standard types, or let users create their own?

2. **Vector Provider**: Which vector database should be the default? (Pinecone, Chroma, other?)

3. **Auto-Curation Frequency**: How often should MemoryManagerAgent run automatically?
   - Per-conversation (immediate)
   - Hourly batch
   - Daily batch
   - Manual only

4. **Note/Example Approval Workflow**: Should auto-generated notes/examples require approval before Status='Active'?

5. **Max Injection Limits**: What are reasonable defaults/maximums for MaxNotesToInject and MaxExamplesToInject?
   - Current defaults: 5 notes, 3 examples
   - Should there be hard caps? (e.g., max 20 notes, max 10 examples)

6. **Prompt Token Budget**: How do we ensure notes/examples don't consume too much of the context window?
   - Truncate individual notes if too long?
   - Dynamically adjust count based on token usage?

7. **Note Type vs. Type Field**: Given we have both AIAgentNoteType (FK) and Type (enum), what's the guidance on when to use which?
   - Type for quick categorization
   - NoteType for detailed categorization with priority
   - Should Type be required or optional?

---

## Dependencies

- **Migration**: ✅ Complete
- **CodeGen**: ✅ Complete (entities generated)
- **Vector Infrastructure**: Existing MJ vector store capabilities
- **AI Provider**: Existing MJ AI provider abstraction

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Vector search performance | High | Medium | Implement caching, monitor, optimize indexes |
| Context window overflow | Medium | Low | Enforce token limits, smart truncation |
| Auto-curation quality | Medium | Medium | Require approval for auto-generated, confidence scores |
| Multi-dimensional scoping complexity | Medium | Low | Comprehensive unit tests, clear documentation |
| User confusion (Type vs NoteType) | Low | Medium | UI guidance, tooltips, examples |

---

## Future Enhancements (Not in Scope)

- Note/Example versioning (track changes over time)
- Collaborative note editing (multiple users contributing)
- Note/Example templates library
- A/B testing different injection strategies
- Machine learning for optimal note selection
- Cross-agent learning (share examples between related agents)
- Note/Example analytics dashboard (most useful, most used, etc.)
