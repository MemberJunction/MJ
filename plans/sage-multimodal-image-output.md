# Plan: Enable Sage Multi-Modal Image Output

## Summary

Enable Sage agent to support image OUTPUT (generation) capabilities, complementing its existing image INPUT support. This plan documents the implementation, design analysis, bugs found, and fixes applied.

---

## PR #1748 Original Design Intent

From PR #1748 analysis, the original design was based on **explicit promotion**:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ORIGINAL DESIGN (PR #1748)                                                      │
│                                                                                  │
│  Generate Image Action                                                           │
│       ↓                                                                          │
│  Agent calls promoteMediaOutputs([{modality, mimeType, data, label}])           │
│       ↓                                                                          │
│  Framework saves to AIAgentRunMedia                                              │
│       ↓                                                                          │
│  Framework creates ConversationDetailAttachment                                  │
│       ↓                                                                          │
│  UI displays image via attachment                                                │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Key Design Principles:**
1. **Explicit Promotion**: Agents deliberately choose which media to expose via `promoteMediaOutputs()`
2. **AIAgentRunMedia**: Stores promoted media (not all generated media)
3. **ConversationDetailAttachment**: UI display mechanism, created from AIAgentRunMedia
4. **AIPromptRunMedia**: Complete audit trail of ALL media generated during prompts

**The Gap**: LoopAgent's LLM response format doesn't have `promoteMediaOutputs` field, so LLMs can't request promotion through their JSON response.

---

## What We Added: Placeholder Pattern

To solve **token overflow** (base64 = ~700K tokens per image), we added:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PLACEHOLDER PATTERN (Post PR #1748)                                             │
│                                                                                  │
│  Generate Image Action returns base64 (~700K tokens)                             │
│       ↓                                                                          │
│  interceptLargeBinaryContent():                                                  │
│       • Stores in _mediaOutputs with refId, persist=false                        │
│       • Replaces base64 with ${media:xxx} placeholder (~30 tokens)               │
│       ↓                                                                          │
│  LLM sees small placeholder in context (SAVES TOKENS!)                           │
│       ↓                                                                          │
│  finalizeAgentRun() resolves placeholders back to base64                        │
│       ↓                                                                          │
│  AgentRunner saves media where persist !== false                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

The `persist` flag replaced explicit `promoteMediaOutputs()` calls for intercepted media:
- `persist=false`: Intercepted but not yet "used" - don't save
- `persist=true`: Used in output - save to AIAgentRunMedia

---

## The Two Agent Types: Critical Difference

### Artifact Agents (Research Report Writer)

| Aspect | Value |
|--------|-------|
| **Primary Output** | HTML artifact in `payload` |
| **How Image Displays** | Embedded directly in HTML: `<img src="data:image/png;base64,...">` |
| **AIAgentRunMedia Needed?** | **NO** - image IS in the artifact content |
| **ConversationDetailAttachment Needed?** | **NO** - artifact displays the image |
| **How persist=true Gets Set** | `resolveMediaPlaceholdersInString()` sets it when embedding in payload |

**Flow:**
1. LLM generates payload HTML with `<img src="${media:xxx}">`
2. `resolveMediaPlaceholdersInPayload()` → replaces with `data:image/png;base64,...`
3. Final artifact HTML contains the embedded image
4. User sees image in the artifact viewer
5. No need for separate media records - image is IN the artifact

### Conversational Agents (Sage)

| Aspect | Value |
|--------|-------|
| **Primary Output** | Text `message` |
| **How Image Displays** | ConversationDetailAttachment (separate from message) |
| **AIAgentRunMedia Needed?** | **YES** - stores the image data |
| **ConversationDetailAttachment Needed?** | **YES** - this is how user sees the image |
| **How persist=true Gets Set** | `processMessageMediaPlaceholders()` finds placeholder in message |

**Flow:**
1. LLM generates message with `<img src="${media:xxx}">`
2. `processMessageMediaPlaceholders()` finds placeholder → sets `persist=true`
3. Code strips `<img>` tags from message (clean text output)
4. AgentRunner saves to AIAgentRunMedia
5. AgentRunner creates ConversationDetailAttachment
6. User sees: message text + image attachment

---

## Bugs Found and Fixed

### Bug #1: Entity Name Typo (FIXED)

**Discovered**: Media records not being created despite `persist=true`

**Symptom**: Server logs showed:
```
Processing 1 of 1 media outputs (filtered by persist flag)
Error saving media output 0: Cannot set properties of null (setting 'AgentRunID')
Saved 0 of 1 media outputs for agent run xxx
```

**Root Cause**: Wrong entity name in `AgentRunner.ts`:
```typescript
// WRONG (line 834)
'MJ: AI Agent Run Media'   // singular

// CORRECT
'MJ: AI Agent Run Medias'  // plural with 's'
```

**Fix**: Commit `8ea74a782` - Changed entity name to correct plural form.

**Status**: ✅ FIXED - Records now being created correctly.

---

### Bug #2: UI Not Refreshing Attachments (FIXED)

**Discovered**: After agent generates image, user must navigate away and back to see attachment.

**Symptom**:
- `AIAgentRunMedia` record created ✅
- `ConversationDetailAttachment` record created ✅
- UI doesn't show attachment until page refresh ❌

**Root Cause Analysis**:

The conversation UI has a multi-stage loading process:

1. **Service Layer**: `ConversationAttachmentService` loads attachments via RunView
2. **Chat Area Component**: Loads attachments during "peripheral data" loading phase
3. **Message List Component**: Receives `attachmentsMap` as input
4. **Message Item Component**: Renders attachments from the map

**The Problem**: Two issues working together:

1. **`onMessageComplete()` wasn't loading attachments** - Fix Attempt 1 added `loadAttachmentsForMessage()` to `onAgentResponse()` but that handler is never called (the `@Output()` is never emitted). Fix Attempt 2 added it to `onMessageComplete()`.

2. **`message-list.component.ts` wasn't watching for `attachmentsMap` changes** - This was the ACTUAL root cause. In `ngOnChanges`:
   - `artifactMap` changes trigger `updateMessages()` ✅
   - `attachmentsMap` changes were NOT handled ❌

   This meant even when `loadAttachmentsForMessage()` updated the map with a new reference, the message-list component never propagated the change to message-item components.

**Comparison with Artifacts (which work correctly)**:
```typescript
// message-list.component.ts - ngOnChanges()
// Artifacts: HANDLED
if (changes['artifactMap'] && this.messages && this.messageContainerRef) {
  this.updateMessages(this.messages);
}
// Attachments: WAS NOT HANDLED - this was the bug!
```

**Fix (Two Parts)**:

**Part 1**: Add `loadAttachmentsForMessage()` to `onMessageComplete()` in `conversation-chat-area.component.ts`:
```typescript
async onMessageComplete(event: {conversationDetailId: string; agentId?: string}): Promise<void> {
    // ... existing agent run refresh code ...

    // Added: Reload attachments created during agent execution
    await this.loadAttachmentsForMessage(event.conversationDetailId);

    // Added: Trigger change detection after async attachment loading
    this.cdr.detectChanges();
}
```

**Part 2**: Add `attachmentsMap` handling to `ngOnChanges()` in `message-list.component.ts`:
```typescript
// Watch for attachmentsMap changes to handle newly created attachments
// This ensures media attachments (e.g., images generated by agents) appear
// immediately without requiring a page refresh
if (changes['attachmentsMap'] && this.messages && this.messageContainerRef) {
  this.updateMessages(this.messages);
}
```

**Why Both Parts are Needed**:
- Part 1: Loads the new attachments from database after agent completes
- Part 2: Propagates the map change to message-item components for rendering

**The Full Message Flow (Corrected)**:
1. Agent message created with "⏳ Starting..." → `messageSent.emit()` → `onMessageSent()` adds message
2. Agent runs...
3. Agent completes → AgentRunner saves attachments to DB
4. `messageComplete.emit()` → `onMessageComplete()` → loads attachments, creates new Map reference
5. Angular detects `attachmentsMap` input change → `ngOnChanges()` in message-list
6. `updateMessages()` propagates attachments to message-item components
7. UI renders the attachment ✅

**Status**: ✅ FIXED - Attachments now display immediately after agent generates them

---

## Design Decisions

### Decision: Artifact Agents Don't Need Media Records

For artifact agents, the image is embedded in the HTML artifact. Creating separate `AIAgentRunMedia` and `ConversationDetailAttachment` records would be:
- **Redundant**: Image already visible in artifact
- **Wasteful**: Duplicating data that's in the artifact
- **Unnecessary**: No UI displays these attachments for artifacts

**Decision**: Don't create media records for artifact agents. The artifact IS the output.

### Decision: Conversational Agents NEED Media Records

For conversational agents:
- Message is clean text
- Image MUST be stored in `AIAgentRunMedia`
- `ConversationDetailAttachment` MUST be created for UI display
- Without these, user never sees the generated image

### Decision: LLM MUST Include Placeholders in Message

The placeholder detection in `processMessageMediaPlaceholders()` only sets `persist=true` when it finds a `${media:xxx}` placeholder in the message. This means:

- **If LLM includes** `<img src="${media:xxx}">` → placeholder found → `persist=true` → saved → attachment displays ✅
- **If LLM just says** "Here's your image" (no placeholder) → placeholder NOT found → `persist` stays false → image NOT saved ❌

**Decision**: Updated the Sage template to ENCOURAGE including `<img>` tags with placeholders. The code strips the tags anyway, so users see a clean message with the image displayed as an attachment.

**Previous (wrong) guidance**: "Don't include `<img>` tags - images are automatically displayed as attachments"
**Current (correct) guidance**: "Include the image placeholder using an `<img>` tag - this tells the system to display it as an attachment"

**Alternative considered**: Always set `persist=true` at interception time for conversational agents. This would be more robust but requires code changes to distinguish artifact vs conversational agents during interception.

---

## Summary: What We Need for Each Agent Type

| Requirement | Artifact Agent | Conversational Agent |
|-------------|---------------|---------------------|
| Token efficiency (placeholder pattern) | ✅ Yes | ✅ Yes |
| Resolve placeholder → base64 in payload | ✅ Yes | ❌ No (no payload) |
| AIAgentRunMedia record | ❌ No (image in artifact) | ✅ Yes |
| ConversationDetailAttachment record | ❌ No (artifact shows image) | ✅ Yes |
| Clean message (no placeholders) | N/A | ✅ Yes (tags stripped) |
| persist=true trigger | Placeholder resolved in payload | Placeholder found in message |

---

## Implementation Status

### Completed Changes

| File | Change | Status |
|------|--------|--------|
| `metadata/agents/.sage-agent.json` | Added Generate Image action | ✅ Done |
| `metadata/agents/.sage-agent.json` | Added Image Output modality | ✅ Done |
| `metadata/agents/.sage-agent.json` | Added Generate Image action + Image Output modality | ✅ Done (commit a542296d1) |
| `metadata/prompts/templates/sage/sage.template.md` | Image prompt crafting guidance + placeholder instructions | ✅ Done (commit a542296d1) |
| `packages/AI/Agents/src/base-agent.ts` | `processMessageMediaPlaceholders()` method | ✅ Done (commit a542296d1) |
| `packages/AI/Agents/src/AgentRunner.ts` | Fixed entity name typo | ✅ Done (commit 8ea74a782) |
| `packages/Angular/Generic/conversations/.../conversation-chat-area.component.ts` | Load attachments in `onMessageComplete()` + `detectChanges()` | ✅ Done (commit e587ec9ec) |
| `packages/Angular/Generic/conversations/.../message-list.component.ts` | Watch `attachmentsMap` changes in `ngOnChanges()` | ✅ Done (commit e587ec9ec) |

---

## Testing Results

### Conversational Agent (Sage)

| Test | Result |
|------|--------|
| Message shows clean text (no placeholder, no `<img>` tags) | ✅ Pass |
| `AIAgentRunMedia` record created | ✅ Pass |
| `ConversationDetailAttachment` record created | ✅ Pass |
| Image displays in UI via attachment immediately | ✅ Pass (after UI fix) |

### Artifact Agent (Research Report Writer)

| Test | Result |
|------|--------|
| Image embedded in artifact HTML | ✅ Pass |
| Artifact displays correctly with images | ✅ Pass |

---

## Related Documentation

- **PR #1748**: Multi-modal agent outputs and image generation infrastructure
- **`multimodal-agent-outputs-analysis.md`**: Comprehensive analysis of the PR implementation
- **Commit `8ea74a782`**: Fix for entity name typo in AgentRunner.ts
