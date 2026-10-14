# Realtime Channels Guide

A **channel** is a surface a person and a realtime agent operate together during a live call: a whiteboard, a browser, a game, a form, an interactive component. The agent acts on it through **verbs**, perceives it through **state notes** (and, when allowed, **pictures**), and the person acts on it directly. This guide is for anyone who ships a channel: core MJ, an Open App, a customer.

Everything a channel needs to be usable by an agent that has never seen it is in its **descriptor**. If the descriptor is good, the agent can operate the channel from the descriptor alone. That is the test this guide keeps coming back to.

**Read this before** adding a channel, wrapping an Angular component as one, changing how a channel is scoped or exposed, or publishing one from an Open App. Companion to [Real-Time Co-Agents Guide](REALTIME_CO_AGENTS_GUIDE.md) (the stack the channels sit in) and the plan [`plans/realtime/channels-v2/README.md`](../plans/realtime/channels-v2/README.md).

**Where the code lives**

| Package | What it holds |
|---|---|
| `@memberjunction/ai-core-plus` | The contract types (`RealtimeChannelDescriptor`, verbs, nouns, events), scoping (`ResolveRealtimeChannelScope`), exposure policy (`ResolveChannelExposure`, `IsVerbWithheld`), and the JSON-schema validator. Pure, shared by browser and server. |
| `@memberjunction/realtime-runtime` | `BaseRealtimeChannelClient` (the class every channel extends), `ChannelActionDispatcher`, the catalog note, the perception coalescer, the visual-perception pump, `RealtimeSessionRuntime`. |
| `@memberjunction/ng-realtime-channels` | `AngularComponentChannel` (wrap an existing component), and the opt-in DOM rasterizer (`EnableChannelFrameCapture`). Small on purpose: no overlay, no Explorer, no router. |
| `@memberjunction/ng-conversations` | The call overlay, the built-in channels (Whiteboard, Remote Browser, Media, Interactive Component, Identity Verification). |
| `@memberjunction/ng-realtime-widget` | `<mj-realtime-widget>`: the call, packaged for any web page (a one-script custom element and an Angular component). See section 10. |
| `@memberjunction/ng-realtime-channel-examples` | A complete worked channel (tic-tac-toe). Not loaded by default; not a dependency of anything. |
| `@memberjunction/ai-agents` | The server half of each channel (`BaseRealtimeChannelServer` plugins) and the server's scoping and exposure decisions. |

---

## 1. The contract

A channel is a class that extends `BaseRealtimeChannelClient` and answers one question, `GetDescriptor()`: here is what I am. Everything else (the catalog the agent reads, the validation of its calls, the notes it receives, the scoping, the exposure policy) is derived from that.

### The descriptor

```ts
interface RealtimeChannelDescriptor {
    Key: string;                 // stable name; matches the registry row and the plugin's ChannelName
    Version: string;             // the channel's own version
    DisplayName: string;         // what the user sees on the tab
    Instructions: string;        // for the MODEL: what this is, who plays what, when to act
    Nouns: RealtimeChannelNoun[];       // what it holds (the shape of its state)
    Verbs: RealtimeChannelVerb[];       // what it accepts
    Inputs?: RealtimeChannelSchema;     // what `open` may seed it with
    Events?: RealtimeChannelEventSpec[];// what it emits
    Output?: RealtimeChannelSchema;     // what it hands back when it completes
    DisplayPolicy: 'open-on-start' | 'on-demand' | 'headless';
    DefaultAvailability: 'all-sessions' | 'opt-in';
    MaxExposure: 'none' | 'state' | 'pixels';
    MultiInstance?: boolean;
}
```

Write every string for the model. `Instructions` and each `Description` are all the agent has to go on, so say who plays what, what a good move looks like and when to stay quiet. The catalog note shows `Instructions` (to 800 characters) and each verb's description (to 160), so lead with what matters.

**Nouns** describe state: one entry per top-level key of what `GetState()` returns, with a JSON Schema. In development (`BaseRealtimeChannelClient.StrictStateChecks`, on outside production) the base class checks the state against the nouns and logs a drift once per issue.

**Verbs** are actions:

| Field | Meaning |
|---|---|
| `Name` | How the agent addresses it. Matched case-insensitively. |
| `Description`, `Preconditions` | For the model. Preconditions are plain-language conditions ("it is your turn", "the cell is empty"). |
| `ParametersSchema` | JSON Schema (subset). The dispatcher validates every call against it before your code runs. |
| `InvokableBy` | `'agent'`, `'user'` or `'both'`. An agent calling a `'user'` verb gets a structured refusal it can read. |
| `ReturnsChannelData` | `'state'` or `'pixels'`: the least exposure at which this verb's RESULT may be given to the agent. See below. |
| `NativeToolName` | The provider-level tool this verb is also exposed as, when a channel mounted at session start declares native tools. |

The schema validator supports `type`, `enum`, `required`, `properties`, `additionalProperties: false`, `items`, `minimum`/`maximum`, `minLength`/`maxLength` and `minItems`/`maxItems`; every other keyword is ignored, never rejected.

### How the agent reaches a channel

There is one stable provider tool, `ContextTool`. A call is `action` plus `target: { channel, instance? }` plus `params`. `ChannelActionDispatcher` validates in this order, and each failure is phrased so the model can correct itself:

1. the channel exists (`unknown_channel`);
2. the instance exists (`unknown_instance`);
3. an unopened `on-demand` channel is opened first (`channel_not_open`); the reserved action `open` mounts and seeds it (`open_failed`, `invalid_params`);
4. the verb exists (`unknown_verb`);
5. the agent may invoke it (`not_invokable_by_agent`);
6. the channel's exposure allows the verb's result (`exposure_restricted`);
7. the parameters satisfy the schema (`invalid_params`, one message per violation);
8. then, and only then, `ApplyVerb` runs.

Steps 5 and 6 come before 7 on purpose: a malformed call must not be able to probe a verb the agent may not have.

A catalog note rendered from the descriptors tells the model which channels exist, sent once when the control channel is usable. A channel that declares native tools at mint (`GetToolDefinitions()`) has those typed tools too, and every verb is also reachable through `ContextTool`, so a channel opened mid-session is fully operable.

The result the model reads on a failure is the `ErrorMessage`: the dispatcher reports every failed verb as `verb_failed` with the `Error` text your `ApplyVerb` returned. So write failures as sentences that say what to do next ("It is not your turn. Wait for the user to move."), not as codes.

### What flows to the model

| Direction | Mechanism |
|---|---|
| Channel to model, unprompted | A **perception note**: `RecordChange({ Author })` marks the state changed; the base class coalesces changes in a short window and sends ONE note carrying a delta of `GetState()` (`[channel:Key#instance] state_changed ...`). `opened` and `completed` notes carry a state snapshot and the output. |
| Channel to model, pictures | Frames on the model's inbound video track (section 6). |
| Model to channel | Verbs through `ContextTool`, or the channel's native tools. |
| Observers (your UI, tests) | `Events$` (typed `RealtimeChannelEvent`, with `ChangeId`) and `Output$`. |

### Exposure: how much the model may perceive

`MaxExposure` is the channel's ceiling. The effective exposure a session gets is

```
effective = min(channel ceiling, agent cap, zero-data-retention ceiling, user choice)
```

with the order `'none' < 'state' < 'pixels'`. The **server** decides everything but the user's choice and returns it in the session policy (`ClientPolicyJson`); the browser applies it with `ApplyExposure({ Policy, User, Reasons })` and can only lower it. The agent cap is `channels.config.<Key>.maxExposure`; `requireZeroDataRetentionFor` lowers it for sessions whose model is not zero-data-retention. The channel keeps working at every level, and the agent is told, once and with the reasons, when exposure drops or returns.

What each level gates:

* `'state'` gates structured notes (`opened` / `completed` payloads, `state_changed` deltas).
* `'pixels'` gates frames.
* `'none'` gates both.

#### `ReturnsChannelData`: verb results are policy, not redaction

Notes and frames are volunteered; a verb the agent calls is asked for. A verb that returns what the channel holds (a page's text, a component's data, a board's contents) would otherwise hand the model exactly what the user, or a zero-data-retention rule, held back. So such a verb declares the least exposure its result needs:

```ts
{ Name: 'read_board', /* ... */ InvokableBy: 'agent', ReturnsChannelData: 'state' }
```

When the channel's effective exposure is below that level:

* the dispatcher (and the native-tool route for a channel mounted at start) **refuses the whole call** with `exposure_restricted` and the policy's reasons, and the verb never runs;
* the catalog note and the `exposure_changed` note list the verb as unavailable, with the reason, so the agent does not try it.

It is deliberately all-or-nothing. Nothing filters or edits a result. That is why the rule for writing verbs is:

* A verb that only **acts** returns what it did, not the state it produced: `{ placed: 4 }`, not `{ board: [...] }`. It needs no flag and works at every level, so an agent that may not see the board can still play.
* A verb that **reads** is flagged: `'state'` for a result that is data, `'pixels'` for a result derived from what the surface looks like.
* An unflagged verb returns what the channel says it returns. If a verb would reveal something, either flag it or lower the channel's own `MaxExposure`.

Built-ins do this: Remote Browser flags `GetPageText` and `AchieveGoal` as `'state'` and `DescribePage` and `LocateElement` as `'pixels'`; the Interactive Component channel flags `GetDataState`, `Validate`, `IsDirty` and every custom method with a non-void return type. A verb offered by several instances (two open components) is withheld only if every offer is flagged.

Pure helpers in `@memberjunction/ai-core-plus`: `IsVerbWithheld`, `WithheldVerbs`, `DescribeWithheldVerb`.

---

## 2. Writing a channel from scratch

Use this when the channel has no Angular surface to wrap (a pure wire to a service), or the surface is not a component you control. For a component you already have, jump to section 3.

The minimum is a name and a descriptor; everything else has a default:

```ts
@RegisterClass(BaseRealtimeChannelClient, 'FormChannel')
export class FormChannel extends BaseRealtimeChannelClient {
    public get ChannelName(): string { return 'Form'; }

    private fields: JSONObject = { name: '' };

    public override GetDescriptor(): RealtimeChannelDescriptor {
        return {
            Key: 'Form', Version: '1.0.0', DisplayName: 'Form',
            Instructions: 'A form the user fills in. Set a field when the user tells you its value; never submit it yourself.',
            Nouns: [{ Name: 'fields', Description: 'The form fields.', Schema: { type: 'object', properties: { name: { type: 'string' } } } }],
            Verbs: [
                { Name: 'set_field', Description: 'Set a field.', InvokableBy: 'both',
                  ParametersSchema: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'string' } }, required: ['name', 'value'], additionalProperties: false } },
                { Name: 'submit', Description: 'Submit the form.', InvokableBy: 'user', ParametersSchema: { type: 'object' } },
            ],
            Inputs: { type: 'object', properties: { title: { type: 'string' } } },
            Output: { type: 'object', properties: { submitted: { type: 'boolean' } }, required: ['submitted'] },
            DisplayPolicy: 'on-demand', DefaultAvailability: 'opt-in', MaxExposure: 'state',
        };
    }

    public override GetState(): JSONObject { return { fields: this.fields }; }

    public override ApplyVerb(verb: string, args: JSONObject, actor: RealtimeChannelActor): RealtimeChannelVerbResult {
        if (verb === 'set_field') {
            this.fields = { ...this.fields, [String(args['name'])]: args['value'] as string };
            this.RecordChange({ Author: actor });
            return { Success: true, Result: { set: args['name'] as string } };
        }
        return { Success: false, ErrorCode: 'unknown_verb', Error: `The form has no action "${verb}".` };
    }
}

export function LoadFormChannel(): void {} // keeps the @RegisterClass from being tree-shaken
```

The members that matter:

| Member | Role |
|---|---|
| `ChannelName` (abstract) | The key; must match the descriptor and the registry row. |
| `GetDescriptor()` | The contract. If you do not override it, one is **synthesized** from the legacy members (`GetToolDefinitions`, `ApplyAgentTool`), which is how channels written before v2 keep working. |
| `GetState()` | State as the model should perceive it. Pure and cheap: it is read whenever a note is built. |
| `ApplyVerb(verb, args, actor, instanceId?)` | Runs a verb. Return a result; do not throw for a refusal. Call `RecordChange({ Author })` when state changed. |
| `OnOpen(inputs)` | Seed the channel from validated open inputs; return a failure to refuse the open. |
| `Complete(output)` | Hand something back (a submitted form, a chosen option, a finished game). Emits on `Output$` and tells the model. |
| `RecordChange({ Author, Perceive })` | The one call that makes state perceptible: assigns a change id, coalesces, sends one delta note. `Perceive: false` records it for observers without telling the model. |
| `EmitChannelEvent(name, payload, changeId?)` | A typed event for observers and tests. |
| `GetSurfaceComponent()`, `BindSurface()`, `UnbindSurface()` | The Angular component shown in the channel's tab, and the hand-off when the overlay creates it. |
| `SerializeState()`, `RestoreState()` | The state of record saved with the session and restored on resume. Return `null` / `false` for a live-only channel. |
| `GetOnboardingDetails()` | What the user is told the first time they see it. |
| `OnInitialize()`, `OnSessionStarted()`, `Dispose()` | Lifecycle. |

A channel's perception is **additive and cheap by default**: changes are coalesced (one note per burst), notes carry deltas, and the first note after an exposure change is a full snapshot.

If the channel has no surface, leave `GetSurfaceComponent()` as `null` and use `DisplayPolicy: 'headless'`.

---

## 3. Wrapping an existing Angular component

Most useful channels are a component the app already has: a board, a form, a chart, a document editor. `AngularComponentChannel<TComponent>` (`@memberjunction/ng-realtime-channels`) turns one into a channel **without changing the component**. You write a descriptor and a few binding functions; the adapter owns the mechanics.

The walkthrough below is the real, tested channel in `@memberjunction/ng-realtime-channel-examples`: tic-tac-toe, where the user plays X by clicking and the agent plays O by calling a verb. Open `packages/Angular/Generic/realtime-channel-examples/src/lib/tic-tac-toe/` alongside this section.

### Step 0: the component you already have

`tic-tac-toe-board.component.ts` is a plain standalone component. It knows nothing about channels or agents. It has state (`Board`, `Turn`, `Result` signals), one method that places a mark (`Play(mark, cell)`), a click handler that calls it, and two outputs (`Moved`, `GameOver`). The rules (whose turn, is the cell free, is the game over) live in `Play`, which is the single place a move can be refused. **That is the property to look for in your own component**: one entry point where the rules live, and outputs for what happened. If a click handler and a service method each apply their own rules, consolidate them first; the channel will call the same entry point as a click does.

### Step 1: subclass, and name the component

```ts
@RegisterClass(BaseRealtimeChannelClient, 'ExampleTicTacToeChannel')
export class TicTacToeChannel extends AngularComponentChannel<TicTacToeBoardComponent> {
    protected readonly ComponentClass: Type<TicTacToeBoardComponent> = TicTacToeBoardComponent;
    protected readonly Descriptor: RealtimeChannelDescriptor = DESCRIPTOR;
```

`ComponentClass` is what the overlay creates in the channel's tab. `Descriptor` is the contract from section 1.

### Step 2: write the descriptor for the model

The `DESCRIPTOR` in `tic-tac-toe-channel.ts` shows the habits worth copying:

* `Instructions` names the roles ("The user plays X by clicking; you play O"), the coordinate system (cells 0 to 8, 4 is the centre), how to read the state (three rows of three characters), when to act ("only play when `state.turn` is O") and how to behave ("say your move out loud briefly").
* State is **compact and unambiguous for a model**: `board: ['X.O', '.X.', '...']`, not nine nullable cells.
* `play` is `InvokableBy: 'both'`: the user's click already goes through the component, and allowing the user to act through the same verb costs nothing and keeps the contract symmetric. `Preconditions` spell out when it succeeds.
* `read_board` is flagged `ReturnsChannelData: 'state'`. `play` and `new_game` return what they did (`{ placed: 4 }`) and nothing about the board, so they work when the agent may not see the board.
* `Output` is `{ winner: 'user' | 'agent' | 'draw', moves }`, so the model reads the end of the game in its own terms, not in marks.

### Step 3: read the state

```ts
protected ReadSurfaceState(board: TicTacToeBoardComponent): JSONObject {
    return { board: boardRows(board.Board()), turn: board.Turn() ?? 'none', result: board.Result() ?? 'none', moves: board.MoveCount() };
}
```

Pure and cheap. One entry per noun. The adapter calls it for every perception note and keeps the last result as the channel's state of record.

### Step 4: apply verbs

```ts
protected ApplySurfaceVerb(board, verb, args, actor): RealtimeChannelVerbResult {
    switch (verb) {
        case 'play': {
            const outcome = board.Play(actor === 'agent' ? AGENT_MARK : USER_MARK, args['cell'] as number);
            return outcome.Ok
                ? { Success: true, Result: { placed: args['cell'] as number } }
                : { Success: false, ErrorCode: outcome.Reason, Error: REFUSALS[outcome.Reason] };
        }
        // new_game, read_board ...
    }
}
```

By the time this runs the adapter has resolved the verb against the descriptor, checked exposure, and validated `args` against the schema, so trust the shape. Check the **domain** rules by asking the component (it owns them) and turn its refusal into a message the model can act on. Return a failure; do not throw. A throw is caught, logged and reported as `verb_failed`, but a refusal is not an error.

### Step 5: say which outputs are events

```ts
protected SurfaceEvents(board): Observable<ChannelSurfaceEvent> {
    return merge(
        outputToObservable(board.Moved).pipe(map((m) => ({ Name: 'moved', Payload: { cell: m.Cell, mark: m.Mark, by: m.Mark === AGENT_MARK ? 'agent' : 'user' } }))),
        outputToObservable(board.GameOver).pipe(map((g) => ({ Name: 'game_over', Payload: { result: g.Result } })))
    );
}
```

Every event is recorded as a change: observers get a typed event, and the model gets one coalesced note. An event the component emits **while the adapter is running the agent's verb** is attributed to the agent (the component echoes the agent's own move through the same output a click uses); anything else is attributed to the user. Set `Author` on the event to override, and `Perceive: false` on an event observers should see but the model should not be told about.

`outputToObservable` (from `@angular/core/rxjs-interop`) adapts the `output()` API; an `EventEmitter` is already an `Observable`.

### Step 6: the optional hooks

| Hook | Use it for | In the example |
|---|---|---|
| `OnSurfaceOpen(component, inputs)` | Apply the seed inputs of `open`. Runs when the surface binds, immediately if it already is. | `first: 'user' \| 'agent'` decides who moves first. |
| `SurfaceCompletion(component)` | A stream that becomes `Complete(output)`. | `GameOver` becomes `{ winner, moves }`. |
| `OnSurfaceBound(component, lastState)` | Restore a component that was created again, from the last known state. | Puts the board back after the panel is collapsed and expanded, or the session resumes. |
| `SurfaceElement(component)` | Name the root element so the channel can show the model a picture (section 6). | `board.Element`. |

### Step 7: register it and keep it from being tree-shaken

`@RegisterClass(BaseRealtimeChannelClient, 'ExampleTicTacToeChannel')` registers the class under the ClassFactory key the registry row or host declaration uses. Because the packages are `sideEffects: false`, an import nobody uses is dropped, so export a no-op `LoadExampleTicTacToeChannel()` and call it from the host's startup code. The call is the static reference a bundler cannot remove.

### What the adapter does for you

* **Binding.** The overlay creates the component and the adapter binds to it: subscribes to its events, applies anything that arrived early, and lets go on unbind. A panel that collapses and expands creates a **new** component instance, so durable state belongs to the channel, not the component. The adapter keeps the last state and hands it to `OnSurfaceBound`.
* **Verbs are serialized.** A second call waits for the first. Order is preserved.
* **A verb that never answers is bounded.** `VerbTimeoutMs` (15 s, overridable) limits how long `ApplySurfaceVerb` may run. On timeout the call fails with `verb_timeout` and a message the agent can act on ("try again or ask the user"), the queue is released and the timeout is logged once. The adapter cannot cancel your promise, so a late result is never delivered, a late failure is logged, and a late success is recorded as a change so the model's next note shows the real state. Nothing is rolled back: a retry the agent makes after a timeout must be rejected by the component's own rules (an occupied cell, a stale version), which is another reason to keep the rules in the component.
* **Validation.** Parameters are validated before your code runs; an unknown verb lists the available ones.
* **Persistence.** `SerializeState()` returns the last state as JSON; `RestoreState()` accepts it back (a non-object is refused).
* **A failing state reader** is logged and the last state is used. A perception note never breaks a call.
* **Teardown.** `Dispose()` unsubscribes and releases anything waiting.

### A verb that arrives before the surface exists

The panel was just opened and the overlay is still creating the component, and the agent calls a verb. There are three possible behaviours; the adapter picks the third.

1. **Run it against a hidden second instance.** Rejected: that instance would hold state the user is not looking at, and the two would diverge.
2. **Acknowledge it now and apply it later.** Rejected: the agent needs the real outcome (a move can be refused), and a lie that turns out wrong is worse than a short wait.
3. **Wait for the surface, bounded.** The call waits up to `SurfaceBindTimeoutMs` (5 seconds; override in a subclass), runs once the surface binds, and fails with `surface_unavailable` and a message the agent can act on ("The Tic-tac-toe is not on screen right now ... Ask the user to open it") if it never does. Calls are serialized, so order is preserved.

The seed inputs of `open` are different: there is nothing to report back but success, so they are applied when the surface binds.

### Making the whole thing testable

The example's tests (`tic-tac-toe-channel.dom.test.ts`) use the **real** component under TestBed, the **real** adapter and the **real** `ChannelActionDispatcher`, and play whole games: the user clicks the buttons, the agent's moves go through `ContextTool`-shaped dispatches, and refusals (not your turn, cell taken, game over, invalid parameters) are checked along the way. Section 9 describes the pattern.

---

## 4. Scoping: which sessions get the channel

A channel is not in every session. Scoping resolves, in order, from least to most specific, with **the most specific layer that mentions a channel winning** and, within a layer, `Exclude` beating `Include`:

1. **Code default.** The descriptor's `DefaultAvailability`: `'all-sessions'` (on unless excluded) or `'opt-in'` (off unless included).
2. **Agent.** The `channels` section of the agent's realtime configuration (`TypeConfiguration` / the config cascade).
3. **App.** `Application.AgentSettings.Realtime.Channels`.
4. **Host.** `StartRealtimeSession(..., { HostChannels })`: channels the page or app brings itself. This is the **only** way a connect-only session (an anonymous embed, with no entity metadata to read a registry from) gets channels.

A registry row's `IsActive = false` is a master kill switch no layer can override.

```jsonc
// Agent: realtime configuration (the persisted cascade uses lowercase keys)
{
  "realtime": {
    "channels": {
      "include": ["TicTacToe", "InteractiveComponent"],        // turn opt-in channels on
      "exclude": ["RemoteBrowser"],                             // turn a channel off (beats include in this layer)
      "config": {
        "InteractiveComponent": { "maxInstances": 3, "autoOpenDelegatedComponents": true, "maxExposure": "state" }
      },
      "displayPolicy": { "TicTacToe": "on-demand" },           // open-on-start | on-demand | headless
      "requireZeroDataRetentionFor": ["pixels"]                 // lower exposure unless the model is zero-data-retention
    }
  }
}
```

```jsonc
// App: Application.AgentSettings (the typed JSON uses PascalCase)
{
  "Realtime": {
    "Channels": {
      "Include": ["TicTacToe"],
      "Exclude": ["Media"],
      "Config": { "TicTacToe": { "maxExposure": "state" } },
      "DisplayPolicy": { "TicTacToe": "headless" }
    }
  }
}
```

```ts
// Host: a page with no registry at all
// HostChannels is carried by the options argument (the 13th parameter of StartRealtimeSession).
await runtime.StartRealtimeSession(agentId, conversationId, null, null, null, null, null, null, null, null, applicationId, null, {
    HostChannels: [
        { ClientPluginClass: 'ExampleTicTacToeChannel', Config: { maxExposure: 'state' }, DisplayPolicy: 'on-demand' },
        // or build it yourself, with injected collaborators:
        { Create: () => new MyChannel(myService) },
    ],
});
```

A host *adds* channels and supplies *defaults*; it cannot lift an agent or app `Exclude`, and its `Config` and `DisplayPolicy` are overridden by the agent and app layers.

**Config reaches the channel intact** as `Context.ChannelConfig`. `maxExposure` in it is the **agent cap** on exposure, applied by the server. Validate the keys your channel reads; a value of the wrong type should fall back to its default with a console warning, not break the session.

**How a decision is made.** At mint the browser reports its candidates (the plugins it has, with their descriptors) to the server; the server resolves scope, native tools and exposure with the same pure functions (`ResolveRealtimeChannelScope`, `ResolveChannelExposure`) and returns a policy; the browser applies it. Against an older server the extended mint is rejected and the runtime retries with the original and remembers; with no policy it resolves the same scope locally from code defaults and host declarations.

---

## 5. Opening a channel on demand

`DisplayPolicy: 'on-demand'` means the channel is **advertised** (in the catalog, with its descriptor) but not mounted until someone opens it. The agent opens it mid-call through `ContextTool`:

```
action: "open"
target: { "channel": "TicTacToe" }
params: { "first": "agent" }
```

The runtime initializes and mounts the channel, reveals its tab, validates `params` against the descriptor's `Inputs` (a violation is `invalid_params`; nothing is half-opened), runs `OnOpen`, and tells the model `opened` with the channel's state (or just `exposure: none` when exposure holds it back). Until then any other action on it is refused with `channel_not_open` and the exact way to open it.

Use `'open-on-start'` for a channel the call is about (the Whiteboard in a design session), `'on-demand'` for one the agent reaches for when it fits (a game, a form, a component), and `'headless'` for one with no tab (a wire to a service, the client-context channel).

A **multi-instance** channel (`MultiInstance: true`) owns several live instances itself (two components, two documents), each with its own id. `OnOpen` returns `{ Success: true, Instance: '<id>' }`; `Complete(output, instanceId)` and `EmitChannelEvent(name, payload, changeId, instanceId)` take the instance; verbs reach the right one through `target.instance`. A single-instance channel never sees any of it.

---

## 6. Visual perception

State notes tell the model what the channel holds. A **picture** tells it what the channel looks like, which a structured state cannot (a chart, a layout, a drawing). Pictures flow on the model's inbound video track when three things are true: the model supports video input, the effective exposure is `'pixels'`, and the channel can produce a frame.

### The pump (in `BaseRealtimeChannelClient`)

A channel opts in once:

```ts
this.EnableVisualPerception({ GetLatestFrame: async () => base64Jpeg | null });
```

and then tells the pump when the surface changed:

* `NotifyVisualChange()` after a **user** change: a frame is pushed, paced to the negotiated cadence (floor 250 ms), and always the latest.
* `ConfirmVisualChange()` after an **agent** change: a confirmation frame, plus a `frame_confirmed` note that tells the model not to narrate it.

The pump is change-driven (no heartbeat), gates on exposure and on the video track being established, and drops a pending frame the moment exposure is withdrawn. Every frame is tagged with the change id of the state it was taken at (a `frame_pushed` event carries it), so a consumer can check that the picture and the state agree. A frame is a picture, never a note.

`AngularComponentChannel` does all of that for you once `SurfaceElement` names the root element and the host registered a rasterizer.

### The rasterizer is opt-in

MJ core ships no DOM rasterizer by default: it is a heavy dependency every embed would pay for. A host that wants the model to see surfaces opts in **once at startup, before a session is minted** (whether a channel can source video is decided at mint):

```ts
import { EnableChannelFrameCapture } from '@memberjunction/ng-realtime-channels';
EnableChannelFrameCapture();   // Explorer does this in ExplorerAppComponent.ngOnInit; <mj-realtime-widget frame-capture> does it for an embed
```

This registers a capturer built on `html-to-image` (MIT, the same library Explorer's pin thumbnails use) with a bounded budget: at most 3000 nodes, a 4 second timeout, one capture at a time, and a longest edge of 1024 px; web fonts are skipped. It fails **softly**: a surface it cannot render (no size, too many nodes, tainted, timed out) costs the model one frame and never throws into a call. After three consecutive failures, or at once on a failure that cannot recover (such as a tainted canvas), it turns itself off for the session and logs the single reason, and the agent keeps receiving state. `CreateDomFrameCapturer(options)` builds a capturer with different limits or a different rasterizer; `ChannelFrameCapture.Instance.Register(fn | null)` registers any capturer, or removes it.

Without it, a channel that names a `SurfaceElement` offers state only.

### Several sources, one arbiter

A session can have several inbound video sources at once: channels, the camera, a shared screen. `VideoSourceArbiter` (in `@memberjunction/ai-realtime-client`) is the single writer of inbound video. On a model that takes several streams it passes every enabled source; on a one-stream model it passes the one the user is focused on, which is why the overlay tells the runtime which surface is on screen (`SetFocusedChannel`). The overlay's **Agent can see** chip lists every source with a switch per source, remembered per user per channel (`mj.realtime.visualPerception.v1` through `UserInfoEngine`); `SetVideoSourceEnabled` and `VideoSources$` are the API behind it. Turning a source off tells the model, with the reason, so it never assumes it can still see.

### Guidelines

* Give the model **state first**. A picture costs a model call's worth of tokens each time; use it for what state cannot say.
* A rasterizer sees only what the browser has rendered. Name the element that is on screen, not a detached one.
* Do not put anything in a surface you would not send to the model, and set `MaxExposure: 'state'` for a surface that must never be photographed.

---

## 7. The Interactive Component channel

Any `ComponentSpec` artifact (from Skip, Sage, the Form Builder or the realtime agent itself) can be a live channel. The **Interactive Component** channel (`InteractiveComponent`, in `@memberjunction/ng-conversations`) shows a component next to the call and lets the agent operate it. It is multi-instance, opt-in and on-demand, and its contract is **derived from the component**, not written by hand:

| The component's spec | Becomes |
|---|---|
| custom `methods[]` | verbs, with parameter schemas |
| the standard methods it supports (`Refresh`, `GetDataState`, `Validate`, `IsDirty`, `Reset`, `Print`, `ScrollTo`, `Focus`) | verbs |
| `getCurrentDataState` | the instance's `data` in the channel's state (a bounded summary: counts, columns, the first N rows) |
| `events[]` | channel events |
| `properties[]` | the schema of the `inputs` accepted when opening it |

Built-ins: `open { artifactId | artifactVersionId, inputs? }`, `show_version { versionId }` (swaps an open instance to another version of **its own** artifact in place: same instance id, same inputs, `version_changed` event) and `close`. Verbs that return data are flagged `ReturnsChannelData: 'state'` (section 1).

### "Ask Skip or Sage for a new version"

The realtime agent is a voice co-agent; it does not write components itself. When the user says "make the chart a stacked bar" while a component is open:

1. The agent **delegates** to Skip or Sage (the `invoke-target-agent` tool), naming the component.
2. The delegated run produces artifacts (a new version of the component).
3. The runtime asks **every channel in the session**, mounted or merely advertised, whether it wants them (`AcceptsDelegationArtifacts`, answered synchronously, before an advertised channel is even initialized, so it reads its config from the argument, not from `Context`).
4. The Interactive Component channel says yes for an artifact it **already shows** (and, if `autoOpenDelegatedComponents` is on, for a component it does not). It is handed the artifacts (`OnDelegationArtifacts`): an open component **moves to the newer version in place** (config `swapToNewerVersions`, default on; otherwise the agent is only told one exists), and a new one is opened. The user's tab is revealed and the model is told what changed.
5. The agent can step the user back with `show_version`.

A channel of your own that hosts artifacts takes part the same way: say yes in `AcceptsDelegationArtifacts` only for the ones you can show, and do something with them in `OnDelegationArtifacts`. A channel that throws is logged and never disturbs the delegation or the other channels.

**Access.** Artifacts load through the signed-in user's own session and read permission (the agent cannot open anything the user cannot).

Configuration (`channels.config.InteractiveComponent`): `autoOpenDelegatedComponents`, `swapToNewerVersions`, `maxInstances` (1 to 8), `maxStateRows` (25), `maxStateChars` (6000), `maxExposure`. Open components are live-only: not saved with the session, not restored on resume.

---

## 8. Publishing a channel from an Open App

An Open App reaches a host through exactly two things: **migrations** and **npm packages**. A channel therefore ships as a client plugin package (plus a server plugin only if it needs one) and a registry row carried by a migration.

### The pieces

1. **The client plugin** (browser): your `BaseRealtimeChannelClient` or `AngularComponentChannel` subclass in the app's client package (`@your-scope/yourapp-ng`), registered with `@RegisterClass(BaseRealtimeChannelClient, 'YourChannel')`, with an exported no-op `LoadYourChannel()` that the package's module or `public-api` calls. The `@memberjunction/*` packages are **peer dependencies**, never regular dependencies (a second copy of the framework registers into a second ClassFactory and nothing resolves).
2. **The server plugin.** The registry row's `ServerPluginClass` is required (`NOT NULL`), so every channel names one. A channel that runs entirely in the browser (the common case for an Open App) uses the generic, already-registered **`ClientOnlyChannelServer`** from `@memberjunction/ai-agents` and writes no server code: set `"ServerPluginClass": "ClientOnlyChannelServer"` on the row. It takes its channel name from the row it is resolved for, so one class serves any number of channels. It contributes no server tools and does not interpret or rewrite saves. It does **not** decide scope (that is resolved by the scoping cascade and the row's `IsActive` before any plugin exists) and it cannot stop a save (the host persists whatever the client submits when a plugin returns `null`), so whether state is stored is decided by the client: a channel whose `SerializeState()` returns `null` never saves, while an `AngularComponentChannel` that has state does, and that state lands on the session's channel row as submitted.

   Write your own `BaseRealtimeChannelServer` (registered with `@RegisterClass(BaseRealtimeChannelServer, 'YourChannelServer')`, with its own `Load...()` called from the server package's entry point) only when the channel needs server tools, a server-side normalizer for saved state (return a replacement, for example to strip an email address), or session-lifecycle work. `InteractiveComponentChannelServer` and `IdentityVerificationChannelServer` in `@memberjunction/ai-agents` are `ClientOnlyChannelServer` subclasses that pin a name under an existing key, which is only worth doing to keep an already-seeded registry key resolving.

   The MJ server loads `ClientOnlyChannelServer` for you (`LoadClientOnlyChannelServer()` in `@memberjunction/server`); an Open App using it needs no server package for its channel at all.
3. **The registry row**: an `MJ: AI Agent Channels` record. Author it as declarative JSON under the app's `metadata/ai-agent-channels/` (so `mj sync push` seeds your dev database), with a fixed primary key from `uuidgen`:

   ```json
   {
     "fields": {
       "Name": "YourChannel",
       "Description": "What it is, for an operator reading the registry.",
       "ServerPluginClass": "ClientOnlyChannelServer",
       "ClientPluginClass": "YourChannel",
       "TransportType": "PubSub",
       "IsActive": true
     },
     "primaryKey": { "ID": "<uuid from uuidgen>" }
   }
   ```

   `Name` is the channel key and must equal the descriptor's `Key` (and the server plugin's `ChannelName`, which `ClientOnlyChannelServer` takes from this very `Name`). `IsActive: false` is the master kill switch.

### How it reaches a host

* **The row ships in a migration.** `metadata/` is a development-time pointer: `mj app install` applies migrations and installs packages and does **nothing else**, so a `mj sync push` whose result lives only in your database is an unshipped change. The row reaches hosts through the release's `*__Metadata_Sync.sql`, which the build engineer generates from the declarative JSON at release time against a fresh database. A feature PR carries only the JSON, never the seed. Follow your app's release runbook (and [Release Metadata Migrations Guide](RELEASE_METADATA_MIGRATIONS_GUIDE.md)). Do not author PostgreSQL migrations by hand.
* **The packages are wired in by `mj app install`.** The client package is registered in the host's `dynamicPackages` (and a server package, if you wrote one, in its server dependencies), and the host's class-registration manifest (`mj codegen manifest`) finds the `@RegisterClass` classes by walking the dependency tree. Declare the package in `mj-app.json`, and keep the `Load*()` call reachable from the package's entry point so the registration is not tree-shaken. In a dev workspace, linking makes the packages resolve but not load: registering them in `dynamicPackages` is a separate step (see the app's local-host doc).
* **Scoping after install.** A channel with `DefaultAvailability: 'opt-in'` is off until an agent or app includes it. Ship the `Include` as app metadata (`Application.AgentSettings.Realtime.Channels.Include`) or document it for the operator.

### Checklist

- [ ] Descriptor `Key`, plugin `ChannelName` and registry `Name` are identical.
- [ ] Client plugin registered, with an exported `Load*()` called from the package entry point.
- [ ] `ServerPluginClass` set: `ClientOnlyChannelServer` for a client-only channel, or your own registered server plugin with its `Load*()`.
- [ ] `MJ: AI Agent Channels` row authored as JSON with a fixed primary key; carried to hosts by the release seed migration.
- [ ] `@memberjunction/*` are peer dependencies.
- [ ] `MaxExposure` and every verb's `ReturnsChannelData` reviewed against what the channel reveals.
- [ ] The descriptor tested by an agent that has never seen the channel (section 9).

---

## 9. Testing a channel

Three layers, from cheapest to most real.

**1. The descriptor, in isolation.** It is pure data: assert that every verb's `ParametersSchema` accepts a valid call and rejects an invalid one with `ValidateJsonAgainstSchemaSubset`, that `GetState()` satisfies the nouns (`channel.ValidateState()`), and that the catalog note (`BuildChannelCatalogNote`) reads the way you intend. `BaseRealtimeChannelClient.StrictStateChecks` warns about state drift at runtime in development.

**2. The channel, through the dispatcher.** Do not call `ApplyVerb` directly in a test that is about the agent: go through the same path the agent does.

```ts
const dispatcher = new ChannelActionDispatcher({
    FindChannel: (key) => (key.toLowerCase() === 'tictactoe' ? { Plugin: channel, IsOpen: true } : null),
    ListChannelKeys: () => ['TicTacToe'],
    ActivateChannel: async () => undefined,
});
const agent = (action, params = {}) => dispatcher.Dispatch({ Target: { Channel: 'TicTacToe' }, Action: action, Params: params });

expect(await agent('play', { cell: 12 })).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
```

Give the channel a recording context (`Initialize({ AgentName, SendContextNote: (t) => notes.push(t), Client: fakeConnection, ... })`) so you can assert what the model was told, and use `ApplyExposure({ Policy: 'none' })` to prove a read verb is refused while an acting verb still works.

**3. The real component, playing a real scenario.** For an `AngularComponentChannel`, render the real component (`renderComponentFixture` from `@memberjunction/ng-test-utils`), hand it to `BindSurface`, and play the scenario with **interleaved** actors: the user clicks real DOM, the agent calls verbs through the dispatcher. `tic-tac-toe-channel.dom.test.ts` plays a whole game to a user win, an agent win and a draw, checks the refusals along the way, collapses and re-expands the panel mid-game, resumes from a saved state, and verifies that pictures flow only at `'pixels'`. Put DOM specs in `*.dom.test.ts` (the jsdom preset); class-level specs stay on the fast node preset.

The adapter's own tests (`@memberjunction/ng-realtime-channels`, `src/__tests__/angular-component-channel.test.ts`) use a hand-written test component rather than Angular, which is also the quickest way to unit test a channel's binding logic.

**The acceptance test for a descriptor** is manual and worth doing once: start a session with a real model that has never seen your channel, open it by voice, and see whether it plays or operates it correctly from the descriptor alone. Where it misreads something, the fix is almost always in `Instructions` or a verb description, not in code.

---

## Reference

* Plan and decisions: [`plans/realtime/channels-v2/README.md`](../plans/realtime/channels-v2/README.md).
* Package READMEs: `packages/Angular/Generic/realtime-widget/README.md` (embedding the call in a page), `packages/RealtimeRuntime/README.md` (dispatch, scoping, exposure), `packages/AI/CorePlus/README.md` (the contract types), `packages/Angular/Generic/realtime-channels/README.md` (the adapter and the rasterizer), `packages/Angular/Generic/realtime-channel-examples/README.md` (the sample), `packages/Angular/Generic/conversations/src/lib/components/realtime/README.md` (the overlay and the built-in channels).
* The stack the channels sit in: [Real-Time Co-Agents Guide](REALTIME_CO_AGENTS_GUIDE.md); remote browser specifics: [Remote Browser Guide](REMOTE_BROWSER_GUIDE.md).
