# Realtime Channels v2: the widget contract, the embeddable realtime element, and mid-session verification

**Status:** BUILD PLAN. Written 2026-10-02. This PR starts as plan only, and the implementation follows on the same branch.
**Branch / PR:** `claude/pensive-thompson-pk5c2d`
**Companion PRs:**
- Caliber: consumes the element, then extends Caliber to configure end-to-end coached sessions.
- A downstream product PR holds the use-case-specific layer.

Both are linked from the PR thread.

**Coordinates with:**
- [#4761](https://github.com/MemberJunction/MJ/pull/4761) ([`video-avatar-and-screen-share.md`](../video-avatar-and-screen-share.md) on that branch), which covers avatar video, camera, screen share and the shared media stack. See §7.
- [`../../realtime-client-context-coagent/`](../../realtime-client-context-coagent/), whose Moves 2 and 3 this plan finishes.
- [`../resources-channel/proposal.md`](../resources-channel/proposal.md).
- [`../media-tracks-and-modalities.md`](../media-tracks-and-modalities.md).

---

## 0. Summary

MJ's realtime co-agent can already put interactive surfaces next to a voice conversation. These are the **channels** (Whiteboard, Remote Browser, Media, plus the headless ClientContextChannel). A channel is a `BaseRealtimeChannelClient` plugin with tools, a surface and a state of record, resolved from a `MJ: AI Agent Channels` row.

This plan turns the channel into a **complete, documented contract** with these properties:
- Anyone (core MJ, an Open App, a customer) can ship a channel the agent can observe, operate and learn from its declaration alone.
- The channel can be scoped to the sessions that want it.
- It can be opened mid-session.
- It can show the agent pixels as well as structured state, when the model supports video input and the user allows it.

The same contract makes **any `ComponentSpec` artifact** (from Skip, Sage, Form Builder, or the realtime agent itself) a live channel. The agent can show it, read its state, call its methods, and swap in a new version when one arrives.

Two pieces of supporting infrastructure ship alongside:
1. **Session events + mid-session identity verification.** An anonymous embedded session learns, through a deterministic server pathway, that the person has verified their email. The session's limits change and the agent is told, with no token change and no reconnect.
2. **`<mj-realtime-widget>`.** A first-class Angular Element that puts the full realtime overlay (channels included) on any web page. It is lifted from Caliber's `<caliber-widget>`, has world-class docs, and Caliber consumes it afterwards.

**No DDL in this PR.** Every new setting rides an existing JSON column under MJ's lockstep JSONType pattern (§4.2). The work is therefore buildable and testable without a CodeGen run. Regenerating the inline JSONType copies is a routine follow-up CodeGen pass and nothing at runtime depends on it.

---

## 1. Locked decisions

From the design conversation. Do not reopen these without a reason.

| # | Decision |
|---|---|
| D1 | **Channels are the plugin model.** We extend `BaseRealtimeChannelClient` into the full widget contract. There is no parallel "widget registry". |
| D2 | **One dispatch path: the `ContextTool` proxy.** It is a single stable tool, so no re-declaration is needed mid-session. It is extended with *addressing* (which channel instance) and *validation* (against the verb's declared schema). This finishes the unification Move 2 promised: the realtime path goes through `ResolveClientTools`. |
| D3 | **Channels are scoped.** A channel row's activation is no longer "every session in the database". Its availability is decided per session from: code default → agent → app → host-declared. |
| D4 | **`ComponentSpec` is the artifact standard.** A generic Interactive Component channel hosts any ComponentSpec. Artifact versioning is the existing plumbing (`MJ: Artifacts` / `MJ: Artifact Versions`). |
| D5 | **The data exposure is policy, not a hard rule.** Each channel declares the most it *can* expose (`none` / `state` / `pixels`). The agent's config and the user can lower it. An agent can require a zero-data-retention model for sensitive channels. |
| D6 | **Mid-session verification is an event, not a token swap.** The principal never changes, so ownership and RLS are untouched. The server records the verification on the session and changes the session's limits, then publishes a session event. The client tells the model. |
| D7 | **Session events are generic.** Verification is the first event type, not a special case. |
| D8 | **Multiple independent inbound video streams are a first-class contract** even though today's models accept one. A source arbiter maps N sources onto however many streams the model can take, which is 1 today. |
| D9 | **Visual perception is per-channel opt-in.** A visible "agent can see" chip lets the user turn it off. |
| D10 | **The change-driven frame pump moves from the whiteboard into the base channel.** |
| D11 | **The embeddable element lives in MJ core.** It is unrelated to `<mj-support-widget>`, which stays its own lightweight thing. |
| D12 | **The Angular adapter** wraps an existing Angular component as a channel surface without rewriting it. |
| D13 | **Nothing use-case-specific in this repo.** Lead-gen flows, specific coaching methodology and org lookups live downstream. Caliber configuration is a separate PR after this merges. |

---

## 2. What exists today (verified)

| Piece | Where | State |
|---|---|---|
| Channel base | `packages/RealtimeRuntime/src/channels/base-realtime-channel-client.ts` | Tools (`GetToolDefinitions`/`ApplyAgentTool`), surface, `SerializeState`/`RestoreState`, onboarding copy, sourced/sunk tracks. **No** agent instructions, typed state, events, inputs, outputs or display policy. |
| Channel registry read | `RealtimeSessionRuntime.fetchChannelDefinitions` (~`:1533`) | Loads **every active row for every session**. No scoping. A connect-only (anonymous embed) provider gets none. |
| Channel row | `MJ: AI Agent Channels` (`Name`, `Description`, `ServerPluginClass`, `ClientPluginClass`, `TransportType`, `ConfigSchema`, `IsActive`, `IsHeadless`, `UIConfig`) | `IsHeadless`/`UIConfig` are not read at runtime. |
| ContextTool proxy | `packages/Angular/Generic/conversations/.../channels/client-context-channel.ts` → runtime `executeAppClientTool` (`RealtimeSessionRuntime.ts` ~`:1671`) | A plain map lookup. **Bypasses** `ResolveClientTools`. `RegisterAppClientTools` replaces the whole set. |
| Unified resolver | `packages/AI/CorePlus/src/client-tool-resolver.ts` (`ResolveClientTools`) | Used only by async `BaseAgent`. `Application.AgentSettings.ClientTools` is read by nothing. |
| Inbound video | `ai-realtime-client/src/media/channelVideoSource.ts` (`ChannelInboundVideoBridge`, `IChannelFrameProvider`) | Whiteboard (change-driven, settle, dedupe, agent-confirmation frame) and Remote Browser. Gemini 3.8 Live (+Extended Thinking) only, via the `SupportsInboundVideo` profile. **One** inbound track, a 750 ms backstop throttle, no source labels, no arbitration. |
| Artifacts in realtime | Activity tab renders `mj-artifact-viewer-panel` for delegated-run artifacts | Rendered, but **not observable or operable** by the agent. |
| Component contract | `packages/InteractiveComponents/src/component-spec.ts` (`properties`, `events`, `methods.standardMethodsSupported`, `customMethods`); runtime `ComponentObject.getCurrentDataState`/`invokeMethod` | Complete, but unused by agents except the text-chat data-snapshot command. |
| Session deadline | `RealtimeClientSessionResolver` (~`:477`) stamps `Config.maxSessionDeadlineIso`; `SessionJanitor.RunMaxDurationSweep` closes past it | Widget guests only; it cannot be extended mid-session. |
| Server→client push | PubSub + GraphQL subscriptions (`ClientToolRequestResolver`, push status) | Nothing is scoped to an agent session. |
| Caliber widget | `bizapps-caliber/packages/Angular/src/lib/widget/` | `createCustomElement` element, consent gate, magic-link auth adapter, resume, page-close, status, branding, a mint **Proxy** over `GraphQLDataProvider` (needed because the runtime's mint is private), and a channel hub. |

---

## 3. Workstreams

Workstreams run roughly in the order listed, and each has acceptance criteria in §9. Package
placements follow [`UI_LAYERING_GUIDE.md`](../../../guides/UI_LAYERING_GUIDE.md): contracts are framework-neutral TypeScript in
`@memberjunction/realtime-runtime` / `@memberjunction/ai-core-plus`, and Angular is an adapter.

### WS1: Channel contract v2

Add a **channel descriptor** that a channel class returns. It is pure data, JSON-serializable, and goes to the agent verbatim:

```ts
export interface RealtimeChannelDescriptor {
    Key: string;                 // stable, e.g. 'Whiteboard', 'InteractiveComponent'
    Version: string;             // semver of the contract this plugin implements
    DisplayName: string;
    OwningPackage?: string;      // e.g. '@mj-biz-apps/forms-ng'
    Instructions: string;        // natural language for the agent: what it is, how to use it, rules
    Nouns: RealtimeChannelNoun[];        // things + JSON Schema of each one's state
    Verbs: RealtimeChannelVerb[];        // actions: params schema, preconditions, InvokableBy: 'agent'|'user'|'both'
    Inputs?: JSONSchema;                 // what the agent may pass when opening it (seed data)
    Events?: RealtimeChannelEventSpec[]; // what it streams back (state changes, user actions)
    Output?: JSONSchema;                 // what it hands back when complete
    DisplayPolicy: 'open-on-start' | 'on-demand' | 'headless';
    DefaultAvailability: 'all-sessions' | 'opt-in';   // see WS2
    MaxExposure: 'none' | 'state' | 'pixels';         // see WS6
    MultiInstance?: boolean;             // may the agent open more than one (e.g. two components)?
}
```

New base-class members:
- `GetDescriptor()`.
- `GetState()`: the nouns snapshot, validated against the schemas in dev builds.
- `ApplyVerb(verb, args, actor)`: the existing `ApplyAgentTool` becomes the legacy path.
- `Events$`.
- `Open(inputs)`.
- `Complete(output)` → `Output$`.
- `InstanceId`.

**Back-compat is mandatory.** A channel that only implements today's members keeps working unchanged. The base class synthesizes a descriptor from `GetToolDefinitions()` (verbs) and `Description` (instructions). The Whiteboard, Remote Browser, Media and ClientContextChannel plugins move onto explicit descriptors as the reference implementations. Their tool names stay identical, so prompts and transcripts are not disturbed.

**Perception becomes structured.** State changes go out as compact, typed context notes (`[channel:<Key>#<instance>] <event> <json delta>`) with **debounce and deltas**, which the Move 3 plan asked for and never got. They no longer go out as free-form text.

The server half (`BaseRealtimeChannelServer`) gains the same descriptor for server-backed channels. Server-side `ValidateSave` stays as it is.

### WS2: Channel scoping and per-session registration

The effective channel set for a session is computed once at mint and can grow mid-session:

1. **Code default.** `Descriptor.DefaultAvailability`. Every existing channel is `'all-sessions'`, so today's behaviour is preserved. New channels default to `'opt-in'`.
2. **Agent.** A new `channels` section in the realtime config cascade (`RealtimeConfigSection.channels`, read from the type's `DefaultConfiguration` < co-agent `TypeConfiguration` < target < app < runtime override), shaped `{ include?: string[]; exclude?: string[]; config?: Record<key, JSON>; displayPolicy?: Record<key, policy> }`.
3. **App.** `Application.AgentSettings.Realtime.Channels`, same shape. This is the lockstep `IAgentSettings` in `ai-core-plus` + `metadata/entities/JSONType-interfaces/IAgentSettings.ts`.
4. **Host.** The session start options (`RealtimeSessionRuntime` + element `channels` property) can declare channels the page brings. These include channels **with no registry row**, which is how a connect-only anonymous embed gets channels at all. A host-declared channel still has to be registered with the ClassFactory, and the server still validates any server half.

`IsActive=false` on a row remains the master kill switch. The resolved set is stored on the session config (as `allowedAgents` is) so server tool relays can check that a verb call targets a channel that is actually in the session.

**Mid-session opening.** An `on-demand` channel in the effective set is advertised in the agent's context with its descriptor, but not mounted. The agent opens it via the proxy (`open` verb, with `Inputs`). It then mounts as a tab and starts streaming.

### WS3: Unified dispatch (finish Move 2)

- **`ContextTool` gains addressing.** The params become `{ action, params, target? }`, where `target` = `{ channel: Key, instance?: id }`. With no `target` the call behaves as today: an app client tool by name.
- **Validation.** Before dispatch the runtime validates `params` against the verb's declared schema. On failure it returns a structured error (`{ success:false, error:'invalid_params', details }`) that the model can recover from.
- **Resolution.** `executeAppClientTool` resolves through `ResolveClientTools` (override → session → app → static). `Application.AgentSettings.ClientTools` is now actually read. `RegisterAppClientTools` gets **owner-keyed merge** semantics: each owner replaces only its own set. This retires the "one caller must own everything" trap and the stale-surface-tools-after-app-switch bug (`explorer-app.component.ts` ~`:887`).
- **Prefix-declared channel tools stay.** They are still declared natively at mint for `open-on-start` channels, because typed native tools are better when known up front. Every verb is *also* reachable through the proxy, so a channel opened mid-session is fully operable.
- **Legacy cleanup.** `FormatClientToolsForPrompt` gets a caller (the realtime companion prompt's tool manifest) or is deleted.

### WS4: The Angular adapter (wrap an existing component)

**Built.** `AngularComponentChannel<TComponent>` (in the new small package `@memberjunction/ng-realtime-channels`, not in `ng-conversations`, to keep embeds light) turns an Angular component into a channel surface **without rewriting the component**. A host declares a descriptor plus small binding functions:

```ts
@RegisterClass(BaseRealtimeChannelClient, 'SudokuChannel')
export class SudokuChannel extends AngularComponentChannel<SudokuComponent> {
    protected readonly ComponentClass: Type<SudokuComponent> = SudokuComponent;
    protected readonly Descriptor: RealtimeChannelDescriptor = { Key: 'Sudoku', Instructions: '…', Nouns: [...], Verbs: [...], … };
    protected ReadSurfaceState(c: SudokuComponent): JSONObject { return { board: c.Board, moves: c.MoveCount }; }
    protected ApplySurfaceVerb(c: SudokuComponent, verb: string, args: JSONObject, actor: RealtimeChannelActor): RealtimeChannelVerbResult { … }
    protected SurfaceEvents(c: SudokuComponent): Observable<ChannelSurfaceEvent> { return merge(c.CellChanged.pipe(map(…)), …); }
}
```

The adapter handles:
- binding and unbinding the surface (a collapsed and re-expanded panel creates a new component, so the last state is kept by the channel and restored through `OnSurfaceBound`);
- state snapshots and change-driven perception: every event and every successful verb becomes a recorded change, and an event emitted while the agent's verb runs is attributed to the agent;
- the visual frame provider (WS6), through the opt-in DOM rasterizer that ships in the same package (`EnableChannelFrameCapture`);
- **a verb that arrives before the surface exists.** Decision: the call *waits* for the surface, bounded (5 s), runs against the real component once it binds (calls are serialized), and fails with `surface_unavailable` and a message the agent can act on if it never does. Rejected: a hidden headless instance (it would hold state the user is not looking at, and the two would diverge) and queue-and-acknowledge (the agent needs the real outcome, since a move can be refused, and an acknowledgement that later proves wrong is worse than a short wait). Seed inputs of `open` are applied when the surface binds, because there is nothing to report back.

**Verb results and exposure.** Added in the same phase, because the adapter makes it easy to write a verb that returns the component's data. A verb declares `ReturnsChannelData: 'state' | 'pixels'`, and below that exposure the dispatcher (and the native-tool route) refuses the whole call with `exposure_restricted`; the catalog and the `exposure_changed` note list the verb as unavailable. It is policy, not redaction.

**Deliverables (done):**
- The adapter and rasterizer: `packages/Angular/Generic/realtime-channels` (`@memberjunction/ng-realtime-channels`).
- A **reference example**, a tic-tac-toe channel built only through the adapter, in `packages/Angular/Generic/realtime-channel-examples` (`@memberjunction/ng-realtime-channel-examples`). It is not a dependency of anything and loads only when a host imports it. Its tests play whole games with the real component and interleaved agent and user moves.
- The guide: **[`guides/REALTIME_CHANNELS_GUIDE.md`](../../../guides/REALTIME_CHANNELS_GUIDE.md)**. It covers the contract, writing a channel from scratch, wrapping an existing component (walking through the sample), scoping, opening on demand, visual perception, the Interactive Component channel, publishing a channel from an Open App (metadata row via a release migration, `Load*()` anti-tree-shake, and how `mj app install` brings it in), and testing.

### WS5: The Interactive Component channel (ComponentSpec)

`InteractiveComponentChannel` is a multi-instance channel that hosts `mj-react-component` (`@memberjunction/ng-react`).

The descriptor is **derived from the spec**:

| From the spec | Becomes |
|---|---|
| `customMethods` + supported `standardMethodsSupported` | verbs (parameters → params schema) |
| `getCurrentDataState` | nouns |
| spec `events` | events |
| `properties` | `Inputs` |

Built-in verbs:
- `component.open { artifactId | artifactVersionId, inputs? }`
- `component.show_version { versionId }`
- `component.close`

Opening sources:
- **The agent.** An artifact the user can read: the conversation's own artifacts, or ones granted by the agent's Collections when the resources channel lands.
- **Delegation results.** A component artifact returned by a delegated run can be auto-opened, which is configurable.

**Versions.** When a newer `MJ: Artifact Version` of an open artifact appears (for example, the agent asked Skip or Sage for a change), the instance swaps in place. Instance identity is kept, the agent receives an event, and the user sees a version chip.

**Exposure.** Data state can contain rows. The channel declares `MaxExposure: 'pixels'`, and WS6's policy decides what actually flows.

**Explicitly not in scope:** generating components. That is any agent's job; this channel only hosts them.

### WS6: Visual perception: multi-source video, change-driven pump, consent chip, exposure policy

1. **Change-driven pump in the base class.**
   - Lift the whiteboard's logic into `BaseRealtimeChannelClient` behind `EnableVisualPerception(frameProvider)`. That logic is: change-driven with no idle heartbeat, a negotiated cadence, a trailing settle timer, dedupe, and one confirmation frame after an agent edit plus a "don't narrate this" note.
   - The whiteboard becomes a consumer of the base implementation, with no behaviour change; this is the honesty test.
   - Frames are tagged with the **same change id** as the matching state event, so state and pixels can be checked for consistency.
2. **Multi-source inbound video contract.**
   - `RealtimeTrackDescriptor` gains optional `SourceID` + `Label`.
   - Model profiles gain `MaxInboundVideoStreams` (Gemini 3.8 Live = 1; fallback 1; 0 when `SupportsInboundVideo=false`).
   - `SendVideoFrame(data, mime, sourceId?)`.
3. **`VideoSourceArbiter`.**
   - It is the single writer to the model's inbound video. It deliberately uses the name, location and `IVideoFrameSink` interface that #4761 task A8 specifies: `@memberjunction/ai-realtime-client` `src/media/videoSourceArbiter.ts`.
   - **Generalisation in this PR:** it maps N live sources onto `MaxInboundVideoStreams` streams. With 1 stream the policy is: explicit user pick → most recent capture → focused/visible surface. A context note is sent on every switch (`[The agent is now viewing: <label>]`). If a future model accepts N, sources pass through untouched.
   - `ChannelInboundVideoBridge` registers sources with the arbiter instead of writing directly.
4. **"Agent can see" chip.**
   - A persistent chip in the overlay while any frames flow, listing each perceived source.
   - Each source has an off toggle. Turning one off removes the source from the arbiter and tells the model.
   - The choice persists per user per channel key via `UserInfoEngine` (`mj.realtime.visualPerception.v1`). Anonymous principals keep it in memory only.
5. **Exposure policy.**
   - The effective exposure is `min(channel MaxExposure, agent config channels.config[key].maxExposure, user toggle)`.
   - **`requireZeroDataRetentionFor: ('state'|'pixels')[]`** in the agent's realtime config. When the session model's configuration bag does not carry `Privacy.ZeroDataRetention: true`, exposure is lowered and the agent is told why. This is a new knob in the lockstep model-configuration bag (`metadata/.../IAIConfiguration.ts` ↔ `@memberjunction/ai` `modelConfiguration.ts`).

**Not in this PR** (#4761 owns them): avatar output, camera and screen-share channels, the `/media` subpath package split, `ng-realtime-media`, placement/PiP layout, and `AddTrack`/`RemoveTrack`. This PR's arbiter and multi-source contract are what those plug into (§7).

### WS7: Session events and mid-session identity verification

**Session events (generic).**
- A new PubSub topic plus a GraphQL subscription, `RealtimeSessionEvents(agentSessionId)`.
- **Authorization:** the subscription resolver loads the session and requires `UserID === contextUser.ID`. For magic-link/anonymous principals it *additionally* requires that the token's scope resource matches the session's conversation. The filter value comes from the authenticated context, **never** from a client argument alone.
- Events are `{ Type, AgentSessionID, OccurredAt, Payload }`.
- `RealtimeSessionRuntime` subscribes for the life of the session. Each event type has a client handler:
  - one that injects a context note;
  - an optional `RequestSpokenResponse`;
  - runtime parameter updates.
- Channels may subscribe through their context.
- Server-side code publishes through `RealtimeSessionEventService.Publish(...)`, which is the hook for apps.

**Identity verification (first event type: `identity.verified`).**
- **The `IdentityVerification` channel.** A small, generic, opt-in channel.
  - **Nouns:** `name`, `email`, `status`.
  - **Verbs:** `fill` (agent or user), `confirm` (user only), `submit`, `resend`, `enter_code`.
  - The agent can fill it from the conversation, but only the user can confirm. This is enforced by `InvokableBy`.
- **`RealtimeSessionVerificationService` (server).**
  - It sends a one-time link **plus** a short typed code as a fallback, so it works on another device.
  - The pending state lives on the `AIAgentSession.Config` JSON: hashed token and code, email, expiry, attempts. That keeps it **bound to the session**.
  - It **does not create an MJ user or swap the session's principal** (D6). Linking the verified email to a Person or User is an app decision, made by a server subscriber to the event. `LinkedEntityID/RecordID` on the session is set only when an app's handler does so.
  - It reuses the magic-link module's token generation, hashing and email-sending primitives rather than inventing new crypto. It does **not** use `MagicLinkInvite` rows: those are login invites, and widening their `Kind` CHECK would need DDL and change login semantics.
  - **Endpoints:**
    - `GET /realtime/verify/:token`: a public landing page saying "Verified, return to your conversation", with nothing to log in to.
    - `POST /realtime/verify/code`: authenticated as the session's own principal.
- **Policy** lives in the channel's `config` in the cascade:
  - `requireBusinessDomain` (a built-in consumer-domain list in code, overridable);
  - `blockedDomains`;
  - `linkTtlMinutes`;
  - `maxSendsPerSession`.
  - Rate limits apply per IP and per email domain on sends, and per session on code attempts, reusing the widget router's limiter pattern.
- **Session limits by verification state.** The realtime config gains `session.unverifiedMaxSeconds` / `session.verifiedMaxSeconds`.
  - The resolver stamps the deadline at mint from the unverified value. It applies to any principal, not only widget guests, when configured.
  - On verification the server **extends `maxSessionDeadlineIso`** and the janitor honours the new value.
  - The client's abuse guard updates from the event payload, but the server is authoritative.
  - A tampered client cannot extend anything.
- **Resume after the cap.** If the cap hits before verification, the session closes with reason `verification_timeout`. A verify link redeemed afterwards still marks the *conversation* verified, and a new session can resume from it through the existing `LastSessionID` chaining.

### WS8: `<mj-realtime-widget>`, the embeddable realtime element

**New package:** `packages/Angular/Generic/realtime-widget` → `@memberjunction/ng-realtime-widget`.
- It provides the component (usable directly inside any Angular app) **and** a standalone custom-element bundle (`dist/element/mj-realtime-widget.js`).
- The bundle is built the way `bizapps-orders`'s `<mj-orders-checkout>` is built: `createApplication` + `createCustomElement`, an AOT bundle with no `unsafe-eval`, CSP nonce support, and a guarded `customElements.define`.
- It hosts `mj-realtime-session-overlay` via deep import, kept off the heavy `ConversationsModule` barrel.

**Lifted from Caliber, generalised:**

| Lifted | Changes on the way in |
|---|---|
| Element bootstrap | — |
| Magic-link / invite redeem auth adapter | Without the `ng-auth-services` SDK payload |
| Consent gate | Recording consent, versioned copy |
| Page-close / pagehide session end | — |
| Resume token store | — |
| Status / phase component | — |
| Branding | Through `--mj-*` CSS custom properties |

**Caliber's mint Proxy is retired.** It exists because `RealtimeSessionRuntime`'s mint is private. Instead:
- MJ adds a public **`IRealtimeSessionLauncher`** seam on the runtime. The default launcher calls `StartRealtimeClientSession`.
- An app supplies its own launcher, and Caliber's becomes "call `LaunchCaliberWidgetSession`".
- Caliber's channel hub stays in Caliber for now. It is a candidate to lift later and is noted in the Caliber PR.

**Auth modes** (exactly one is used):
- `widget-key`: anonymous, through the existing `ConversationWidgetInstance` mint, so the origin allowlist, rate limits and caps all apply.
- `invite-token`: a magic-link invite, redeemed by the adapter.
- `token`: bring your own MJ JWT.
- A JS-only `launcher`: a custom launcher for apps.

**Declarative API** (attributes, kebab-case):
- `api-url`, `widget-key` | `invite-token` | `token`;
- `agent-id`, `application-id`, `conversation-id`;
- `channels` (a comma list of keys);
- `chrome` (`orb|console|auto`), `auto-start`, `require-consent`, `theme` (`light|dark|auto`);
- `locale`, `csp-nonce`.

**Script API** (properties and methods on the element):
- Properties that take objects: `channels`, `channelInputs`, `launcher`, `theme` tokens.
- Methods: `start()`, `end()`, `openChannel(key, inputs)`, `sendContextNote(text)`, `requestSpokenResponse(text)`, and `registerChannel(classRef)` for page-supplied channels.

**DOM events** (bubbling + composed; `detail` is typed and documented):
- `mj-ready`, `mj-session-started`, `mj-session-ended` (with reason);
- `mj-phase-changed`, `mj-verified`, `mj-session-event`;
- `mj-channel-opened`, `mj-channel-event`, `mj-channel-output`;
- `mj-error`.

**Docs.** The package README is a full embed guide:
- Quick start, with copy-paste HTML for each auth mode.
- A full attribute / property / method / event reference table.
- Theming and CSP.
- Examples:
  - plain HTML;
  - script-driven (vanilla JS, listening to events, opening channels);
  - inside an Angular app;
  - inside React (`ref`-based property setting);
  - a CMS embed snippet.

It is linked from `guides/REALTIME_CHANNELS_GUIDE.md`.

### WS9: Close-out

- Unit tests for every package touched (MJ's Definition of Done).
- New integration bundles where the deterministic tier can reach them (§6).
- READMEs:
  - `realtime-runtime`;
  - `ng-realtime-widget` (new);
  - `ai-realtime-client` (arbiter);
  - the server verification service.
- `guides/REALTIME_CHANNELS_GUIDE.md` (new) and a section in `guides/REALTIME_CO_AGENTS_GUIDE.md` if it exists. Index both in `guides/README.md`.
- A changeset: `minor` (new public API + a new package). There are no migrations.

---

## 4. Cross-cutting rules

### 4.1 Layering and dependencies
- Contracts (descriptor types, scoping resolution, event types) live in framework-neutral packages.
- `realtime-runtime` stays free of Angular, as it is today.
- The element package depends on `ng-conversations` via deep imports only.
- No re-exports between packages (MJ rule 5).
- Strict pnpm: declare every import.

### 4.2 No DDL; JSON in lockstep
Each JSON shape changed here has a metadata JSONType source and a package-side mirror. **Both are edited in the same commit:**

| Shape | JSONType source | Package mirror |
|---|---|---|
| `IAgentSettings.Realtime.Channels` | `metadata/entities/JSONType-interfaces/IAgentSettings.ts` | `@memberjunction/ai-core-plus` |
| Model configuration `Privacy.ZeroDataRetention` | `IAIConfiguration.ts` | `@memberjunction/ai` `modelConfiguration.ts` |
| Realtime config `channels` / `session.*` | — (realtime config is parsed in code) | `realtime-coagent-config.ts` |
| Session config verification state | — (internal) | the resolver's `RealtimeSessionConfig` |

Runtime code parses with the package mirror and never touches generated inline copies. The PR description must say that one routine `mj sync push` + `mj codegen` refreshes those copies, and that nothing depends on it.

### 4.3 Security
- The server never trusts a channel key, instance, deadline or verification state sent by the client.
- Verb calls relayed to the server are checked against the session's resolved channel set.
- Event subscriptions are scoped from the authenticated context.
- Verification tokens and codes are stored hashed, single-use, expiring and rate-limited.
- The verify landing page leaks nothing about the session.

---

## 5. Non-goals for this PR

- Use-case flows (lead capture, a specific coaching methodology, org/990 lookups, CRM hand-off). These belong in a downstream product repo.
- Caliber configuration and the Caliber-side extensions. That is a separate PR after this merges.
- The MJ Forms channel. It is a follow-up PR in `bizapps-forms`, which ships its channel and metadata row via its own migrations, proving Open-App extensibility.
- Collaboration workspace integration (decided later).
- Avatar, camera, screen share, the media stack and the layout system (#4761).
- Changes to `<mj-support-widget>`.
- Generating deliverable documents. MJ's existing Create/Add/Finalize Document actions already do this, and consumers use them.

---

## 6. Testing strategy

**Unit tests (vitest), in every touched package:**
- descriptor synthesis for legacy channels;
- scoping resolution (all four layers + kill switch);
- proxy addressing and validation errors;
- owner-keyed tool merge;
- arbiter policy and switch notes;
- the change-driven pump (fake timers);
- exposure policy, including the ZDR downgrade;
- verification service: token/code hashing, expiry, rate limits, domain policy, deadline extension;
- event subscription authorization;
- the element's attribute/property/event contract (DOM tests);
- the Angular adapter with a test component.

**Integration tests.** Add deterministic bundles for:
- the verification flow end to end against the server (mint session → request → redeem → event observed → deadline extended);
- an event subscription refused for a non-owner.

These need a migrated database plus MJAPI. **The authoring environment for this PR has no SQL Server**, because container registries are blocked by policy, so the bundles are written and typechecked here and **executed by the reviewer who brings the branch local** (see the handoff note in the PR). The PR states plainly what was and was not run.

**Manual verification checklist** (in the PR):
- an embedded element on a static HTML page;
- anonymous → verify on a phone → the agent acknowledges;
- opening a component artifact mid-call and the agent reading and operating it;
- the "agent can see" chip turning perception off.

---

## 7. Coordination with #4761 (video avatar / media stack)

| Area | This PR | #4761 |
|---|---|---|
| `VideoSourceArbiter` + `IVideoFrameSink` | **Implements** it at the path/interface #4761 A8 specifies, generalised to N streams | Consumes it for camera/screen. A8 becomes "already done; extend". |
| Track descriptor `SourceID`/`Label`, `MaxInboundVideoStreams` | Adds them | Uses them for camera/screen sources |
| "Agent can see" indicator | A session-level chip + per-source toggle | `MediaBadge 'agent-can-see'` on tiles. **Blend:** the tile badge reads the same arbiter state. |
| Base-channel change-driven pump | Adds it | Camera/screen don't need it (they are streams), so no conflict |
| `UIConfig` | Not touched | Adds `Placement`/`AllowedPlacements` |
| New Angular package | `ng-realtime-widget` (the element) | `ng-realtime-media` (tiles/stage). The element will render through it once it lands. |

Whichever PR merges second rebases. The table is the contract for that merge.

---

## 8. Open questions

1. ~~Does the Angular adapter live in `ng-conversations` or in a new `ng-realtime-channels` package?~~ Resolved in WS4: a new small package, `@memberjunction/ng-realtime-channels`, so an embed or an Open App can use the adapter without the conversations stack. The rasterizer moved there too, since it is the same opt-in.
2. Should the Interactive Component channel auto-open delegated component artifacts by default (`true` in Explorer, configurable in embeds)?
3. What is the size and update path of the consumer-domain list? Ship a curated list in code that config can override.

---

## 9. Task checklist and acceptance

| ID | Task | Acceptance |
|---|---|---|
| T1 | Descriptor types + base-class members + legacy synthesis | Existing channels pass their tests unchanged. A legacy-only fake channel exposes a synthesized descriptor. |
| T2 | Reference channels migrated to explicit descriptors | Tool names unchanged. Descriptor snapshots tested. |
| T3 | Structured, debounced, delta perception notes | Fake-timer tests: N rapid changes produce 1 note carrying a delta. |
| T4 | Scoping resolver (code → agent → app → host) + session-stored effective set | Matrix tests. A row with `IsActive=false` is excluded even when host-declared. |
| T5 | On-demand open via proxy, with inputs | A test channel opens mid-session and its verbs work. |
| T6 | ContextTool addressing + schema validation + `ResolveClientTools` in realtime + owner-keyed merge | Invalid params return a structured error. Two owners' tools coexist. App switch clears only the old surface's tools. |
| T7 | Angular adapter + sample game channel + guide | **An agent with no prior knowledge can play the sample game from the descriptor alone**, verified manually with a real model and documented in the PR. Unit tests on the adapter. |
| T8 | Interactive Component channel (spec-derived descriptor, open/show_version/close, version swap) | Spec → descriptor tests. A version swap keeps the instance and emits an event. Invoking a custom method works through the proxy. |
| T9 | Base change-driven pump; whiteboard migrated onto it | Whiteboard tests unchanged. Frames carry change ids. |
| T10 | Multi-source track contract + `VideoSourceArbiter` | 1-stream policy tests (pick > recent > focused). N-stream pass-through test with a fake 2-stream model. A switch emits a note. |
| T11 | "Agent can see" chip + per-source off toggle + persistence | DOM tests. Toggling off stops frames within one cadence. |
| T12 | Exposure policy + ZDR knob | A downgrade happens when the model lacks ZDR and the agent requires it. The agent is told. |
| T13 | Session events: topic, subscription, auth, runtime handlers | A non-owner is refused. An owner receives events. A handler injects the note. |
| T14 | Verification channel + service + endpoints + policy + deadline extension | Unit tests for every policy branch. Integration bundle (§6). A tampered client cannot extend the deadline. |
| T15 | `IRealtimeSessionLauncher` seam | The default launcher matches today's mint. A custom launcher works without a Proxy. |
| T16 | `ng-realtime-widget` component + element bundle + all auth modes | DOM contract tests for every attribute, property, method and event. The bundle builds with no `unsafe-eval`. A static HTML sample page boots it. |
| T17 | Docs: element README, channels guide, package READMEs, guides index | Every public API is documented with an example. Links pass `check:claude-md`-style link validation. |
| T18 | Changeset + PR handoff notes (what ran, what didn't, how to run the integration tier locally) | — |
