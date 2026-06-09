# Conversations Runtime Extraction & Widget Extension Surface

> **Status:** Planning / design — open for team review before any implementation.
> **Authors:** Drafted via collaborative brainstorming session.
> **Date:** 2026-06-08.
> **Audience:** MJ core maintainers + any downstream app team building chat-shaped UX on top of MJ (Form Builder Component Studio embed already in production; a downstream learning-focused application is the immediate forcing function).
> **TL;DR:** The "conversation engine" described in recent design discussions is half-built already. Finish the extraction by promoting the runtime/orchestration code (currently trapped as Angular services) into a new pure-TypeScript package, leave the existing data-layer `ConversationEngine` where it is, and expand the widget's extension surface so downstream apps can build "character"-shaped tutor surfaces with zero custom chat code.

---

## 1. Problem

A downstream Angular app (LXP, an AI-powered Learning Platform) wants an always-present AI tutor embedded throughout its UI — a full-page tutor home, a tutor surface composited over a paused video player, and a corner-bubble assistant. Their UI engineer prototyped against MJ's chat widget and reported two findings:

1. **The underlying capabilities are great and should be reused.** Client tools (the agent invoking app-side functions like "navigate to lesson"), inline Response Forms, streaming progress, agent-run plumbing — all real today, all working.
2. **The widget's UI shape doesn't fit some of their screens.** The widget is well-built (~48 components, ~98% `--mj-*` token-driven, no Kendo, `RegisterClass`-based renderer registry), but its full-page mode is shaped as a "power-tool chat workspace" with a conversation-list sidebar, `@AgentName` invocation, and dense framing. The learning app's tutor home is a warm two-view *page* with a character presence, voice states, and resume cards. Token re-skinning flips colors but not structure.

Their initial proposal: **build custom UI on top of MJ's chat *services***. That created a design tension:

- The "services" they need are bundled inside the Angular package `@memberjunction/ng-conversations`. To use them outside that package, you either pull the whole Angular package as a dependency (works for Angular consumers but mixes UI deps into non-UI consumers) or reach into internals (fragile across MJ upgrades).
- Even ignoring the dependency direction, several teams building chat-shaped UX in parallel risks fragmenting how MJ apps do chat. The MJ position should be that the same engine drives all chat surfaces.

Two related issues compound this:

- **Default agent is hardcoded** as the string `"Sage"` in three places in the Angular package. Any deployment that wants a different conversation manager has to fork.
- **Voice/multimodal channels are coming** (separate workstream — `/plans/audio-agent-architecture.md`, `/plans/complete/multi-modal-chat-support.md`). The engine has to be open to them without a rewrite when they land.

So this plan does three things at once:

1. **Extract the runtime layer** out of Angular into a pure-TS package consumable on client or server.
2. **Expand the widget's extension surface** (slots, lifecycle events, persona config, chat-specific tokens) so downstream apps can almost always use the widget directly instead of building custom UX.
3. **Replace the hardcoded default-agent lookup** with an `MJ: Application Settings`-driven resolution chain, plus a metadata flag on `MJ: AI Agents`.

---

## 2. Current state (what already exists)

A short read-only audit grounds the rest of the plan. None of the following is hypothetical:

- **`ConversationEngine` already exists** in `@memberjunction/core-entities/src/engines/conversations.ts`. Extends `BaseEngine`, singleton via `BaseSingleton`, exposes `Conversations$` observable, owns the per-conversation message cache, handles `BaseEntity` save/delete events for cache invalidation, and runs the `GetConversationComplete` GraphQL query. **It is already the pure-TS data layer.** No need to recreate it; the new runtime package consumes it.
- **`mj-conversation-chat-area`** (`packages/Angular/Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.ts`) is **already the unified component** used by all three modes:
  - Corner overlay (`mj-chat-agents-overlay` wraps it).
  - Embedded panel (Form Builder cockpit and Component Studio AI Assistant both embed it directly with input configuration).
  - Full-page Chat (`mj-chat-conversations-resource` wraps it plus a `mj-conversation-list` sidebar).
  - **Mode is purely `@Input()`-driven** (`overlayMode`, `showAgentPicker`, `showExportButton`, `defaultAgentId`, `linkedEntityId`, `applicationScope`, `applicationId`, etc.). There is no separate "full-page component" or "embed component" to consolidate.
- **`mj-mention-editor`** is already standalone, implements `ControlValueAccessor`, owns its own attachment handling, and emits structured mention data via `getMentionChipsData()` / `getPlainTextWithJsonMentions()`. No third-party mention library is involved.
- **`MJ: Application Settings`** entity + **`ApplicationSettingEngine`** singleton already ship in `@memberjunction/core-entities`. They mirror `UserInfoEngine` (BaseEngine, debounced setter, observable, `GetSetting(name, applicationId?)` with app-scoped-over-global resolution). **Zero scaffolding needed for the settings-driven default-agent work.**
- **Voice/multimodal scaffolding is in design only.** No live voice code. The relevant plans (`audio-agent-architecture.md`, `multi-modal-chat-support.md`) describe a "channels" / "modality" concept; this plan reserves seams for them but ships zero voice code.

What does *not* exist yet:

- A pure-TS home for the agent-run pipeline, the streaming/PubSub routing, the client-tool dispatch wiring, and the mention parser. These are currently pure-RxJS classes wrapped with `@Injectable()` and declared inside the Angular package's services folder:
  - `ConversationAgentService` (send-message → `RunAIAgentFromConversationDetail` GraphQL mutation pipeline).
  - `ConversationStreamingService` (subscribes to `PUSH_STATUS_UPDATES_TOPIC`, routes progress events to the right message by `ConversationDetailID`, handles late-arrival replay).
  - `ConversationBridgeService` (overlay ⇄ workspace state coordination — already pure RxJS, the `@Injectable()` is purely for DI registration).
  - `MentionParserService` (already pure string parsing).
- A formalized widget extension surface (slots, persona inputs, lifecycle events, chat-specific design tokens). Some `<ng-content>` projections exist informally; this plan promotes them to a documented system.
- A metadata-driven default conversation-manager mechanism. Today: `Agents.find(a => a.Name === 'Sage')` in three places.
- A `/guides/` doc covering the conversations UX stack end-to-end.

---

## 3. Goals & non-goals

### Goals

1. Net-new pure-TS package `@memberjunction/conversations-runtime` owning the orchestration concerns above. Browser + server consumable. Zero UX dependencies.
2. `ConversationEngine` stays in `core-entities`. Every existing import of it continues to work unchanged.
3. Angular widget package (`@memberjunction/ng-conversations`) becomes a thin wrapper consuming the runtime, with an expanded but **additive-only** extension surface: chat-specific slots, persona/character inputs, lifecycle `@Output()`s, chat design tokens.
4. Default-agent resolution becomes a 4-step chain driven by widget input → `MJ: Application Settings` (app-scoped) → `MJ: Application Settings` (global) → an `IsDefaultConversationManager` flag on `MJ: AI Agents`. The hardcoded `"Sage"` name lookup goes away.
5. Reserve a `ConversationChannel` interface in the runtime so voice/video can plug in later as separate packages without engine changes.
6. Ship one new `/guides/` doc (`CONVERSATIONS_UX_STACK_GUIDE.md`) modeled on `FORMS_ARCHITECTURE_GUIDE.md` covering the full three-layer stack.
7. Form Builder cockpit and Component Studio AI Assistant embeds continue working with **zero source changes** in their packages. This is a hard regression bar.

### Non-goals

- Renaming or moving `ConversationEngine` out of `core-entities`.
- Introducing breaking input/output changes on `mj-conversation-chat-area`, `mj-chat-agents-overlay`, or `mj-mention-editor`.
- Implementing voice channels. That belongs to the voice/multimodal channels workstream; this plan only reserves the seam.
- Building any UI for the downstream learning app. The widget extensions are general-purpose; the LXP-style "warm tutor home" is implemented by that app's team using the new extension points.
- Touching the deprecated `conversation-workspace.component`. It is already flagged for removal; deletion can ride a separate cleanup PR.
- Migrating the existing `ConversationBridgeService` / `MentionParserService` Vitest test files — they port over essentially as-is.

---

## 4. Target architecture

### 4a. Three-layer stack

```
┌─────────────────────────────────────────────────────────────────┐
│  APPS  (Explorer, downstream Angular apps, future React apps,   │
│         Node workers / CLI tools)                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  @memberjunction/ng-conversations  (Angular UI, unchanged       │
│    package; additive extension surface)                          │
│                                                                  │
│    • mj-conversation-chat-area (overlay / embed / full-page)    │
│    • mj-chat-agents-overlay (corner-bubble shell)               │
│    • mj-mention-editor (standalone composer)                     │
│    • mj-chat-conversations-resource (full-page wrapper)         │
│    • NEW: ChatSlotDirective system                              │
│    • NEW: chat-specific design tokens (--mj-chat-*)             │
│    • NEW: persona/character inputs + lifecycle outputs          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  @memberjunction/conversations-runtime  ★ NEW                   │
│    Pure TypeScript · Zero UX deps · Client + server             │
│                                                                  │
│    ConversationsRuntime (BaseEngine — orchestration)            │
│    ├── Bridge          overlay ⇄ workspace state                │
│    ├── Streaming       PubSub progress routing                  │
│    ├── AgentRunner     send message → agent run pipeline        │
│    ├── Tools           client-tool registry + dispatch          │
│    ├── DefaultAgent    Application-Settings-driven resolver     │
│    ├── Mentions        parser (pure)                            │
│    └── Channels        TextChannel built-in; voice/video        │
│                        register externally                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  @memberjunction/core-entities  (data layer — unchanged)        │
│    ConversationEngine                                            │
│    ApplicationSettingEngine                                      │
│    AIEngineBase                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  @memberjunction/core, ai-agent-client, ai-engine-base,         │
│  graphql-dataprovider, global                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Why `conversations-runtime` and not `conversations`:** the runtime/orchestration framing is honest about what's inside, and avoids name collision with the existing `ConversationEngine` data-layer class.

### 4b. Runtime public API

A single top-level singleton, MJ idiom:

```typescript
export class ConversationsRuntime extends BaseEngine<ConversationsRuntime> {
  public static get Instance(): ConversationsRuntime;

  public async Config(forceRefresh?: boolean, contextUser?: UserInfo,
                      provider?: IMetadataProvider): Promise<void>;

  // Sub-components — compose, don't re-export
  public get Bridge():       ConversationBridge;
  public get Streaming():    ConversationStreaming;
  public get Tools():        ClientToolRegistry;
  public get DefaultAgent(): DefaultAgentResolver;
  public get Mentions():     MentionParser;

  // Convenience: the things every consumer does
  public sendMessage(input: SendMessageInput,
                     contextUser?: UserInfo,
                     provider?: IMetadataProvider): Observable<ConversationTurnEvent>;

  public observeConversation(conversationId: string): Observable<ConversationState>;

  public registerChannel(channel: ConversationChannel): void;
  public selectChannel(agent: AIAgentEntityExtended,
                       preference: 'text' | 'voice' | 'auto'): ConversationChannel;
}
```

Key shapes:

```typescript
interface SendMessageInput {
  conversationId: string | null;       // null = new conversation
  threadId?: string | null;
  text: string;
  mentions?: MentionRef[];
  attachments?: ConversationAttachment[];
  appContext?: Record<string, unknown>;
  defaultAgentId?: string | null;
  applicationId?: string | null;
  linkedEntityId?: string | null;
  linkedRecordId?: string | null;
}

type ConversationTurnEvent =
  | { kind: 'started';        agentRunId: string; }
  | { kind: 'progress';       step: string; percent?: number; message?: string; }
  | { kind: 'tool-invoked';   toolName: string; args: unknown; }
  | { kind: 'response-form';  form: AgentResponseForm; }
  | { kind: 'artifact';       artifactId: string; }
  | { kind: 'complete';       result: ExecuteAgentResult; }
  | { kind: 'error';          error: Error; };

interface ConversationState {
  conversation:    ConversationEntity | null;
  messages:        ConversationDetailEntity[];
  activeAgentRun:  AgentRunStatus | null;
  artifacts:       ArtifactSummary[];
}
```

Three properties of this API:

- **Observable-first.** Matches the `BaseEngine.ObserveProperty` / `UserInfoEngine` / `ConversationEngine` idiom already established. Angular consumers use `async` pipe; non-Angular consumers use `.subscribe()`.
- **`provider?: IMetadataProvider` everywhere.** Browser apps with a single provider pass nothing and fall through to `Metadata.Provider`. Server-side or multi-provider clients pass their bound provider explicitly. Matches the established CLAUDE.md rule for per-provider code paths.
- **Two engines, two concerns.** `ConversationEngine.Instance` for data CRUD (load / save / delete conversations, message cache). `ConversationsRuntime.Instance` for orchestration (send, stream, tools, channels). The runtime delegates to the data engine for state; it does not re-export it.

### 4c. Default-agent resolution

A `DefaultAgentResolver` (inside the runtime, exposed as `ConversationsRuntime.Instance.DefaultAgent`) walks this chain on every send:

1. **Explicit `defaultAgentId` on the call (or widget `@Input()`)** — already works today, preserved.
2. **`MJ: Application Settings` row** where `ApplicationID = <current app>` and `Name = 'Conversations.DefaultAgentID'`.
3. **`MJ: Application Settings` row** where `ApplicationID IS NULL` and `Name = 'Conversations.DefaultAgentID'` (global default).
4. **`MJ: AI Agents` row** where `IsDefaultConversationManager = 1` (metadata fallback, replaces `Agents.find(a => a.Name === 'Sage')`).

If all four steps fail, the resolver throws a descriptive error rather than failing silently — the current code path logs a warning and returns `null`, which makes misconfigurations hard to spot at the call site.

**Schema change:** one column on `MJ: AI Agents` plus an `sp_addextendedproperty` description. Single migration:

```sql
ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    IsDefaultConversationManager BIT NOT NULL DEFAULT 0;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When set, this agent is the fallback default conversation manager...',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'IsDefaultConversationManager';

-- Data step: preserve existing behavior — Sage stays the default unless reconfigured
UPDATE ${flyway:defaultSchema}.AIAgent
SET IsDefaultConversationManager = 1
WHERE Name = 'Sage';
```

CodeGen picks up the column after the migration; `AIAgentEntity` gains a strongly-typed `IsDefaultConversationManager: boolean` property. No `.Get()` / `.Set()` workarounds — the column has to exist before the runtime is wired to it.

**Caching:** `ApplicationSettingEngine` already caches and exposes a reactive observable. `AIEngineBase.Instance.Agents` already caches all agents. The resolver caches its result per `(applicationId, explicitAgentId)` for the lifetime of a turn and invalidates when either source emits a change.

### 4d. Channel seam

A minimal interface, no implementation beyond the built-in text channel:

```typescript
export interface ConversationChannel {
  readonly kind: 'text' | 'voice' | 'video' | string;
  readonly capabilities: ChannelCapabilities;

  send(input: SendMessageInput,
       ctx: ChannelContext): Observable<ConversationTurnEvent>;

  state$?: Observable<ChannelState>;  // optional — only voice/video need it
  dispose(): void;
}

interface ChannelCapabilities {
  canSendText:     boolean;
  canSendAudio:    boolean;
  canReceiveAudio: boolean;
  canSendVideo:    boolean;
  canReceiveVideo: boolean;
  isRealtime:      boolean;
}
```

The runtime ships **one built-in channel: `TextChannel`** — a thin adapter around the existing `RunAIAgentFromConversationDetail` GraphQL mutation, exposing it through the `ConversationTurnEvent` stream.

Voice/video are separate future packages (e.g., `@memberjunction/conversations-channel-voice`) that call `runtime.registerChannel(...)`. The widget asks `runtime.selectChannel(agent, preference)`; widget code never imports voice-specific types.

**Net cost of this section now:** ~150 lines of interface definitions + the TextChannel adapter wrapping existing code. Pays off the day voice lands.

### 4e. Widget extension surface

All additive on `mj-conversation-chat-area`. Existing embeds (Form Builder, Component Studio) are untouched.

**New `@Input()`s:**

```typescript
// Persona/character — opt-in; off by default
@Input() ShowAgentCharacter: boolean = false;
@Input() AgentCharacterConfig: AgentCharacterConfig | null = null;
//        { avatarUrl, characterName, voiceStateMode: 'subtle' | 'prominent' }

// Channel preference for this surface
@Input() PreferredChannel: 'text' | 'voice' | 'auto' = 'auto';

// Default-agent resolution context (formalize)
@Input() ApplicationId: string | null = null;

// Empty-state customization (today only EmptyStateGreeting exists)
@Input() EmptyStateConfig: EmptyStateConfig | null = null;
//        { greeting, subtext, suggestedPrompts, hideDefaultPrompts }
```

**New `<ng-content>` slot system** via a single `ChatSlotDirective`:

```html
<mj-conversation-chat-area ...>
  <ng-template mjChatSlot="emptyState">…</ng-template>
  <ng-template mjChatSlot="agentPresence" let-state>…</ng-template>
  <ng-template mjChatSlot="header" let-conversation>…</ng-template>
  <ng-template mjChatSlot="messageExtra" let-message>…</ng-template>
</mj-conversation-chat-area>
```

If a slot is not supplied, the component renders its existing default. Zero change-detection cost when slots are absent.

**New lifecycle `@Output()`s** — pure passthrough from the runtime's observable stream:

```typescript
@Output() AgentTurnStarted    = new EventEmitter<{ agentRunId; agentId }>();
@Output() AgentTurnProgress   = new EventEmitter<{ step; percent?; message? }>();
@Output() AgentTurnCompleted  = new EventEmitter<{ agentRunId; result }>();
@Output() ToolInvoked         = new EventEmitter<{ toolName; args; result }>();
@Output() ResponseFormShown   = new EventEmitter<{ formId; questionsCount }>();
@Output() ResponseFormSubmitted = new EventEmitter<{ formId; values }>();
@Output() VoiceStateChanged   = new EventEmitter<'idle'|'listening'|'thinking'|'speaking'>();
@Output() ChannelChanged      = new EventEmitter<'text'|'voice'|'video'>();
```

Concrete consumer use cases these unlock without forking the widget: pausing a video player on `VoiceStateChanged === 'listening'`, recording a tutor-step badge when `ResponseFormSubmitted` fires, navigating to a specific lesson when `ToolInvoked` fires for a `navigate-to-lesson` tool.

**New chat-specific design tokens** (`--mj-chat-*`), defined in the widget package and defaulting to existing semantic `--mj-*` tokens:

```scss
--mj-chat-bubble-user-bg:        var(--mj-brand-primary);
--mj-chat-bubble-user-text:      var(--mj-text-inverse);
--mj-chat-bubble-agent-bg:       var(--mj-bg-surface-card);
--mj-chat-bubble-agent-text:     var(--mj-text-primary);
--mj-chat-composer-bg:           var(--mj-bg-surface);
--mj-chat-composer-border:       var(--mj-border-default);
--mj-chat-character-accent:      var(--mj-brand-primary);
--mj-chat-voice-listening:       var(--mj-status-info);
--mj-chat-voice-thinking:        var(--mj-status-warning);
--mj-chat-voice-speaking:        var(--mj-brand-primary);
--mj-chat-presence-pulse-color:  var(--mj-brand-primary);
```

A downstream app's warm theme becomes a token override file, not a CSS fork. Matches the established `--mj-*` token discipline in CLAUDE.md.

---

## 5. Backwards compatibility

The hard regression bar: **Form Builder cockpit and Component Studio AI Assistant embeds compile and render identically with zero source changes in their packages.** Verified by:

1. Existing inputs on `mj-conversation-chat-area` remain in place with identical defaults and identical semantics. New inputs all have safe defaults (`false`, `null`, `'auto'`).
2. Existing outputs continue to fire on the same events. New outputs are additive.
3. The deprecated `conversation-workspace.component` is left alone.
4. `mj-mention-editor` is untouched.
5. `mj-chat-agents-overlay` keeps its existing input/output surface; internally it switches from injecting Angular services to consuming `ConversationsRuntime.Instance`, which is invisible to consumers.

There is no metadata migration that changes existing-install behavior. The default-agent flag migration sets `IsDefaultConversationManager = 1` on the existing Sage row, preserving today's behavior on every install that already has Sage.

---

## 6. Documentation deliverables

1. **TSDoc** on every exported class, interface, and method in `conversations-runtime`. Each block: what it does (one sentence), when to use it vs. the obvious alternative, an `@example` when the signature isn't self-explanatory.
2. **`packages/conversations-runtime/README.md`** — overview, "when to use this vs. the widget", `Config()` bootstrap, four short code samples (send a message, observe a conversation, register a client tool, register a channel). Links to the guide.
3. **`packages/Angular/Generic/conversations/README.md`** — updated to position the package as the Angular wrapper over the runtime, with full prop/event reference for the new extension surface.
4. **`guides/CONVERSATIONS_UX_STACK_GUIDE.md`** — new guide, modeled on `FORMS_ARCHITECTURE_GUIDE.md` and `NAVIGATION_AND_ROUTING_GUIDE.md`. Structure:
   - Three-layer stack diagram.
   - "I want a chat surface in my app" decision tree (default config → embed → DefaultAgentId/linked-record → slots/character/tokens → headless runtime).
   - Widget reference: full props/events, four extension dimensions.
   - Runtime reference: `Config()`, `sendMessage`, `observeConversation`, client tools, channels.
   - `MJ: Application Settings` reference (the 4-step default-agent resolution chain).
   - Examples — Form Builder embed, "warm tutor full-page with character" pattern, server-side conversation read.
   - Anti-patterns — don't import widget internals; don't depend on `conversations-runtime` from `core-entities` (cycle); don't reach around the channel system to call audio APIs directly.
   - Cross-references — `FORMS_ARCHITECTURE_GUIDE.md`, `audio-agent-architecture.md`.
5. **CLAUDE.md root** gets one new line in the existing development-guides list pointing to the new guide. No other CLAUDE.md edits.

---

## 7. Tests

Vitest, `src/__tests__/`, no DB, mocks at boundaries — MJ standard.

**Pure-TS runtime — `packages/conversations-runtime/src/__tests__/`:**

| Test file | Covers |
|---|---|
| `ConversationsRuntime.test.ts` | `Config()` lazy load, singleton semantics, sub-component composition, `provider?` fallback to `Metadata.Provider` |
| `DefaultAgentResolver.test.ts` | The 4-step resolution chain — one test per layer plus tie-breaker tests. Mocks `ApplicationSettingEngine` + `AIEngineBase` |
| `ConversationAgentRunner.test.ts` | `sendMessage()` happy path: started → progress → complete. Error path: started → error. Resolution failure surfaces a descriptive error |
| `ConversationStreaming.test.ts` | PubSub message routing by `ConversationDetailID`, late-arrival replay (5-minute window), unsubscribe cleanup |
| `ClientToolRegistry.test.ts` | register / deregister / dispatch, decorator chain, context propagation, missing-tool error |
| `MentionParser.test.ts` | Ported from current package (already exists) |
| `TextChannel.test.ts` | Wraps the GraphQL call; mock the call, assert event-stream shape |
| `ConversationBridge.test.ts` | Ported from current package (already exists) |

Coverage target: **80%+ line coverage on the runtime package.**

**Angular widget — `packages/Angular/Generic/conversations/src/__tests__/`** (additive to existing tests):

| Test file | Covers |
|---|---|
| `ChatSlotDirective.test.ts` | Slot registry — projection works when slot supplied, default renders when absent |
| `chat-area.persona.test.ts` | `ShowAgentCharacter` + `AgentCharacterConfig` inputs render the character zone; off by default |
| `chat-area.events.test.ts` | Lifecycle `@Output()`s fire from the runtime's observable stream |
| `chat-area.tokens.test.ts` | New `--mj-chat-*` tokens have correct fallbacks to existing semantic tokens |

**One integration smoke test** in `packages/conversations-runtime/src/__tests__/integration/sendMessage.smoke.test.ts`: mock `IMetadataProvider` + mock GraphQL client, call `sendMessage()`, assert full event sequence comes back. Catches wiring regressions across all sub-components at once.

**No new Playwright tests.** Existing browser smoke tests should catch widget regressions. Add Playwright coverage only if real regressions surface during dogfooding.

**CI gate.** PR has to pass:
1. Both packages' Vitest suites.
2. Full Turborepo `npm run build` (catches downstream TypeScript breakage in apps consuming the widget).
3. MJExplorer Vite/ESBuild build (catches lazy-load / dependency-graph regressions).

---

## 8. Sequencing

The work decomposes into seven steps. Each step is independently committable and reviewable; the PR could ship as one branch or as a stacked series.

**Step 1 — Migration: `IsDefaultConversationManager` column on `MJ: AI Agents`** (~30 min)
- Single `migrations/v5/V…__v5.x_AIAgent_IsDefaultConversationManager.sql` migration adding the column + `sp_addextendedproperty` + data step flagging the existing Sage row.
- Run migration locally; run CodeGen; verify `AIAgentEntity.IsDefaultConversationManager` exists as a typed property.
- **Unblocks Step 4 (resolver wiring).**

**Step 2 — Create `@memberjunction/conversations-runtime` package skeleton** (~1 hr)
- New package directory with `package.json`, `tsconfig.json`, `vitest.config.ts`, scaffolded `src/index.ts`.
- Declared deps: `@memberjunction/core`, `@memberjunction/core-entities`, `@memberjunction/global`, `@memberjunction/ai-agent-client`, `@memberjunction/ai-core-plus`, `@memberjunction/ai-engine-base`, `@memberjunction/graphql-dataprovider`, `rxjs`. **No Angular deps.**
- Empty `ConversationsRuntime` class extending `BaseEngine`, exports.
- Verify `npm run build` from package directory succeeds and the package is picked up by Turborepo.

**Step 3 — Port the pure-TS sub-components** (~3 hrs)
- Port `MentionParserService` → `MentionParser` (essentially a rename — already pure).
- Port `ConversationBridgeService` → `ConversationBridge` (strip `@Injectable()`, keep RxJS).
- Port `ConversationStreamingService` → `ConversationStreaming`.
- Port `ConversationAgentService` → `ConversationAgentRunner` (the bulk of the work; this is the agent-run pipeline).
- Port the client-tool registry logic out of `AgentClientSession` reuse (or wrap it) into `ClientToolRegistry`.
- Write `TextChannel` wrapping the existing GraphQL mutation.
- Migrate existing Vitest tests for `MentionParser` and `ConversationBridge`.

**Step 4 — Wire `DefaultAgentResolver`** (~1 hr)
- Reads `ApplicationSettingEngine.Instance.GetSetting('Conversations.DefaultAgentID', applicationId)` for layers 2 + 3.
- Reads `AIEngineBase.Instance.Agents.find(a => a.IsDefaultConversationManager)` for layer 4.
- Comprehensive unit tests for the chain.

**Step 5 — Update `@memberjunction/ng-conversations` to consume the runtime** (~3 hrs)
- Existing services (`ConversationAgentService`, `ConversationStreamingService`, etc.) become thin wrappers that delegate to `ConversationsRuntime.Instance.*`. Some can be removed entirely; some stay as Angular DI shims for components that already inject them (to avoid blast-radius churn).
- Replace the three `Agents.find(a => a.Name === 'Sage')` call sites with `ConversationsRuntime.Instance.DefaultAgent.resolve(...)`.
- Add the new `@Input()`s (`ShowAgentCharacter`, `AgentCharacterConfig`, `PreferredChannel`, `ApplicationId`, `EmptyStateConfig`).
- Add the `@Output()`s wiring them to the runtime's observable stream.
- Add `ChatSlotDirective` and project the four documented slots.
- Add `--mj-chat-*` token definitions in the package's SCSS.
- Run existing test suite to confirm no regressions; add new tests for the new surface.

**Step 6 — Manual verification of the three existing embeds** (~1 hr)
- Build MJExplorer.
- Open the corner overlay — confirm it still toggles, renders messages, streams progress.
- Navigate to the full-page Chat app — confirm conversation list + chat area still work.
- Open Form Builder cockpit — confirm the embedded chat-area still routes to the Form Builder agent (its `[DefaultAgentId]` input still wins, layer 1).
- Open Component Studio AI Assistant — same verification.
- Run a conversation that invokes a client tool (e.g., ask Sage to navigate somewhere) — confirm tool dispatch still works.

**Step 7 — Documentation** (~3 hrs)
- TSDoc pass over the runtime public API.
- `packages/conversations-runtime/README.md`.
- `packages/Angular/Generic/conversations/README.md` update.
- `guides/CONVERSATIONS_UX_STACK_GUIDE.md`.
- CLAUDE.md root cross-reference line.

**Honest total estimate:** ~12 hours of focused engineering work, plus review. The "single day" framing some had in mind is realistic for Steps 1-5 if everything goes smoothly and no surprises surface in the wiring. Steps 6-7 are a second day. Plan accordingly: **2-3 focused days end-to-end with review in the loop**, not a single uninterrupted day.

---

## 9. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Form Builder / Component Studio embed regresses during the widget rewrite | Medium | High — both are in production | Manual verification step (Step 6) is non-skippable. CI runs the full Turborepo build. Existing embed configurations are documented as the regression test set. |
| The runtime package accidentally pulls an Angular transitive dep | Low | Medium — defeats the purpose | `package.json` declares zero Angular deps. CI build verifies. Reviewers explicitly check the lock-file diff. |
| `ApplicationSettingEngine` cache misses or wrong-scope resolution surprises consumers | Low | Medium — wrong agent gets picked | Resolver unit tests cover every chain step + tie-breakers. The descriptive error on full failure surfaces misconfigurations loudly instead of falling back silently. |
| Voice channel work lands with a different shape than the reserved interface | Medium | Low — this plan is the only consumer of the interface at that point | Renames/extensions are cheap when there's one consumer. Coordinate informally with the voice/multimodal workstream during their design phase. |
| The "headless runtime" path gets abused — apps build custom chat UX they didn't need | Medium | Medium — fragments MJ chat UX over time | The new guide includes an explicit "before going headless, prove the widget slots/inputs can't cover it" guardrail. Code review enforces. |
| Singletons cross-contaminate in multi-provider client setups | Low | High — wrong-server data shows up in wrong conversation | Every runtime API accepts `provider?: IMetadataProvider`. CLAUDE.md's existing per-provider rule applies; tests cover the multi-provider case. |
| Turborepo dependency graph becomes harder to reason about after adding the new package | Low | Low | One new package, clearly placed in the layer diagram. Documented in the guide. |

---

## 10. Out of scope (explicitly)

- Implementing voice channels (separate workstream owned by the voice/multimodal channels effort).
- Building any UI for the downstream learning app — the widget extensions are general-purpose, the app team consumes them.
- Removing the deprecated `conversation-workspace.component` — can ride a separate cleanup PR.
- Refactoring `mj-mention-editor` — already standalone, no need.
- Server-side reference implementation — the runtime is designed for server-side use, but proving it with a real Node consumer is a follow-up, not a launch requirement. Tests cover the `provider?` parameter path.
- Per-linked-entity default agent resolution (e.g., "this Course nominates its own tutor agent"). Adds an entity-metadata convention that doesn't exist today; consider as a follow-up if real demand surfaces.
- Migrating to a "junction" `MJ: Application Default Agent` table instead of `IsDefaultConversationManager` flag + `Application Settings` key. The current proposal is leaner; revisit if multiple agents per application become a real need.

---

## 11. Cross-references

- `packages/Angular/Generic/conversations/` — current widget implementation.
- `packages/MJCoreEntities/src/engines/conversations.ts` — existing `ConversationEngine` (data layer; unchanged by this plan).
- `packages/MJCoreEntities/src/engines/ApplicationSettingEngine.ts` — existing settings engine the resolver consumes.
- `packages/MJCore/src/generic/baseEngine.ts` — `BaseEngine` reference for the runtime class shape.
- `guides/FORMS_ARCHITECTURE_GUIDE.md` — structural model for the new guide.
- `guides/NAVIGATION_AND_ROUTING_GUIDE.md` — same; both are multi-layer subsystem guides.
- `plans/audio-agent-architecture.md` — voice channels work; the `ConversationChannel` interface reserves seams for it.
- `plans/complete/multi-modal-chat-support.md` — modality scaffolding context.
- `CLAUDE.md` — root project rules; the new guide adds one cross-reference line.
