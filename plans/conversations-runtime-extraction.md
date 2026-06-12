# Conversations Runtime Extraction & Widget Extension Surface

> **Status:** Planning / design — revised after first round of team review (2026-06-09).
> **Authors:** Drafted via collaborative brainstorming session.
> **Date:** 2026-06-08 (initial); 2026-06-09 (revised for team feedback).
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
- **Real-time AI Agents (voice now, video later) are landing in 5.41.0** via PR #2787 (`plans/ai-agent-sessions.md`) — introducing `BaseRealtimeModel`, a new `Realtime` agent type, the generic Voice Co-Agent, and **agent-level Sessions & Channels** infrastructure. The conversations runtime must be aware of Sessions/Channels so a user activating voice in the widget flows cleanly through that infrastructure, not a parallel one.

So this plan does three things at once:

1. **Extract the runtime layer** out of Angular into a pure-TS package consumable on client or server.
2. **Expand the widget's extension surface** (slots with interface contracts + cloneable defaults, Before/After cancelable lifecycle events, persona config, chat-specific tokens) so downstream apps can almost always use the widget directly instead of building custom UX.
3. **Replace the hardcoded default-agent lookup** with an `MJ: Application Settings`-driven resolution chain, with a small code-const Sage fallback for safety if no setting is configured.

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
- **Real-time AI Agents are landing imminently** via PR #2787 (target: 5.41.0). That work introduces (a) `BaseRealtimeModel` — a modality-agnostic, streaming, full-duplex, tool-calling model primitive (Gemini Live, GPT Realtime); (b) a new `Realtime` agent type plus a generic **Voice Co-Agent** that acts as the live voice for any existing agent; (c) **Sessions & Channels infrastructure** — long-lived Sessions wrap the multiple `AIAgentRun`s of a real-time interaction; pluggable, *interactive* Channels (voice, whiteboard, text, …) are bidirectional surfaces the agent perceives and acts on. This supersedes the earlier `audio-agent-architecture.md` / `multi-modal-chat-support.md` plans. This plan no longer reserves its own channel abstraction — it integrates with PR #2787's infrastructure directly.

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
3. Angular widget package (`@memberjunction/ng-conversations`) becomes a thin wrapper consuming the runtime, with an expanded but **additive-only** extension surface: slots with interface contracts AND cloneable default components, persona/character inputs, **Before/After cancelable** lifecycle `@Output()`s, chat design tokens.
4. Default-agent resolution becomes a 3-step chain driven by widget input → `MJ: Application Settings` (app-scoped) → `MJ: Application Settings` (global), with a small code-const Sage fallback if no setting is configured. The hardcoded `"Sage"` `Agents.find(...)` lookup goes away. No schema migration; Sage default ships as a metadata seed in `metadata/application-settings/`.
5. Integrate with the AI Agent Sessions/Channels infrastructure from PR #2787 — the runtime surfaces Session state, doesn't own a parallel abstraction. Implementation is a stub task in this workstream until that PR lands.
6. Ship one new `/guides/` doc (`CONVERSATIONS_UX_STACK_GUIDE.md`) modeled on `FORMS_ARCHITECTURE_GUIDE.md`, **and** update every existing README touched by this work (`ng-conversations`, the new `conversations-runtime` package, plus any guide rendered obsolete by the new one). Include a runnable **example personalization component** demonstrating slot subclassing.
7. Form Builder cockpit and Component Studio AI Assistant embeds continue working with **zero source changes** in their packages. This is a hard regression bar.

### Non-goals

- Renaming or moving `ConversationEngine` out of `core-entities`.
- Introducing breaking input/output changes on `mj-conversation-chat-area`, `mj-chat-agents-overlay`, or `mj-mention-editor`.
- Building the Sessions/Channels/Realtime infrastructure — that's PR #2787. This plan **integrates** with it, doesn't reimplement any part of it.
- Building any UI for the downstream learning app. The widget extensions are general-purpose; the LXP-style "warm tutor home" is implemented by that app's team using the new extension points.
- Touching the deprecated `conversation-workspace.component`. It is already flagged for removal; deletion can ride a separate cleanup PR.
- Migrating the existing `ConversationBridgeService` / `MentionParserService` Vitest test files — they port over essentially as-is.

---

## 4. Target architecture

### 4a. Three-layer stack

```
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│  ANGULAR APPS                         │   │  NON-ANGULAR JS APPS                  │
│  (Explorer, current/future Angular    │   │  (future React/Next/Vue/Svelte/…),   │
│   apps that want the widget)          │   │   Node workers, CLI tools, server-   │
│                                       │   │   side jobs, test harnesses)          │
└──────────────────────────────────────┘   └──────────────────────────────────────┘
                  │                                            │
                  ▼                                            │
┌──────────────────────────────────────┐                      │
│  @memberjunction/ng-conversations    │                      │
│    Angular UI — same package, same   │                      │
│    selectors, additive extension     │                      │
│    surface                            │                      │
│                                       │                      │
│  • mj-conversation-chat-area         │                      │
│    (overlay / embed / full-page)     │                      │
│  • mj-chat-agents-overlay            │                      │
│  • mj-mention-editor                  │                      │
│  • mj-chat-conversations-resource    │                      │
│  • NEW: ChatSlotDirective + slot     │                      │
│    interfaces + exported default     │                      │
│    slot components (cloneable)       │                      │
│  • NEW: --mj-chat-* design tokens    │                      │
│  • NEW: persona/character inputs +   │                      │
│    Before/After cancelable events    │                      │
└──────────────────────────────────────┘                      │
                  │                                            │
                  └──────────────────┬─────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  @memberjunction/conversations-runtime  ★ NEW                   │
│    Pure TypeScript · Zero UX deps · Client + server             │
│    Consumed directly by any JS host; ng-conversations is just   │
│    one consumer.                                                 │
│                                                                  │
│    ConversationsRuntime (BaseEngine — orchestration)            │
│    ├── Bridge          overlay ⇄ workspace state                │
│    ├── Streaming       PubSub progress routing                  │
│    ├── AgentRunner     send message → agent run pipeline        │
│    ├── Tools           client-tool registry + dispatch          │
│    ├── DefaultAgent    Application-Settings-driven resolver     │
│    ├── Mentions        parser (pure)                            │
│    └── Sessions        observability over the Sessions/Channels │
│                        infrastructure from PR #2787 (stub —     │
│                        owned by that PR, integrated here)        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  @memberjunction/core-entities  (data layer — unchanged)        │
│    ConversationEngine                                            │
│    ApplicationSettingEngine                                      │
│    AIEngineBase                                                  │
│    [+ new Sessions/Channels entities from PR #2787]             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  @memberjunction/core, ai-agent-client, ai-engine-base,         │
│  graphql-dataprovider, global                                    │
└─────────────────────────────────────────────────────────────────┘
```

**The layering rule:**
- **Angular apps** consume `@memberjunction/ng-conversations` (which transitively consumes `conversations-runtime`). They get the widget.
- **Non-Angular JS apps** (React, Vue, Svelte, Next.js, Node workers, CLI tools, server-side jobs, test harnesses) consume `@memberjunction/conversations-runtime` directly. They bring their own UX layer.

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
  public get Sessions():     SessionsObserver;     // ★ integrates PR #2787

  // Convenience: the things every consumer does
  public sendMessage(input: SendMessageInput,
                     contextUser?: UserInfo,
                     provider?: IMetadataProvider): Observable<ConversationTurnEvent>;

  public observeConversation(conversationId: string): Observable<ConversationState>;
}
```

**`SessionsObserver`** is intentionally an *observability* surface, not a *control* surface. When PR #2787's Sessions/Channels infrastructure runs (e.g., a user activates voice and the Voice Co-Agent spawns a Session), the runtime observes that Session's lifecycle and surfaces it through the same `ConversationTurnEvent` stream consumers already subscribe to. The Sessions/Channels infrastructure itself lives in `core-entities` + the agent runtime — this plan does not duplicate it.

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
4. **Code-const fallback** — `Agents.find(a => a.Name === DEFAULT_FALLBACK_AGENT_NAME)` where `DEFAULT_FALLBACK_AGENT_NAME = 'Sage'`. Last-resort safety net so the system never throws on a clean install where seeding may have skipped.

If even step 4 misses (no agent named `Sage` exists in the install), the resolver throws a descriptive error rather than returning `null` — the current code path logs a warning and returns `null`, which makes misconfigurations hard to spot at the call site.

**No schema migration.** The hardcoded `Agents.find(a => a.Name === 'Sage')` from today's three call sites collapses into the single fallback constant inside the resolver, kept around purely as the safety net.

**The default ships as a metadata seed.** A new directory `metadata/application-settings/` containing `.sage-default-agent.json` seeds the global setting:

```json
{
  "fields": {
    "ApplicationID": null,
    "Name": "Conversations.DefaultAgentID",
    "Value": "@lookup:MJ: AI Agents.Name=Sage",
    "Comments": "Global default conversation-manager agent. App-scoped overrides take precedence."
  }
}
```

On every install that runs `mj sync push`, the setting exists and the resolver never needs the fallback. Deployments that want a different global default rewrite the lookup value to their chosen agent (e.g., Betty in the Betty v2 deployment); deployments that want a per-app override add an app-scoped row.

**Caching.** `ApplicationSettingEngine` already caches and exposes a reactive observable. `AIEngineBase.Instance.Agents` already caches all agents. The resolver caches its result per `(applicationId, explicitAgentId)` for the lifetime of a turn and invalidates when either source emits a change.

### 4d. AI Agent Sessions & Channels integration

> **Status revision (post-#2787 merge):** PR #2787 (sessions/channels infrastructure) has now landed in `next`. The original framing of this section as a "stub task" is replaced by the real wiring described below. Stub language preserved in the rejected-alternatives section for history.

PR #2787 introduced Sessions (long-lived wrappers over multiple `AIAgentRun`s of a real-time interaction) and Channels (interactive, bidirectional surfaces the agent perceives and acts on — voice, whiteboard, text, etc.). The conversations runtime does **not** invent a parallel abstraction; it observes and surfaces what PR #2787 owns.

**Architecture — adapter pattern, identical shape to `INotificationAdapter` / `IActiveTaskTracker`:**

```
ConversationsRuntime (pure TS, framework-agnostic)
  └── Sessions: SessionsObserver
        └── subscribes to ← ISessionsAdapter (interface in conversations-runtime)
              ├── Default: NoOpSessionsAdapter (EMPTY observable, headless-friendly)
              └── Angular impl: VoiceSessionsAdapter (in ng-conversations)
                    └── bridges → VoiceSessionService (PR #2787)
                          ├── SessionStarted$  → 'session-started' event
                          ├── ActiveChannels$  → diff into 'session-channel' open/close
                          └── SessionEnded$    → 'session-ended' event
```

**Why an adapter, not direct subscription?** The runtime must remain Angular-free so non-Angular consumers (React, Vue, Node workers) can use it. The adapter contract is the explicit boundary; the host implements it for whatever session source it has.

**Narrowed event payloads** — honest about what's distinguishable client-side today:

```typescript
type SessionLifecycleEvent =
  | { kind: 'session-started';   sessionId: string; channelKinds: string[]; }
  | { kind: 'session-channel';   sessionId: string; channelKind: string;
                                  state: 'open' | 'closed'; }          // narrowed from 4 states
  | { kind: 'session-ended';     sessionId: string;
                                  reason: 'explicit' | 'error' | 'unknown'; }  // narrowed from server's 4
```

- `'opening'`/`'closing'` channel states were dropped because `VoiceSessionService`'s only channel observable (`ActiveChannels$`) only carries the full plugin array — no per-channel transition observable exists today. Future widening (adding `Status$` to `BaseRealtimeChannelClient`) is non-breaking.
- `'janitor'`/`'shutdown'` reasons happen out-of-process on the server (janitor sweep while the tab is gone, host shutdown) and have no client push channel today. They're observability concerns, not orchestration.

**Cross-package change — minimal addition to `VoiceSessionService` (`@memberjunction/ng-conversations`):**

Two new `Observable<...>` exports emitted at deterministic points:

- `SessionStarted$: Observable<{ sessionId: string; channelNames: string[] }>` — fires after `mintSession` resolves AND `Connect()` returns, so subscribers see a guaranteed non-null `sessionId`. Avoids the `Active$ → true` / `agentSessionId === null` race window.
- `SessionEnded$: Observable<{ sessionId: string; reason: 'explicit' | 'error' }>` — fires in `teardown()` with the prior `agentSessionId` captured before nulling. Reason is `'explicit'` when triggered by `EndVoiceSession`, `'error'` when triggered by the start-path catch block.

This is analogous to the `beforeToolInvoked` cancel-enforcement addition to `AgentClientSession` — small, surgical, additive contract additions to PR-#2787-owned code so the runtime layer can bridge without race conditions.

**Scope cut — server-only events.** The `MJ: AI Agent Sessions` row is the durable truth (`Status`, `CloseReason`, `ClosedAt` columns), but server-side close events that fire while the user's tab is gone do NOT propagate to the runtime today (no GraphQL subscription on `AIAgentSession` rows). Admin/observability tooling polls the entity for those. Adding a subscription is out of scope; if a future PR adds one, the runtime can layer a second adapter that merges with `VoiceSessionsAdapter`.

**`RealtimeSessionReviewService` is unrelated.** It loads past sessions for replay; it doesn't observe live lifecycle. Not bridged.

**Wired surfaces:**

- `ConversationsRuntime.Instance.Sessions.SessionLifecycle$` — pure-TS consumers subscribe here.
- `ConversationsRuntime.Instance.UseSessionsAdapter(adapter)` — hosts register at bootstrap.
- `<mj-conversation-chat-area>`'s `(sessionStarted)`, `(sessionChannelStateChanged)`, `(sessionEnded)` outputs — Angular consumers subscribe through the widget's existing event surface.

**Net cost of the real wiring:** ~250 lines across `ISessionsAdapter` (new file in `ConversationsRuntime`), the enhanced `SessionsObserver`, `VoiceSessionsAdapter` (new file in `ng-conversations`), 2 new observables on `VoiceSessionService`, chat-area's subscription, plus 18 unit tests covering the round-trip.

### 4e. Widget extension surface

All additive on `mj-conversation-chat-area`. Existing embeds (Form Builder, Component Studio) are untouched.

**New `@Input()`s:**

```typescript
// Persona/character — opt-in; off by default
@Input() ShowAgentCharacter: boolean = false;
@Input() AgentCharacterConfig: AgentCharacterConfig | null = null;
//        { avatarUrl, characterName, voiceStateMode: 'subtle' | 'prominent' }

// Default-agent resolution context (formalize)
@Input() ApplicationId: string | null = null;

// Empty-state customization (today only EmptyStateGreeting exists)
@Input() EmptyStateConfig: EmptyStateConfig | null = null;
//        { greeting, subtext, suggestedPrompts, hideDefaultPrompts }
```

*(`PreferredChannel` from the original draft is gone — channel selection is owned by the Sessions/Channels infrastructure in PR #2787; the widget reacts to Session state via the new outputs below, not to a channel preference input.)*

**New slot system: `ChatSlotDirective` + interface contracts + cloneable default components.**

Five named slots — each has (a) a `mjChatSlot` template form for ad-hoc projection, (b) a TypeScript interface every slot component implements so the widget can call into it with a strong contract, and (c) an exported standalone default component the consumer can clone, subclass, or wrap (containment pattern):

| Slot | Interface | Default standalone component | Purpose |
|---|---|---|---|
| `emptyState` | `IMJChatEmptyStateComponent` | `MJChatEmptyStateDefaultComponent` | What renders before any messages exist |
| `agentPresence` | `IMJChatAgentPresenceComponent` | `MJChatAgentPresenceDefaultComponent` | Character / avatar / voice-state visualization |
| `header` | `IMJChatHeaderComponent` | `MJChatHeaderDefaultComponent` | Top bar (title, agent picker, export/share toggles) |
| `messageExtra` | `IMJChatMessageExtraComponent` | `MJChatMessageExtraDefaultComponent` | Per-message decoration (inline within the bubble) |
| `demonstrationSurface` | `IMJChatDemonstrationSurfaceComponent` | `MJChatDemonstrationSurfaceDefaultComponent` *(no-op default)* | **NEW.** Adjacent full-width surface for content the agent is "walking through" (e.g., annotated lesson material). Off unless a slot is supplied. |

```typescript
// Example interface contract — the widget can speak with confidence to whatever component lands in the slot
export interface IMJChatEmptyStateComponent {
  Greeting: string;
  Subtext?: string;
  SuggestedPrompts?: string[];
  PromptSelected: EventEmitter<string>;     // standardized output
}
```

**Three consumption modes, all first-class:**

```html
<!-- Mode 1: Project an ad-hoc template -->
<mj-conversation-chat-area ...>
  <ng-template mjChatSlot="emptyState">
    <my-warm-welcome />
  </ng-template>
</mj-conversation-chat-area>

<!-- Mode 2: Wrap the exported default (containment) -->
<mj-conversation-chat-area ...>
  <ng-template mjChatSlot="agentPresence" let-state>
    <my-warm-frame>
      <mj-chat-agent-presence-default [State]="state" [Mode]="'prominent'" />
    </my-warm-frame>
  </ng-template>
</mj-conversation-chat-area>
```

```typescript
// Mode 3: Subclass the exported default
@Component({ selector: 'my-tutor-presence', standalone: true, ... })
export class MyTutorPresenceComponent
  extends MJChatAgentPresenceDefaultComponent
  implements IMJChatAgentPresenceComponent {
  // Override only what you need
}
```

If a slot is not supplied, the component renders its exported default. Zero change-detection cost when slots are absent.

**New lifecycle `@Output()`s — Before/After cancelable pattern.**

Per established MJ convention (see `packages/Angular/Generic/trees/src/lib/events/tree-events.ts`, `packages/Angular/Generic/base-forms/src/lib/types/form-events.ts`, and `packages/Angular/Generic/clustering/src/lib/clustering.types.ts`), action events come as `Before*` / `After*` pairs. The `Before*` event carries an args object extending `CancellableChatEventArgs` (with a `Cancel: boolean` property the listener can flip); the widget checks `if (event.Cancel) return;` before proceeding and emits the corresponding `After*` only on the non-canceled path. Informational events (progress, shown notifications) stay as single emitters.

```typescript
// Base — mirrors MJ's established CancellableEventArgs idiom
export class CancellableChatEventArgs {
  Cancel: boolean = false;
  CancelReason?: string;
}

// Agent-turn lifecycle
export class BeforeAgentTurnEventArgs extends CancellableChatEventArgs {
  readonly Input: SendMessageInput;
}
export class AfterAgentTurnEventArgs {
  readonly AgentRunId: string;
  readonly Result: ExecuteAgentResult;
}

// Tool invocations (the agent invoking a client tool)
export class BeforeToolInvokedEventArgs extends CancellableChatEventArgs {
  readonly ToolName: string;
  readonly Args: unknown;
}
export class AfterToolInvokedEventArgs {
  readonly ToolName: string;
  readonly Args: unknown;
  readonly Result: unknown;
}

// Response form submission
export class BeforeResponseFormSubmittedEventArgs extends CancellableChatEventArgs {
  readonly FormId: string;
  readonly Values: Record<string, unknown>;
}
export class AfterResponseFormSubmittedEventArgs {
  readonly FormId: string;
  readonly Values: Record<string, unknown>;
}

// Widget @Output declarations
@Output() BeforeAgentTurn = new EventEmitter<BeforeAgentTurnEventArgs>();
@Output() AfterAgentTurn  = new EventEmitter<AfterAgentTurnEventArgs>();
@Output() AgentTurnProgress = new EventEmitter<{ step; percent?; message? }>(); // informational

@Output() BeforeToolInvoked = new EventEmitter<BeforeToolInvokedEventArgs>();
@Output() AfterToolInvoked  = new EventEmitter<AfterToolInvokedEventArgs>();

@Output() ResponseFormShown = new EventEmitter<{ formId; questionsCount }>();   // informational
@Output() BeforeResponseFormSubmitted = new EventEmitter<BeforeResponseFormSubmittedEventArgs>();
@Output() AfterResponseFormSubmitted  = new EventEmitter<AfterResponseFormSubmittedEventArgs>();

// Session lifecycle (from PR #2787 integration, Section 4d) — informational only;
// cancellation of voice/realtime activity lives at the Sessions layer, not here
@Output() SessionStarted = new EventEmitter<{ sessionId; channelKinds }>();
@Output() SessionChannelStateChanged = new EventEmitter<{ sessionId; channelKind; state }>();
@Output() SessionEnded = new EventEmitter<{ sessionId; reason }>();
```

**Concrete consumer use cases this enables without forking the widget:**
- Pause a video on `BeforeAgentTurn` (don't cancel — just sync UI state alongside).
- Block a destructive tool invocation client-side: `BeforeToolInvoked` listener sets `Cancel = true` if the user hasn't confirmed.
- Capture analytics on `AfterAgentTurn` / `AfterToolInvoked`.
- Coordinate UI lighting/dim with `SessionChannelStateChanged` (e.g., dim the room when the voice channel transitions to `open`, restore when `closed`).

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

1. Existing inputs on `mj-conversation-chat-area` remain in place with identical defaults and identical semantics. New inputs all have safe defaults (`false`, `null`).
2. Existing outputs continue to fire on the same events. New outputs are additive — Before/After pairs are new emitters; no existing emitter is renamed or repurposed.
3. The deprecated `conversation-workspace.component` is left alone.
4. `mj-mention-editor` is untouched.
5. `mj-chat-agents-overlay` keeps its existing input/output surface; internally it switches from injecting Angular services to consuming `ConversationsRuntime.Instance`, which is invisible to consumers.

**No schema migration ships with this plan.** The default-agent change is purely metadata: a new `metadata/application-settings/.sage-default-agent.json` seeds the global default. Existing installs preserve today's "Sage is the default" behavior either via the seed (on next `mj sync push`) or via the code-const fallback (if they skip the sync).

---

## 6. Documentation deliverables

Per review feedback, docs scope is *wider* than a single new guide — every README touched by this work is updated, and any older guide rendered obsolete is updated in place rather than orphaned.

### 6a. TSDoc

Every exported class, interface, and method in `conversations-runtime` gets a TSDoc block. Each block: what it does (one sentence), when to use it vs. the obvious alternative, an `@example` when the signature isn't self-explanatory.

The same TSDoc bar applies to every new public symbol in `ng-conversations` (slot interfaces, default slot components, event arg classes).

### 6b. READMEs to write or update

| README | Action | What it covers |
|---|---|---|
| `packages/ConversationsRuntime/README.md` | **NEW** | Overview, "when to use this vs. the widget", `Config()` bootstrap, four short code samples (send a message, observe a conversation, register a client tool, observe Sessions). Links to the guide. |
| `packages/Angular/Generic/conversations/README.md` | **UPDATE** | Reposition the package as the Angular wrapper over the runtime. Full prop/event reference for the new extension surface. Slot system + three consumption modes (project / wrap / subclass). Updated embed examples that match current Form Builder + Component Studio usage. |
| `packages/MJCoreEntities/src/engines/conversations.ts` | **JSDoc top-of-file expand** | Clarify that `ConversationEngine` is the data layer; orchestration lives in `@memberjunction/conversations-runtime`. Point readers at the new package. |
| Any subpackage README that mentions the chat widget today | **UPDATE in place** | Audit pass. Anything that references the widget's internal services or implies they're a public API gets corrected. |

### 6c. New guide: `guides/CONVERSATIONS_UX_STACK_GUIDE.md`

Modeled on `FORMS_ARCHITECTURE_GUIDE.md` and `NAVIGATION_AND_ROUTING_GUIDE.md`. Structure:

- Three-layer stack diagram.
- "I want a chat surface in my app" decision tree (default config → embed → DefaultAgentId/linked-record → slots/character/tokens → headless runtime).
- Widget reference: full props/events, the slot system (with interfaces + cloneable defaults), Before/After cancelable event pattern, design tokens.
- Runtime reference: `Config()`, `sendMessage`, `observeConversation`, client tools, Sessions observability.
- `MJ: Application Settings` reference (the 3-step default-agent resolution chain + code-const fallback + the seeded default).
- **Worked examples** — Form Builder embed (as-is), "warm tutor full-page with character" pattern (built on slots + tokens), server-side conversation read (Node worker).
- Anti-patterns — don't import widget internals; don't depend on `conversations-runtime` from `core-entities` (cycle); don't reimplement Sessions/Channels (they live in PR #2787's stack); don't bypass slot interfaces with `any`-typed templates.
- Cross-references — `FORMS_ARCHITECTURE_GUIDE.md`, `plans/ai-agent-sessions.md`.

### 6d. Guides to update or retire

- `audio-agent-architecture.md` and `complete/multi-modal-chat-support.md` are superseded by PR #2787's `plans/ai-agent-sessions.md`. Replace with one-line redirect notes; do not delete (the conversation history is useful).
- Any existing guide that references "Sage hardcoded" or "the widget's services" gets updated to reflect the new resolver and the runtime split.

### 6e. Runnable example component

Per feedback, ship a concrete personalization example, not just docs. A new package `packages/Angular/Generic/conversations/examples/` (or a similar location) holds:

- `ChatWithWarmCharacterExample` — a standalone Angular component using slots + persona inputs + token overrides to produce a warm, character-driven chat surface. Imports the exported default slot components and demonstrates the subclass + wrap modes. Suitable as a copy-and-modify starting point for downstream apps.
- Sample `--mj-chat-*` token override file shown in the README.

### 6f. CLAUDE.md root

One new line in the existing development-guides list pointing to the new guide. No other CLAUDE.md edits.

---

## 7. Tests

Vitest, `src/__tests__/`, no DB, mocks at boundaries — MJ standard.

**Pure-TS runtime — `packages/ConversationsRuntime/src/__tests__/`:**

| Test file | Covers |
|---|---|
| `ConversationsRuntime.test.ts` | `Config()` lazy load, singleton semantics, sub-component composition, `provider?` fallback to `Metadata.Provider` |
| `DefaultAgentResolver.test.ts` | The 3-step resolution chain — one test per layer plus tie-breaker tests, plus the code-const Sage fallback when no setting is configured, plus the descriptive-error path when even the fallback misses. Mocks `ApplicationSettingEngine` + `AIEngineBase`. |
| `ConversationAgentRunner.test.ts` | `sendMessage()` happy path: started → progress → complete. Error path: started → error. Resolution failure surfaces a descriptive error |
| `ConversationStreaming.test.ts` | PubSub message routing by `ConversationDetailID`, late-arrival replay (5-minute window), unsubscribe cleanup |
| `ClientToolRegistry.test.ts` | register / deregister / dispatch, decorator chain, context propagation, missing-tool error |
| `SessionsObserver.test.ts` | Stub-mode behavior — no-ops cleanly until PR #2787 is wired in. Asserts the no-op observer produces no errors when subscribed and never emits Session events. **Real Sessions integration tests follow once PR #2787 lands.** |
| `MentionParser.test.ts` | Ported from current package (already exists) |
| `ConversationBridge.test.ts` | Ported from current package (already exists) |

Coverage target: **80%+ line coverage on the runtime package.**

**Angular widget — `packages/Angular/Generic/conversations/src/__tests__/`** (additive to existing tests):

| Test file | Covers |
|---|---|
| `ChatSlotDirective.test.ts` | Slot registry — projection works when slot supplied, default standalone component renders when absent. All five slots covered. |
| `slot-interfaces.test.ts` | Every default slot component satisfies its declared interface (compile-time assertion in TS plus runtime smoke). |
| `chat-area.persona.test.ts` | `ShowAgentCharacter` + `AgentCharacterConfig` inputs render the character zone; off by default |
| `chat-area.events.before-after.test.ts` | Before/After cancelable event pairs — `Cancel = true` halts default behavior and suppresses the `After*` emit; `Cancel = false` (default) lets it through and fires the `After*`; informational events fire regardless. Covers `BeforeAgentTurn`/`AfterAgentTurn`, `BeforeToolInvoked`/`AfterToolInvoked`, `BeforeResponseFormSubmitted`/`AfterResponseFormSubmitted`. |
| `chat-area.tokens.test.ts` | New `--mj-chat-*` tokens have correct fallbacks to existing semantic tokens |

**One integration smoke test** in `packages/ConversationsRuntime/src/__tests__/integration/sendMessage.smoke.test.ts`: mock `IMetadataProvider` + mock GraphQL client, call `sendMessage()`, assert full event sequence comes back. Catches wiring regressions across all sub-components at once.

**No new Playwright tests.** Existing browser smoke tests should catch widget regressions. Add Playwright coverage only if real regressions surface during dogfooding.

**CI gate.** PR has to pass:
1. Both packages' Vitest suites.
2. Full Turborepo `npm run build` (catches downstream TypeScript breakage in apps consuming the widget).
3. MJExplorer Vite/ESBuild build (catches lazy-load / dependency-graph regressions).

---

## 8. Sequencing

The work decomposes into six steps (the original Step 1 migration is gone — see Section 4c). Each step is independently committable and reviewable; the PR could ship as one branch or as a stacked series.

**Step 1 — Create `@memberjunction/conversations-runtime` package skeleton** (~1 hr)
- New package directory with `package.json`, `tsconfig.json`, `vitest.config.ts`, scaffolded `src/index.ts`.
- Declared deps: `@memberjunction/core`, `@memberjunction/core-entities`, `@memberjunction/global`, `@memberjunction/ai-agent-client`, `@memberjunction/ai-core-plus`, `@memberjunction/ai-engine-base`, `@memberjunction/graphql-dataprovider`, `rxjs`. **No Angular deps.**
- Empty `ConversationsRuntime` class extending `BaseEngine`, exports.
- Verify `npm run build` from package directory succeeds and the package is picked up by Turborepo.

**Step 2 — Port the pure-TS sub-components** (~3 hrs)
- Port `MentionParserService` → `MentionParser` (essentially a rename — already pure).
- Port `ConversationBridgeService` → `ConversationBridge` (strip `@Injectable()`, keep RxJS).
- Port `ConversationStreamingService` → `ConversationStreaming`.
- Port `ConversationAgentService` → `ConversationAgentRunner` (the bulk of the work; this is the agent-run pipeline).
- Port the client-tool registry logic out of `AgentClientSession` reuse (or wrap it) into `ClientToolRegistry`.
- Stub `SessionsObserver` as a no-op (real wiring follows once PR #2787 lands).
- Migrate existing Vitest tests for `MentionParser` and `ConversationBridge`.

**Step 3 — Wire `DefaultAgentResolver` + metadata seed** (~1 hr)
- Reads `ApplicationSettingEngine.Instance.GetSetting('Conversations.DefaultAgentID', applicationId)` for layers 2 + 3.
- Code-const fallback `Agents.find(a => a.Name === 'Sage')` for layer 4.
- Author `metadata/application-settings/.sage-default-agent.json` and the `.mj-sync.json` for the new metadata folder. Test that `mj sync push` upserts the global setting.
- Comprehensive unit tests for the 3-step chain + fallback + descriptive-error path.

**Step 4 — Update `@memberjunction/ng-conversations` to consume the runtime** (~4 hrs)
- Existing services (`ConversationAgentService`, `ConversationStreamingService`, etc.) become thin wrappers that delegate to `ConversationsRuntime.Instance.*`. Some can be removed entirely; some stay as Angular DI shims for components that already inject them (to avoid blast-radius churn).
- Replace the three `Agents.find(a => a.Name === 'Sage')` call sites with `ConversationsRuntime.Instance.DefaultAgent.resolve(...)`.
- Add the new `@Input()`s (`ShowAgentCharacter`, `AgentCharacterConfig`, `ApplicationId`, `EmptyStateConfig`).
- **Add `ChatSlotDirective` + interface contracts + exported default slot components** for all five slots (`emptyState`, `agentPresence`, `header`, `messageExtra`, `demonstrationSurface`).
- **Add Before/After cancelable `@Output()`s** for the agent-turn / tool-invoked / response-form-submitted events; informational outputs for progress / Session events.
- Add `--mj-chat-*` token definitions in the package's SCSS, defaulting to existing semantic tokens.
- Run existing test suite to confirm no regressions; add new tests for the new surface.

**Step 5 — Manual verification of the three existing embeds + slot stress-test** (~1.5 hrs)
- Build MJExplorer.
- Open the corner overlay — confirm it still toggles, renders messages, streams progress.
- Navigate to the full-page Chat app — confirm conversation list + chat area still work.
- Open Form Builder cockpit — confirm the embedded chat-area still routes to the Form Builder agent (its `[DefaultAgentId]` input still wins, layer 1).
- Open Component Studio AI Assistant — same verification.
- Run a conversation that invokes a client tool (e.g., ask Sage to navigate somewhere) — confirm tool dispatch still works.
- **Slot stress-test:** build the example `ChatWithWarmCharacterExample` against the new slot system and verify it covers the two zones flagged by design review: (a) a full-page text view paired with a "voice call" view on one conversation, and (b) the demonstrative-material surface via `demonstrationSurface`. If either zone reveals a missing primitive, that's a stop-the-line signal and the design comes back for revision before proceeding.

**Step 6 — Documentation + Sessions integration stub** (~3.5 hrs)
- TSDoc pass over the runtime public API.
- `packages/ConversationsRuntime/README.md` (new).
- `packages/Angular/Generic/conversations/README.md` update.
- Top-of-file JSDoc expand on `ConversationEngine` in `core-entities`.
- Audit pass over subpackage READMEs that mention the widget.
- `guides/CONVERSATIONS_UX_STACK_GUIDE.md` (new).
- One-line redirect notes in `audio-agent-architecture.md` and `complete/multi-modal-chat-support.md` pointing at PR #2787's `plans/ai-agent-sessions.md`.
- CLAUDE.md root cross-reference line.
- **`ChatWithWarmCharacterExample`** runnable component.
- **Sessions integration stub:** confirm the `SessionsObserver` no-op compiles and tests pass; document the follow-up task that wires it against PR #2787's public API.

**Honest total estimate:** ~14 hours of focused engineering work, plus review (slightly more than the original 12 — the slot interface/cloneable-default work and the wider docs audit add hours, partially offset by dropping the migration). Plan accordingly: **2-3 focused days end-to-end with review in the loop**, not a single uninterrupted day.

**Follow-up after PR #2787 lands** (separately tracked, not in scope of this PR):
- Replace the `SessionsObserver` stub with real subscriptions against PR #2787's Sessions/Channels surface.
- Add real Session integration tests.
- Update the new guide's Sessions section once the public API stabilizes.

---

## 9. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Form Builder / Component Studio embed regresses during the widget rewrite | Medium | High — both are in production | Manual verification step (Step 5) is non-skippable. CI runs the full Turborepo build. Existing embed configurations are documented as the regression test set. |
| The runtime package accidentally pulls an Angular transitive dep | Low | Medium — defeats the purpose | `package.json` declares zero Angular deps. CI build verifies. Reviewers explicitly check the lock-file diff. |
| `ApplicationSettingEngine` cache misses or wrong-scope resolution surprises consumers | Low | Medium — wrong agent gets picked | Resolver unit tests cover every chain step + tie-breakers. The descriptive error path surfaces misconfigurations loudly instead of falling back silently. |
| PR #2787's Sessions/Channels public API differs from what `SessionsObserver` assumes | Medium | Low — observer is a no-op stub until #2787 lands | Wiring is deferred to a follow-up tracked outside this PR. The integration is small (~40 lines per Section 4d). Cross-reference both plan docs to stay aligned. |
| The "headless runtime" path gets abused — apps build custom chat UX they didn't need | Medium | Medium — fragments MJ chat UX over time | The new guide includes an explicit "before going headless, prove the widget slots/inputs can't cover it" guardrail. Code review enforces. |
| The slot stress-test (Step 5) reveals a missing primitive (e.g., the warm tutor home or demonstrative-material zone can't be expressed cleanly with current slots) | Medium | Medium — design needs revision before proceeding | Treat this as a stop-the-line signal. Either add a new slot or revise the existing slot interfaces; do not paper over with `any`-typed templates. The new guide's anti-patterns section reinforces this. |
| Singletons cross-contaminate in multi-provider client setups | Low | High — wrong-server data shows up in wrong conversation | Every runtime API accepts `provider?: IMetadataProvider`. CLAUDE.md's existing per-provider rule applies; tests cover the multi-provider case. |
| Turborepo dependency graph becomes harder to reason about after adding the new package | Low | Low | One new package, clearly placed in the layer diagram. Documented in the guide. |

---

## 10. Out of scope (explicitly)

- Implementing the Sessions/Channels/Realtime stack. That's PR #2787 (`plans/ai-agent-sessions.md`). This plan integrates with it via a no-op stub now; real wiring follows once that PR lands.
- Building any UI for the downstream learning app — the widget extensions are general-purpose, the app team consumes them.
- Removing the deprecated `conversation-workspace.component` — can ride a separate cleanup PR.
- Refactoring `mj-mention-editor` — already standalone, no need.
- Server-side reference implementation — the runtime is designed for server-side use, but proving it with a real Node consumer is a follow-up, not a launch requirement. Tests cover the `provider?` parameter path.
- Per-linked-entity default agent resolution (e.g., "this Course nominates its own tutor agent"). Adds an entity-metadata convention that doesn't exist today; consider as a follow-up if real demand surfaces.
- Adding a junction `MJ: Application Default Agent` table for multiple agents per application. The 3-step Application-Settings chain is leaner; revisit only if multiple-default-agents-per-app becomes a real need.

---

## 11. Cross-references

- `packages/Angular/Generic/conversations/` — current widget implementation.
- `packages/MJCoreEntities/src/engines/conversations.ts` — existing `ConversationEngine` (data layer; unchanged by this plan).
- `packages/MJCoreEntities/src/engines/ApplicationSettingEngine.ts` — existing settings engine the resolver consumes.
- `packages/MJCore/src/generic/baseEngine.ts` — `BaseEngine` reference for the runtime class shape.
- `packages/Angular/Generic/trees/src/lib/events/tree-events.ts` — reference implementation of the Before/After cancelable event pattern used in Section 4e.
- `packages/Angular/Generic/base-forms/src/lib/types/form-events.ts` — second reference for the same pattern (`CancellableFormEvent` family).
- `packages/Angular/Generic/clustering/src/lib/clustering.types.ts` — third reference, generic `CancelableEvent<T>` variant.
- `guides/FORMS_ARCHITECTURE_GUIDE.md` — structural model for the new guide.
- `guides/NAVIGATION_AND_ROUTING_GUIDE.md` — same; both are multi-layer subsystem guides.
- **PR #2787 (`plans/ai-agent-sessions.md`)** — Real-Time AI Agents: `BaseRealtimeModel`, `Realtime` agent type, Voice Co-Agent, Sessions/Channels infrastructure. The conversations runtime integrates with it; the channel abstraction lives there, not here. *(Supersedes the earlier `plans/audio-agent-architecture.md` and `plans/complete/multi-modal-chat-support.md` — those get one-line redirect notes per Section 6d.)*
- `CLAUDE.md` — root project rules; the new guide adds one cross-reference line.
