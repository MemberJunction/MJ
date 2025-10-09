# Conversation Component Improvements Proposal

## Issue 1: Race Conditions with Progress Updates

### Problem
The Conversation Manager delegation message shows "👉 Delegating to **Agent**" briefly, then gets overwritten back to "Analyzing response..." by progress callbacks. This happens even though we:
1. Set Status = 'Complete'
2. Check Status === 'Complete' in progress callback
3. Save the record

### Root Cause Analysis

**The progress callback receives a stale entity reference:**

```typescript
// Line 527 - Pass entity directly to callback
this.createProgressCallback(conversationManagerMessage, 'Conversation Manager')

// Line 430 - Callback signature
private createProgressCallback(
  conversationDetail: ConversationDetailEntity,  // ❌ STALE REFERENCE
  agentName: string
): AgentExecutionProgressCallback
```

**Timeline of the race:**
1. `conversationManagerMessage.Status = 'Complete'` (in memory)
2. `await conversationManagerMessage.Save()` (starts async DB write)
3. Progress callback fires with CLOSURE REFERENCE to old entity
4. Callback checks `conversationDetail.Status` - sees 'Complete' from step 1 ✅
5. BUT callback has the SAME object reference, so it CAN modify it
6. Callback sets `conversationDetail.Message = progressText`
7. Callback calls `conversationDetail.Save()` - overwrites the delegation message!

**Why DataCache doesn't help here:**
The callback closure captures the entity object BEFORE it's marked complete. Even though the cache has the right instance, the callback already has a reference to that same instance.

### Proposed Solution

**Guardrail Pattern:** Never allow writes to completed/errored messages

#### Option A: Check Status Before Every Save (Recommended)

Add a guard method that ALL code must use before saving ConversationDetail:

```typescript
/**
 * Safe save for ConversationDetail - prevents overwrites of completed/errored messages
 * @returns true if saved, false if blocked
 */
private async safeS aveConversationDetail(
  detail: ConversationDetailEntity,
  context: string
): Promise<boolean> {
  // Never modify completed or errored messages
  if (detail.Status === 'Complete' || detail.Status === 'Error') {
    console.log(`[${context}] 🛡️ Blocked save - message is ${detail.Status}`);
    return false;
  }

  await detail.Save();
  return true;
}
```

**Changes Required:**
1. Replace ALL `conversationDetail.Save()` calls in progress-related code with `safeS aveConversationDetail()`
2. Keep direct `Save()` for intentional updates (user edits, etc.)

**Locations to update:**
- Line 465: Progress callback - use `safeS aveConversationDetail(detail, agentName)`
- Line 167: `updateTaskExecutionMessages` - use `safeS aveConversationDetail(message, 'TaskProgress')`
- Any other progress update paths

#### Option B: Check Status in DataCache (More Invasive)

Override `Save()` in DataCache-managed entities to check Status:

```typescript
// In DataCacheService.createConversationDetail()
const detail = await md.GetEntityObject<ConversationDetailEntity>(...);

// Override Save to add guard
const originalSave = detail.Save.bind(detail);
detail.Save = async function() {
  if (this.Status === 'Complete' || this.Status === 'Error') {
    console.warn('🛡️ Blocked save - message is ' + this.Status);
    return true; // Pretend it succeeded
  }
  return await originalSave();
};
```

**Pros:** Automatic protection for ALL saves
**Cons:** Monkey-patching, harder to debug, might block legitimate updates

#### Option C: Immutable Complete Messages (Nuclear Option)

Once Status='Complete', create a NEW entity for any further updates instead of modifying:

```typescript
if (conversationDetail.Status === 'Complete') {
  // Don't modify - create follow-up message instead
  const followUp = await this.dataCache.createConversationDetail(this.currentUser);
  followUp.ConversationID = conversationDetail.ConversationID;
  followUp.ParentID = conversationDetail.ID; // Thread it
  followUp.Message = progressText;
  // ... etc
}
```

**Pros:** Preserves history perfectly
**Cons:** Creates noise, changes UI expectations

### Recommendation: Option A (safeS aveConversationDetail)

**Implementation:**
1. Add `safeS aveConversationDetail()` method to `message-input.component.ts`
2. Replace `Save()` in these specific locations:
   - `createProgressCallback()` (line 465)
   - `updateTaskExecutionMessages()` (line 167)
3. Keep direct `Save()` everywhere else (user actions, initial creation, error handling)

**Locations that should KEEP direct Save():**
- Setting initial Status='In-Progress' (creation)
- User edits (editClicked)
- Explicit Status='Complete' transitions (end of agent run)
- Error handling (Status='Error')

---

## Issue 2: Passing Full Entities to MessageItemComponent

### Problem
`MessageItemComponent` receives only IDs:
- `artifactId?: string`
- `artifactVersionId?: string`
- `artifactVersionNumber?: number`

But `conversation-chat-area.component.ts` already loads:
- Full `ArtifactEntity` objects (line 217-228)
- Full `ArtifactVersionEntity` objects (line 200-207)
- Full `AIAgentRunEntityExtended` objects (line 165-174)

Then we throw away the entities and store only primitive data in maps:

```typescript
// Line 211 - Wasteful!
const versionToArtifact = new Map<string, {
  artifactId: string;        // ❌ We have the full ArtifactEntity!
  artifactName: string;      // ❌ Just artifact.Name
  versionNumber: number      // ❌ Just version.VersionNumber
}>();

// Line 244 - More waste!
this.artifactsByDetailId.set(artifact.ConversationDetailID, {
  artifactId: artifactInfo.artifactId,    // ❌ Primitives only
  versionId: artifact.ArtifactVersionID,
  versionNumber: artifactInfo.versionNumber,
  name: artifactInfo.artifactName
});
```

### Proposed Solution

#### Step 1: Create Type Definitions

```typescript
// In conversation-state.model.ts (or new file: peripheral-data.model.ts)

/**
 * Peripheral data loaded for a conversation detail message
 */
export interface ConversationDetailPeripheralData {
  agentRun?: AIAgentRunEntityExtended;
  artifact?: ArtifactEntity;
  artifactVersion?: ArtifactVersionEntity;
}

/**
 * Type-safe maps for peripheral data
 */
export interface PeripheralDataMaps {
  agentRunsByDetailId: Map<string, AIAgentRunEntityExtended>;
  artifactsByDetailId: Map<string, {
    artifact: ArtifactEntity;
    version: ArtifactVersionEntity;
  }>;
}
```

#### Step 2: Update ConversationChatAreaComponent Properties

```typescript
// Replace current maps:
// OLD
public agentRunsByDetailId = new Map<string, AIAgentRunEntityExtended>(); // ✅ Already good!
public artifactsByDetailId = new Map<string, {artifactId: string; versionId: string; versionNumber: number; name: string}>();

// NEW
public agentRunsByDetailId = new Map<string, AIAgentRunEntityExtended>(); // No change
public artifactsByDetailId = new Map<string, {
  artifact: ArtifactEntity;
  version: ArtifactVersionEntity;
}>();
```

#### Step 3: Update loadPeripheralData to Store Full Entities

```typescript
// In loadPeripheralData() - lines 209-251

// Create entity maps instead of primitive data
const artifactEntities = new Map<string, ArtifactEntity>();
const versionEntities = new Map<string, ArtifactVersionEntity>();

// Store full entities (line 226-228)
if (artifactsResult.Success && artifactsResult.Results) {
  for (const artifact of artifactsResult.Results) {
    artifactEntities.set(artifact.ID, artifact);
  }
}

// Store full version entities (line 232-238)
for (const version of versionsResult.Results) {
  versionEntities.set(version.ID, version);
}

// Build final map with FULL entities (line 241-251)
for (const junctionRecord of conversationDetailArtifacts.Results) {
  const version = versionEntities.get(junctionRecord.ArtifactVersionID);
  const artifact = version ? artifactEntities.get(version.ArtifactID) : undefined;

  if (junctionRecord.ConversationDetailID && version && artifact) {
    this.artifactsByDetailId.set(junctionRecord.ConversationDetailID, {
      artifact: artifact,      // ✅ Full entity
      version: version         // ✅ Full entity
    });
  }
}
```

#### Step 4: Update MessageItemComponent @Input Properties

```typescript
// OLD
@Input() public artifactId?: string;
@Input() public artifactVersionId?: string;
@Input() public artifactVersionNumber?: number;
@Input() public agentRun: AIAgentRunEntityExtended | null = null; // ✅ Already full entity!

// NEW - Match agentRun pattern
@Input() public artifact?: ArtifactEntity;
@Input() public artifactVersion?: ArtifactVersionEntity;
@Input() public agentRun: AIAgentRunEntityExtended | null = null; // No change
```

#### Step 5: Update Template Binding in conversation-chat-area.component.html

```html
<!-- OLD -->
<mj-conversation-message-item
  [artifactId]="artifactsByDetailId.get(message.ID)?.artifactId"
  [artifactVersionId]="artifactsByDetailId.get(message.ID)?.versionId"
  [artifactVersionNumber]="artifactsByDetailId.get(message.ID)?.versionNumber"
  [agentRun]="agentRunsByDetailId.get(message.ID) || null"
  ...
></mj-conversation-message-item>

<!-- NEW -->
<mj-conversation-message-item
  [artifact]="artifactsByDetailId.get(message.ID)?.artifact"
  [artifactVersion]="artifactsByDetailId.get(message.ID)?.version"
  [agentRun]="agentRunsByDetailId.get(message.ID) || null"
  ...
></mj-conversation-message-item>
```

#### Step 6: Update InlineArtifactComponent to Accept Full Entities

Currently `inline-artifact.component.ts` takes:
```typescript
@Input() artifactId!: string;
@Input() versionNumber?: number;
```

Change to:
```typescript
@Input() artifact?: ArtifactEntity;          // Full entity
@Input() artifactVersion?: ArtifactVersionEntity;  // Full entity

// Backward compatibility (deprecated)
@Input() artifactId?: string;
@Input() versionNumber?: number;
```

Then update `loadArtifact()`:
```typescript
private async loadArtifact(): Promise<void> {
  // If full entities provided, use them directly
  if (this.artifact && this.artifactVersion) {
    this.currentVersion = this.artifactVersion;
    this.generatePreview();
    this.loading = false;
    return;
  }

  // Otherwise fall back to loading by ID (backward compat)
  if (!this.artifactId) {
    this.error = true;
    this.loading = false;
    return;
  }

  // ... existing loading code
}
```

### Benefits

1. **Type Safety:** Full entity types instead of anonymous objects
2. **No Redundant Loads:** Components use already-loaded entities
3. **Richer Data:** Access to ALL entity properties (timestamps, user IDs, etc.)
4. **Better IntelliSense:** TypeScript knows the full entity structure
5. **Consistency:** Matches existing `agentRun` pattern
6. **Future-Proof:** Easy to add more entity types (users, tags, etc.)
7. **Cleaner Code:** No more `artifactInfo.artifactName` - just `artifact.Name`

### Migration Path

1. ✅ Add type definitions (new file, no breaking changes)
2. ✅ Update `artifactsByDetailId` map type
3. ✅ Update `loadPeripheralData()` to store entities
4. ✅ Add new `@Input()` properties to `MessageItemComponent` (keep old ones for now)
5. ✅ Update template bindings
6. ✅ Update `InlineArtifactComponent` to accept entities
7. ✅ Deprecate old ID-based properties (comment as deprecated)
8. 🔄 Remove deprecated properties in next major version

### Example Usage After Changes

```typescript
// In MessageItemComponent template
@if (artifact && artifactVersion) {
  <mj-inline-artifact
    [artifact]="artifact"
    [artifactVersion]="artifactVersion"
    [currentUser]="currentUser"
  />
}

// Now inline-artifact can use:
// - artifact.Name, artifact.Description, artifact.Type
// - artifactVersion.Name, artifactVersion.Description, artifactVersion.Content
// - No loading needed - instant render!
```

---

## Summary

### Issue 1 Fix: Prevent progress updates from overwriting completed messages
- Add `safeS aveConversationDetail()` guard method
- Use it in progress callbacks and task update methods
- Keep direct `Save()` for intentional user actions

### Issue 2 Fix: Pass full entities instead of IDs
- Create proper type definitions for peripheral data
- Store full `ArtifactEntity` and `ArtifactVersionEntity` in maps
- Update `MessageItemComponent` to receive entities
- Update `InlineArtifactComponent` to skip loading when entities provided
- Massive performance win + cleaner code

Both changes are backward compatible and can be implemented incrementally.
