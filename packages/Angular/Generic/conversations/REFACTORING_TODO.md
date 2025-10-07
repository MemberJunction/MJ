# Conversations Package Refactoring TODO

## Completed ✅
1. **Simplified ConversationStateService** - Removed complex observables, now uses simple arrays with Angular change detection
2. **Updated ConversationListComponent** - Now binds directly to `conversationState.filteredConversations` and `conversationState.activeConversationId`

## In Progress 🔄

### 1. Update ConversationChatAreaComponent
**File**: `conversation-chat-area.component.ts`

**Changes Needed**:
- Remove Observable subscriptions (`activeConversation$`, `activeThreadId$`)
- Add `DoCheck` lifecycle hook to detect conversation ID changes
- Use direct property binding: `conversationState.activeConversation`
- Simplify the conversation change detection logic
- Remove `destroy$` Subject and `takeUntil` since no more subscriptions

**Key Logic**:
```typescript
// Replace subscription with ngDoCheck
private previousConversationId: string | null = null;

ngDoCheck() {
  const currentId = this.conversationState.activeConversationId;
  if (currentId !== this.previousConversationId) {
    this.previousConversationId = currentId;
    this.onConversationChanged(currentId);
  }
}

async onConversationChanged(conversationId: string | null) {
  if (conversationId) {
    await this.loadMessages(conversationId);
    await this.restoreActiveTasks(conversationId);
    this.agentStateService.startPolling(this.currentUser, conversationId);
  } else {
    this.messages = [];
    this.activeTasks.clear();
  }
}
```

### 2. Populate AgentID in ConversationDetail Records
**File**: `message-input.component.ts`

**Changes Needed**:
- When creating AI message responses, set `agentMessage.AgentID = result.agentRun.AgentID`
- This provides denormalized fast lookup (no need for AgentRun join)

**Location**: `handleAgentResponse()` method around line 315-320

### 3. Remove Old Agent Enrichment Code
**File**: `conversation-chat-area.component.ts`

**Changes Needed**:
- Delete `enrichMessagesWithAgentInfo()` method (lines 452-488)
- Remove call to `enrichMessagesWithAgentInfo()` in `loadMessages()` (line 445)
- This is now unnecessary since AgentID is stored directly on ConversationDetail

### 4. Update Message Item Component for AgentID
**File**: `message-item.component.ts`

**Changes Needed**:
- Update `aiAgentInfo` getter to use `this.message.AgentID` (no longer needs `(as any)`)
- Simplify the logic since AgentID is now a proper field

**Current Logic** (line 107-108):
```typescript
// Get agent ID from enriched property (populated by looking up AgentRun)
const agentID = (this.message as any).AgentID;
```

**New Logic**:
```typescript
// Get agent ID from denormalized field
const agentID = this.message.AgentID;
```

### 5. Update Artifact Creation to Use ConversationDetailArtifact M2M
**File**: `message-input.component.ts`

**Changes Needed**:
- Import `ConversationDetailArtifactEntity`
- After creating artifact version, create ConversationDetailArtifact junction record
- Set `Direction` to 'Output'

**Location**: `createArtifactFromPayload()` method around line 378-393

**New Code**:
```typescript
const versionSaved = await version.Save();
if (!versionSaved) {
  console.error('Failed to save artifact version');
  return;
}

// Create M2M relationship
const junction = await md.GetEntityObject<ConversationDetailArtifactEntity>(
  'MJ: Conversation Detail Artifacts',
  this.currentUser
);
junction.ConversationDetailID = message.ID;
junction.ArtifactVersionID = version.ID;
junction.Direction = 'Output';
await junction.Save();
```

### 6. Update Artifact Loading in Message Item
**File**: `message-item.component.ts`

**Changes Needed**:
- Add logic to load artifacts via ConversationDetailArtifact junction table
- Load artifact versions where `ConversationDetailID = message.ID AND Direction = 'Output'`
- Update `hasArtifact` getter to check for junction records

### 7. Enhance Artifact Cards Styling
**File**: `message-item.component.html` and `message-item.component.css`

**Current State**: Basic artifact card exists (lines 25-46 in HTML, lines 92-184 in CSS)

**Enhancement Needed**:
- Make cards more visually appealing like claude.ai
- Add artifact type icon based on artifact type
- Show artifact name/description
- Add animation on hover
- Support multiple artifacts per message (array of artifacts)

### 8. Update Workspace Component
**File**: `conversation-workspace.component.ts`

**Changes Needed**:
- Remove Observable subscriptions
- Use direct binding to `conversationState.activeConversation`
- Simplify state management

## Schema Changes Applied ✅
1. Added `AgentID` to ConversationDetail table (nullable, FK to AIAgent)
2. Created `ConversationDetailArtifact` table with M2M relationship
3. Added `ContentHash` to ArtifactVersion table
4. Removed old `ConversationDetailID` from ArtifactVersion (migration rollback needed if it was added)

## Testing Checklist
- [ ] Conversation list updates immediately when renamed (no reload/flicker)
- [ ] Active conversation stays selected after auto-naming first message
- [ ] Agent names and icons display correctly in messages
- [ ] Artifacts display as styled cards below messages
- [ ] Multiple artifacts per message supported
- [ ] Clicking artifact card opens artifact viewer panel
- [ ] Search works correctly with direct binding
- [ ] Pin/unpin works without losing selection
- [ ] Creating new conversation activates it immediately
