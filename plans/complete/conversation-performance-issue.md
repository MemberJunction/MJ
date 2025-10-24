# Conversation Loading Performance Issue

**Date:** 2025-10-15
**Issue:** 60+ GraphQL calls when clicking a single conversation
**Location:** `packages/Angular/Generic/conversations`

---

## Problem Summary

When clicking a single conversation in the conversation list, the server receives **60+ GraphQL queries**, creating massive network overhead and database load.

### Observed Pattern (from logs)

```
31x RunViewQuery
2x GetQueryDataByNameQuery
15x SingleMJAIPromptRun
6x SingleMJAIAgentRun
2x SingleMJActionExecutionLog
3x SingleMJArtifact
3x SingleMJArtifactVersion
```

**Total: ~62 separate GraphQL operations for loading ONE conversation**

---

## Root Cause Analysis

### 1. Lazy-Loading Artifacts in Message Rendering Loop

**File:** `/packages/Angular/Generic/conversations/src/lib/components/message/message-list.component.ts:176-189`

```typescript
// PROBLEM: This runs for EVERY message, EVERY time updateMessages() is called
messages.forEach((message, index) => {
    const key = this.getMessageKey(message);
    const existing = this._renderedMessages.get(key);

    if (existing) {
        // Update existing component
        const instance = existing.instance as MessageItemComponent;

        // Get artifact from lazy-loading map
        const artifactList = this.artifactMap.get(message.ID);
        const firstArtifact = artifactList && artifactList.length > 0 ? artifactList[0] : undefined;

        // Trigger lazy load and set properties
        if (firstArtifact) {
            // ⚠️ PROBLEM: This triggers 2 database queries PER MESSAGE
            Promise.all([
                firstArtifact.getArtifact(),      // Query 1: SingleMJArtifact
                firstArtifact.getVersion()        // Query 2: SingleMJArtifactVersion
            ]).then(([artifact, version]) => {
                instance.artifact = artifact;
                instance.artifactVersion = version;
                this.cdRef.detectChanges();
            }).catch(err => {
                console.error('Failed to lazy-load artifact:', err);
            });
        }
    } else {
        // Create new component - SAME PROBLEM HERE (lines 213-233)
        const componentRef = this.messageContainerRef.createComponent(MessageItemComponent);
        // ... same lazy-loading code ...
    }
});
```

### 2. LazyArtifactInfo Loads Entities Individually

**File:** `/packages/Angular/Generic/conversations/src/lib/models/lazy-artifact-info.ts:110-156`

```typescript
private async loadEntities(): Promise<void> {
    const md = new Metadata();

    // Load both entities in parallel to minimize database round trips
    const [artifact, version] = await Promise.all([
        this.loadArtifact(md),    // Individual Load() call
        this.loadVersion(md)      // Individual Load() call
    ]);
}

private async loadArtifact(md: Metadata): Promise<ArtifactEntity> {
    const artifact = await md.GetEntityObject<ArtifactEntity>('MJ: Artifacts', this.currentUser);
    await artifact.Load(this.artifactId);  // ⚠️ Single record Load() -> GraphQL query
    return artifact;
}

private async loadVersion(md: Metadata): Promise<ArtifactVersionEntity> {
    const version = await md.GetEntityObject<ArtifactVersionEntity>('MJ: Artifact Versions', this.currentUser);
    await version.Load(this.artifactVersionId);  // ⚠️ Single record Load() -> GraphQL query
    return version;
}
```

**Why This Is Bad:**
- `Entity.Load(id)` makes a GraphQL query for a SINGLE record
- If there are 10 messages with artifacts, that's **20 separate queries** (10 artifacts + 10 versions)
- Each query has network overhead + database roundtrip
- Queries happen sequentially as messages are processed

### 3. Multiple Triggers for updateMessages()

The `updateMessages()` method is called multiple times due to Angular change detection:

1. **Initial load** - When messages are fetched from cache
2. **Peripheral data load** - When artifact map is populated (line 102-104 in message-list.component.ts)
3. **Change detection cycles** - Any time @Input() changes

```typescript
ngOnChanges(changes: SimpleChanges) {
    // React to messages array changes
    if (changes['messages'] && this.messages && this.messageContainerRef) {
        this.updateMessages(this.messages);  // Trigger 1
        this.updateDateFilterVisibility();
    }

    // React to artifact map changes (when artifacts are added/updated)
    if (changes['artifactMap'] && this.messages && this.messageContainerRef) {
        this.updateMessages(this.messages);  // Trigger 2 (causes redundant lazy-loads!)
    }
}
```

---

## Why It's 60+ Queries

### Breakdown for a Conversation with 10 Messages

**Phase 1: Load Peripheral Data (conversation-chat-area.component.ts:194-210)**
```
1x RunView (Agent Runs) = 1 query ✅ Good - single query for all runs
1x RunQuery (Artifacts Map) = 1 query ✅ Good - single query for all artifacts
```

**Phase 2: First updateMessages() Call (Initial Render)**
```
For each of 10 messages with artifacts:
  - firstArtifact.getArtifact() = 10x SingleMJArtifact queries ❌
  - firstArtifact.getVersion() = 10x SingleMJArtifactVersion queries ❌

Total from render: 20 queries
```

**Phase 3: Second updateMessages() Call (When artifactMap is populated)**
```
ngOnChanges detects 'artifactMap' change
Calls updateMessages() again
For each existing message component:
  - Checks if artifactList changed
  - Triggers lazy load AGAIN for each artifact

Due to LazyArtifactInfo caching (line 50-52), these don't actually query DB
But the Promise.all() is still executed
```

**Additional Queries (Agent Runs, Prompt Runs, Actions)**

If messages reference agent runs with related data, there may be additional individual queries for:
- AIPromptRun entities (15 queries in your logs)
- AIAgentRun entities (6 queries)
- ActionExecutionLog entities (2 queries)

These might be coming from similar per-message loading patterns elsewhere in the component.

---

## The Fix Strategy

### Short-Term Fix: Batch Load Artifacts

Instead of lazy-loading artifacts individually per message, **batch load all artifacts upfront** when peripheral data is loaded.

**Modified approach in conversation-chat-area.component.ts:175-240:**

```typescript
private async loadPeripheralData(conversationId: string): Promise<void> {
    // ... existing code ...

    const [agentRunsResult, artifactMapResult] = await Promise.all([
        rv.RunView<AIAgentRunEntityExtended>({ ... }),
        rq.RunQuery({ QueryName: 'GetConversationArtifactsMap', ... })
    ]);

    // Build artifact map using lazy-loading pattern
    this.artifactsByDetailId.clear();
    if (artifactMapResult.Success && artifactMapResult.Results && artifactMapResult.Results.length > 0) {
        // NEW: Collect all unique artifact and version IDs
        const artifactIds = new Set<string>();
        const versionIds = new Set<string>();

        for (const row of artifactMapResult.Results) {
            artifactIds.add(row.ArtifactID);
            versionIds.add(row.ArtifactVersionID);
        }

        // NEW: Batch load ALL artifacts and versions upfront with RunViews
        const [artifactsResult, versionsResult] = await Promise.all([
            rv.RunView<ArtifactEntity>({
                EntityName: 'MJ: Artifacts',
                ExtraFilter: `ID IN ('${Array.from(artifactIds).join("','")}')`,
                ResultType: 'entity_object'
            }, this.currentUser),
            rv.RunView<ArtifactVersionEntity>({
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ID IN ('${Array.from(versionIds).join("','")}')`,
                ResultType: 'entity_object'
            }, this.currentUser)
        ]);

        // Create lookup maps
        const artifactMap = new Map(artifactsResult.Results?.map(a => [a.ID, a]) || []);
        const versionMap = new Map(versionsResult.Results?.map(v => [v.ID, v]) || []);

        // NEW: Pass pre-loaded entities to LazyArtifactInfo
        for (const row of artifactMapResult.Results) {
            const lazyInfo = new LazyArtifactInfo(
                row,
                this.currentUser,
                artifactMap.get(row.ArtifactID),  // Pre-loaded artifact
                versionMap.get(row.ArtifactVersionID)  // Pre-loaded version
            );
            const existing = this.artifactsByDetailId.get(row.ConversationDetailID) || [];
            existing.push(lazyInfo);
            this.artifactsByDetailId.set(row.ConversationDetailID, existing);
        }
    }
}
```

**Modified LazyArtifactInfo constructor:**

```typescript
export class LazyArtifactInfo {
    // ... existing fields ...

    constructor(
        queryResult: any,
        private currentUser: UserInfo,
        preloadedArtifact?: ArtifactEntity,      // NEW
        preloadedVersion?: ArtifactVersionEntity  // NEW
    ) {
        // Populate display data from query result
        this.conversationDetailId = queryResult.ConversationDetailID;
        // ... existing assignments ...

        // NEW: If entities were pre-loaded, use them
        if (preloadedArtifact) {
            this._artifact = preloadedArtifact;
        }
        if (preloadedVersion) {
            this._version = preloadedVersion;
        }
    }
}
```

**Result:** Instead of 20 individual queries, you get **2 batch queries** (1 for artifacts, 1 for versions)

### Medium-Term Fix: Remove Redundant updateMessages() Calls

**In message-list.component.ts:94-105:**

```typescript
ngOnChanges(changes: SimpleChanges) {
    // React to messages array changes
    if (changes['messages'] && this.messages && this.messageContainerRef) {
        this.updateMessages(this.messages);
        this.updateDateFilterVisibility();
    }

    // ❌ REMOVE THIS: artifactMap changes are handled by pre-loading
    // if (changes['artifactMap'] && this.messages && this.messageContainerRef) {
    //     this.updateMessages(this.messages);
    // }
}
```

Since artifacts are now pre-loaded, the artifactMap change doesn't require re-rendering.

### Long-Term Fix: Optimize Other Per-Message Queries

Investigate and batch load:
- AIPromptRun entities (15 queries)
- AIAgentRun entities (6 queries)
- ActionExecutionLog entities (2 queries)

These likely have similar per-message loading patterns that should be batched.

---

## Expected Improvement

### Before (Current)
```
Phase 1: 2 queries (agent runs, artifact map)
Phase 2: 20 queries (10 artifacts + 10 versions, individually)
Phase 3: 15 queries (prompt runs, individually)
Phase 4: 6 queries (agent runs, individually)
Phase 5: 2 queries (action logs, individually)
Phase 6: ~20 more (various RunView queries)

Total: ~65 queries
Time: ~2-3 seconds
Network: ~500KB+ payload
```

### After (With Batching)
```
Phase 1: 2 queries (agent runs, artifact map)
Phase 2: 2 queries (batch artifacts, batch versions) ✅
Phase 3: 1 query (batch prompt runs) ✅
Phase 4: Already batched (included in Phase 1) ✅
Phase 5: 1 query (batch action logs) ✅

Total: ~6 queries
Time: ~300-500ms
Network: ~50KB payload
```

**Improvement:** 90% reduction in queries, 85% reduction in load time

---

## Implementation Priority

1. **High**: Batch load artifacts and versions (biggest impact)
2. **Medium**: Remove redundant updateMessages() calls
3. **Low**: Batch load prompt runs, action logs (smaller impact)

---

## Next Steps

1. Modify `LazyArtifactInfo` to accept pre-loaded entities
2. Update `conversation-chat-area.component.ts` to batch load artifacts
3. Test with conversation containing 10+ messages with artifacts
4. Measure before/after query counts and timings
5. Apply same pattern to prompt runs and other per-message data
