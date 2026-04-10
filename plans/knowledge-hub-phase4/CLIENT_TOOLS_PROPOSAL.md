# Knowledge Hub — Agent-Driven UX via Client Tools

## Vision

Transform the Knowledge Hub from a manually-operated dashboard into an agent-augmented workspace where users can accomplish complex tasks through natural conversation. The Sage agent (or a dedicated Knowledge Hub agent) can drive dashboard features, set up configurations, run pipelines, and provide contextual insights — all while the user stays in the chat overlay.

---

## Architecture

### Three Integration Layers

```
Layer 1: Context Injection
    Dashboard state → AppContext → Chat Overlay → Agent system prompt
    Agent always knows what the user is looking at

Layer 2: Client Tools
    Agent decides → Server publishes tool request → Client executes → UI updates
    Agent can drive any dashboard action

Layer 3: Contextual Awareness
    Data changes → Context updates → Agent sees new state
    Agent can proactively comment on what user sees
```

---

## Layer 1: Context Injection

### What Changes Per Dashboard Tab

Each Knowledge Hub tab builds a rich `AppContext` snapshot that flows into the agent's system prompt:

**Autotagging Dashboard:**
```typescript
AppContext = {
    App: { Name: 'Knowledge Hub', Description: '...' },
    ActiveNavItem: { Name: 'Autotagging', ResourceType: 'Custom' },
    DashboardContext: {
        ActiveSubTab: 'taxonomy',
        SourceCount: 12,
        ContentTypeCount: 8,
        TagCount: 342,
        RecentPipelineStatus: 'idle',
        // Taxonomy-specific
        SelectedTag: { Name: 'Machine Learning', ChildCount: 5, ItemCount: 28 },
        OrphanCount: 12,
        DuplicateCandidates: 8,
    }
}
```

**Analytics Dashboard:**
```typescript
AppContext = {
    DashboardContext: {
        ActiveTab: 'overview',
        DateRange: '30D',
        EntityFilter: 'All',
        KPIs: {
            TotalTags: 342,
            ItemsProcessed: 4821,
            AvgConfidence: 0.78,
            Coverage: 0.68,
        },
        // If drill-down is active
        DrillDown: {
            Chart: 'Tag Growth',
            DataPoints: 6,
        }
    }
}
```

### Implementation

Each resource component builds context in a `BuildDashboardContext()` method, called on every state change. The parent explorer-app already wires `AppContext` to the chat overlay — we just need to enrich it with dashboard-specific data.

```typescript
// In each KH resource component
private BuildDashboardContext(): Record<string, unknown> {
    return {
        ActiveTab: this.ActiveTab,
        // ... tab-specific state
    };
}

// Called on every relevant state change
private UpdateContext(): void {
    this.DashboardContext = this.BuildDashboardContext();
    // Flows up via Output to explorer-app → chat overlay
}
```

---

## Layer 2: Client Tools

### New Tool Definitions

Register these in `metadata/client-tool-definitions/`:

#### Autotagging Tools

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `CreateContentSource` | Create a new content source | `name`, `sourceType`, `contentTypeId`, `url?`, `entityId?`, `entityDocId?` |
| `CreateContentType` | Create a new content type | `name`, `description`, `minTags`, `maxTags`, `aiModelId?` |
| `RunAutotagPipeline` | Trigger the autotagging pipeline | `sourceFilter?` |
| `MergeTags` | Merge two tags in the taxonomy | `sourceTagId`, `targetTagId` |
| `RenameTag` | Rename a tag | `tagId`, `newName` |
| `DeleteTag` | Delete an unused tag | `tagId` |

#### Scheduling Tools

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `CreateScheduledJob` | Create a scheduled pipeline job | `name`, `cronExpression`, `actionType`, `params` |
| `PauseScheduledJob` | Pause a running schedule | `jobId` |
| `ResumeScheduledJob` | Resume a paused schedule | `jobId` |

#### Analytics Tools

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `SetAnalyticsDateRange` | Change the date range filter | `range: '7D' | '30D' | '90D' | 'YTD' | 'All'` |
| `DrillDownChart` | Open drill-down for a specific chart | `chartName` |
| `SwitchAnalyticsTab` | Switch to a specific analytics tab | `tab: 'overview' | 'tags' | 'sources' | 'pipeline' | 'quality'` |

#### Search Tools

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `RunKnowledgeSearch` | Execute a search query | `query`, `entityFilter?`, `minScore?` |
| `RefineSearch` | Add filters to current search | `tags?`, `entityNames?`, `dateRange?` |

#### Navigation Tools (already exist)

| Tool Name | Description |
|-----------|-------------|
| `SwitchDashboardTab` | Switch active dashboard tab |
| `NavigateToRecord` | Open entity record |
| `ShowSearchResults` | Navigate to search with query |

### Tool Registration Strategy

**Metadata tools** (persist across sessions, admin-controlled):
- All CRUD operations (create source, create type, merge tags)
- Pipeline triggers (run autotag, run vector sync)
- These are linked to the Sage agent via `MJ: AI Agent Client Tools` junction

**Ephemeral tools** (registered per-app at runtime):
- Dashboard state manipulation (date range, drill-down, tab switching)
- These are registered in each resource component's `ngAfterViewInit`

```typescript
// In AutotaggingPipelineResourceComponent
ngAfterViewInit(): void {
    this.RegisterEphemeralTools();
}

private RegisterEphemeralTools(): void {
    const agentClient = inject(AgentClientService);

    agentClient.RegisterTool({
        Name: 'SwitchAutotagTab',
        Description: 'Switch to a specific tab in the autotagging dashboard',
        InputSchema: {
            type: 'object',
            properties: {
                tab: { type: 'string', enum: ['pipeline', 'sources', 'types', 'tags', 'history', 'taxonomy'] }
            },
            required: ['tab']
        },
        Handler: async (params) => {
            this.SwitchTab(params.tab as TabName);
            this.cdr.detectChanges();
            return { success: true, message: `Switched to ${params.tab} tab` };
        }
    });
}
```

---

## Layer 3: Contextual Awareness

### How the Agent "Sees" What the User Sees

When the user is on the Analytics Overview tab with a 30-day filter, the agent's system prompt includes:

```
## Current Application Context

The user is currently using the **Knowledge Hub** application.
They are viewing the **Analytics** tab, specifically the **Overview** sub-view.

### Dashboard State
- Date Range: Last 30 days
- Entity Filter: All entities
- Key Metrics:
  - Total Tags: 342 (+18 this week)
  - Items Processed: 4,821
  - Average Confidence: 0.78
  - Content Coverage: 68%
- Drill-Down Active: Tag Growth chart (showing monthly trend)

### Available Actions
You can help the user by:
- Changing the date range or entity filter
- Drilling into specific charts for more detail
- Switching to the Tags, Sources, Pipeline, or Quality tabs
- Running a search to find specific content
- Setting up scheduled pipelines for automation
```

### Dynamic Context Updates

When the user interacts with the dashboard (clicks a chart, changes a filter, switches tabs), the context is updated in real-time:

```typescript
// In the resource component
private OnStateChanged(): void {
    const context = this.BuildDashboardContext();
    this.ContextChanged.emit(context);
    // Flows up to chat overlay, which updates the agent's context
}
```

The agent can then proactively respond:

> **User clicks the low-confidence tags chart**
> **Agent**: "I see you're looking at 23 tags with confidence below 0.4. The most common pattern is single-word generic tags like 'data' and 'report' — these tend to get low scores because they're too broad. Want me to find and merge the most generic ones into more specific taxonomy branches?"

---

## Example Conversations

### Setting Up a New Content Source

**User**: "I want to autotag our Products entity"

**Agent**: "I'll set that up for you. Let me check if Products has an Entity Document configured..."

*Agent calls `NavigateToApp` → Knowledge Hub → Autotagging*
*Agent reads AppContext, sees available EntityDocuments*

**Agent**: "Products has an Entity Document called 'Products - classification' with a vectorization template. I'll create a Content Source using it."

*Agent calls `CreateContentSource`:*
```json
{
    "name": "Products Autotagging",
    "sourceType": "Entity",
    "contentTypeId": "...",
    "entityId": "...",
    "entityDocId": "..."
}
```

**Agent**: "Done! I've created the 'Products Autotagging' content source. Want me to run the pipeline now to start tagging?"

### Analyzing Tag Quality

**User**: "Why is our tag quality score dropping?"

*Agent reads AppContext — sees Analytics tab with Quality data*

**Agent**: "Looking at your quality metrics, the average confidence dropped from 0.82 to 0.78 over the last 30 days. The main driver is the RSS Feed source — it's generating tags with an average weight of 0.42, well below your other sources (Entity Records: 0.81, Websites: 0.73)."

*Agent calls `DrillDownChart` on Source Performance*

**Agent**: "The RSS feeds are bringing in content that's harder to tag accurately — many articles are just summaries without enough context. I'd suggest either:
1. Enabling full-text extraction for RSS (I can update the configuration)
2. Increasing the minimum tag weight threshold for RSS sources
3. Pausing the low-quality feeds and focusing on entity records

Which approach would you prefer?"

---

## Implementation Phases

### Phase 1: Context Injection (Low effort, high value)
- Add `BuildDashboardContext()` to each KH resource component
- Wire context through `@Output()` to explorer-app
- Agent immediately gains awareness of user's view

### Phase 2: Dashboard Navigation Tools (Medium effort)
- Register ephemeral tools for tab switching, filter changes, drill-down
- Agent can guide users through the UI
- No data mutation — read-only navigation

### Phase 3: CRUD Tools (Medium-high effort)
- Define metadata tools for content source/type creation, tag management
- Implement handlers that call `Metadata().GetEntityObject()` + Save
- Agent can set up configurations through conversation

### Phase 4: Pipeline & Scheduling Tools (Medium effort)
- Tools for triggering pipelines, creating schedules
- Build on existing GraphQL mutations (RunPipeline, CreateScheduledJob)
- Agent can automate recurring tasks

### Phase 5: Proactive Insights (High effort, highest value)
- Agent monitors context changes and proactively offers analysis
- Pattern detection: "Your tag quality dropped 5% this week"
- Recommendations: "3 new orphaned tags were created — want me to assign parents?"

---

## Security Considerations

- All CRUD tools respect MJ's entity-level permissions via `contextUser`
- Pipeline triggers go through the same authorization as manual triggers
- Ephemeral tools are sandboxed to the current browser session
- Tool execution is audited via the existing `MJ: AI Agent Run Steps` entity
- Admin can disable specific tools per-agent via the `MJ: AI Agent Client Tools` junction
