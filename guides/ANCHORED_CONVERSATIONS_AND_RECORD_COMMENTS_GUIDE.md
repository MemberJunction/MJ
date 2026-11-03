# Anchored Conversations & Record Commenting Guide

MemberJunction provides a unified **Anchored Conversations & Record Commenting** system built on top of `MJ: Conversations` and `MJ: Conversation Details`. Instead of introducing a separate commenting table, record discussions—whether anchored to an entire record, a specific form field, a collapsible section, a left-nav rail tab/group, a related-entity contribution grid, or a document/slide/spreadsheet block—are stored as first-class conversations.

This means every anchored comment thread automatically inherits:
- Multi-message threading (`MJ: Conversation Details`)
- User and AI agent `@mention` autocomplete and in-app notifications (`MJ: User Notifications`)
- Resolution tracking (`IsResolved`, `ResolvedByUserID`, `ResolvedAt`)
- Row-Level Security (RLS) and Field-Level Security (FLS) enforcement across both reads and writes

---

## 1. Database Schema (`MJ: Conversations`)

Migration `V202611022155__v6.2.x__Anchored_Conversations_And_Record_Comments.sql` adds the following columns, constraints, and indexes to `__mj.Conversation`:

| Column | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `AnchorType` | `NVARCHAR(30)` | `NULL` | Discriminator for anchored threads (`NULL` = standard standalone chat conversation). Constrained by `CK_Conversation_AnchorType` to `'Contribution'`, `'DocBlock'`, `'Field'`, `'Group'`, `'Record'`, `'Section'`, `'SheetRange'`, or `'SlideRegion'`. |
| `AnchorKey` | `NVARCHAR(255)` | `NULL` | Target identifier within the record: `EntityField.Name` when `AnchorType = 'Field'`, `SectionKey` when `AnchorType = 'Section'`, rail `GroupKey` when `AnchorType = 'Group'`, or block/cell ID for documents/sheets/slides. |
| `AnchorMetadata` | `NVARCHAR(MAX)` | `NULL` | Strongly-typed JSON payload (`JSONType = 'IConversationAnchorMetadata'`, exposed on `MJConversationEntity` as `AnchorMetadataObject`) storing display labels, quoted value snapshots, and FLS `restrictedFields` stamps. |
| `IsResolved` | `BIT` | `NOT NULL` | Default `0`. Whether the anchored thread has been marked resolved. |
| `ResolvedByUserID` | `UNIQUEIDENTIFIER` | `NULL` | Foreign key to `__mj.User(ID)` recording who resolved the thread. |
| `ResolvedAt` | `DATETIMEOFFSET` | `NULL` | Timestamp when the thread was resolved. |

### Constraints & Indexes
- **`CK_Conversation_AnchorType`**: Enforces valid `AnchorType` values (`NULL` or one of the 8 canonical anchor types).
- **`CK_Conversation_AnchorLinkBinding`**: Enforces `AnchorType IS NULL OR (LinkedEntityID IS NOT NULL AND LinkedRecordID IS NOT NULL)` so an anchored conversation cannot exist without a parent record link.
- **`IDX_Conversation_LinkedRecord_Anchor`**: Filtered index on `(LinkedEntityID, LinkedRecordID, AnchorType, AnchorKey, IsResolved) WHERE LinkedEntityID IS NOT NULL AND AnchorType IS NOT NULL` for sub-millisecond form comment pre-warming.

### Main Chat List Isolation & Record-Bound "Ask AI" Conversations
- **Anchored Comments (`AnchorType IS NOT NULL`)**: `ConversationEngine.LoadConversations()` filters main chat history with `AND AnchorType IS NULL` by default (unless `{ includeAnchored: true }` is passed), ensuring inline record comments never clutter a user's primary AI chat sidebar.
- **Record-Bound "Ask AI" Chats (`LinkedEntityID IS NOT NULL AND AnchorType IS NULL`)**: When a user starts an "Ask AI" conversation from `<mj-chat-agents-overlay>` while viewing an entity record form, `ChatAgentsOverlayComponent` binds the conversation to `(LinkedEntityID, LinkedRecordID)` with `AnchorType = NULL`. `ConversationEngine.LoadConversations()` also excludes record-linked conversations by default (`AND LinkedEntityID IS NULL`, unless `{ includeRecordLinked: true }` is passed), while `ConversationEngine.LoadRecordConversations(linkedEntityId, linkedRecordId, contextUser, environmentId)` loads prior AI conversations scoped to that specific record as the user navigates between records.

---

## 2. Strongly-Typed JSON Metadata (`IConversationAnchorMetadata`)

Defined in `metadata/entities/JSONType-interfaces/IConversationAnchorMetadata.ts` and generated onto `MJConversationEntity.AnchorMetadataObject`:

```typescript
export interface IConversationAnchorMetadata {
    /** Friendly display label of the anchor target at the time the comment was created */
    anchorDisplayName?: string;
    /** Target field code name when AnchorType is 'Field' */
    fieldName?: string;
    /** Collapsible panel SectionKey containing the target field or section */
    sectionKey?: string;
    /** Friendly display name of the section */
    sectionDisplayName?: string;
    /** Left-nav rail group key containing the target section */
    groupKey?: string;
    /** Friendly display name of the rail group */
    groupDisplayName?: string;
    /** Formatted snapshot of the field's value at the moment the thread was started */
    quotedValue?: string;
    /** Field names on the linked entity whose FLS read permission is required to view this thread */
    restrictedFields?: string[];
    /** Optional character/block range for rich-text or document blocks */
    selectionRange?: {
        startOffset?: number;
        endOffset?: number;
        blockId?: string;
    };
}
```

> **Type Derivation Rule**: Always derive the `AnchorType` union from the generated entity class (`MJConversationEntity['AnchorType']` or `ConversationAnchorType` from `@memberjunction/core-entities`) rather than hand-copying string literals.

---

## 3. Security Architecture: RLS & Two-Stage FLS Protection

Anchored record comments are governed by a defense-in-depth security model across `@memberjunction/core-entities` (`AnchoredConversationSecurity.ts`, `ConversationWriteAccess.ts`, `mentionNotification.ts`) and `@memberjunction/core-entities-server` (`AnchoredConversationReadSecurityHook.ts`, `RestrictedFieldCommentClassifier.ts`, `MJConversationEntityServer`, and `MJConversationDetailEntityServer`).

### 3.1 Row-Level Security (RLS) & Server-Side Read Hook (`AnchoredConversationPostRunViewHook`)
- **Server-Side `PostRunView` Enforcement (`AnchoredConversationReadSecurityHook.ts`)**: Registered via `RegisterProviderHook('PostRunView', AnchoredConversationPostRunViewHook)` in `@memberjunction/core-entities-server` and `MJServer`, every server-side `RunView` against `MJ: Conversations` or `MJ: Conversation Details` automatically filters out any anchored thread (`AnchorType IS NOT NULL`) or message row whose linked record fails `UserCanReadLinkedRecord` (RLS) or whose target/stamped fields fail `IsConversationHiddenByFieldSecurity` (FLS) for `contextUser`—even when callers request narrow `Fields` projections. Verified by FLS closeout check `CO20` (`fls-closeout:anchored-comments-protected`).
- **Engine Read Gate (`UserCanReadLinkedRecord`)**: `ConversationEngine.LoadAnchoredConversations()` also runs `FilterAnchoredConversationsForUser()`, verifying that the caller has `EntityPermission.CanRead` on the target entity **and** that the target record passes `RunView` (`ResultType: 'count_only'`) under the caller's RLS filter (supporting both SQL Server and PostgreSQL identifier quoting via `provider.QuoteIdentifier`).
- **Write Gate (`UserMayWriteConversation` & `MJConversationEntityServer`)**: Any authenticated user who can read the linked record, satisfies `entityInfo.CanUserComment(user)`, and is not blocked by FLS on the target field can start or reply to an anchored comment thread on that record without needing explicit `MJ: Resource Permissions` share rows. Users denied RLS read access to the record are rejected on both `MJConversationEntity` and `MJConversationDetailEntity` saves.

### 3.2 Field-Level Security (FLS) — Read Gate (`IsConversationHiddenByFieldSecurity`) & `quotedValue` Redaction
When `entityInfo.FieldLevelSecurityApplies === true`, `IsConversationHiddenByFieldSecurity(entityInfo, user, anchorType, anchorKey, anchorMetadata)` computes `denied = entityInfo.GetDeniedReadFields(user)` and hides the conversation in 0ms when:
1. `conv.AnchorType === 'Field'` and `denied.has(conv.AnchorKey.toLowerCase())`, OR
2. `conv.AnchorMetadataObject.fieldName` is in `denied`, OR
3. Any field listed in `conv.AnchorMetadataObject.restrictedFields` is in `denied`.

**No `quotedValue` Snapshots on Restricted or Encrypted Fields**: Both client-side (`<mj-form-field>` and `<mj-record-comments>`) and server-side (`MJConversationEntityServer.Save()`) strip `AnchorMetadataObject.quotedValue` whenever the target field has `HasFieldPermissions === true` or `Encrypt === true`, preventing sensitive field values from being persisted in plaintext JSON metadata, `MJ: Record Changes`, or search indexes.

### 3.3 Field-Level Security (FLS) — Write-Time Unanchored Comment Classifier (`InspectAndStampRestrictedFieldsForComment`)
What if an entity has FLS enabled (for example, a restricted `Salary` or `SSN` column), and a user posts a comment anchored at the **Record** or **Section** level that discusses or quotes the restricted field?

On every `MJConversationDetailEntityServer.Save()` belonging to an anchored conversation (`conversation.AnchorType != null`) on an FLS-governed entity, `InspectAndStampRestrictedFieldsForComment()` runs a two-stage detector:
1. **Stage 1 — Deterministic Lexical + Author-Readable Value Match (No Refusal Oracle)**:
   - Checks whether the comment mentions any FLS-restricted field's `Name` or `DisplayName` (word-boundary matched).
   - Loads the linked record via `RunView` and checks whether any non-trivial current value of an FLS-restricted field **that the authoring user is permitted to read** appears verbatim in the comment text (catching cases where an HR user with `Salary` read access writes `"Can we bump 185000 to 195000?"` without typing `"Salary"`, so `Salary` is stamped into `restrictedFields`).
   - **Refusal-Oracle Prevention**: Fields the authoring user is *denied* Read access to are **never** value-matched against their comment text, preventing a denied user from probing secret column values via save refusals.
2. **Stage 2 — Governed Semantic `AIPromptRunner` Classifier**:
   - Invokes the governed system prompt `'Anchored Comment Restricted Field Classifier'` (`metadata/prompts/.prompts.json`) via `AIPromptRunner` + `AIPromptParams` (or a custom classifier registered via `RegisterRestrictedFieldLLMClassifier()`) to detect indirect or paraphrased references to restricted fields (e.g., `"base comp"`, `"annual pay"` → `Salary`).
   - Non-anchored record-linked AI chats (`AnchorType == null`) bypass this classifier so normal agent turns do not incur extra LLM classification calls.
3. **Enforcement & Stamping**:
   - If the **author** is denied read access to a matched restricted field, the save is **rejected** with a generic message (`'You do not have permission to comment on restricted fields.'`) that does not disclose which restricted field matched.
   - If the **author** is authorized to read the field, the save succeeds and the matched field names are stamped into `conversation.AnchorMetadataObject.restrictedFields` and persisted on `MJ: Conversations`. All subsequent reads filter the thread deterministically in 0ms via `IsConversationHiddenByFieldSecurity()`.

### 3.4 Entity-Level Commenting Control (`MJ: Entities.Configuration.Comments`)
Administrators can enable, disable, or restrict record commenting per entity via `MJ: Entities.Configuration` (`IEntityConfiguration.Comments?: IEntityCommentsConfiguration`):

```json
{
  "Comments": {
    "Enabled": true,
    "RequiredPermission": "Read",
    "AllowedRoles": ["Developer", "Reviewer"]
  }
}
```

- **`Enabled`** (`boolean`, default `true`): Set to `false` to completely hide commenting affordances (`<mj-form-field>`, `<mj-collapsible-panel>`, `<mj-form-toolbar>`, `<mj-record-form-container>`) and reject server-side anchored conversation saves for that entity (`EntityInfo.AllowRecordComments === false`).
- **`RequiredPermission`** (`'Read' | 'Update'`, default `'Read'`): Controls whether a user only needs `CanRead` on the entity (default) or must also have `CanUpdate` permission (`EntityInfo.CanUserComment(user)`).
- **`AllowedRoles`** (`string[]`, optional): When populated, restricts commenting to users holding at least one of the listed role names or role IDs.

---

## 4. `@Mention` Notifications with FLS/RLS Gating

When a message is saved in `MJConversationDetailEntityExtended.Save()`, `DispatchConversationMentionNotifications()` parses `@{"type":"user","id":"...","name":"..."}` tokens in `detail.Message` and creates in-app `MJ: User Notifications`:
- Skips self-mentions and duplicate user tokens in the same message.
- Deduplicates against any notification already created by `CreateShareNotification` during `SyncPermissionsFromMentions`.
- **Security Gate**:
  - For **anchored conversations**, verifies both `IsConversationHiddenByFieldSecurity(entityInfo, recipientUser, ...)` and `UserCanReadLinkedRecord(provider, recipientUser, conv.LinkedEntityID, conv.LinkedRecordID)`. A user denied FLS or RLS access never receives a notification that would leak a restricted comment preview.
  - For **unlinked private conversations** (`LinkedEntityID IS NULL`), verifies `canRecipientAccessUnlinkedConversation` so notifications are only sent to the conversation owner (`conversation.UserID`) or users/roles holding an `'Approved'` `MJ: Resource Permissions` grant on `conversation.ID`.

---

## 5. Angular Form UX (`@memberjunction/ng-base-forms`)

Anchored commenting is built directly into `<mj-record-form-container>`, `<mj-form-toolbar>`, `<mj-collapsible-panel>`, and `<mj-form-field>` with zero extra boilerplate required on generated or custom forms:

1. **Field-Level Affordances (`<mj-form-field>`)**:
   - Hovering any field on a saved record reveals a subtle comment trigger button (`fa-regular fa-comment-dots`).
   - Fields with open comment threads display a persistent pill badge (`💬 N`) in the label row and are never auto-hidden as "empty" in read mode.
   - Clicking the trigger or pill opens the inline anchored popover (`<mj-record-comments Mode="popover">`) tethered to that field, capturing the field's current formatted value (`quotedValue`) unless the field is FLS-governed (`HasFieldPermissions`) or encrypted (`Encrypt`).
2. **Section-Level Affordances (`<mj-collapsible-panel>`)**:
   - Each section header rolls up open comment counts across both section-anchored threads and all fields rendered inside the section (`SectionIndicators.CommentCount`).
   - Displays a clickable comment badge in the panel header (`OnOpenSectionComments`) and reveals an add-comment icon button on header hover.
3. **Left-Nav Rail & Collapsed Spine (`<mj-record-form-container>`)**:
   - Because `CommentCount` is part of `FormSectionIndicators` and summed by `SumSectionIndicators()`, open comment counts roll up automatically to left-nav rail tabs, the `More` folder, and the collapsed rail spine.
4. **Toolbar Action & Organized Side-Rail Drawer (`<mj-form-toolbar>` + `RecordCommentsToolbarAction` + `<mj-record-comments Mode="drawer">`)**:
   - Registers `Key: 'comments'` (`Mode: 'both'`, `Pinnable: true`, not in `DEFAULT_PINNED_TOOLBAR_ACTIONS`) on `<mj-form-toolbar>` so **Comments** appears in the **More (`...`)** menu by default with a live open-thread count badge, and can be pinned/unpinned to the main toolbar by any user via `UserInfoEngine`.
   - When opened from the toolbar (or via the **"View all record comments in side rail"** button in the inline popover header), the side-rail drawer organizes all threads across the record into section groups (`Details`, `System Metadata`, `General Record Comments`, etc.) so comments across every tab and section can be reviewed in one place.
   - Both the inline popover dialog (`.mj-record-comments-popover`) and the side-rail drawer (`.mj-record-comments-drawer`) are resizable—the popover provides an **Expand / Restore** header toggle button (`400px` ↔ `560px`) as well as native drag-resizing (`resize: both`), and the drawer includes a left-edge drag resize handle (`320px`–`720px`) whose width is persisted per user via `UserInfoEngine.Instance.SetSettingDebounced('MJ_CommentsPanel_Width', ...)`.
   - The drawer supports filtering by `Open` / `Resolved` / `All` and by target anchor, displays `quotedValue` live-diff indicators when a field's value has changed since the comment was posted, displays an `FLS` shield badge when restricted fields are stamped on a thread, and jumps/expands/scrolls/pulses the target field or section when an anchor chip is clicked.
   - Comment composers implement IME-safe `Enter`-to-submit (checking `event.isComposing`, `keyCode === 229`, and Safari's `compositionend` timestamp window), debounced server-side `@mention` autocomplete across `MJ: Users` and `MJ: AI Agents`, clean `@Name` composer chips (serialized to `@{"type":...,"id":...,"name":...}` wire tokens on submit), and interactive `@mention` pills in rendered messages that navigate directly to the mentioned `MJ: Users` or `MJ: AI Agents` record when clicked.
