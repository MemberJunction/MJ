# Research Agent Context Optimization Strategy

**Date:** 2025-10-15
**Issue:** Research Agent rapidly exhausts context windows when retrieving web content and database results
**Goal:** Maintain research continuity while dramatically reducing token consumption

---

## Problem Analysis

### Current Context Consumption Pattern

The Research Agent currently stores full action results in conversation history:

```typescript
// From base-agent.ts:3348
const resultsMessage = `Action results:\n${JSON.stringify(actionSummaries, null, 2)}`;
params.conversationMessages.push({
    role: 'user',
    content: resultsMessage
});
```

Where `actionSummaries` includes:
```typescript
{
    actionName: result.action.name,
    success: result.success,
    params: result.result?.Params.filter(p => p.Type ==='Both' || p.Type ==='Output'),
    resultCode: actionResult?.Result?.ResultCode,
    message: result.success ? actionResult?.Message : result.error
}
```

### The Core Problem

**Web Page Content Action** (web-page-content.action.ts) returns:
- Full HTML content (up to 100KB default via `MaxContentLength`)
- Converted markdown (often longer than HTML)
- Complete metadata structures

**Google Custom Search Action** returns:
- Full search results with snippets for all items (10 items default)
- Complete metadata and pageMap structures

**Database Research Actions** return:
- Complete entity metadata trees (EntityInfo with all fields, relationships, permissions)
- Full SQL query results

**Result**: A single web page fetch can add 50K-100K tokens to conversation history. After 3-5 research iterations, most models hit their context limits.

---

## Solution Architecture

### 1. Content Citation Pattern (Primary Strategy)

Instead of storing full content in conversation history, store **excerpts with citations** to external storage.

#### Implementation Components

##### A. Content Storage Service

Create a simple in-memory or database-backed content store:

```typescript
// packages/AI/Agents/src/ContentStore.ts

export interface StoredContent {
    id: string;                          // Unique identifier (UUID)
    sourceType: 'web' | 'database' | 'storage' | 'search';
    sourceUrl?: string;                  // Original URL if web/search
    contentType: string;                 // 'html', 'markdown', 'json', 'entity_metadata'
    fullContent: string;                 // Complete content
    contentLength: number;               // Character count
    metadata: Record<string, any>;       // Type-specific metadata
    createdAt: Date;
    agentRunId: string;                  // Link to agent run for lifecycle management
}

export interface ContentExcerpt {
    contentId: string;                   // Reference to StoredContent
    excerpt: string;                     // Relevant excerpt (max 500 chars)
    excerptLocation: string;             // "lines 45-67", "paragraph 3", "section: Introduction"
    relevance: string;                   // Why this excerpt matters
    sourceType: 'web' | 'database' | 'storage' | 'search';
    sourceUrl?: string;                  // For easy reference
}

export class ContentStore {
    private store: Map<string, StoredContent> = new Map();

    /**
     * Stores full content and returns a citation
     */
    public storeContent(content: StoredContent): string {
        this.store.set(content.id, content);
        return content.id;
    }

    /**
     * Retrieves full content by ID (for when agent needs to re-examine)
     */
    public getContent(contentId: string): StoredContent | null {
        return this.store.get(contentId) || null;
    }

    /**
     * Extracts relevant excerpts from content
     */
    public extractExcerpts(
        contentId: string,
        relevanceCriteria: string[],
        maxExcerptLength: number = 500
    ): ContentExcerpt[] {
        const content = this.store.get(contentId);
        if (!content) return [];

        // Use simple keyword matching or more sophisticated NLP
        // to extract relevant sections
        return this.findRelevantSections(
            content,
            relevanceCriteria,
            maxExcerptLength
        );
    }

    /**
     * Cleanup content after agent run completes
     */
    public cleanupForAgentRun(agentRunId: string): void {
        for (const [id, content] of this.store.entries()) {
            if (content.agentRunId === agentRunId) {
                this.store.delete(id);
            }
        }
    }
}
```

##### B. Modified Action Post-Processing

Modify `BaseAgent.handleActionsStep()` to extract citations instead of storing full content:

```typescript
// In base-agent.ts, around line 3331

// Build citations instead of full results
const actionCitations = await this.buildActionCitations(
    actionResults,
    actions,
    params.agent.ID
);

// Add condensed message with citations
const citationsMessage = `Action results with citations:\n${JSON.stringify(actionCitations, null, 2)}`;
params.conversationMessages.push({
    role: 'user',
    content: citationsMessage
});
```

```typescript
// New method in BaseAgent

private async buildActionCitations(
    actionResults: any[],
    actions: AgentAction[],
    agentId: string
): Promise<any[]> {
    const contentStore = ContentStore.getInstance();

    return actionResults.map((result, index) => {
        const action = actions[index];
        const actionResult = result.success ? result.result : null;

        // Extract the content from action result
        const content = this.extractContentFromActionResult(actionResult, action);

        if (content && content.fullContent && content.fullContent.length > 1000) {
            // Store full content
            const contentId = contentStore.storeContent({
                id: this.generateUUID(),
                sourceType: this.detectSourceType(action.name),
                sourceUrl: content.sourceUrl,
                contentType: content.contentType,
                fullContent: content.fullContent,
                contentLength: content.fullContent.length,
                metadata: content.metadata,
                createdAt: new Date(),
                agentRunId: this._agentRun?.ID || ''
            });

            // Extract relevant excerpts (first 500 chars as default)
            const excerpt = content.fullContent.substring(0, 500) +
                (content.fullContent.length > 500 ? '...' : '');

            return {
                actionName: action.name,
                success: result.success,
                contentId: contentId,
                excerpt: {
                    text: excerpt,
                    location: "beginning",
                    totalLength: content.fullContent.length,
                    sourceUrl: content.sourceUrl
                },
                resultCode: actionResult?.Result?.ResultCode || 'SUCCESS',
                message: `Content stored (${content.fullContent.length} chars). Citation ID: ${contentId}`,
                // Include ONLY small output params, not content params
                params: actionResult?.Params
                    ?.filter(p =>
                        (p.Type === 'Both' || p.Type === 'Output') &&
                        p.Name !== 'Content' &&
                        p.Name !== 'Results' &&
                        p.Name !== 'Entities'
                    )
            };
        } else {
            // Small content - include in full
            return {
                actionName: action.name,
                success: result.success,
                params: actionResult?.Params?.filter(p => p.Type === 'Both' || p.Type === 'Output'),
                resultCode: actionResult?.Result?.ResultCode || 'SUCCESS',
                message: result.success ? actionResult?.Message || 'Action completed' : result.error
            };
        }
    });
}
```

##### C. New "Retrieve Content" Action

Create an action that allows the agent to retrieve full content when needed:

```typescript
// packages/Actions/CoreActions/src/custom/utilities/retrieve-stored-content.action.ts

@RegisterClass(BaseAction, "Retrieve Stored Content")
export class RetrieveStoredContentAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contentId = this.getStringParam(params, "contentid");
        const excerptOnly = this.getBooleanParam(params, "excerptonly", false);
        const searchTerms = this.getStringParam(params, "searchterms"); // For finding relevant sections

        if (!contentId) {
            return this.createErrorResult("ContentID parameter is required");
        }

        const contentStore = ContentStore.getInstance();
        const content = contentStore.getContent(contentId);

        if (!content) {
            return this.createErrorResult(`Content not found for ID: ${contentId}`);
        }

        if (excerptOnly && searchTerms) {
            // Extract relevant excerpts based on search terms
            const excerpts = contentStore.extractExcerpts(
                contentId,
                searchTerms.split(',').map(t => t.trim()),
                500
            );

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    contentId,
                    sourceType: content.sourceType,
                    sourceUrl: content.sourceUrl,
                    totalLength: content.contentLength,
                    excerpts: excerpts.map(e => ({
                        text: e.excerpt,
                        location: e.excerptLocation,
                        relevance: e.relevance
                    }))
                }, null, 2)
            };
        } else {
            // Return full content (use sparingly!)
            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    contentId,
                    sourceType: content.sourceType,
                    sourceUrl: content.sourceUrl,
                    contentType: content.contentType,
                    content: content.fullContent,
                    metadata: content.metadata
                }, null, 2)
            };
        }
    }
}
```

##### D. Update Research Agent Prompt

Update `/metadata/prompts/database-research-agent.md` to teach the agent about citations:

```markdown
## Working with Content Citations

When you execute actions that retrieve web pages, database results, or other large content,
the system will return a **content citation** instead of the full content. This allows you to:

1. **See a summary** - You'll receive an excerpt (first 500 characters) and metadata
2. **Reference the content** - You'll get a Citation ID that you can use later
3. **Retrieve specific sections** - Use the "Retrieve Stored Content" action when you need more detail

### Example Citation Response

```json
{
  "actionName": "Web Page Content",
  "success": true,
  "contentId": "content_abc123def456",
  "excerpt": {
    "text": "Quantum computing is a revolutionary technology that leverages quantum mechanics...",
    "location": "beginning",
    "totalLength": 45230,
    "sourceUrl": "https://example.com/quantum-computing"
  },
  "resultCode": "SUCCESS",
  "message": "Content stored (45230 chars). Citation ID: content_abc123def456"
}
```

### When to Retrieve Full Content

You should retrieve full content **sparingly**, only when:
- The excerpt doesn't contain the specific information you need
- You need to analyze document structure or extract specific data
- You're performing detailed comparisons between sources

### How to Retrieve Content

Use the "Retrieve Stored Content" action:

```json
{
  "action": "Retrieve Stored Content",
  "parameters": {
    "ContentID": "content_abc123def456",
    "ExcerptOnly": true,
    "SearchTerms": "commercialization timeline, error correction"
  }
}
```

This will extract only the sections relevant to your search terms (500 chars per section),
rather than loading the entire 45KB document.
```

---

### 2. Payload-Based Content Storage (Alternative Strategy)

Store content in the payload rather than message history, using `SourceRecord` from the Research Agent payload structure.

#### Advantages
- Content already structured in the payload
- No new infrastructure needed
- Payload can be scoped/filtered when passed to sub-agents

#### Implementation

Modify Research Agent to store full content in `SourceRecord.content` but only reference it in conversation:

```typescript
// In Research Agent execution

// After action execution
const sourceRecords: SourceRecord[] = [];

for (const result of actionResults) {
    if (result.action.name === 'Web Page Content' ||
        result.action.name === 'Google Custom Search') {

        const sourceRecord: SourceRecord = {
            sourceID: `src_${generateId()}`,
            sourceType: 'web',
            url: extractUrl(result),
            content: result.fullContent,  // Store full content HERE
            contentFormat: 'markdown',
            contentLength: result.fullContent.length,
            accessedAt: new Date().toISOString(),
            // ... other fields
        };

        sourceRecords.push(sourceRecord);

        // Add to payload
        payload.sources.push(sourceRecord);
    }
}

// In conversation, only add source IDs and excerpts
params.conversationMessages.push({
    role: 'user',
    content: `Retrieved ${sourceRecords.length} sources:\n` +
        sourceRecords.map(s =>
            `- ${s.sourceID}: ${s.url}\n  Excerpt: ${s.content.substring(0, 200)}...`
        ).join('\n')
});
```

Then teach the agent to reference `payload.sources` when it needs full content.

#### Challenges
- Agent can't easily "retrieve" content mid-conversation without payload modification
- Payload still grows large (though not sent to LLM each time)
- Requires payload-aware prompting

---

### 3. Hybrid Approach (Recommended)

Combine both strategies:

1. **Store content in payload** for complete audit trail and persistence
2. **Use citations in conversation** to minimize token usage
3. **Provide "Retrieve Content" action** for when agent needs details

This gives you:
- ✅ Complete audit trail in payload/database
- ✅ Minimal conversation token usage
- ✅ Agent can retrieve content on-demand
- ✅ Payload can be filtered when passed to sub-agents

---

## Implementation Roadmap

### Phase 1: Content Store Infrastructure (2-3 hours)
1. Create `ContentStore` class in `/packages/AI/Agents/src/ContentStore.ts`
2. Add singleton instance management
3. Implement basic storage/retrieval

### Phase 2: BaseAgent Integration (3-4 hours)
1. Modify `handleActionsStep()` to build citations
2. Add `buildActionCitations()` method
3. Add `extractContentFromActionResult()` helper
4. Test with existing Research Agent

### Phase 3: Retrieve Content Action (2 hours)
1. Create `RetrieveStoredContentAction`
2. Add action metadata to database
3. Test retrieval patterns

### Phase 4: Research Agent Updates (2-3 hours)
1. Update Database Research Agent prompt with citation guidance
2. Add examples of citation usage
3. Test iterative research workflows

### Phase 5: Payload Integration (Optional, 2-3 hours)
1. Modify Research Agent to store full content in `SourceRecord.content`
2. Ensure payload and ContentStore stay in sync
3. Add cleanup logic when agent run completes

---

## Token Savings Estimate

### Current Pattern
- Web page fetch: ~50,000 tokens in conversation
- 3 iterations: 150,000 tokens
- **Result**: Context exhausted after 3-4 actions

### With Citations
- Web page citation: ~500 tokens in conversation
- 3 iterations: 1,500 tokens
- **Savings**: 99% reduction
- **Result**: 50+ actions possible before context limit

### Example Calculation

**Before:**
```
Web page (100KB markdown) = 25,000 tokens
Database metadata (20 entities) = 15,000 tokens
Google search (10 results) = 8,000 tokens
Total per iteration: 48,000 tokens

3 iterations = 144,000 tokens
Claude 3.5 Sonnet limit = 200,000 tokens
Remaining for responses: 56,000 tokens
```

**After:**
```
Web page citation = 300 tokens
Database metadata citation = 400 tokens
Google search citation = 200 tokens
Total per iteration: 900 tokens

20 iterations = 18,000 tokens
Claude 3.5 Sonnet limit = 200,000 tokens
Remaining for responses: 182,000 tokens
```

---

## Additional Optimizations

### 1. Summarization for Entity Metadata

For database research, don't return full `EntityInfo` trees. Instead, return structured summaries:

```typescript
// Instead of full EntityInfo with all fields
const entitySummary = {
    name: entity.Name,
    description: entity.Description,
    primaryKey: entity.Fields.find(f => f.IsPrimaryKey)?.Name,
    fieldCount: entity.Fields.length,
    topFields: entity.Fields.slice(0, 5).map(f => ({
        name: f.Name,
        type: f.Type,
        description: f.Description
    })),
    relationshipCount: entity.RelatedEntities?.length || 0,
    // Citation for full entity details
    fullEntityCitationId: storeEntityMetadata(entity)
};
```

### 2. Google Search Result Condensing

Return only essential search result fields:

```typescript
// Instead of full search results with pagemap, etc.
const searchCitations = results.items.map(item => ({
    title: item.title,
    url: item.link,
    snippet: item.snippet?.substring(0, 200), // Trim snippets
    // Citation for full page content
    contentCitationId: null // Populated when they fetch the page
}));
```

### 3. Progressive Content Loading

Teach agents to:
1. Start with citations and excerpts
2. Only retrieve full content for the most relevant sources
3. Use excerpts for comparative analysis when possible

---

## Testing Strategy

### Test Case 1: Multi-Iteration Research
**Scenario**: "Research quantum computing commercialization timeline"
- Execute 5 web searches
- Fetch 10 web pages
- Query database 3 times
**Expected**: Should complete without context exhaustion

### Test Case 2: Content Retrieval Accuracy
**Scenario**: Agent cites content, then retrieves specific section
- Verify retrieved content matches citation
- Verify excerpt relevance matching works

### Test Case 3: Payload Sync
**Scenario**: Ensure payload SourceRecords stay in sync with ContentStore
- Store web page → check both locations
- Clean up agent run → verify both cleared

---

## Migration Path

### Backward Compatibility

The citation system should be **opt-in** initially:

```typescript
// Add config to AIAgent entity or agent configuration
enableContentCitations: boolean = false;  // Default off for existing agents

// In BaseAgent.handleActionsStep()
if (params.agent.EnableContentCitations) {
    return this.buildActionCitations(...);
} else {
    // Existing behavior
    return this.buildActionSummaries(...);
}
```

This allows gradual rollout without breaking existing agents.

---

## Alternative Approaches Considered

### 1. ❌ Message History Pruning
**Idea**: Automatically remove old messages from history
**Problem**: Loses context, agent can't reference earlier findings

### 2. ❌ Summarization-Only
**Idea**: Use LLM to summarize action results before adding to history
**Problem**: Summarization itself costs tokens, can lose critical details, adds latency

### 3. ❌ External Vector Store
**Idea**: Store all content in vector DB, retrieve via semantic search
**Problem**: Over-engineered for this use case, adds complexity, requires vector DB setup

### 4. ✅ Content Citation Pattern (Selected)
**Advantages**:
- Preserves full content for retrieval
- Dramatically reduces conversation tokens
- Simple implementation
- Agent has fine-grained control over what to retrieve

---

## Open Questions

1. **ContentStore Persistence**: Should content be persisted to database or kept in memory?
   - **Recommendation**: Start with in-memory (sufficient for single agent run), add DB persistence later if needed

2. **Cleanup Strategy**: When should stored content be cleaned up?
   - **Recommendation**: Cleanup on agent run completion, keep for 1 hour for debugging

3. **Excerpt Extraction**: Use simple keyword matching or NLP-based relevance?
   - **Recommendation**: Start simple (keyword matching), upgrade to NLP if needed

4. **Citation Format**: Include excerpt in citation or require separate action?
   - **Recommendation**: Always include small excerpt (~500 chars) in citation for context

---

## Success Metrics

- **Primary**: Agent can complete 10+ iterative research actions without context exhaustion
- **Token Reduction**: 90%+ reduction in conversation token usage for content-heavy actions
- **Quality**: Agent finds relevant information as effectively as with full content
- **Performance**: No significant latency increase (<100ms per citation creation)

---

## Conclusion

The **Content Citation Pattern with Hybrid Payload Storage** is the recommended approach:

1. **Immediate Impact**: 99% reduction in conversation token usage
2. **Low Complexity**: Simple ContentStore, no external dependencies
3. **Agent Control**: Agent decides when to retrieve full content
4. **Audit Trail**: Full content preserved in payload for traceability
5. **Backward Compatible**: Can be rolled out gradually

**Next Steps**: Implement Phase 1 (Content Store Infrastructure) and test with existing Research Agent to validate token savings.
