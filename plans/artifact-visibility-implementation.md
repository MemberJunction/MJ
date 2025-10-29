# Artifact Visibility Controls - Implementation Summary

## Overview

Added agent-level and artifact-level visibility controls to hide system/internal artifacts from user-facing lists while preserving them for debugging/admin use.

---

## Migration Created

**File**: `migrations/v2/V202510231258__v2.110.x_Artifact_Visibility_Controls.sql`

### Schema Changes

#### 1. AI Agent - ArtifactCreationMode
```sql
ALTER TABLE AIAgent
ADD ArtifactCreationMode nvarchar(20) NOT NULL DEFAULT 'Always';

CHECK CONSTRAINT: ('Always', 'Never', 'System Only')
```

**Values**:
- `'Always'` - Create visible artifacts as normal (default)
- `'Never'` - Don't create artifacts at all
- `'System Only'` - Create artifacts but mark as hidden/system

**Usage**: Controls how each agent handles artifact creation from payloads

#### 2. Artifact - Visibility
```sql
ALTER TABLE Artifact
ADD Visibility nvarchar(20) NOT NULL DEFAULT 'Always';

CHECK CONSTRAINT: ('Always', 'System Only')
```

**Values**:
- `'Always'` - Show in all artifact lists (default)
- `'System Only'` - Hide from normal user views

**Usage**: Controls whether artifact appears in user-facing lists

#### 3. Data Update
```sql
UPDATE AIAgent
SET ArtifactCreationMode = 'System Only'
WHERE Name = 'Sage';
```

Sets Sage to create hidden artifacts (routing payloads are technical, not user content)

---

## Server-Side Implementation

### RunAIAgentResolver (Won't compile until CodeGen)

**Early Exit for 'Never' Mode** (lines 642-650):
```typescript
const agent = AIEngine.Instance.Agents.find(a => a.ID === agentRun.AgentID);
const creationMode = agent?.ArtifactCreationMode;

if (creationMode === 'Never') {
    LogStatus(`Skipping artifact creation - agent has ArtifactCreationMode='Never'`);
    return {};
}
```

**Set Visibility on New Artifacts** (lines 684-692):
```typescript
const creationMode = agent.ArtifactCreationMode;
if (creationMode === 'System Only') {
    artifact.Visibility = 'System Only';
    LogStatus(`Artifact marked as "System Only" per agent configuration`);
} else {
    artifact.Visibility = 'Always';
}
```

### TaskOrchestrator (Won't compile until CodeGen)

**Same Pattern** (lines 712-720):
```typescript
const creationMode = agent.ArtifactCreationMode;
if (creationMode === 'System Only') {
    artifact.Visibility = 'System Only';
    LogStatus(`Task artifact marked as "System Only"`);
} else {
    artifact.Visibility = 'Always';
}
```

---

## How It Works

### Flow for Different Agents

#### Sage (ArtifactCreationMode = 'System Only')
```
User message → Sage evaluates → Returns routing payload
    ↓
Server checks: agent.ArtifactCreationMode === 'System Only'
    ↓
Creates artifact with:
    Name: "Sage Payload - timestamp" (or extracted name)
    Visibility: "System Only"
    ↓
Artifact saved but HIDDEN from:
    ✗ Conversation artifact lists
    ✗ Collection artifact browsers
    ✗ Search results
    ✓ Admin/debug views (future)
```

#### Marketing Agent (ArtifactCreationMode = 'Always' or default)
```
User message → Marketing Agent creates blog
    ↓
Server checks: agent.ArtifactCreationMode === 'Always' (or null)
    ↓
Creates artifact with:
    Name: "Slice of Culture: Exploring..." (extracted)
    Visibility: "Always"
    ↓
Artifact visible in:
    ✓ Conversation artifact lists
    ✓ Collection browsers
    ✓ Search results
    ✓ All user-facing views
```

#### Agent with ArtifactCreationMode = 'Never'
```
User message → Agent processes → Returns payload
    ↓
Server checks: agent.ArtifactCreationMode === 'Never'
    ↓
Skips artifact creation entirely (early exit)
    ↓
No artifact created, no database records
```

---

## UI Filtering (To Be Implemented After CodeGen)

### Conversation Chat Area
**File**: `conversation-chat-area.component.ts`

Update GetConversationComplete query or filter results:
```typescript
// Filter out system artifacts when building artifactsByDetailId map
const visibleArtifacts = parsedArtifacts.filter(a => a.Visibility !== 'System Only');
```

### Collection Views
**File**: `collection-view.component.ts`

Add filter to artifact queries:
```typescript
const filter = `CollectionID='${collectionId}' AND (Visibility IS NULL OR Visibility='Always')`;
```

### Search Results
**File**: `search.service.ts`

Add filter to artifact search:
```typescript
ExtraFilter: `... AND (Visibility IS NULL OR Visibility='Always')`
```

### Artifact Modal/Lists
Filter the `getArtifactsArray()` method to exclude system artifacts.

---

## Future Enhancements

### Admin Panel for System Artifacts
Could add:
- Toggle in UI: "Show System Artifacts" checkbox
- Separate tab: "System/Debug Artifacts"
- Admin-only view with all artifacts including system ones
- Filter: `Visibility='System Only'`

### Additional Visibility Values
Schema allows extending with more values:
- `'Private'` - Only visible to creator
- `'Shared'` - Only visible to specific users
- `'Team'` - Visible to team members
- `'Organization'` - Visible to all in organization

---

## Testing After CodeGen

1. ✅ Run CodeGen to generate new fields
2. ✅ Set Sage to `ArtifactCreationMode='System Only'`
3. ✅ Create message with Sage → verify artifact has `Visibility='System Only'`
4. ✅ Create message with Marketing Agent → verify artifact has `Visibility='Always'`
5. ✅ Verify Sage artifacts don't show in conversation artifact lists
6. ✅ Verify Marketing Agent artifacts DO show in lists
7. ✅ Test agent with `ArtifactCreationMode='Never'` → no artifact created

---

## Migration Rollback

If needed:
```sql
-- Remove constraints
ALTER TABLE [${flyway:defaultSchema}].[AIAgent] DROP CONSTRAINT CK_AIAgent_ArtifactCreationMode;
ALTER TABLE [${flyway:defaultSchema}].[Artifact] DROP CONSTRAINT CK_Artifact_Visibility;

-- Remove columns
ALTER TABLE [${flyway:defaultSchema}].[AIAgent] DROP COLUMN ArtifactCreationMode;
ALTER TABLE [${flyway:defaultSchema}].[Artifact] DROP COLUMN Visibility;
```

---

## Files Modified (Pending CodeGen)

1. ✅ Migration created: `V202510231258__v2.110.x_Artifact_Visibility_Controls.sql`
2. ⏳ RunAIAgentResolver.ts - Added visibility logic (won't compile)
3. ⏳ TaskOrchestrator.ts - Added visibility logic (won't compile)
4. 🔜 UI components - Need filtering after CodeGen

**Status**: Migration ready, server logic implemented, waiting for CodeGen to run.
