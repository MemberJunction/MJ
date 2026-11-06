# Sandboxed Component Host, BridgeDataProvider, and Realtime Component Surfaces

**Status:** Proposal · **Date:** 2026-10-08 · **Branch:** `sandboxed-component-host-plan`

---

## 0. Summary

Two pieces of work that share one foundation.

1. **Make the interactive-component host safe everywhere.** Today a `ComponentSpec` component runs in
   Explorer's own JavaScript realm through `new Function`
   (`packages/React/runtime/src/compiler/component-compiler.ts:756`). It can reach `window`, the
   auth tokens in browser storage, the GraphQL provider, and the network. Nothing but the linter
   stands in the way.
   - We keep the proven engine (`@memberjunction/react-runtime`) and the `<mj-react-component>`
     API, and move the engine into an **opaque-origin sandboxed frame**.
   - Inside the frame a new **`BridgeDataProvider`** stands in for the real provider, so
     components get **real `BaseEntity` subclasses** (custom properties, methods, synchronous
     `Validate()`, generated validators) and can mutate data. Every persistence call crosses a
     message bridge to the host's provider, which holds the only credential.
   - The mobile app's DOM host already proves the pattern (`packages/MobileApp/src/interactive/dom-host/`).
     We promote it into one shared host page and protocol for web and mobile.

2. **Let realtime agents build React components live.**
   - Expose ComponentSpec in two places:
     - a **Components channel**, a full surface like Whiteboard and Remote Browser;
     - a **`component` item kind on the whiteboard**.
   - Both mounts share one engine and one tool vocabulary.
   - Any author can drive the tools: the live model itself (including the near-frontier reasoning
     behind GPT Live and Gemini 3.8 Live), or a delegated builder such as Skip, Codesmith or any
     other agent.
   - The linter runs on every edit.
   - Edits can target a single child component.
   - Results save as versioned `Component` artifacts that a person can promote to the registry, a
     dashboard or a form.

A cheap parallel track (Part C) fixes the existing HTML/SVG whiteboard widgets:
- targeted edits;
- a CSP;
- the model can see rendered widgets.

---

## 1. Where we are today

### 1.1 Interactive component runtime and host

| Piece | Location | Note |
|---|---|---|
| Spec contract | `packages/InteractiveComponents/src/component-spec.ts:159` | `ComponentSpec`: code, PRD/TDD, `dataRequirements`, `dependencies`, `libraries`, `properties`, `events`, `methods` |
| Runtime | `packages/React/runtime` (`@memberjunction/react-runtime`) | React 18.2 UMD + `@babel/standalone` from CDN; LRU compile cache keyed on name + code hash; `ComponentManager.LoadHierarchy` |
| Angular host | `packages/Angular/Generic/react/src/lib/components/mj-react-component.component.ts` | `createRoot` in the host DOM; `utilities` = live `md`/`rv`/`rq`/`ai`; data capture via `wrapUtilitiesWithCapture` |
| Linter | `packages/React/linter` | 60 rule classes, server-side today (`Actions/CoreActions/src/custom/interactive-forms/_shared.ts:169`) |
| Test harness | `packages/React/test-harness` | Playwright, renders + lints, returns HTML/errors/screenshot |
| Permission pre-check | `packages/Angular/Generic/artifacts/src/lib/components/plugins/component-permission-evaluation.ts:74` | Blocks render when declared read/query permissions are missing |

**Consumers of `<mj-react-component>`:**
- Component artifact viewer (`artifacts/.../component-artifact-viewer.component.*`), which also serves dashboard artifact parts.
- Interactive forms (`base-forms/.../interactive-form*.component.*`).
- Component Studio preview (`dashboards/src/ComponentStudio/components/workspace/component-preview.component.html`).

**The security gap.** Components share `window`/`document` with Explorer. Lint rules
(`no-window-access`, `no-import-statements`, …) are the only guard. Lint rules can't stop
`[].constructor.constructor('return this')()`, and they don't constrain library code at all.

**The iteration gap.**
- Any change to `name`/`code`/`version` calls `reinitializeComponent()`
  (`mj-react-component.component.ts:183`), which unmounts the root and reloads the whole hierarchy.
- The version key for a spec without `version` is a hash over **every** node's code
  (`React/runtime/src/utilities/component-hash.ts:27`).

### 1.2 Mobile DOM host (the pattern to promote)

- `MobileApp/src/interactive/dom-host/host-page.ts` loads the published
  `@memberjunction/react-runtime` UMD in a WebView and calls `createReactRuntime` +
  `manager.loadHierarchy`. That is the **same engine**.
- `MobileApp/src/interactive/dom-host/bridge-protocol.ts` proxies these methods:
  - `rv.RunView(s)` and `rq.RunQuery`;
  - `md.Entities`, which is snapshotted at init;
  - `ai.*`, `ml.*` and `search.*`.
  It also carries callbacks, a `height` message and an `error` message. The page holds **no
  credential**.
- It deliberately leaves `md.GetEntityObject` unproxied (`UNPROXYABLE_UTILITIES`). This proposal
  closes that gap by proxying the **provider** instead of the entity.
- Mobile's *native* render mode (`MobileApp/src/interactive/mobile-safety.ts`) compiles components
  inside the React Native process with the app's real provider. That is the same in-realm
  exposure as the web host.

### 1.3 Realtime and the whiteboard

- **Channels.** A channel is a tool surface plus persisted state, defined by `MJ: AI Agent Channels`
  rows with server and client plugins.
  - Client contract: `RealtimeRuntime/src/channels/base-realtime-channel-client.ts`. Its context
    exposes `SendContextNote`, `RequestSave`, `SaveAsArtifact`, `ExecuteServerAction` and
    `SetFocusMode`.
  - Client tools are routed by prefix through `RealtimeSessionRuntime.RegisterClientToolHandler`.
- **Whiteboard** (`Angular/Generic/whiteboard`):
  - 9 item kinds and 14 `Whiteboard_*` tools.
  - HTML widgets render in `sandbox="allow-scripts"` srcdoc iframes, with **no CSP**.
  - `Whiteboard_UpdateContent` is a **full replacement** (64k cap), which restarts the widget.
  - The model's vision frames draw HTML widgets as a dashed placeholder
    (`whiteboard-export.ts:550`). Scene deltas clip widget HTML to 200 characters.
  - "Save to artifacts" always writes a new artifact at `VersionNumber = 1`
    (`MJServer/src/resolvers/RealtimeClientSessionResolver.ts:2150`).
- **Co-agent delegation.**
  - `invoke-target-agent` runs any allowed agent.
  - Artifacts come back in the tool result (`RealtimeRuntime/src/session/delegation-result-parser.ts`).
  - A delegated run's `Component` artifact already renders in the overlay's activity rail.
- **Reasoning planes.**
  - GPT Live can delegate reasoning to a Responses backend (`plans/realtime/gpt-live-1.md` §2).
  - Gemini 3.8 Live Extended Thinking keeps generating while it issues non-blocking tool calls
    (`plans/realtime/gemini-3-8-live.md`).
  - Either way, the live model can author substantial code without stalling the voice.
- **Precedent for granular agent edits with a safety boundary:**
  `Explorer/dashboards/src/ComponentStudio/services/canvas-edit-transforms.ts`. Agents may edit the
  definition freely, while committing it stays a human action.

### 1.4 External context

OpenAI shipped "Intelligent UI" with GPT-6 on 2026-10-07 to all ChatGPT tiers. As reported, it
generates charts, forms, buttons and small tools inside chat answers from a library of native,
streamable components plus a compiler that renders while the model generates. It is chat-only, with
no announced developer renderer. ([9to5Mac](https://9to5mac.com/2026/10/07/openai-brings-gpt-6-to-chatgpt-and-debuts-intelligent-ui/),
[Neowin](https://www.neowin.net/news/openai-brings-gpt-6-to-12-billion-chatgpt-users-with-new-intelligent-ui/),
[Wavect analysis](https://wavect.io/blog/openai-intelligent-ui-vs-openui/).)

That makes generated UI table stakes. Our difference is UI over the customer's governed data that is
permissioned, persisted, versioned and reusable, built live by voice on a shared canvas. Their
choice of composing known components informs §7.2 (`Component_FindExisting`): reusing registry
components by reference is the fast, safe path.

---

## 2. Goals and non-goals

**Goals**
1. **Secure by default.** Every interactive component, whether on web or mobile, embedded or from a
   registry, runs in an opaque-origin sandbox with no credential and no direct network access.
2. **Full entity fidelity in the sandbox.** Components get real `BaseEntity` subclasses and can read
   and write data within the user's permissions.
3. **No API churn for consumers.** `<mj-react-component>` inputs and outputs stay the same. The few
   synchronous method calls become async, with mirrors where needed (§5.8).
4. **One host page and one protocol for web and mobile.**
5. **Realtime component surfaces.**
   - A Components channel and a whiteboard `component` item, sharing one engine.
   - Author-agnostic tools.
   - Edits that target a single child component.
   - The linter in the loop.
   - Versioned artifacts, with promotion that stays a human action.

**Non-goals (for this plan)**
- Rewriting the runtime, the ComponentSpec contract or the linter.
- Changing server-side permissions, RLS or `*EntityServer` behaviour. The server stays the authority.
- Streaming partial tool arguments into progressive rendering. That is a later item.
- A scoped-token direct-to-MJAPI provider. It stays a later option (§11).

---

## 3. Threat model

**What we defend against:**
- Code an LLM generated, possibly steered by prompt injection from web pages (Remote Browser),
  documents (Resources), meeting participants or user content.
- Third-party library code loaded from CDNs.
- Components resolved from external registries.
- Honest bugs: infinite loops, runaway queries, accidental mass updates.

**What must be protected:**
- The user's tokens (MSAL cache, magic-link session in `sessionStorage`).
- The authenticated provider.
- The host DOM and navigation.
- Data outside the component's declared scope.
- Exfiltration of data the component *is* allowed to read.

**The boundary, in layers:**
1. Opaque-origin frame (`sandbox="allow-scripts"`, never paired with `allow-same-origin`).
2. A CSP inside the frame with `connect-src 'none'`.
3. A host-side bridge that checks every request against an access policy.
4. The server's own permissions and validation, unchanged.

Client-side entity logic was never a security boundary and still isn't.

---

## 4. Architecture overview

```
 Host (Explorer / Mobile app)                         Sandboxed frame (opaque origin, CSP)
 ┌───────────────────────────────────────┐            ┌──────────────────────────────────────┐
 │ <mj-react-component> / DomComponentHost│  init ►   │ Component host page (per deployment)  │
 │   ComponentFrameHost                   │◄ ready    │  React 18 + Babel + react-runtime     │
 │    • transport (MessagePort / RN)      │           │  @memberjunction/core + global        │
 │    • access policy (dataRequirements)  │  rpc   ◄──│  entity-class bundle (optional)       │
 │    • data capture (DataSnapshot)       │  result ─►│  BridgeDataProvider (Metadata.Provider│
 │    • entity event forwarding           │  events ─►│    + BaseEntity.Provider)             │
 │    • theme / size / method mirrors     │◄ height   │  snapshot helper, storage shim        │
 │ real provider (GraphQLDataProvider)    │◄ snapshot │  ComponentManager → React root(s)     │
 └───────────────────────────────────────┘            └──────────────────────────────────────┘
```

**Proposed packages** (names TBD):

| Package | Runs in | Contains |
|---|---|---|
| `@memberjunction/component-host-protocol` | both | Message types, protocol version, transports (window `MessagePort`, React Native WebView). Promoted from `bridge-protocol.ts` so a breaking change fails to compile on both sides. |
| `@memberjunction/component-host-frame` | frame | `BridgeDataProvider`, page bootstrap, storage shim, snapshot helper, synthesized entity classes (§5.5) |
| `@memberjunction/component-host` | host | `ComponentFrameHost` (framework-agnostic host side), `ComponentAccessPolicy`, data capture, event forwarding |
| `@memberjunction/ng-react` (existing) | Explorer | `<mj-react-component>` becomes a thin Angular adapter over `ComponentFrameHost` |
| `MobileApp` (existing) | mobile | `DomComponentHost` becomes a thin React Native adapter over `ComponentFrameHost` |

---

## 5. Part A: the sandboxed component host

### 5.1 The host page

There is one HTML page per deployment, plus bundles:

- **Core bundle:**
  - React 18.2, ReactDOM and `@babel/standalone`;
  - `@memberjunction/react-runtime`, `@memberjunction/core` and `@memberjunction/global`;
  - `component-host-frame`;
  - the approved component libraries, loaded on demand as today.
- **Entity-class bundle**, loaded only when `LoadEntityClasses` is true (§5.5):
  - `@memberjunction/core-entities`;
  - every installed Open App's `-entities` package;
  - each app's client-side entity subclasses.

The entity bundle is **built per deployment**, because installed Open Apps differ. The
class-registration manifest tooling already supports this: `mj codegen manifest --filter BaseEntity`
emits only `BaseEntity` subclasses (the `--filter` flag is in
`MJCLI/src/commands/codegen/manifest.ts:160`). The bundle should be produced by the same
prestart/prebuild step that already generates MJExplorer's supplemental manifest.

**Serving.** MJAPI, or the Explorer deployment, serves the page and bundles. Web iframes and mobile
WebViews load the **same URL**. That replaces mobile's inline page, which pins
`react-runtime@6.1.0` from unpkg, so mobile picks up host-page fixes without an app release.

**Origin.** There are two options (decision D1):
- **(a) Dedicated sandbox origin** (for example `components.<host>`, or a separate MJAPI port).
  - Bundles are cacheable.
  - The CSP is sent as a real header.
  - The page is cleanly separated from Explorer.
- **(b) A same-origin path** loaded with `sandbox="allow-scripts"`.
  - The frame is still an opaque origin.
  - CSP comes via `<meta>`.
  - Needs no deployment config.
  - Caching of opaque-origin frame loads must be measured (spike S2).

Recommendation: (a) for production, with (b) as the zero-config fallback.

### 5.2 Frame configuration and CSP

**Sandbox attribute:** `sandbox="allow-scripts"`.
- Never add `allow-same-origin`.
- No `allow-top-navigation` and no `allow-forms` (forms work through React handlers).
- Printing needs `allow-modals` (D3).
- External links go through a host callback, not `allow-popups`.

**CSP:**
```
default-src 'none';
script-src  'self' 'unsafe-eval' <approved library origins>;   # Babel + new Function need unsafe-eval
style-src   'self' 'unsafe-inline' <approved library css origins>;
img-src     'self' data: blob:;
font-src    'self' data:;
connect-src 'none';                                             # no egress: all data via the bridge
frame-src   'none'; form-action 'none'; base-uri 'none';
```
- `'unsafe-eval'` is acceptable here. The CSP is about **egress**, not script origin.
- **Library hosting (D2).** Mirror approved `MJ: Component Libraries` onto the sandbox origin so
  `script-src` can be `'self'` only. Otherwise fall back to an allowlist built from `CDNUrl` and
  `CDNCssUrl`.

**Storage.** Opaque-origin frames throw on `localStorage`, `sessionStorage` and IndexedDB. The page
installs in-memory shims before any library loads. Saved user settings already go through the
bridge (`SaveUserSettings`).

### 5.3 Bridge protocol

The protocol is promoted from mobile and extended.

**Transport.**
- Web: the host creates a `MessageChannel` and transfers one port in the `init` message. After
  that, only the owning host can talk to the frame. The first `postMessage` checks
  `event.source === iframe.contentWindow`.
- Mobile: keeps its `injectJavaScript` / `onMessage` transport behind the same interface.

**Versioning.**
- `init` carries `ProtocolVersion`.
- The page answers `ready` with its supported range.
- On a mismatch the host shows a clear error card rather than a blank panel. This matters because
  the mobile binary and the server-served page version independently.

**Messages:**

| Direction | Message | Purpose |
|---|---|---|
| host → frame | `init` | Spec, props, `ComponentStyles` plus resolved `--mj-*` token values, saved settings, metadata snapshot, current user, `LoadEntityClasses`, libraries |
| host → frame | `update` | Whole-spec change, single-node swap (§7.7), props/styles/settings change |
| host → frame | `invoke` | Standard and custom methods (`print`, `refresh`, `validate`, `isDirty`, `reset`, `scrollTo`, `focus`, `invokeMethod`) |
| host → frame | `entity-event` | Save/delete/remote-invalidate events for entities the frame declared or touched |
| host → frame | `theme` | Re-sent styles and tokens when the host theme changes (the host already observes `documentElement`, `mj-react-component.component.ts:360`) |
| host → frame | `snapshot-request` | Ask for a visual and text snapshot |
| frame → host | `ready` | Protocol range, registered method names, initial height |
| frame → host | `rpc` / host → frame `rpc-result` | All provider and utility calls (§5.4) |
| frame → host | `callback` | `OpenEntityRecord`, `CreateSimpleNotification`, `NotifyEvent`, `SaveUserSettings`, `OpenUrl` (new) |
| frame → host | `state` | Pushed mirrors: `IsDirty`, last validation result, registered methods |
| frame → host | `height` / `overlay` | Auto-size and overlay requests (§5.9) |
| frame → host | `snapshot` | PNG/JPEG data URL plus a DOM text outline |
| frame → host | `error` | Compile or render failure, routed to the existing `ComponentEvent` |

### 5.4 BridgeDataProvider (frame side)

`BridgeDataProvider extends ProviderBase` and implements `IEntityDataProvider`. In the frame it is
the **only** provider: it is set as `Metadata.Provider` and `BaseEntity.Provider`, so
`new Metadata()`, `RunView`, `this.ProviderToUse` and `GetEntityObject` all resolve to it.

**Metadata and user.**
- Metadata is hydrated at init from the host's snapshot through `MetadataFromSimpleObject`
  (`MJCore/src/generic/providerBase.ts:38`).
- `GetCurrentUser()` returns the host-supplied user.
- `AllowRefresh` is false. A metadata refresh is a host decision, sent as a new `init`.

**Forwarded operations.** Each of these becomes an `rpc` to the host:
- `InternalRunView(s)`, `InternalRunQuery(ies)`, `InternalExecuteQueryFromSpec`
- `Load`, `Save`, `Delete`, `GetRecordChanges`, the IS-A child lookup
- `InternalGetEntityRecordName(s)`
- `Get/SetRecordFavoriteStatus`, `GetRecordDependencies`, `GetRecordDuplicates`
- `GetDatasetByName` / `GetDatasetStatusByName`
- remote operations
- `CreateTransactionGroup`, whose `Submit` sends one batched `rpc`
- the semantic search pass

**Policy-gated or unavailable.**
- `MergeRecords` is allowed only for `Trusted` components.
- `DatabaseConnection` / `InstanceConnectionString` throw.
- `LocalStorageProvider` is in-memory.
- Anything not forwarded fails with a clear "not available in the component sandbox" error, never
  a silent no-op. The same rule applies on mobile.

**How an entity behaves in the frame.**
- `GetEntityObject('X')` returns the registered subclass. Field getters and setters, `Dirty`,
  `GetAll()`, synchronous `Validate()` with the generated `Validate*()` rules, and custom members
  all run locally.
- `entity.Save()` runs the subclass's `Save` logic **once, in the frame**, then calls
  `ProviderToUse.Save`, which crosses the bridge.

**How the host persists** (spike S1 validates the exact mechanics):
1. Rebuild a `BaseEntity` for the record from the payload: original values first, then changed
   values, so dirty tracking and concurrency checks behave as if the edit were local.
2. Call the **provider's** `Save` directly, not `entity.Save()`, so subclass logic doesn't run twice.
3. Raise the matching `BaseEntity` events on the host, so open forms and `BaseEngine` caches refresh.
4. Return the refreshed record and `LatestResult` to the frame, which applies it the way it applies
   a `GraphQLDataProvider` response.

### 5.5 `LoadEntityClasses` (host input, default `true`)

A boolean on the host (`<mj-react-component [LoadEntityClasses]>`,
`ComponentFrameHostOptions.LoadEntityClasses`, and the mobile `DomComponentHost` prop) controls the
heaviest part of the page load.

- **`true` (default).** The page loads the entity-class bundle, and `GetEntityObject` returns real
  subclasses with full fidelity. This is right for forms and for anything that writes, or that calls
  entity methods.
- **`false`.** The page skips the bundle. `BridgeDataProvider` registers a ClassFactory fallback
  that **synthesizes a lightweight class per entity on first use**:
  - it subclasses `BaseEntity`;
  - it defines one accessor per `EntityInfo.Fields` entry, through `Get`/`Set`.
  `BaseEntity` defines no dynamic accessors today, so this is new.
  - Generated property names, CRUD, `Dirty` and metadata-level validation work.
  - Custom subclass members and generated `Validate*()` rules don't exist; the server still
    enforces constraints.
  - Calling a missing member fails with an explicit error.

  Use it where the caller knows definitively that the component is read-only or uses only plain
  fields: report and chart artifacts, whiteboard widgets with no writes, low-bandwidth mobile.

Later, an optional `auto` could infer the setting from the spec. Write verbs in
`dataRequirements.entities[].permissionLevelNeeded`, or a lint finding of `GetEntityObject`, would
imply `true`. The explicit boolean stays authoritative.

### 5.6 Access policy at the bridge

`ComponentFrameHost` checks every `rpc` before it reaches the provider.

```ts
type ComponentPolicyMode = 'Enforce' | 'Audit' | 'Trusted';

interface ComponentAccessPolicy {
  /** Enforce: undeclared access is rejected. Audit: allowed but logged. Trusted: declared scope not required. */
  Mode: ComponentPolicyMode;
  /** Ask the user before a Save/Delete/TransactionGroup from this component. */
  ConfirmWrites: boolean;
  /** Per-component call budget; exceeding it rejects with a clear error. */
  MaxCallsPerMinute?: number;
  /** Whether ai.* utilities (cost-bearing) are available. */
  AllowAI: boolean;
}
```

- **`dataRequirements` becomes an enforced capability manifest.**
  - Entities are checked with their declared verbs (`read`, `create`, `update`, `delete`).
  - Queries are checked by name and category.
  - Today it is only a pre-render check (`EvaluateComponentPermissions`), which stays.
  - Rejections are returned as structured errors, so the lint/repair loop (§7.2) can fix the spec.
- **Defaults:**
  - Agent-authored and unpromoted components: `Enforce` + `ConfirmWrites`.
  - Existing registry and metadata components during rollout: `Audit` first, then `Enforce` once
    audit logs are clean.
  - Signed or promoted core components: `Trusted` (decision D5).
- **Unchanged:** server permissions, RLS and validation always apply on top.

### 5.7 Data capture moves to the host

`wrapUtilitiesWithCapture` (`mj-react-component.component.ts:1367`) moves to `ComponentFrameHost`.
- Every `RunView` and `RunQuery` result already passes through the host, so `GetCurrentDataState()`
  **stays synchronous** and needs no frame round-trip.
- That keeps the agent-facing "what is this component showing" path intact.

### 5.8 `<mj-react-component>` API changes

- **Inputs and outputs are unchanged.** Inputs: `Component`, `ComponentProps`, `Styles`,
  `SavedUserSettings`, `UserStateScope`, `PersistUserSettings`, `EnableLogging`,
  `UseComponentManager`. Outputs: `StateChange`, `ComponentEvent`, `RefreshData`, `OpenEntityRecord`,
  `UserSettingsChanged`, `Initialized`.
- **New inputs:**
  - `LoadEntityClasses: boolean = true` (§5.5).
  - `AccessPolicy?: ComponentAccessPolicy` (§5.6; defaults computed from provenance).
  - `IsolationMode: 'sandboxed' | 'in-page'`. This exists for rollout only. It defaults to
    `sandboxed` once Phase 2 completes, and `in-page` is then removed (D6).
- **Methods that become async:**
  - `InvokeMethod`, `Validate`, `Reset`, `ScrollTo`, `Focus`, `Print`, `Refresh`, `SetDataState`.
  - Known synchronous caller: interactive form panels call `hasMethod`/`invokeMethod` and use the
    return value (`base-forms/.../interactive-form-panel.component.ts:287-289`). Those panels move
    to `await`.
- **Mirrors that keep reads synchronous:**
  - `HasMethod` reads the method list pushed at `ready`.
  - `IsDirty` and the last validation result are pushed by the frame on change.
  - `GetCurrentDataState` is host-captured (§5.7).

### 5.9 UX inside a frame

- **Auto-height.** A `ResizeObserver` in the frame sends `height`, and the host sizes the frame.
  Mobile already does this.
- **Overlays** (antd dropdowns, modals, tooltips, which portal to `body`) are clipped to the frame
  (D4). Options:
  1. Give the frame headroom and set the antd `getPopupContainer` to a frame-level layer.
  2. The frame sends an `overlay` rect, and the host temporarily expands the frame above the page.
  3. Accept clipping for widgets and do (2) only for forms.
  Measure on the forms corpus first.
- **Focus and keyboard.** Forward focus-trap boundaries and `Escape`. `Focus()` is invoked through
  the bridge.
- **Theme.** Computed `--mj-*` values plus `ComponentStyles` are sent at init and on every theme
  change. antd theming (`wrapWithLibraryThemeProviders`) runs inside the frame unchanged.
- **Print.** Either `allow-modals` with in-frame `window.print()`, or the host prints from a
  snapshot (D3).

### 5.10 Performance

- **Cost per frame:** React, Babel, the runtime, core and, optionally, entity classes. Mitigations:
  - **Cacheable bundles** on the sandbox origin.
  - **Warm frame pool.** Keep one pre-initialized frame ready.
  - **One frame can host several component roots** where isolation *between* them doesn't matter,
    for example the parts of one dashboard.
  - **Precompile on save/publish.** Store compiled JS alongside the spec, so Babel loads only for
    drafts (Phase 6).
- **Metadata snapshot.** It is sent once per frame by structured clone. Measure its size. If it is
  large, send only the entities the spec declares plus their relationships, with on-demand top-up
  over `rpc`.
- **Spike S2** measures time-to-first-render in-page versus framed for representative components:
  a chart, an AG Grid table, an antd form, and a 5-node hierarchy.

### 5.11 Mobile

- `DomComponentHost` becomes an adapter over `ComponentFrameHost`, using the React Native
  transport. It loads the server-served page (§5.1).
- **Native in-process rendering is limited to `Trusted` components** (D7). Everything else uses the
  DOM host. This closes mobile's in-realm exposure.
- The `UNPROXYABLE_UTILITIES` list shrinks to what is truly synchronous, such as
  `geoDataEngine.ResolvePointToLocation`. `GetEntityObject` now works through `BridgeDataProvider`.

### 5.12 Verification

- **Parity.** Run the existing component corpus (`metadata/components`, plus registry samples)
  through `React/test-harness` against both hosts. Diff the rendered HTML, errors, lint results and
  `DataSnapshot`. The harness should run components in the real host page so tests match production.
- **Security tests** (must fail inside the frame):
  - reading `window.parent` or `top`;
  - top navigation;
  - `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, image beacons to foreign origins;
  - reading storage or cookies;
  - posting forged messages to the host;
  - calling an undeclared entity under `Enforce`.
- **Entity fidelity.** Save/Delete through the bridge for:
  - a plain entity;
  - an entity with a client subclass override;
  - an IS-A child;
  - a `TransactionGroup`;
  - an optimistic-concurrency conflict.

---

## 6. Rollout of the host

Migrate one surface at a time behind `IsolationMode`, in order of risk:
1. Component artifact viewer, which also covers dashboard artifact parts and Skip output.
2. Component Studio preview.
3. Interactive forms. These come last because of overlays, field-change flow, sizing and async
   method calls.

The policy starts in `Audit` for existing components and `Enforce` for agent-authored ones. Once the
parity and security suites are green on all three surfaces, `sandboxed` becomes the default and
`in-page` is removed.

---

## 7. Part B: realtime component surfaces

### 7.1 One engine, two mounts

**`ComponentSurfaceState`** is a framework-agnostic state model in the style of `WhiteboardState`.
It holds:
- the working spec tree, with a revision per node;
- the last lint result, last runtime errors, last `DataSnapshot` summary and last visual snapshot;
- undo history;
- references to saved artifact and version IDs.

Agent tools are applied through a pure `ApplyComponentAgentTool(state, toolName, argsJson)` that
never throws, mirroring `ApplyWhiteboardAgentTool`.

**Mounts:**
- **Components channel.** A full-pane surface like Remote Browser, for app-sized builds. It is a new
  `MJ: AI Agent Channels` row: `Name: Components`, `ServerPluginClass: ComponentChannelServer`,
  `ClientPluginClass: RealtimeComponentChannel`, `TransportType: PubSub`.
  - **Server half:**
    - lint (calls the existing linter, as `interactive-forms/_shared.ts` does);
    - `FindExisting` search;
    - artifact version saves;
    - registry fetch;
    - `OnChannelStateSave` normalization.
  - **Client half:**
    - `ApplyAgentTool`;
    - the surface component;
    - `Serialize`/`RestoreState`;
    - `IChannelFrameProvider` backed by frame snapshots.
  - It fits the multi-pane layout proposed in `plans/realtime/resources-channel/proposal.md` §5.
- **Whiteboard `component` item.** A tenth item kind, rendered by the same sandboxed host:
  ```ts
  interface WhiteboardComponentItem extends WhiteboardItemBase {
    Kind: 'component';
    X: number; Y: number; W: number; H: number;
    Title?: string;
    /** Saved artifact this widget shows (preferred: keeps board JSON small). */
    ArtifactID?: string;
    ArtifactVersionID?: string;
    /** Working copy while it is being built, before the first save (size-capped). */
    DraftSpec?: ComponentSpec;
    Props?: Record<string, unknown>;
    LoadEntityClasses?: boolean;   // default true
  }
  ```
  - Off-viewport items render as placeholders (existing `IsNearViewport`).
  - "Open full size" moves a widget into the Components channel; "Pin to board" moves it back.

### 7.2 Tool vocabulary (author-agnostic)

There is one tool set with the prefix `Component_`. Each call addresses a component by
`componentId`. The whiteboard reuses these tools with `placement: 'whiteboard'` instead of adding
its own.

| Tool | Params | Notes |
|---|---|---|
| `Component_Create` | `placement` ('surface' \| 'whiteboard'), `spec`, `x`,`y`,`w`,`h`?, `props`? | Returns `componentId` (and `itemId` on the whiteboard) |
| `Component_Open` | `artifactId`, `versionId`?, `placement` | Put an existing or delegated artifact on a surface |
| `Component_FindExisting` | `query`, `limit`? | Server tool. Semantic search over `MJ: Components` requirement and design embeddings, plus registries. Reuse by reference (`location: 'registry'`) |
| `Component_UpdateNode` | `componentId`, `node`, any of `code`, `properties`, `events`, `dataRequirements`, `libraries` | Replace one node (§7.7) |
| `Component_EditCode` | `componentId`, `node`, `edits: [{find, replace}]` | Targeted edit. Each `find` must match exactly once |
| `Component_AddNode` / `Component_RemoveNode` | `componentId`, `parent`, `spec` / `node` | Grow or shrink the hierarchy |
| `Component_SetProps` | `componentId`, `props` | No code change |
| `Component_SetStyle` | `componentId`, `styleOverrides` | Re-renders in place (already no remount) |
| `Component_Inspect` | `componentId` | Lint, runtime errors, `DataSnapshot` summary, DOM text outline. Also sends one visual frame |
| `Component_SaveVersion` | `componentId`, `comment`? | Creates or appends a `Component` artifact version. Non-destructive |

- **Every mutating tool follows the same sequence:**
  1. Apply the change to the working copy.
  2. Lint it on the server.
  3. If there are critical or high violations, return them without rendering.
  4. Otherwise compile and render in the frame.
  5. Return `{success, revision, lint, runtimeErrors}`.
  The *author* repairs. The host never silently rewrites code.
- **What stays a person's job.** Promotion is not an agent tool: publishing to `MJ: Components`,
  adding to a dashboard, or activating an entity form override. This follows the
  `canvas-edit-transforms.ts` safety boundary.
- **Tool count.** That is about 11 tools on top of the whiteboard's 14. If a provider can't take
  that many, or binds tools at connect time, fold them into one `Component({action, params})` tool,
  as `ClientContextChannel`'s `ContextTool` does.
- **Size caps** (TBD in D8): per-node code about 64k (matching HTML widgets), whole spec about
  256k, all within the 2 MB channel-state cap.

### 7.3 Who authors

1. **The live model directly.** This includes reasoning planes: GPT Live's remote reasoning backend
   and Gemini 3.8 Live Extended Thinking with non-blocking tools. Good for small builds and every
   tweak.
2. **Delegated builders** through `invoke-target-agent`: Skip (the `skip-client` Open App),
   Codesmith, or any agent in `allowedAgents`.
   - Their `Component` artifacts arrive in the delegation result, are opened with
     `Component_Open`, and are then iterated with the same tools.
   - To revise an existing component, the request includes its artifact version ID.

**Configuration.** Which modes are enabled is set in the existing co-agent config cascade
(`AI/Agents/src/realtime/realtime-coagent-config.ts`), for example
`componentAuthoring: { direct: true, delegateTo: ['Skip', 'Codesmith'] }`.

**Prompt guidance** (Voice Co-Agent template):
- Sketch in HTML/SVG when no data or state is needed.
- Use a component for live data, writes or rich interaction.
- Look for an existing component before writing one.
- Delegate large multi-component builds when the session's reasoning plane is weak.

### 7.4 Perception

This also fixes HTML widgets.

- **Snapshot helper.** In the frame, it renders the DOM, including `<canvas>` content, to an image
  plus a short text outline. It answers `snapshot-request` and pushes a fresh snapshot after each
  render settles.
- **Whiteboard export** (`whiteboard-export.ts:550`) composes the latest snapshot instead of the
  dashed placeholder. The channel's `IChannelFrameProvider` uses it for the inbound video track.
- **Text context.** After an agent tool settles, `SendContextNote` carries the `DataSnapshot`
  summary and the DOM outline, so non-vision models also "see" the result.

### 7.5 Persistence and promotion

- **The working copy** lives in channel state, persisted through `RequestSave` with a size cap.
- **Saving.** `Component_SaveVersion` and the user's Save write a `Component` artifact
  (`application/vnd.mj.component`).
  - The **first save creates the artifact; later saves add versions**.
  - Fix the board artifact the same way, so it stops always writing a new v1.
- **The whiteboard stores references**, not specs, once a component has been saved.
- **Promotion (human):**
  - Publish to `MJ: Components` as Draft.
  - Add to a dashboard (Artifact part).
  - Use as an entity form override (interactive-forms flow).

### 7.6 Multi-party sessions

- LiveKit board sync (`whiteboard-sync.ts`, last-writer-wins snapshots) carries specs and
  references.
- **Each participant renders the widget in their own frame with their own permissions**, so the
  same widget can show different data to different people. This is permission-correct. Decision D9:
  should we show a "showing data visible to you" affordance?

### 7.7 Single-node hot swap

- **Today**, any code change remounts the whole tree, and the version key covers every node.
- **Proposal:**
  1. Key registry entries **per node** (node content hash), not per hierarchy.
  2. Give each host instance its **own** `components` map.
  3. On a single child update, compile only that node, replace its entry in the map, and re-render
     the root.
- **Why it works.** Child components are read from `componentsOuter[...]` inside the wrapper **on
  every render** (`component-compiler.ts:238-240, 325`). So the parent keeps its function identity
  and state, and React remounts only the changed subtree.
- **Caveats:**
  - `componentsOuter` is captured on first render, so the swap must mutate the existing map object,
    which is per-instance so other instances are unaffected.
  - Root code changes still remount. State survives only through `savedUserSettings` and an
    optional `SetDataState` restore.
- **Spike S5** prototypes this.

---

## 8. Part C: HTML/SVG whiteboard widget improvements

Ship these in parallel; they are cheap and independent.

- **`Whiteboard_EditHtml {itemId, edits:[{find, replace}]}`.** Targeted edits instead of full
  replacement.
- **`Whiteboard_GetContent {itemId}`.** Returns the full current HTML. Scene deltas clip it to 200
  characters, so the model otherwise has to remember its own source.
- **CSP `<meta>` in the srcdoc** (`connect-src 'none'` etc.). Today widgets can still reach the
  network.
- **Inject resolved `--mj-*` token values** as CSS variables, so widgets follow light and dark mode
  instead of the prompt's "design for a plain white background".
- **The snapshot helper (§7.4)**, injected into the srcdoc, so HTML widgets appear in the model's
  vision frames.
- **Optional.** A first-class `svg` item kind for diagrams, which would simplify export.

---

## 9. Phasing and exit criteria

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0** (parallel) | Part C | Edit/GetContent tools shipped. CSP on widgets. Widgets visible in vision frames |
| **P1** | Protocol package, host page, `BridgeDataProvider`, per-deployment entity bundle, `LoadEntityClasses`, access policy (Audit), data capture on host | Corpus parity and security suites green on the host page in the harness. Spikes S1–S3 resolved |
| **P2** | `<mj-react-component>` on `ComponentFrameHost` behind `IsolationMode`. Migrate viewer → Studio → forms. Policy to `Enforce` for agent-authored components | All three surfaces sandboxed by default. `in-page` removed |
| **P3** | Mobile on the shared page and protocol. Native mode limited to `Trusted` | Mobile renders the same corpus through the server page. Version handshake tested |
| **P4** | `ComponentSurfaceState`, tool vocabulary, server lint loop, single-node hot swap (S5), perception helper | A live model builds and iterates a data-bound component end to end in the harness |
| **P5** | Components channel + whiteboard `component` item, persistence with versions, promotion UI, co-agent authoring config, prompt guidance | Voice session demo: build a member-retention dashboard and an editable form live, save, promote |
| **P6** | Precompile on publish, scoped-token provider option, streaming render, overlay expansion, MCP Apps export | Per item |

---

## 10. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | Sandbox origin: dedicated origin vs same-origin path | Dedicated origin in prod, path fallback |
| D2 | Library hosting: mirror on the sandbox origin vs CDN allowlist | Mirror; allowlist as fallback |
| D3 | Printing: `allow-modals` vs host-side print from snapshot | `allow-modals` (narrow, enables `print()`) |
| D4 | Overlay strategy for antd portals | Headroom + in-frame container first; overlay expansion for forms if needed |
| D5 | What qualifies as `Trusted` (signed? promoted? core-only?) | Promoted + published by an admin role |
| D6 | Keep `in-page` mode after rollout? | No. Remove it |
| D7 | Mobile native in-process rendering | `Trusted` only |
| D8 | Size caps for node and spec | 64k per node, 256k per spec, revisit after S2 |
| D9 | Multi-party data visibility affordance | Show a subtle "your data" hint on component widgets in shared rooms |
| D10 | Tool shape: individual `Component_*` tools vs one action tool | Individual tools; fall back to one tool per provider capability |

---

## 11. Spikes and risks

**Spikes**
- **S1. Host persist fidelity.** Rebuild an entity from frame payloads (original values, then
  changes) and call the provider's `Save`/`Delete` directly. Covers IS-A children,
  `TransactionGroup`, concurrency, and host-side event raising.
- **S2. Page weight and time-to-first-render** in-page vs framed. Includes opaque-origin caching
  under option D1(b) and metadata snapshot size.
- **S3. Library compatibility in an opaque origin** with storage shims: antd, Chart.js, ApexCharts,
  AG Grid, Leaflet, D3, xlsx.
- **S4. Snapshot quality** for canvas-heavy libraries.
- **S5. Single-node hot swap** with state preservation.

**Risks**
- **Bundle weight** of `core-entities` in every frame. Mitigated by `LoadEntityClasses=false`,
  caching and frame pooling.
- **Protocol drift** between the mobile binary and the server page. Mitigated by the version
  handshake and an explicit error card.
- **Existing components that rely on host `window`/`document`** despite the lint rules. The parity
  suite surfaces them, and `Audit` mode logs them before enforcement.
- **Name collisions** between synthesized accessors (`LoadEntityClasses=false`) and `BaseEntity`
  members.
- **Event storms** from forwarding entity events. Forward only declared or touched entities, and
  debounce.
- **Alternative held in reserve.** Run the real `GraphQLDataProvider` in the frame with a
  short-lived, narrowly scoped JWT (`mj_scopes`), with the CSP limited to MJAPI. That means less
  bridge code and server-enforced policy, at the cost of a credential in the frame and a dependency
  on scope granularity. Revisit in P6.

---

## 12. References

- `packages/React/runtime/src/compiler/component-compiler.ts` (`new Function` at 756; child resolution 238–240, 325)
- `packages/React/runtime/src/utilities/component-hash.ts:27`
- `packages/Angular/Generic/react/src/lib/components/mj-react-component.component.ts` (inputs 169–490, reinit 183, theme observer 360, methods 1502–1679, capture 1367)
- `packages/MobileApp/src/interactive/dom-host/{host-page.ts,bridge-protocol.ts,DomComponentHost.tsx}`, `mobile-safety.ts`
- `packages/MJCore/src/generic/providerBase.ts` (abstract members; `MetadataFromSimpleObject` at 38), `interfaces.ts:262` (`IEntityDataProvider`), `baseEntity.ts:3645` (`ProviderToUse`)
- `packages/MJCLI/src/commands/codegen/manifest.ts:160` (`--filter`)
- `packages/Angular/Generic/base-forms/src/lib/interactive-form/` (host props snapshot, `FieldChanged`, sync `invokeMethod` at 287–289)
- `packages/Angular/Generic/artifacts/src/lib/components/plugins/{component-artifact-viewer.component.ts,component-permission-evaluation.ts}`
- `packages/Angular/Generic/whiteboard/src/lib/{whiteboard-state.ts,whiteboard-tools.ts,whiteboard-export.ts,whiteboard-widget-bridge.ts}`
- `packages/Angular/Generic/conversations/src/lib/components/realtime/whiteboard/whiteboard-channel.ts`
- `packages/RealtimeRuntime/src/channels/base-realtime-channel-client.ts`, `src/session/delegation-result-parser.ts`
- `packages/AI/Agents/src/realtime/{realtime-tool-broker.ts,realtime-coagent-config.ts}`
- `packages/Angular/Explorer/dashboards/src/ComponentStudio/services/canvas-edit-transforms.ts`
- `plans/realtime/{gpt-live-1.md,gemini-3-8-live.md,resources-channel/proposal.md}`, `plans/realtime-client-context-coagent/`
