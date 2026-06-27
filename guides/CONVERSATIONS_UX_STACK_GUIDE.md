# Conversations UX Stack Guide

How MemberJunction's conversational AI surfaces are layered — orchestration
logic in a pure-TS runtime, Angular widget on top, your app on top of that —
so the same conversation engine drives a corner overlay, a full-page Chat
workspace, an embedded cockpit, **and** a future React/Vue/Node consumer
without forking.

> **TL;DR** — `@memberjunction/conversations-runtime` is a framework-agnostic
> singleton that handles agent dispatch, default-agent resolution, mentions,
> bridge state, streaming, client tools, and sessions observability.
> `@memberjunction/ng-conversations` (Angular widget) is one consumer; non-Angular
> hosts (React, Vue, Node) are also intended consumers and get the same engine.
> Hosts wire UI concerns through small **adapter** interfaces. Customize the
> widget via **slots** + Before/After **events** + `--mj-chat-*` **tokens** —
> no fork required.

---

## 1. The big picture

```
┌─ Layer 4   Your app                                                    (consumer code)
│            <mj-conversation-chat-area> + slots + event handlers + tokens
│            OR React/Vue/Node consumer driving ConversationsRuntime directly
├─ Layer 3   @memberjunction/ng-conversations                            (Angular widget)
│            chat-area / message-list / message-item / overlay /
│            realtime overlay / 6 slots + ChatSlotDirective /
│            ConversationsRuntimeBootstrap (registers adapters into runtime)
├─ Layer 2   @memberjunction/conversations-runtime  ★ pure TS, zero UX deps
│            ConversationsRuntime singleton (BaseEngine + @RegisterForStartup)
│            ├── Mentions · Bridge · AgentRunner · Streaming
│            ├── DefaultAgent · Tools · Sessions
│            └── Adapter slots: Notification · ActiveTaskTracker · Sessions
└─ Layer 1   @memberjunction/core-entities + @memberjunction/ai-agent-client
             ConversationEngine (data CRUD) · ApplicationSettingEngine ·
             AIEngineBase · AgentClientSession · ClientToolRegistry
```

**Layering rule:** any non-Angular JavaScript host (React, Vue, Node workers,
CLI tools, server-side jobs, test harnesses) consumes Layer 2 directly. The
Angular widget IS one consumer of the runtime — not its parent or owner.

---

## 2. Why a runtime?

Before the split, every orchestration concern lived inside
`@memberjunction/ng-conversations` as `@Injectable()` services intermixed
with components. Three real costs:

| Cost | Symptom |
|---|---|
| **Non-Angular consumers had to fork.** | React/Vue apps that wanted MJ's conversation engine could only get it by importing the Angular widget — which pulled in `@angular/core`, Kendo, ag-Grid, Markdown rendering, and a dozen UI deps they didn't need. |
| **Headless test harnesses had to mock Angular DI.** | Server-side tests of "send a message → agent replies" needed a fake `MJNotificationService`, `ActiveTasksService`, etc. just to call `processMessage`. |
| **Default-agent logic was duplicated.** | The string `'Sage'` appeared in 3 files as a `.find()` lookup. Adding a per-app default required touching all 3. |

The runtime addresses all three by being framework-agnostic with **adapter
interfaces** for the UI concerns the host owns (notifications, active-task
tracking, sessions).

---

## 3. When to use each layer

| You're building... | Use |
|---|---|
| An Angular app with a chat overlay or workspace, possibly customized | **Layer 3** (`<mj-conversation-chat-area>`) — slots + events + tokens |
| An Angular embed (Form Builder cockpit, Component Studio AI panel) | **Layer 3** with `[defaultAgentId]` pinned |
| A React or Vue chat surface | **Layer 2** directly — implement adapters in your framework |
| A Node worker that sends agent messages on a schedule | **Layer 2** — register `ConsoleNotificationAdapter` (default), `NoOpActiveTaskTracker` (default), call `AgentRunner.processMessage` |
| A custom server-side runner that observes conversations | **Layer 2** — subscribe to `Streaming` or `Sessions` |
| **You're forking the widget because you can't customize it through slots/events** | **Stop and file an issue.** That's the gap the slot system is designed to fill. |

---

## 4. The adapter pattern (the boundary between runtime and host)

The runtime needs UI affordances (toasts, active-task indicators, session
lifecycle observability) but cannot import any framework. Hosts implement small
interfaces and register them at bootstrap:

| Adapter | What the runtime calls | Angular default | Headless default |
|---|---|---|---|
| `INotificationAdapter` | `Notify(level, message, ttlMs?)` | Bridges to `MJNotificationService.CreateSimpleNotification` | `ConsoleNotificationAdapter` (console.log/warn/error) |
| `IActiveTaskTracker` | `RemoveByAgentRunId(agentRunId)` | Bridges to `ActiveTasksService.removeByAgentRunId` | `NoOpActiveTaskTracker` (no-op) |
| `ISessionsAdapter` | (observable) `SessionLifecycle$` | `RealtimeSessionsAdapter` bridges `RealtimeSessionService`'s `SessionStarted$` / `ActiveChannels$` / `SessionEnded$` | `NoOpSessionsAdapter` (EMPTY observable) |

### Registration (Angular host)

`ConversationsRuntimeBootstrap` (`providedIn: 'root'`) registers all three at
first injection. Every Angular DI shim service in `@memberjunction/ng-conversations`
takes it as a constructor dependency, so adapters are guaranteed registered
before any shim method runs.

### Registration (non-Angular host)

```typescript
import {
    ConversationsRuntime,
    ConsoleNotificationAdapter,
    NoOpActiveTaskTracker,
    NoOpSessionsAdapter,
} from '@memberjunction/conversations-runtime';

// Console-only defaults are fine for many headless cases — no setup needed.
await ConversationsRuntime.Instance.Config(false, contextUser, provider);

// OR register custom adapters
ConversationsRuntime.Instance.UseNotificationAdapter({
    Notify: (level, message) => myLogger.log(level, message),
});
ConversationsRuntime.Instance.UseActiveTaskTracker({
    RemoveByAgentRunId: (id) => myTaskState.delete(id),
});
ConversationsRuntime.Instance.UseSessionsAdapter(myCustomSessionsAdapter);
```

---

## 5. Default-agent resolution

The runtime answers "what agent should reply to this user message?" through a
5-step chain. The widget exposes step 1 via `[defaultAgentId]`; step 2 is the
app's own first-class agent config; steps 3–4 are the legacy Application Setting
key; step 5 is the global code fallback.

```
1. Explicit input  →  [defaultAgentId] on <mj-conversation-chat-area>
2. App AgentSettings →  Application.AgentSettings.DefaultAgentID
                       (the first-class app agent config — JSONType column;
                        read query-light by ID, cache-served on repeat)
3. App-scoped      →  Application Setting key 'Conversations.DefaultAgentID'
                       where ApplicationID = <current app>   [legacy fallback]
4. Global          →  Application Setting key 'Conversations.DefaultAgentID'
                       where ApplicationID IS NULL
                       (metadata-seeded to Sage at
                        metadata/application-settings/.sage-default-conversation-manager.json)
5. Code-const Sage →  Agents.find(a.Name === 'Sage')  — last-resort fallback
                       (kept so installs without metadata sync still work)
```

`Application.AgentSettings` (a JSONType column, shape `IAgentSettings`) is the
single first-class place an app declares its default/lead agent, the agents
relevant to it (`RelevantAgents` — the realtime co-agent's allowed-delegation
union), app-scoped client tools, and realtime persona/disclosure overrides. The
legacy `Conversations.DefaultAgentID` Application Setting still works as a
fallback for installs that configured it that way.

**Setting a different default for one app:**

```bash
# Add to metadata/application-settings/
{
  "fields": {
    "ApplicationID": "@lookup:MJ: Applications.Name=My Custom App",
    "Name": "Conversations.DefaultAgentID",
    "Value": "@lookup:MJ: AI Agents.Name=My Specialist Agent"
  }
}

mj sync push --dir=metadata --include="application-settings"
```

**Setting a per-conversation default** (overrides app-scoped for that one
conversation): the widget's per-conversation agent picker writes to
`MJConversationEntity.DefaultAgentID`. Higher-priority than step 1.

---

## 6. The slot system (extension surface)

The chat-area exposes 6 named template slots. Project a template via the
`mjChatSlot` directive to replace or augment the default rendering. Every
slot is **opt-in** — existing embeds see no UI change.

| Slot | What it covers | Activation |
|---|---|---|
| `header` | Replaces the entire `.chat-header` chrome (title, badges, export/share buttons) | Consumer projects `mjChatSlot="header"` |
| `agentPresence` | Sticky-top character/voice-state presence bar | `[showAgentCharacter]="true"` AND optional slot |
| `emptyState` | Replaces the welcome block on a fresh conversation | Consumer projects `mjChatSlot="emptyState"` |
| `messageRenderer` | Per-message renderer (full bubble replacement) | Consumer projects `mjChatSlot="messageRenderer"` |
| `messageExtra` | Additive content inside each default bubble, after the text | Consumer projects `mjChatSlot="messageExtra"` |
| `demonstrationSurface` | Layout-mode switch — stage takes main pane, messages → side rail | `[showDemonstrationSurface]="true"` AND slot |

### Three ways to consume each slot

Every slot ships with (a) an interface contract, (b) a standalone default
component, and (c) the `mjChatSlot` directive. Pick one:

**1. Project an ad-hoc template**
```html
<mj-conversation-chat-area>
    <ng-template mjChatSlot="emptyState" let-config>
        <div class="my-custom-welcome">
            <h1>Hello there!</h1>
            <p>{{ config?.subtext }}</p>
        </div>
    </ng-template>
</mj-conversation-chat-area>
```

**2. Wrap the default in containment (best for incremental customization)**
```typescript
@Component({
    selector: 'my-warm-empty-state',
    standalone: true,
    imports: [MJChatEmptyStateDefaultComponent],
    template: `
        <div class="warm-frame">
            <warm-tutor-illustration />
            <mj-chat-empty-state-default [Greeting]="Greeting" [Subtext]="Subtext" />
        </div>
    `,
})
export class WarmEmptyStateComponent implements IMJChatEmptyStateComponent { ... }
```

**3. Subclass the default**
```typescript
@Component({ selector: 'my-bubble', standalone: true, template: `...` })
export class MyBubbleComponent extends MJChatMessageBubbleDefaultComponent {
    // Override specific behavior; inherit the rest.
}
```

### Per-message slots — special note

`messageRenderer` and `messageExtra` are per-iteration. `message-list` uses
dynamic component creation (not `*ngFor`), so the slot integration uses a
dual rendering path: `ComponentRef<MessageItemComponent>` for the default,
`EmbeddedViewRef<MessageRendererContext>` for the consumer-projected template.
Both flow through `_renderedMessages: Map<string, RenderedMessageEntry>` with
a `kind` tag for narrowing.

---

## 7. Before/After cancelable events

Three event pairs let the host **observe AND veto** key actions before they
happen, plus session-lifecycle informational events.

| Pair | When it fires | Cancel enforced? |
|---|---|---|
| `(beforeAgentTurn)` / `(afterAgentTurn)` | Around `processMessage()` | ✓ Yes |
| `(beforeResponseFormSubmitted)` / `(afterResponseFormSubmitted)` | Around interactive form submission | ✓ Yes |
| `(beforeToolInvoked)` / `(afterToolInvoked)` | Around client-tool dispatch | ✓ Yes |
| `(sessionStarted)` / `(sessionChannelStateChanged)` / `(sessionEnded)` | Realtime session lifecycle | Informational — cancel not applicable |

### Cancel mechanics

```typescript
onBeforeToolInvoked(event: BeforeToolInvokedEventArgs) {
    if (event.ToolName === 'deleteRecord') {
        const ok = await this.confirm('Allow agent to delete?');
        if (!ok) {
            event.Cancel = true;
            event.CancelReason = 'User declined';
        }
    }
}
```

When `Cancel = true`:
- The action does NOT run (tool handler not called, agent turn aborts, form not submitted).
- The matching `(after*)` event does NOT fire.
- For tool cancel: the server receives `Tool dispatch canceled by host: <reason>`, so the agent can adapt.

### Synchronous semantics

`Subject.next()` and `EventEmitter.emit()` notify subscribers synchronously.
Your handler must mutate `event.Cancel` inline — async checks (awaits inside
the handler) won't be picked up. For async confirmations, surface them via
a UI flow that runs BEFORE the action is requested.

---

## 8. Persona & character

Three inputs on chat-area drive the "agent character" UX (default off):

```html
<mj-conversation-chat-area
    [showAgentCharacter]="true"
    [agentCharacterConfig]="{
        avatarUrl: '/sid.png',
        characterName: 'Sid',
        voiceStateMode: 'subtle',  // or 'prominent' for centered presence
        state: 'idle'              // 'idle' | 'listening' | 'thinking' | 'speaking'
    }"
    [emptyStateConfig]="{
        greeting: 'Hi! Want to walk through the lesson?',
        subtext: 'Tap a topic to start.',
        suggestedPrompts: ['What is X?', 'Explain Y']
    }">
</mj-conversation-chat-area>
```

When `[showAgentCharacter]` is `true`, the `agentPresence` slot renders a sticky
bar above the header. Per Matt's 06-10 placement design.

---

## 9. Design tokens (`--mj-chat-*`)

The widget defines a chat-specific token palette that defaults to MJ's semantic
tokens, so dark mode "just works" without consumer code. Override at any
`:root` scope to theme.

```css
:root {
    /* Bubbles */
    --mj-chat-bubble-user-bg:   var(--mj-brand-primary);
    --mj-chat-bubble-user-text: var(--mj-text-inverse);
    --mj-chat-bubble-agent-bg:  var(--mj-bg-surface-card);
    --mj-chat-bubble-agent-text: var(--mj-text-primary);

    /* Composer */
    --mj-chat-composer-bg:     var(--mj-bg-surface);
    --mj-chat-composer-border: var(--mj-border-default);

    /* Persona */
    --mj-chat-character-accent:       var(--mj-brand-primary);
    --mj-chat-presence-pulse-color:   var(--mj-brand-primary);

    /* Voice state */
    --mj-chat-voice-listening: var(--mj-status-info);
    --mj-chat-voice-thinking:  var(--mj-status-warning);
    --mj-chat-voice-speaking:  var(--mj-brand-primary);
}

/* Theme override — warm tutor surface */
.warm-tutor :root {
    --mj-chat-bubble-agent-bg: #fef3c7;  /* warm yellow */
    --mj-chat-character-accent: #ea580c; /* warm orange */
}
```

The tokens are injected at runtime by `ConversationsRuntimeBootstrap` via a
`<style id="mj-chat-tokens">` element in `<head>`. (Angular's emulated view
encapsulation rewrites `:root {}` inside `styleUrls`, breaking the global
selector — runtime injection sidesteps the issue.)

---

## 10. Sessions observability

When a user activates voice (or any future realtime channel), the widget's
`<mj-conversation-chat-area>` exposes three informational outputs:

```html
<mj-conversation-chat-area
    (sessionStarted)="onSessionStarted($event)"
    (sessionChannelStateChanged)="onChannelChange($event)"
    (sessionEnded)="onSessionEnded($event)">
</mj-conversation-chat-area>
```

```typescript
onSessionStarted(e: SessionStartedEventArgs) {
    console.log('Session', e.SessionId, 'started with channels:', e.ChannelKinds);
}

onChannelChange(e: SessionChannelStateChangedEventArgs) {
    // e.State is 'open' | 'closed'
    console.log('Channel', e.ChannelKind, 'is now', e.State);
}

onSessionEnded(e: SessionEndedEventArgs) {
    // e.Reason is 'explicit' | 'error' | 'unknown'
    console.log('Session ended:', e.Reason);
}
```

These re-broadcast from `ConversationsRuntime.Instance.Sessions.SessionLifecycle$`,
which is fed by whichever `ISessionsAdapter` the host registered. In Angular,
that's `RealtimeSessionsAdapter` (auto-registered by `ConversationsRuntimeBootstrap`),
which bridges `RealtimeSessionService`'s native observables.

### What's NOT surfaced

- **Channel `'opening'`/`'closing'` transitions.** Only `'open'`/`'closed'` —
  `RealtimeSessionService` only exposes the full channel array, not per-channel
  transitions. Future widening is non-breaking.
- **Server-only close reasons** (`'Janitor'`, `'Shutdown'`). Those happen
  out-of-process while the user's tab is gone; no client push channel today.
  Admin/observability tooling polls `MJ: AI Agent Sessions` for those.

---

## 11. Pre-warming with `@RegisterForStartup`

`ConversationsRuntime` is decorated with `@RegisterForStartup({ deferred: true,
deferredDelay: 5000, severity: 'warn' })`. Five seconds after app boot, the MJ
startup manager fires `HandleStartup()`, which calls `Config(false)` —
pre-loading `AIEngineBase`, `ApplicationSettingEngine`, and `ConversationEngine`
in the background.

Result: the first user to open chat doesn't pay the load cost. Failures log as
warnings (`severity: 'warn'`); boot is never blocked.

---

## 12. Multi-provider considerations

The runtime supports apps that connect to multiple MJ servers in parallel
(federated UIs, multi-tenant clients). Every `Config(forceRefresh, contextUser,
provider)` call accepts an explicit `IMetadataProvider`; when supplied, all
dependent engines (`AIEngineBase`, `ApplicationSettingEngine`,
`ConversationEngine`) scope to that provider.

Adapters are global (singleton), but they receive enough context (sessionId,
agent ID, user) to route correctly. If a future multi-provider setup needs
per-provider adapters, the runtime can be extended with provider-keyed adapter
maps — the interface contract doesn't change.

---

## 13. Examples

### Minimal Angular embed (everything default)

```html
<mj-conversation-chat-area
    [environmentId]="environmentId"
    [currentUser]="currentUser"
    [conversationId]="activeConversationId">
</mj-conversation-chat-area>
```

That's it. Sage replies through the global default agent. Tokens apply
automatically. All slots use defaults.

### Pinned-agent embed (Form Builder cockpit pattern)

```html
<mj-conversation-chat-area
    [defaultAgentId]="formBuilderAgentId"
    [applicationScope]="'Application'"
    [applicationId]="formBuilderAppId"
    [linkedEntityId]="componentsEntityId"
    [linkedRecordId]="currentComponentId"
    [showAgentPicker]="false">
</mj-conversation-chat-area>
```

The Form Builder agent answers (not Sage). New conversations are scoped to the
Form Builder app and linked to the current component record.

### Warm-character surface (Sid pattern)

```html
<mj-conversation-chat-area
    [showAgentCharacter]="true"
    [agentCharacterConfig]="sidCharacterConfig"
    [emptyStateConfig]="warmGreeting">

    <ng-template mjChatSlot="messageRenderer" let-message>
        <mj-chat-message-bubble-default [Message]="message" />
    </ng-template>
</mj-conversation-chat-area>
```

Sid presence at the top. Side-aligned bubble layout (user right, agent left).
Token-themed warm colors via `:root` overrides.

### Tool-call confirmation gate

```typescript
@Component({ ... })
export class MyChatHost {
    constructor(private dialog: MJDialogService) {}

    async onBeforeToolInvoked(event: BeforeToolInvokedEventArgs) {
        const destructive = ['deleteRecord', 'sendEmail', 'createInvoice'];
        if (destructive.includes(event.ToolName)) {
            const ok = await this.dialog.confirm(`Allow agent to call ${event.ToolName}?`);
            if (!ok) {
                event.Cancel = true;
                event.CancelReason = 'User declined';
            }
        }
    }
}
```

### Non-Angular consumer (Node worker)

```typescript
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
import { setupMyMetadataProvider } from './my-provider';

async function main() {
    const provider = await setupMyMetadataProvider();
    const contextUser = await getServiceUser();

    // Console defaults are fine for a headless worker.
    await ConversationsRuntime.Instance.Config(false, contextUser, provider);

    const runner = ConversationsRuntime.Instance.AgentRunner;
    const result = await runner.processMessage({
        conversationId: 'abc',
        message: 'Generate the weekly report',
        conversationDetailId: 'msg-1',
        applicationId: null,
    });

    console.log(result);
}
```

---

## 14. Reference implementations

| Concern | Code |
|---|---|
| Runtime singleton + adapter slots | `packages/ConversationsRuntime/src/ConversationsRuntime.ts` |
| `INotificationAdapter` + default | `packages/ConversationsRuntime/src/adapters/INotificationAdapter.ts` |
| `IActiveTaskTracker` + default | `packages/ConversationsRuntime/src/adapters/IActiveTaskTracker.ts` |
| `ISessionsAdapter` + default | `packages/ConversationsRuntime/src/adapters/ISessionsAdapter.ts` |
| Default-agent resolver (5-step chain incl. `Application.AgentSettings.DefaultAgentID`) | `packages/ConversationsRuntime/src/default-agent/DefaultAgentResolver.ts` |
| Unified client-tool resolver (`ResolveClientTools` — one tier-agnostic merge: override > session > app > static — used by the async agent prompt builder, the realtime path, and conversations) | `packages/AI/CorePlus/src/client-tool-resolver.ts` |
| App-context snapshot (`AppContextSnapshot` + `View`/`Capabilities` + `FormatAppContextNote`) — fed to async agents (system prompt) and realtime (mint + streaming) | `packages/AI/CorePlus/src/app-context.ts` |
| Angular bootstrap (adapter registration + token CSS injection) | `packages/Angular/Generic/conversations/src/lib/services/conversations-runtime-bootstrap.service.ts` |
| Slot directive + name union | `packages/Angular/Generic/conversations/src/lib/directives/chat-slot.directive.ts` |
| Slot interfaces + defaults | `packages/Angular/Generic/conversations/src/lib/components/slots/` |
| Event arg classes | `packages/Angular/Generic/conversations/src/lib/events/chat-events.ts` |
| Voice → runtime sessions bridge | `packages/Angular/Generic/conversations/src/lib/services/realtime-sessions-adapter.ts` |
| chat-area component | `packages/Angular/Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.ts` |

---

## 15. Related guides

- **[REALTIME_CO_AGENTS_GUIDE](REALTIME_CO_AGENTS_GUIDE.md)** — PR #2787's
  realtime/voice/whiteboard architecture. The runtime's sessions adapter bridges
  to the services described there.
- **[DASHBOARD_BEST_PRACTICES](DASHBOARD_BEST_PRACTICES.md)** — chat surfaces
  embedded into dashboard chrome.
- **[FORMS_ARCHITECTURE_GUIDE](FORMS_ARCHITECTURE_GUIDE.md)** — when the agent
  needs to surface an interactive form (the `(beforeResponseFormSubmitted)`
  event ties into the form-presentation layer).
