# Skip Chat Re-Skin — Implementation Plan

## Overall Status: COMPLETE (code + local DB)

All code changes are implemented, compiled, and tested locally. Blocked on Skip SaaS API credentials for end-to-end agent execution testing.

| Phase | Status |
|---|---|
| Phase 1: Design Tokens | COMPLETE (prior PR) |
| Phase 2: Agent Routing | COMPLETE |
| Phase 3: Theme Enhancement | COMPLETE |
| Phase 4: Configurable Labels | COMPLETE |
| Phase 5: BrandedChatResource | COMPLETE |
| Phase 6: Branding Assets | COMPLETE |
| Phase 7: Old Package Cleanup | COMPLETE |
| Phase 8: Integration Testing | COMPLETE — UI verified, agent blocked on Skip API credentials |

### Build Verification (All Pass)

| Package | Status |
|---|---|
| `@memberjunction/ng-shared-generic` | Build clean |
| `@memberjunction/ng-conversations` | Build clean |
| `@memberjunction/ng-artifacts` | Build clean |
| `@memberjunction/ng-explorer-core` | Build clean |
| `MJExplorer` (full app bundle) | Build clean |

---

## Context

Rewrite the MJ conversation/chat system to be re-brandable for white-label products (Skip, Betty, future). Based on Amith Nagarajan's architectural direction: no wrapper package, branding via theme CSS + metadata-driven configuration, single generic `BrandedChatResource` component.

**Phase 1 (design tokens) is already complete.**

---

## Critical Architecture Finding

**`MessageInputComponent` owns ALL agent routing logic**, not `ConversationChatAreaComponent`. The full hierarchy:

```
ChatConversationsResource  (reads Data.Configuration)
  → ConversationChatAreaComponent  (manages conversation UI)
    → MessageInputComponent  (OWNS AGENT ROUTING)
      → ConversationAgentService.processMessage()  (Sage — hardcoded)
      → ConversationAgentService.invokeSubAgent()  (direct agent call)
      → MentionAutocompleteService.getSuggestions()  (@mention dropdown)
```

All new config must flow: Resource → ChatArea → MessageInput via `@Input()`.

`MentionAutocompleteService` is a **singleton** (`providedIn: 'root'`). Filtering must happen at the call site, NOT by mutating the singleton's cache.

---

## Phase 2: Configurable Agent Routing — COMPLETE

### New Files

**`conversations/src/lib/models/agent-routing-config.model.ts`**
```typescript
export interface AgentRoutingConfig {
  AvailableAgents?: MJAIAgentEntityExtended[];  // Constrained agent list (empty = no constraint)
  DefaultAgent?: MJAIAgentEntityExtended;        // Agent for unrouted messages
}
```
Export from `public-api.ts`.

### Modified Files (6 files)

#### 1. `conversation-chat-area.component.ts`
- Add `@Input() AgentRouting: AgentRoutingConfig | null = null;`

#### 2. `conversation-chat-area.component.html`
- Bind `[agentRouting]="AgentRouting"` to every `<mj-message-input>` instance
- Bind `[agentRouting]="AgentRouting"` to `<mj-conversation-empty-state>`

#### 3. `message-input.component.ts` — Core routing changes
- Add `@Input() AgentRouting: AgentRoutingConfig | null = null;`
- Add helper method:
  ```typescript
  private getEffectiveAgents(): MJAIAgentEntityExtended[] {
    if (this.agentRouting?.AvailableAgents?.length) {
      const permittedIds = new Set(
        this.mentionAutocomplete.getAvailableAgents().map(a => a.ID)
      );
      return this.agentRouting.AvailableAgents.filter(a => permittedIds.has(a.ID));
    }
    return this.mentionAutocomplete.getAvailableAgents();
  }
  ```
- Modify mention suggestion filtering — post-filter `getSuggestions()` results using `getEffectiveAgents()` IDs
- Modify `processMessageThroughAgent()`:
  - If `agentRouting?.DefaultAgent` exists → call `invokeSubAgent()` directly instead of `processMessage()`
  - If `getEffectiveAgents()` yields exactly 1 agent → invoke that agent directly (single-agent mode)
  - If multiple → call `processMessage()` with constrained agent list
- Pass `getEffectiveAgents()` as `constrainedAgents` to `processMessage()`

#### 4. `conversation-agent.service.ts`
- Add optional parameter to `processMessage()`:
  ```typescript
  async processMessage(
    conversationId: string,
    message: MJConversationDetailEntity,
    conversationHistory: MJConversationDetailEntity[],
    conversationDetailId: string,
    onProgress?: AgentExecutionProgressCallback,
    constrainedAgents?: MJAIAgentEntityExtended[]  // NEW
  ): Promise<ExecuteAgentResult | null>
  ```
- When `constrainedAgents` is provided and non-empty, use them for `ALL_AVAILABLE_AGENTS` instead of filtering from `AIEngineBase.Instance.Agents`

#### 5. `conversation-empty-state.component.ts`
- Add `@Input() agentRouting: AgentRoutingConfig | null = null;`
- Pass through to its `<mj-message-input>` in template

#### 6. `chat-conversations-resource.component.ts`
- Add `public agentRouting: AgentRoutingConfig | null = null;`
- In `applyConfigurationParams()`, resolve agent names from `Data.Configuration`:
  ```typescript
  if (config.availableAgentNames || config.defaultAgentName) {
    this.agentRouting = this.resolveAgentRouting(config);
  }
  ```
- Bind `[AgentRouting]="agentRouting"` in template

### Backward Compatibility
- `null` AgentRouting = current behavior (all permitted agents, Sage routing)
- `AvailableAgents` can only restrict, never expand — intersected with user permissions
- `processMessage()` new param is optional — existing callers unaffected
- Singleton `MentionAutocompleteService` cache is never mutated

---

## Phase 3: Theme System Enhancement — COMPLETE

### Modified Files (1 file + 2 new CSS)

#### 1. `shared/src/lib/theme.service.ts`

**Add `Hidden` flag to `ThemeDefinition`:**
```typescript
export interface ThemeDefinition {
    // ...existing fields...
    /** When true, hidden from user theme picker but available programmatically */
    Hidden?: boolean;
}
```

**Filter hidden from `AvailableThemes`, add `AllThemes`:**
```typescript
public get AvailableThemes(): ThemeDefinition[] {
    return Array.from(this.themeRegistry.values()).filter(t => !t.Hidden);
}
public get AllThemes(): ThemeDefinition[] {
    return Array.from(this.themeRegistry.values());
}
```

**Add temporary theme methods:**
```typescript
private _temporaryThemeId: string | null = null;

public async ApplyThemeTemporary(themeId: string): Promise<void> {
    this._temporaryThemeId = themeId;
    await this.applyTheme(themeId);
}

public async RestorePersistedTheme(): Promise<void> {
    if (this._temporaryThemeId === null) return;
    this._temporaryThemeId = null;
    const resolvedThemeId = this.resolveTheme(this._preference$.value);
    await this.applyTheme(resolvedThemeId);
}

public get IsTemporaryThemeActive(): boolean {
    return this._temporaryThemeId !== null;
}
```

**Guard `onSystemThemeChange()`:**
```typescript
private async onSystemThemeChange(): Promise<void> {
    if (this._temporaryThemeId) return; // Don't override temporary theme
    // ...existing logic...
}
```

#### 2. New: `MJExplorer/src/assets/themes/skip-light.css`
```css
[data-theme-overlay="skip-light"] {
    --mj-brand-primary: #147F9D;
    --mj-brand-primary-hover: #0F6A84;
    --mj-brand-primary-active: #0B5A70;
    --mj-logo-mark: url('/assets/themes/skip/skip-mark.svg');
    --mj-logo-mark-inverse: url('/assets/themes/skip/skip-mark-white.svg');
    --mj-logo-wordmark: url('/assets/themes/skip/skip-logo.svg');
    --mj-logo-color: #147F9D;
    --mj-text-link: #147F9D;
    --mj-border-focus: #147F9D;
}
```

#### 3. New: `MJExplorer/src/assets/themes/skip-dark.css`
Similar, with dark-appropriate overrides.

#### 4. Theme Registration
Skip themes registered at app bootstrap with `Hidden: true` so they don't appear in the user theme picker.

---

## Phase 4: Configurable Labels (Full Scope) — COMPLETE

Covers **all** terminology overrides: empty state, artifact viewer tabs, collection labels, and "Save to Collection" text.

### New Files

**`conversations/src/lib/models/branding-labels.model.ts`**
```typescript
export interface BrandingLabels {
  // Empty state
  WelcomeTitle?: string;
  WelcomeSubtitle?: string;
  WelcomeIcon?: string;
  SuggestedPrompts?: Array<{icon: string; title: string; prompt: string}>;
  SuggestedPromptCount?: number;
  InputPlaceholder?: string;
  // Artifact viewer tabs & labels
  TabLabelOverrides?: Record<string, string>;  // e.g. {'Display':'Report','Functional':'Design','Spec':'Design'}
  ArtifactLabel?: string;        // "Artifact" → "Report"
  SaveToCollectionLabel?: string; // "Save to Collection" → "Save to Library"
  // Collection labels
  CollectionLabel?: string;       // "Collection" → "Library"
  CollectionsLabel?: string;      // "Collections" → "Libraries"
}
```

### Modified Files — Empty State (3 files)

#### 1. `conversation-chat-area.component.ts`
- Add `@Input() BrandingLabels: BrandingLabels | null = null;`

#### 2. `conversation-chat-area.component.html`
- Bind `[BrandingLabels]="BrandingLabels"` to `<mj-conversation-empty-state>`

#### 3. `conversation-empty-state.component.ts` + `.html`
- Add `@Input()` with getter/setter for `BrandingLabels`:
  ```typescript
  private _brandingLabels: BrandingLabels | null = null;
  @Input()
  set BrandingLabels(value: BrandingLabels | null) {
    this._brandingLabels = value;
    this.refreshPrompts();
  }
  get BrandingLabels(): BrandingLabels | null { return this._brandingLabels; }
  ```
- `refreshPrompts()` uses custom prompts from labels or defaults
- Template: `{{ BrandingLabels?.WelcomeTitle || 'Welcome to Conversations' }}`, etc.

### Modified Files — Artifact Viewer (3 files)

#### 4. `artifact-viewer-panel.component.ts`
- Add inputs:
  ```typescript
  @Input() TabLabelOverrides: Record<string, string> | null = null;
  @Input() SaveToCollectionLabel: string = 'Save to Collection';
  ```

#### 5. `artifact-viewer-panel.component.html`
- Tab rendering: replace `{{ tab }}` with `{{ TabLabelOverrides?.[tab] || tab }}`
- "Save to Collection" tooltip: use `{{ SaveToCollectionLabel }}`

#### 6. `conversation-chat-area.component.html` (artifact viewer binding)
- Pass through: `[TabLabelOverrides]="BrandingLabels?.TabLabelOverrides"` and `[SaveToCollectionLabel]="BrandingLabels?.SaveToCollectionLabel || 'Save to Collection'"` to `<mj-artifact-viewer-panel>`

Note: Plugin tab labels (Functional, Technical, Spec, etc.) from `ComponentArtifactViewerComponent.GetAdditionalTabs()` also go through `TabLabelOverrides` — the map uses the original label as the key (e.g. `{'Functional': 'Design', 'Spec': 'Design'}`). The override happens at the display layer in `artifact-viewer-panel.component.html`, not in the plugin itself.

### Modified Files — Collections (2+ files)

#### 7. Collection components in conversations package
- `collection-view.component.ts` — Add `@Input() CollectionLabel: string = 'Collection';`
- `collections-full-view.component.ts` — Add `@Input() CollectionsLabel: string = 'Collections';`
- Templates: replace hardcoded "Collection"/"Collections" with the input values
- Thread from `ChatArea` → collection components

#### 8. `chat-conversations-resource.component.ts`
- Add `public brandingLabels: BrandingLabels | null = null;`
- In `applyConfigurationParams()`, read from config
- Bind `[BrandingLabels]="brandingLabels"` in template

---

## Phase 5: Generic BrandedChatResource + App Metadata — COMPLETE

### Design Decision: Full Sidebar Included

BrandedChatResource includes the **full conversation list sidebar** (same as ChatConversationsResource). This means Skip users see their conversation history, can pin/unpin the sidebar, resize it, etc.

**Approach**: BrandedChatResource is a standalone component with its own template that mirrors ChatConversationsResource's layout, plus branding orchestration (theme apply/restore, config resolution). There's template duplication with ChatConversationsResource — acceptable for now; can be refactored into a shared layout component later.

### New Files (2 files)

#### 1. `explorer-core/src/lib/resource-wrappers/branded-chat-resource.component.ts`

Full resource component with sidebar + branding (~1,006 lines). Template structure matches ChatConversationsResource:

```
+---------------------------------------------------+
| [Sidebar: mj-conversation-list] | [Main: mj-conversation-chat-area] |
| (collapsible, resizable, pinnable)| [AgentRouting], [BrandingLabels]   |
+---------------------------------------------------+
```

```typescript
@RegisterClass(BaseResourceComponent, 'BrandedChatResource')
@Component({
  standalone: false,
  selector: 'mj-branded-chat-resource',
  template: `...`,  // Same sidebar+main layout as ChatConversationsResource
  styles: [`...`],   // Same styles
  encapsulation: ViewEncapsulation.None
})
export class BrandedChatResource extends BaseResourceComponent implements OnInit, OnDestroy {
```

Key logic:
- `ngOnInit()`:
  1. Read `Data.Configuration` → typed `BrandedChatConfig`
  2. Resolve agent names → `AgentRoutingConfig` via `AIEngineBase.Instance.Agents`
  3. Build `BrandingLabels` from terminology/label config
  4. Determine theme: if user prefers dark → use `darkThemeId`, else `themeId`
  5. Call `themeService.ApplyThemeTemporary(resolvedThemeId)`
  6. Initialize engines (AIEngineBase, MentionAutocomplete, conversations)
  7. Load sidebar state from UserSettings
  8. Set `isReady = true`
- `ngOnDestroy()`: Call `themeService.RestorePersistedTheme()`
- **Sidebar management**: Same state (collapsed, pinned, width, resize) and UserSettings persistence as ChatConversationsResource
- **URL management**: Same query param management (conversationId, artifactId)
- **Event handling**: Same conversation selection, creation, rename, delete handlers

**Config interface** (typed from metadata Configuration):
```typescript
interface BrandedChatConfig {
  // Theme
  themeId?: string;
  darkThemeId?: string;
  // Agent routing
  availableAgentNames?: string[];
  defaultAgentName?: string;
  // Empty state labels
  welcomeTitle?: string;
  welcomeSubtitle?: string;
  welcomeIcon?: string;
  suggestedPrompts?: Array<{icon: string; title: string; prompt: string}>;
  suggestedPromptCount?: number;
  inputPlaceholder?: string;
  // Artifact/collection terminology
  tabLabelOverrides?: Record<string, string>;
  artifactLabel?: string;
  saveToCollectionLabel?: string;
  collectionLabel?: string;
  collectionsLabel?: string;
}
```

**Note on duplication**: The sidebar logic (~200 lines: state, resize, settings, mobile detection) is duplicated from ChatConversationsResource. This is a conscious trade-off — extracting a shared base class or layout component would be cleaner but adds refactoring risk to the existing Chat app. Can be done as a follow-up.

#### 2. `metadata/applications/.skip-application.json`
```json
{
  "fields": {
    "Name": "Skip",
    "Description": "Skip AI Assistant",
    "Icon": "skip-app-icon",
    "Color": "#147F9D",
    "DefaultForNewUser": false,
    "Status": "Active",
    "NavigationStyle": "Both",
    "DefaultNavItems": [
      {
        "Label": "Chat",
        "Icon": "fa-solid fa-comments",
        "ResourceType": "Custom",
        "DriverClass": "BrandedChatResource",
        "isDefault": true,
        "Configuration": {
          "themeId": "skip-light",
          "darkThemeId": "skip-dark",
          "availableAgentNames": ["Skip"],
          "defaultAgentName": "Skip",
          "welcomeTitle": "Welcome to Skip",
          "welcomeIcon": "skip-welcome-logo",
          "inputPlaceholder": "Ask Skip anything...",
          "suggestedPrompts": [
            {"icon": "fa-chart-line", "title": "Data insights", "prompt": "Show me key trends in my data"},
            {"icon": "fa-magnifying-glass", "title": "Find records", "prompt": "Help me find specific records"},
            {"icon": "fa-file-chart-column", "title": "Create report", "prompt": "Build a report from my data"},
            {"icon": "fa-robot", "title": "Automate task", "prompt": "Help me automate a repetitive task"}
          ],
          "tabLabelOverrides": {
            "Display": "Report",
            "Functional": "Design",
            "Spec": "Design"
          },
          "artifactLabel": "Report",
          "saveToCollectionLabel": "Save to Library",
          "collectionLabel": "Library",
          "collectionsLabel": "Libraries"
        }
      }
    ]
  },
  "relatedEntities": { "MJ: Application Entities": [] }
}
```

### Module Registration
- `BrandedChatResource` added to `explorer-core.module.ts` declarations/exports
- `LoadBrandedChatResource()` tree-shaking prevention function added
- Called from module's `public-api.ts`

---

## Phase 6: Branding Assets — COMPLETE

### Skip Mascot SVGs
All SVGs derived from the original `assets/skip-icon.svg` mascot (character with eyes, smile, crown):

- `skip-mark.svg` — full-color mascot (teal body, white face details)
- `skip-mark-white.svg` — inverse variant (white body, teal face details) for dark backgrounds
- `skip-logo.svg` — full-color mascot (same as mark; wordmark can be added later)
- `skip-logo-white.svg` — inverse variant
- `skip-glyph.svg` — outer silhouette only (white fill, for CSS mask use cases)

Located in `packages/MJExplorer/src/assets/themes/skip/`. Referenced by `skip-light.css` and `skip-dark.css` from Phase 3.

### App Icon CSS Classes
Defined in `packages/MJExplorer/src/styles.scss`. Same pattern as `.mj-logo` — `background-image` SVG with `[data-theme="dark"]` variant:

- `.skip-app-icon` — renders full-color mascot at `1em` size (scales with `font-size`). Auto-switches to white variant in dark mode. Used as the Application `Icon` field value — works in all existing `<i [class]="app.Icon">` locations (Home cards, app switcher, nav bar, command palette) with zero template changes.
- `.skip-welcome-logo` — renders full-color mascot at `4rem` for the welcome/empty state screen. Auto-switches to white variant in dark mode.

### Empty State Template Change
`conversation-empty-state.component.html` changed from `class="fa-solid {{ WelcomeIcon }}"` (which prepended FA class) to `[class]="WelcomeIcon || 'fa-solid fa-comments fa-3x'"` so branded icons have full control over their CSS class.

No angular.json changes needed — `src/assets` is already included in the build.

---

## Phase 7: Old Package Cleanup — COMPLETE

- `packages/Angular/Generic/skip-chat/` was already absent (dist-only, no source, never in this branch)
- No workspace entry to remove
- No stale imports found

---

## Phase 8: Integration Testing — COMPLETE (UI only)

### What Was Verified Locally

- All 5 packages build clean: shared, conversations, artifacts, explorer-core, MJExplorer
- Skip application appears in the Home page app picker after DB push + MJAPI restart + user assignment
- BrandedChatResource renders with sidebar + chat area
- Welcome screen shows "Welcome to Skip" with custom prompts and bolt icon
- Agent routing attempts to invoke Skip agent directly (bypasses Sage)
- Theme restoration on app switch (ngOnDestroy calls RestorePersistedTheme)

### Known Blocker

**Skip API credentials** (`ASK_SKIP_API_KEY`, `ASK_SKIP_ORGANIZATION_ID`) are not configured in the local dev `.env`. The Skip agent's `SkipProxyAgent` driver calls `brain.askskip.ai` and needs these to authenticate. Contact the Skip/Blue Cypress team for credentials.

Without credentials: UI branding, theme, labels, and routing all work. Agent execution fails at the API call layer.

---

## Staging / Production Deployment Guide

### Overview

The Skip feature uses **metadata-driven configuration only** — no SQL schema migrations are needed. The `__mj.Application` and `__mj.UserApplication` tables already exist in every MJ database. The deployment inserts one row into `Application` and one row per user into `UserApplication`.

### Database Tables Involved (Already Exist — No DDL Required)

#### `__mj.Application` (receives 1 new row)

| Column | Type | Nullable | Default | Value for Skip |
|---|---|---|---|---|
| `ID` | uniqueidentifier | NO | newsequentialid() | Auto-generated |
| `Name` | nvarchar(100) | NO | — | `'Skip'` |
| `Description` | nvarchar(MAX) | YES | NULL | `'Skip AI Assistant'` |
| `Icon` | nvarchar(500) | YES | NULL | `'skip-app-icon'` |
| `DefaultForNewUser` | bit | NO | 1 | `0` (false — assigned per-user) |
| `Status` | nvarchar(20) | NO | `'Active'` | `'Active'` |
| `NavigationStyle` | nvarchar(20) | NO | `'App Switcher'` | `'Both'` |
| `DefaultNavItems` | nvarchar(MAX) | YES | NULL | JSON blob (see below) |
| `DefaultSequence` | int | NO | 100 | `100` (default) |
| `Path` | nvarchar(100) | NO | — | Auto-generated from Name: `'skip'` |
| `AutoUpdatePath` | bit | NO | 1 | `1` (default) |
| `SchemaAutoAddNewEntities` | nvarchar(MAX) | YES | NULL | NULL |
| `Color` | nvarchar(20) | YES | NULL | `'#147F9D'` |
| `ClassName` | nvarchar(255) | YES | NULL | NULL |
| `TopNavLocation` | nvarchar(30) | YES | NULL | NULL |
| `HideNavBarIconWhenActive` | bit | NO | 0 | `0` (default) |

**Constraints on Application table:**
- UNIQUE on `Name` — will fail if a "Skip" application already exists
- UNIQUE on `Path` — will fail if a "skip" path already exists
- CHECK on `Status` — must be one of: `'Pending'`, `'Active'`, `'Disabled'`, `'Deprecated'`
- CHECK on `NavigationStyle` — must be one of: `'App Switcher'`, `'Nav Bar'`, `'Both'`

**`DefaultNavItems` JSON value** (stored as nvarchar(MAX)):
```json
[
  {
    "Label": "Chat",
    "Icon": "fa-solid fa-comments",
    "ResourceType": "Custom",
    "DriverClass": "BrandedChatResource",
    "isDefault": true,
    "Configuration": {
      "themeId": "skip-light",
      "darkThemeId": "skip-dark",
      "availableAgentNames": ["Skip"],
      "defaultAgentName": "Skip",
      "welcomeTitle": "Welcome to Skip",
      "welcomeIcon": "skip-welcome-logo",
      "inputPlaceholder": "Ask Skip anything...",
      "suggestedPrompts": [
        {"icon": "fa-chart-line", "title": "Data insights", "prompt": "Show me key trends in my data"},
        {"icon": "fa-magnifying-glass", "title": "Find records", "prompt": "Help me find specific records"},
        {"icon": "fa-file-chart-column", "title": "Create report", "prompt": "Build a report from my data"},
        {"icon": "fa-robot", "title": "Automate task", "prompt": "Help me automate a repetitive task"}
      ],
      "tabLabelOverrides": {"Display": "Report", "Functional": "Design", "Spec": "Design"},
      "artifactLabel": "Report",
      "saveToCollectionLabel": "Save to Library",
      "collectionLabel": "Library",
      "collectionsLabel": "Libraries"
    }
  }
]
```

#### `__mj.UserApplication` (receives 1 row per user who should see Skip)

| Column | Type | Nullable | Default | Value |
|---|---|---|---|---|
| `ID` | uniqueidentifier | NO | newsequentialid() | Auto-generated |
| `UserID` | uniqueidentifier | NO | — | Target user's ID |
| `ApplicationID` | uniqueidentifier | NO | — | The Skip application's ID |
| `Sequence` | int | NO | 0 | `100` (or any desired sort order) |
| `IsActive` | bit | NO | 1 | `1` |

**Constraints on UserApplication table:**
- UNIQUE on `(UserID, ApplicationID)` — prevents duplicate assignments
- Foreign key to `__mj.User(ID)` — UserID must exist
- Foreign key to `__mj.Application(ID)` — ApplicationID must exist

### Step 1: Insert the Skip Application Record

**Option A — via `mj sync push` (recommended)**:
```bash
# Cannot use --include="applications" because other app metadata files may have
# pre-existing lookup failures. Use a temporary directory instead:
mkdir -p metadata/skip-app
cp metadata/applications/.mj-sync.json metadata/skip-app/.mj-sync.json
cp metadata/applications/.skip-application.json metadata/skip-app/.skip-application.json
npx mj sync push --dir=metadata --include="skip-app"
rm -rf metadata/skip-app
```

**Option B — direct SQL INSERT** (if mj-sync is not available on staging):
```sql
INSERT INTO __mj.Application (
    Name, Description, Icon, Color, DefaultForNewUser, Status,
    NavigationStyle, DefaultNavItems
)
VALUES (
    'Skip',
    'Skip AI Assistant',
    'skip-app-icon',
    '#147F9D',
    0,  -- Not default for new users
    'Active',
    'Both',
    -- DefaultNavItems JSON (minified):
    '[{"Label":"Chat","Icon":"fa-solid fa-comments","ResourceType":"Custom","DriverClass":"BrandedChatResource","isDefault":true,"Configuration":{"themeId":"skip-light","darkThemeId":"skip-dark","availableAgentNames":["Skip"],"defaultAgentName":"Skip","welcomeTitle":"Welcome to Skip","welcomeIcon":"skip-welcome-logo","inputPlaceholder":"Ask Skip anything...","suggestedPrompts":[{"icon":"fa-chart-line","title":"Data insights","prompt":"Show me key trends in my data"},{"icon":"fa-magnifying-glass","title":"Find records","prompt":"Help me find specific records"},{"icon":"fa-file-chart-column","title":"Create report","prompt":"Build a report from my data"},{"icon":"fa-robot","title":"Automate task","prompt":"Help me automate a repetitive task"}],"tabLabelOverrides":{"Display":"Report","Functional":"Design","Spec":"Design"},"artifactLabel":"Report","saveToCollectionLabel":"Save to Library","collectionLabel":"Library","collectionsLabel":"Libraries"}}]'
);
```

### Step 2: Assign Skip App to Users

Since `DefaultForNewUser = false`, users won't see Skip automatically. Assign per-user:

**Option A — SQL (bulk assign to specific users)**:
```sql
INSERT INTO __mj.UserApplication (UserID, ApplicationID, Sequence, IsActive)
SELECT u.ID, a.ID, 100, 1
FROM __mj.User u
CROSS JOIN __mj.Application a
WHERE u.Email IN ('user1@example.com', 'user2@example.com')
  AND a.Name = 'Skip';
```

**Option B — SQL (assign to ALL active users)**:
```sql
INSERT INTO __mj.UserApplication (UserID, ApplicationID, Sequence, IsActive)
SELECT u.ID, a.ID, 100, 1
FROM __mj.User u
CROSS JOIN __mj.Application a
WHERE a.Name = 'Skip'
  AND u.IsActive = 1
  AND NOT EXISTS (
    SELECT 1 FROM __mj.UserApplication ua
    WHERE ua.UserID = u.ID AND ua.ApplicationID = a.ID
  );
```

**Option C — Make default for all users**: Change `DefaultForNewUser` to `1` (true):
```sql
UPDATE __mj.Application SET DefaultForNewUser = 1 WHERE Name = 'Skip';
```
New users get it automatically; existing users still need manual assignment via Option A or B.

**Option D — Admin UI**: Admin → Users → edit user → add Skip application.

### Step 3: Verify Skip Agent Exists

The agent routing config references `defaultAgentName: "Skip"`. The target database must have an active AI Agent named "Skip":

```sql
SELECT ID, Name, Status, DriverClass
FROM __mj.vwAIAgents
WHERE Name = 'Skip';
```

Expected: `Name=Skip, Status=Active, DriverClass=SkipProxyAgent`

If the Skip agent doesn't exist on staging, the branding/theme will still work — but messages won't route to any agent. The routing gracefully falls back to showing all agents via Sage.

### Step 4: Configure Skip API Credentials

The Skip agent (`SkipProxyAgent`) calls the external Skip SaaS API. These env vars must be set on the MJAPI server:

```env
ASK_SKIP_URL=<Skip API base URL>
ASK_SKIP_CHAT_URL=https://brain.askskip.ai/chat/
ASK_SKIP_API_KEY=<Skip API key>
ASK_SKIP_ORGANIZATION_ID=<organization ID>
```

Without `ASK_SKIP_API_KEY` and `ASK_SKIP_ORGANIZATION_ID`, messages to Skip will fail with "No response received from Skip API".

### Step 5: Restart MJAPI After DB Changes

MJAPI caches the Applications list at startup. After pushing the Skip application record, **restart MJAPI** so it picks up the new application. A browser page refresh alone is not sufficient.

### Summary of What Gets Created in DB

| Table | Records | How |
|---|---|---|
| `__mj.Application` | 1 (Skip) | `mj sync push` or direct SQL INSERT |
| `__mj.UserApplication` | 1 per assigned user | SQL INSERT or Admin UI |
| `__mj.AIAgent` (Skip) | Already exists | Pre-existing — verify it's there |

**No DDL migrations, no schema changes, no CodeGen needed.** All changes are DML (INSERT/UPDATE) against existing tables.

### Rollback

If you need to remove Skip from staging:

```sql
-- Remove user assignments first (FK constraint)
DELETE ua FROM __mj.UserApplication ua
INNER JOIN __mj.Application a ON ua.ApplicationID = a.ID
WHERE a.Name = 'Skip';

-- Remove the application record
DELETE FROM __mj.Application WHERE Name = 'Skip';
```

---

## Complete File Manifest

### New Files (7)
| File | Phase | Purpose |
|---|---|---|
| `conversations/src/lib/models/agent-routing-config.model.ts` | 2 | AgentRoutingConfig interface |
| `conversations/src/lib/models/branding-labels.model.ts` | 4 | BrandingLabels interface (incl. tab + collection overrides) |
| `explorer-core/src/lib/resource-wrappers/branded-chat-resource.component.ts` | 5 | Generic branded resource (full sidebar + theme + labels) |
| `MJExplorer/src/assets/themes/skip-light.css` | 3 | Skip light theme CSS |
| `MJExplorer/src/assets/themes/skip-dark.css` | 3 | Skip dark theme CSS |
| `MJExplorer/src/assets/themes/skip/*.svg` | 6 | Skip logo assets (4 files) |
| `metadata/applications/.skip-application.json` | 5 | Skip app metadata |

### Modified Files (15)
| File | Phase | Changes |
|---|---|---|
| `shared/src/lib/theme.service.ts` | 3 | Hidden flag, ApplyThemeTemporary, RestorePersistedTheme |
| `conversations/src/lib/services/conversation-agent.service.ts` | 2 | Optional constrainedAgents param |
| `conversations/src/lib/components/message/message-input.component.ts` | 2 | agentRouting input, getEffectiveAgents, modified routing |
| `conversations/src/lib/components/conversation/conversation-chat-area.component.ts` | 2,4 | AgentRouting + BrandingLabels inputs |
| `conversations/src/lib/components/conversation/conversation-chat-area.component.html` | 2,4 | Bind inputs to children (message-input, empty-state, artifact-viewer) |
| `conversations/src/lib/components/conversation/conversation-empty-state.component.ts` | 2,4 | agentRouting + BrandingLabels inputs, configurable prompts |
| `conversations/src/lib/components/conversation/conversation-empty-state.component.html` | 4 | Interpolate configurable labels |
| `artifacts/src/lib/components/artifact-viewer-panel.component.ts` | 4 | TabLabelOverrides + SaveToCollectionLabel inputs |
| `artifacts/src/lib/components/artifact-viewer-panel.component.html` | 4 | Override tab labels + save button text |
| `conversations/src/lib/components/collection/collection-view.component.ts` | 4 | CollectionLabel input |
| `conversations/src/lib/components/collection/collections-full-view.component.ts` | 4 | CollectionsLabel input |
| `conversations/src/public-api.ts` | 2,4 | Export new models |
| `explorer-core/src/lib/resource-wrappers/chat-conversations-resource.component.ts` | 2,4 | Pass routing + labels to chat area |
| `explorer-core/src/lib/explorer-core.module.ts` | 5 | Register BrandedChatResource |
| `explorer-core/src/public-api.ts` | 5 | Export BrandedChatResource + tree-shaking loader |

### Auto-Generated Files (updated by manifest regeneration)
| File | Changes |
|---|---|
| `packages/Angular/Bootstrap/src/generated/mj-class-registrations.ts` | Includes BrandedChatResource |
| `packages/ServerBootstrap/src/generated/mj-class-registrations.ts` | Updated manifest |
| `packages/ServerBootstrapLite/src/generated/mj-class-registrations.ts` | Updated manifest |

---

## Phase Dependency Graph

```
Phase 2 (Agent Routing)  ────────────┐
Phase 3 (Theme Enhancement) ─────────┼── Phase 5 (BrandedChatResource)
Phase 4 (Configurable Labels) ───────┘         │
Phase 6 (Assets) ─────────────────────────────┘
Phase 7 (Cleanup) ─── independent
Phase 8 (Integration Test) ─── after all above
```

**Phases 2, 3, 4 are independent** and can be developed in parallel.

---

## Deferred to Follow-up

1. **Betty app metadata** — same pattern as Skip, create when Betty is ready
2. **Shared sidebar layout component** — extract sidebar+main layout from ChatConversationsResource and BrandedChatResource into a reusable component to eliminate template duplication
3. **End-to-end agent test** — requires Skip API credentials
4. **Skip replaces Chat when installed** — Mark Patterson's doc suggests "If Skip is installed, it would replace the functionality of Chat." However, Amith's architectural direction was for Skip to be a separate branded app alongside Chat. Currently both coexist side by side. Needs alignment on which approach to take.
5. **Role-appropriate experience (Admin vs User modes)** — hide technical details (ERDs, table names, JSON, error messages) from non-technical users. Each primary app designates features per user level.
6. **Skip admin page** — group Skip-relevant admin functions (AI configs, permissions, database tools) within the Skip app so users don't need to leave it.
7. **Horizontal split-screen mode** — chat on top, component display on bottom (like Outlook reading pane). Sidebar remains on left, hideable.
8. **Analytics page** — Skip usage stats and costs, similar to Izzy's analytics.
9. **Conversation panel enhancements**:
   - ~~Show time/date on each conversation~~ — **DONE** (relative timestamps using `__mj_UpdatedAt`)
   - ~~Add sorting option (by date/time or title)~~ — **DONE** (toggle in header menu, default sort by date)
   - Enable conversation title editing — **ALREADY EXISTS** (Rename in context menu edits Name + Description)
   - Replace small context menu actions with always-visible icons — **SKIPPED**: the original concern was about Refresh/Select/Hide, which were already moved to the header menu. The per-conversation three-dot menu (pin/rename/delete) follows standard chat app patterns (Slack, Discord, ChatGPT) and works well as-is.
10. **Collection enhancements**:
    - ~~Allow component/artifact name to be edited~~ — **DONE** (double-click to rename inline, saves via `MJArtifactEntity.Save()`, permission-gated)
    - Retain original conversation with component (currently only via Links tab, which is hidden and one-way)
11. **Reconcile Chat/Conversations/Messages terminology** — determine if all three terms are needed
12. **Home screen filtering** — show only primary apps (Skip, Izzy, Developer, Admin) based on permissions/purchase, not all apps

Source: `Skip User Experience Ideas.docx` (Mark Patterson)

---

## Bug Fix: Temporary Theme Lost on Light/Dark Switch

**Bug**: When a temporary theme is active (e.g., `skip-light` while in the Skip app) and the user switches between light and dark mode, the Skip theme overlay is stripped and the colors revert to default MJ branding.

**Root cause**: `ThemeService.SetTheme()` and `onSystemThemeChange()` did not account for temporary themes. When the user changed their preference (or the OS theme changed), the service resolved the preference to a built-in theme (`light` or `dark`), which called `applyTheme()` → removed `data-theme-overlay` → disabled custom CSS. The temporary theme was silently overwritten.

**Fix** (included in this branch, `theme.service.ts`):
1. `ApplyThemeTemporary()` now accepts both a light and dark variant ID: `ApplyThemeTemporary(lightThemeId, darkThemeId?)`. The service stores both and uses `resolveTemporaryTheme()` to pick the correct one based on the user's current preference.
2. `SetTheme()` — when `_temporaryThemeId` is set, re-resolves and applies the correct temporary variant instead of applying the raw built-in theme.
3. `onSystemThemeChange()` — same behavior: re-resolves the temporary variant when the OS theme changes, instead of ignoring the change entirely (which also prevented dark→light switching from working).
4. `BrandedChatResource` — simplified to pass both variants in one call: `ApplyThemeTemporary(themeId, darkThemeId)`.

**Impact**: Affects all branded apps using temporary themes (Skip, future Betty, etc.). Without this fix, any theme switch while in a branded app breaks the branding until the user navigates away and back.

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Agent routing breaks MJ Chat | Empty `AgentRouting` = current behavior, zero breaking changes |
| Singleton MentionAutocomplete mutated | Filtering at call site only, singleton cache untouched |
| Theme not restored on tab switch | `ngOnDestroy` always calls `RestorePersistedTheme()` |
| Agent name resolution fails | Empty `AvailableAgents` → no-constraint fallback (all agents visible) |
| Browser refresh in branded chat | Theme reapplied in `ngOnInit()` on component recreation |
| System theme change during branded mode | `onSystemThemeChange()` guards against `_temporaryThemeId` |
