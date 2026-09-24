# @memberjunction/mobile-app

## 6.2.0-edge.0

### Minor Changes

- 7658d68: Mobile app v6: make realtime voice actually resolve on a device, route hosted applications' generic nav items, and scope the new agent-session grants with row-level security.

  **Why `minor`.** The branch adds metadata — two `MJ: Row Level Security Filters` rows and the `UI` role's `MJ: AI Agent Sessions` / `MJ: AI Agent Session Channels` permissions — which becomes a consolidated metadata-sync migration at release.

  **Realtime voice could not have worked on a device.** The React Native WebRTC drivers registered against `OpenAILiveClient` / `OpenAIRealtimeClient`, but `ClassFactory` matches on the registered base class's _name_ and the session runtime resolves against `BaseRealtimeClient` — so the RN drivers were filed in a bucket lookup never reads, the browser driver won, and `new RTCPeerConnection()` threw under Hermes. They now register against `BaseRealtimeClient` under the same provider keys the browser drivers use, `registerGlobals()` from `react-native-webrtc` runs at module load, and a unit test asserts on the resolved _class_ rather than merely that something resolves.

  Two related corrections: the RN drivers now override `createAudioSink()` rather than `attachRemoteAudio()` — the latter is where the base driver installs `pc.ontrack`, so overriding it silently removed the remote stream, its subscribers and the output audio meter — and `'xai'` is no longer advertised as supported. Grok Voice speaks the OpenAI protocol but over a websocket with a client-owned PCM plane, so it would have hit the `AudioContext` crash the provider filter exists to prevent.

  **Session lifecycle.** `RealtimeSessionRuntime` gains three fixes that apply to every host, Explorer included: a start abandoned mid-flight (the user leaves while the mint is in progress) now releases the microphone, the provider connection and the server-side session instead of leaking all three; concurrent teardowns coalesce onto one run instead of racing into two `Disconnect()` calls and two `CloseAgentSession` mutations; and a host that declines the resolved provider now unwinds through the shared teardown, so channel plugins are disposed rather than left published with live tool handlers. `IRealtimeMediaHost` gains an optional `ReleaseMicrophone()` — iOS is put into a record-and-play audio category for a call, and nothing was putting it back. `LastStartError` lets a host tell a denied microphone apart from a provider failure.

  **Agent runs reported failure as success.** `ConversationAgentRunner.processMessage` returns `null` only when no agent resolves; every other failure — a quota rejection, an agent that threw, a transport error — comes back as a well-formed result carrying `success: false`. The mobile send path tested only for `null`, so those turns reported success and left a permanently spinning bubble with no error anywhere in the UI.

  **Attachments were uploaded after the agent had already answered.** Photograph an invoice, ask for the totals, and the agent replied "I don't see an attachment" while the file appeared a second later. `SendMessage` now takes an `onUserMessageSaved` hook that runs in the window between the user's row existing and the run starting.

  **Hosted applications.** Nav items are parsed into a shape derived from the generated `MJApplicationEntity_IDefaultNavItem` rather than a hand-copy, which restores `RecordID` — the field identifying which record a non-`Custom` item opens. Generic resource types now resolve through the same registry as `Custom` ones, keyed by the type name, and this build ships a `Dashboards` surface backed by the same `DashboardView` the Explorer route mounts. Retired applications and deactivated nav items are filtered the way MJ Explorer filters them, and the launcher's ordering now matches `compareUserApplications`.

  **Storage seam corrections.** `MJStorageBlobStore` restores the compensating `DeleteObject` when the `MJ: Files` row fails to save (otherwise a successful upload with a failed row leaves permanently orphaned bytes) and configures `FileStorageEngine` before reading its accounts, so a cold process does not silently fall back to environment-only credentials. `ConversationAttachmentService.DeleteAttachment` now honours the store's return value instead of deleting the row regardless — the anti-orphan guarantee three doc comments promised. The browser store implements `GetDownloadUrl` through `CreateMediaAccessToken`, which is what makes Explorer's new storage-backed attachments readable rather than write-only, and `saveAttachments` accepts the agent whose `InlineStorageThresholdBytes` the decision should honour.

  **Security.** The `UI` role's new read/update permissions on agent sessions and session channels are scoped by two new RLS filters (`UI: Own Agent Sessions`, `UI: Own Agent Session Channels`), matching the pattern the Widget Guest rows already use. Unscoped, any signed-in user could read and modify another user's sessions.

  The sample application no longer sets `DefaultForNewUser` — a worked example should not install itself into every deployment's new users — and its screen now handles transport failures rather than showing "Loading…" forever on a dead network.

### Patch Changes

- 83ec55c: Artifacts render **in** a dashboard panel, including interactive components.

  A dashboard's artifact part rendered as a link row reading "Open artifact". A dashboard whose
  panels are doors to things is not a dashboard — the point is seeing several things at once without
  opening any of them. The panel now renders the artifact through `ArtifactContentView`, the same
  dispatch the artifact detail screen uses, extracted from that route so a component drawn on a
  dashboard and the same component drawn from a chat thread cannot diverge. A footer link still opens
  it full screen, because a panel is a summary.

  The dashboard composer offers artifacts alongside saved queries, narrowed to the types that render
  as a panel rather than a document. An agent-authored interactive component IS an artifact, so
  putting one on a dashboard is how a chart with a drill-down stops being something you open from a
  chat thread and becomes something you check. `BuildDashboardConfig` stamps the Artifact part type
  and writes `artifactId`, so these dashboards open on the desktop like any other.

  Also drops two weak casts introduced in the previous change: `MJConversationArtifactEntity` has a
  typed `ArtifactType` getter, and `MJ: Conversation Artifact Versions` has no content-type column at
  all — the cast was inventing a field rather than reading one.

- 5a90d4b: Artifacts in the chat thread, a renderer registry, and the query builder's output.

  **In the thread.** An artifact now appears as a card under the turn that produced it.
  `MJ: Conversation Details` carries `ArtifactID` directly, so the association is a column read. The
  dock above the composer stays — "what did this conversation produce" and "what did _that_ turn
  produce" are different questions and neither answer replaces the other.

  **A registry instead of a heuristic.** Renderers resolve by artifact type name and content type
  through `MJGlobal.ClassFactory`, with the same priority ordering and tie-break `ng-conversations`
  uses for its viewer plugins — so an artifact type added to MJ metadata reaches a renderer by
  registration. The previous path sniffed the type name and then the content to invent a `kind` the
  web has no concept of; it survives as the fallback for types not yet moved over, which is honest
  about being a guess.

  **The Data artifact renders.** Query-builder output shows its interpretation, its rows and the SQL
  behind them. `NormalizeToTables` from `@memberjunction/core` already collapses both the multi-table
  snapshot and the legacy single-table shape, so mobile uses it directly and cannot disagree with the
  web about what a row is. Rows stack as label/value cards rather than a grid: a 9-column grid on a
  390pt screen is a horizontal scrollbar with a table hidden behind it.

  **Percentage styles no longer vanish.** The web→RN style normalizer grouped `%` with `vh`/`vw` as a
  unit React Native "cannot resolve" and dropped it. RN resolves percentages natively on dimensions,
  position and spacing — so an agent-authored bar chart rendered as six identical full-width bars,
  every one reading 100%. Percentages are now kept on the properties RN resolves them for and dropped
  only where RN would ignore them anyway. Found by rendering a real interactive component, which is
  the only way this class of defect shows up.

- a865218: Compose dashboards from Data Explorer, and make dashboard tables readable on a phone.

  **The gap.** All 15 dashboards in MJ are `Type = 'Code'` — their panels are an Angular component,
  which is exactly why none of them render anywhere but Explorer, and why the mobile `Dashboards`
  resource had nothing real to show. `Config` dashboards are data, and data renders wherever there is
  a renderer. There were none, so nothing could demonstrate the generic path.

  **Compose one.** `/explorer/dashboard/new` picks approved saved queries, orders them, and saves a
  `Config` dashboard. It writes the same Golden Layout tree MJ Explorer reads — a mobile-only shape
  with a converter would produce dashboards only one client could open, which defeats building them
  from metadata. It composes from saved queries rather than arbitrary SQL because a query is already
  named, permissioned and approved.

  **Two fixes the first composed dashboard exposed immediately:**
  - Tabular panels rendered as a horizontally-scrolling four-column grid, so a phone showed a row of
    GUIDs clipped mid-value with the meaningful columns off the right edge. Rows now stack as
    label/value cards — the same decision the Data artifact renderer makes, and the only layout where
    a wide row stays readable without panning.
  - The composer offered queries requiring a parameter with no default. A dashboard panel supplies no
    parameters, so one of those renders `Parameter validation failed` where a panel should be. They
    are excluded, with a count of how many and why.

  ***

  **Data Explorer is now the app's own surface when opened from Apps.** The nav items declare
  `DataExplorerResource`, `QueryBrowserResource` and `DashboardBrowserResource`, and nothing had
  claimed those driver classes — so opening the application showed "opens on desktop" while the same
  lists sat one tab away on Home. They are registered through `MJGlobal.ClassFactory` against the
  same driver strings the Angular shell resolves, so it is one navigation model with two hosts and no
  branch anywhere that recognises Data Explorer by name. A deployment can still override any of them
  by registering a higher-priority subclass, which a special case in the host would have prevented.

  The list bodies moved to `src/explorer/ExplorerLists.tsx` and are shared by the Home routes and the
  hosted surfaces — the host already draws a header and back button, so a screen with its own would
  stack two, and a second implementation is how "the list in Apps" and "the list on Home" start
  behaving differently.

  **The dashboard list shows `Type = 'Config'` only.** A `Code` dashboard's panels ARE an Angular
  component and a `Dynamic Code` dashboard's are generated for a browser; neither has anything a
  native surface can render, which is why every one of them used to be listed and then apologise. A
  list whose rows mostly cannot be opened stops being a menu of what you can do. The standing "built
  for desktop" notice went with them, since it is no longer true of anything in the list.

- c8c29b0: Return sends the message in the mobile composer, with the web's exact precedence: an open mention
  picker with results completes the mention first, Shift+Return inserts a newline wherever the
  platform reports modifiers, and the policy is configurable per host via `SubmitOnEnter`. Defaults to
  sending only when a hardware keyboard is attached — an on-screen keyboard has no Shift to fall back
  on, so sending there would leave no way to type a second line.

  Also fixes mention tokens leaking into conversation titles and list snippets. A conversation opened
  with `@Sage …` was named from the wire format and showed as `@{"type":"agent","id":"55…` in the
  thread header and in every row of the conversation list; the conversion now happens where the view
  model is built, which also repairs conversations already named that way.

- aee203e: Pin the dashboard layout parser against the format MJ Explorer actually writes.

  `Dashboard.UIConfigDetails` holds Golden Layout's native `ResolvedLayoutConfig`. The mobile parser
  had only ever been fed its own composer's simplified tree, so nothing proved it could read a
  dashboard authored on the desktop. Verified against fixtures shaped like the real thing —
  components nested in `stack` nodes, `size`/`sizeUnit`, `componentType`, GL's `resolved: true` — and
  against two dashboards seeded in that exact format and opened on a device.

  It works, and now it is pinned. Two properties matter and are easy to break:
  - **Components live inside `stack` nodes**, always, even a stack of one. A walk that only descends
    rows and columns finds nothing in a real Explorer dashboard. A mutation restricting the walk fails
    four of the six new tests.
  - **Panels sharing a stack are tabs on a desktop.** A phone has no tabs, so they flatten into the
    list in order and stack vertically — nothing hidden behind a tab the user cannot reach.

  `parsePanels` is exported for this.

- 9160fd9: Interactive components get their declared libraries **and their child components** on mobile, the same way the Angular react bridge supplies them.

  **The gap.** An agent-authored component declares its libraries in the spec, and the compiler turns
  each declaration into a binding — `const _ = libraries['_']`. The mobile runtime context carried no
  libraries at all, so every component that used one (which is most of them) was refused up front with
  "this component uses external libraries that only run on desktop". A component asking for `lodash`
  was being sent to the desktop over a dependency that could have been sitting in the bundle.

  **The seam is the one the web already uses.** `RuntimeContext.libraries`, keyed by
  `globalVariable` — the same field `AngularReactAdapterService` fills from `LibraryLoader`'s CDN
  loads, merged by the compiler as `{ ...context.libraries }`. Mobile fills it from ordinary npm
  dependencies, pinned to the exact versions `__mj.ComponentLibrary` declares. Imports are lazy, so a
  component that declares nothing evaluates nothing.

  **Filling the map is not sufficient, and the reason is a scoping detail.** The compiler emits the
  `const _ = …` bindings _inside_ `DestructureWrapperUserComponent` but splices the component's source
  one scope out, so a component body referencing `_` reads a free variable. On the web that resolves
  because the UMD `<script>` already defined `window._` — the component is reading the global, not the
  runtime's map. Mobile therefore also publishes each library onto `globalThis` under its declared
  global name, which is the same act a UMD bundle performs, in the module system Hermes has. Existing
  globals are never overwritten, mirroring `LibraryLoader`'s own guard.

  **react-runtime: the browser check now tests for a DOM.** `loadRequiredLibraries` gated CDN loading
  on `typeof window === 'undefined'`. React Native defines `window` but has no `document`, so Hermes
  went down the script-loading path and threw
  `Failed to resolve dependencies: Library 'lodash' not found` for every component that declared one.
  It now tests for `document.createElement`, which is the capability it actually needs; browsers are
  unaffected, and DOM-less hosts fall through to the runtime context as intended.

  **Thirteen libraries, and honesty about the rest.** Provided: lodash, dayjs, moment, luxon, mathjs,
  simple-statistics, chroma-js, uuid, axios, marked, d3, topojson-client, xlsx. Declined: everything
  DOM- or canvas-bound (Chart.js, ApexCharts, AG Grid, Ant Design, Leaflet, Mapbox GL, GSAP,
  SortableJS, Popper, Emotion, DOMPurify, html2canvas, jsPDF, geo-maps) — shimming those renders
  nothing and reports no error, which is worse than declining. The fallback card now names the library
  and why, instead of the blanket "uses external libraries", and a spec is refused only for the
  libraries it actually cannot get rather than for having any.

  ***

  ## Child components

  **Mobile called `loadComponent`; the Angular bridge calls `loadHierarchy`.** That one-word
  difference was the whole gap. `loadComponent` compiles a single spec, so a component built out of
  sub-components — the shape `metadata/components/CLAUDE.md` prescribes for anything non-trivial — had
  nothing to render its children with, and `AssessSpec` refused any spec declaring `dependencies`
  rather than producing a component with holes in it.

  Mobile now makes the same call `MJReactComponent.loadComponentWithManager()` makes, with the same
  options (`defaultNamespace: 'Global'`, `defaultVersion`, `returnType: 'both'`), and passes
  `result.components` — the flat, unwrapped map of every loaded descendant — as the `components` prop,
  which is where the compiler's generated child bindings read them from. The `libraries` map is passed
  as a prop alongside it, as the bridge does, for components that read `libraries.d3` rather than the
  bare global.

  **Libraries are resolved for the whole tree, not the root.** `loadHierarchy` compiles each component
  against _its own_ `spec.libraries`, so a parent using lodash whose child uses d3 needs both loaded
  before any of it compiles. `CollectHierarchyLibraries` walks the tree once up front.

  **`generateComponentHierarchyHash` moved into the runtime.** It derives the registry version key for
  a spec with no explicit `version`, and it lived as a private method on the Angular component — so a
  second host had to reimplement it, and two implementations of a registry key is how two surfaces
  silently compile two copies of the same component. `MJReactComponent` now delegates to the runtime's
  copy.

  **What mobile still declines, and why it is not "dependencies".** A child whose code the spec does
  not carry: `location: 'registry'` without inline `code` needs a component-registry fetch this app
  cannot perform, and a child with no code at all cannot compile. The fallback names the missing part.

  ***

  ## The rest of the prop contract

  `MJReactComponent` hands a component eight things. Mobile was supplying three. The remaining gaps
  closed here, each by moving the implementation rather than writing a second one:

  **`utilities` — was `{}`.** `RuntimeUtilities` (452 lines, zero `@angular/*` imports) moves from
  `@memberjunction/ng-react` to `@memberjunction/react-runtime`. It builds `md`, `rv`, `rq`, `ai`,
  `geoDataEngine` and `ml` over MJ core — the data surface the component contract promises, and not an
  Angular concept. A native host previously had to reimplement it or pass `{}`, which meant any
  component with data requirements could not read a row. The `@RegisterClass` registration moves with it
  unchanged and ng-react now imports the factory instead of owning it.

  **And the override now works where it never did.** `createRuntimeUtilities` consulted
  `ClassFactory` only when `typeof window === 'undefined'`, returning `new RuntimeUtilities()`
  directly otherwise — so the `@RegisterClass` registration was inert on every browser and React
  Native host. The base class still built working utilities, which is exactly why this went
  unnoticed: nothing broke, a documented extension point simply did nothing. The guard is removed.
  For an app that registers no subclass this changes nothing — with a null key `CreateInstance`
  matches the base's own registration and constructs the same class the fallback would have — and for
  one that does, substitution finally happens. A jsdom test pins it: it fails against the old guard.

  **`styles` — was `undefined`**, which `buildComponentProps` turns into the runtime's frozen default
  palette, and silently discarded the spec's `styleOverrides` (the mechanism that keeps "make the
  charts blue" out of generated code as a hardcoded literal). `BuildStylesFromTheme` now accepts a
  `ThemeTokenReader` as well as an element, so React Native — which holds the same `--mj-*` token
  values but has no stylesheet to read them from — feeds them through the _identical_ mapping instead
  of a copy. Mobile then applies `ApplyStyleOverrides` on top, as the bridge does.

  **`savedUserSettings` / `onSaveUserSettings` — were absent**, so every sort order, selected tab and
  collapsed panel reset on each open while the same component remembered them on the web. Mobile now
  uses the same four `react-runtime` helpers and the same `UserInfoEngine` (`MJ: User Settings`)
  storage, which means the same key: settings saved on a desktop open on a phone. A mobile-only key
  format would have quietly given each user two profiles.

  **`callbacks.OpenEntityRecord` — was `key.GetValueByIndex(0)`.** Components routinely identify a
  record by something that is _not_ its primary key, because that is what their query returned. The
  Angular component did the full resolution inline; `resolveEntityRecordKey` now lives in the runtime
  and does it for both — coercing the three shapes a component may pass, then running a view to
  translate a non-primary-key field. `NotifyEvent` was missing entirely and is now accepted.

  **`CreateSimpleNotification` — was `console.log`.** It now renders above the component that raised
  it, dismissed by tap rather than a timer so a failed-save message cannot vanish unread.

  **Error boundary** now matches the bridge's options (`logErrors`, `recovery: 'retry'`).

  ## Manifest scoping

  `@memberjunction/react-runtime` is excluded from all four class-registration manifests
  (`ng-bootstrap`, `ng-bootstrap-lite`, `server-bootstrap`, `server-bootstrap-lite`). Moving a
  `@RegisterClass` into it made the package eagerly reachable from every bootstrap's dependency walk,
  which would have pulled `@babel/standalone` (~3 MB) out of Explorer's lazy ng-react chunk and into
  its initial bundle, and into the server bundle besides. `RuntimeUtilities` stays where it was
  behaviourally: registered lazily through `ng-react` via the existing `lazy-feature-config` entry.

  ## Still not at parity

  `utilities` is not wrapped for data capture (the bridge's fallback-snapshot support), and component
  methods (`print` / `refresh` / `invokeMethod`) are not exposed to the host.

  ***

  ## Registry-backed child components, and Hermes's async limit

  Two things were still stopping real agent-authored components from rendering, both found by
  running the deployment's actual component registry rather than hand-written samples.

  **Children named instead of inlined.** A spec routinely references `DataGrid`, `OpenRecordButton`,
  `SingleRecordView` by name with no code — that is what `metadata/components/CLAUDE.md` prescribes
  for anything non-trivial. `loadHierarchy` fetches those itself, but it _compiles each child as it
  fetches it_, and a component's library bindings are emitted at the top of its factory — so a
  registry child's libraries are unknowable until it is too late to load them. `hierarchy-resolver.ts`
  walks the tree first through the same `ComponentMetadataEngine.FindComponent` the runtime will use,
  purely to learn the library set; the specs it reads come back from `ComponentManager`'s own fetch
  cache, so the second read is free. `AssessSpec` no longer refuses children — it cannot judge them
  synchronously, and refusing them declined the majority of real components over a lookup the app can
  perform.

  **`async` in runtime-compiled code.** Hermes compiles the app's own modules ahead of time, where
  async is fully supported. Components take the other path — compiled at runtime, executed through
  `new Function` — and Hermes's runtime compiler rejects async outright: `async functions are
unsupported`. A component doing `const rows = await utilities.rv.RunView(…)` therefore failed to
  compile, with an error naming neither cause nor remedy. Mobile now compiles with
  `transform-async-to-generator`. Hermes accepts the generators that produces; it is only `async`
  syntax it refuses.

  `transform-regenerator` was tried and rejected on evidence: it would also remove the generators, but
  in this Babel version it miscompiles real component code (`Property name expected type of string but
got undefined`) — measured across the registry, it broke 12 components that otherwise transpile
  cleanly. The narrower transform is both sufficient and safe. A test asserts it stays out.

  Measured against this deployment's 118 registered components: 73 have a fully resolvable hierarchy
  and declare only libraries the native runtime can provide. The other 45 declare Chart.js, ApexCharts
  or ECharts — which the DOM host below now serves.

  ***

  ## Canvas and DOM components: a second renderer rather than a refusal

  Chart.js and ApexCharts are the two most-declared libraries in the component registry, and both draw
  into an `HTMLCanvasElement`. AG Grid, antd and Leaflet mount DOM nodes. None of that fails natively
  for want of effort — React Native has no canvas and no DOM. Reimplementing each library's
  configuration surface against `react-native-svg` would mean being subtly wrong forever against a
  moving target.

  A WebView is a browser, so a component that needs one gets one. `dom-host/` renders the component in
  a real document using the **same** react-runtime UMD bundle the Playwright test harness loads, the
  **same** CDN URLs recorded in `MJ: Component Libraries`, and the same compile path. That is parity by
  construction rather than parity by imitation.

  `AssessSpec` is no longer a yes/no gate: it returns a `RenderMode`. Components that can run natively
  still do — faster, native scrolling, the app's typography — and only the ones that genuinely need a
  browser take the other path. Which renderer is used is not a difference in what a component
  _receives_: both get the same `utilities`, `styles`, `savedUserSettings` and callbacks.

  **The page holds no credential.** It cannot call `RunView` — it has no provider and no token, and
  giving it one would put the app's session inside a document that just executed third-party library
  code. `utilities` and callbacks are proxied over a closed, named-method bridge to the native side,
  which owns the one authenticated provider. A component can ask for what the signed-in user could
  already read, and nothing else.

  **The UMD bundle is now minified, and 55% smaller.** It was 11 MB with minification disabled — for
  a real reason, not indifference: `MJGlobal.ClassFactory` keys every registration on `class.name`,
  and terser's default mangling renames classes, so distinct classes collapse onto one identifier and
  their registrations collide. `keep_classnames` / `keep_fnames` remove the cause rather than the
  symptom; everything else still minifies, taking it to 5.1 MB. That size is now a first-render wait
  on a phone rather than a number on disk, which is why it was worth fixing properly.

  A test evaluates the built bundle in a `vm` sandbox and asserts both that it initialises and that
  its class names survived — verified to fail when plain mangling is restored, so re-enabling it
  cannot pass silently here and break wherever a component is actually rendered.

  The first DOM-hosted render still needs a connection; the WebView caches the bundle afterwards.

  **Routing happens after resolution, not before.** `AssessSpec` is synchronous, so it can only see
  the spec it is handed — and a dashboard whose parent uses lodash while a registry-backed child draws
  a Chart.js canvas looks native-renderable right up until the child fails. The component that most
  needs the DOM host is exactly the one whose canvas library is buried a level down. The hierarchy is
  therefore resolved first and the renderer chosen against the resolved tree.

  The resolver also returns the tree with every registry child's code **inlined**, because the DOM host
  page has no provider: a child it still had to fetch would throw inside the WebView. The native
  renderer gets the same inlined spec, which costs nothing and means both paths reason about one thing.

  ***

  ## A crash no longer costs the reader the data

  By the time most components throw, the fetching has succeeded — the failure is in the drawing.
  Replacing the whole thing with "this component ran into an error" discards rows the reader came for
  and could still read perfectly well.

  `utilities` is wrapped so every view and query result is recorded, and a component that fails after
  loading shows those rows instead of a dead card, under an explanation that does not pretend anything
  worked. `MJReactComponent` captures for the same reason and calls it a fallback snapshot; the
  difference here is that it is _shown_, because on a phone there is no second pane to offer it in.

  In the DOM host the capture is nearly free — every data call already funnels through the one bridge
  handler — and only a page that never mounted is treated as failed, so a component that reports an
  error after rendering is not replaced by a table it did not ask for.

  Rendering goes through the Data artifact view, so captured rows and query-builder output cannot
  drift into describing a row differently.

  **Verified on both platforms.** The DOM host, its bridge, the canvas chart, registry-resolved
  children and the drill-down all behave identically on Android and iOS. `react-native-webview` is a
  native module, so the app needs a rebuild rather than a Metro reload.

  **Deliberately not built:** the rest of the host-facing method API (`validate`, `isDirty`, `reset`,
  `scrollTo`, `focus`, `invokeMethod`). Those exist on the web so an Angular container can drive an
  embedded component; mobile has no such container, and adding the surface with no caller would be
  speculative. `getCurrentDataState`'s purpose — a fallback when the component cannot show its own
  data — is served above.

- 230119c: Keep the tab bar on screen when you drill in.

  The bar existed but every drill-down — a chat thread, Data Explorer, an app, a record — was pushed
  on the ROOT stack, which covers it. So one level into Data Explorer there was nothing but a back
  chevron, and three levels in you pressed back three times to reach anywhere else. The bar was only
  doing half its job.

  Each tab now owns a stack (`app/(tabs)/(home|chats|apps|you)/`), and every drill-down reachable
  from a tab lives inside that tab's group. Route paths are unchanged — Expo Router groups are
  invisible in the URL — so deep links and existing navigation calls are unaffected.

  Screens that SHOULD cover the bar stay at the root: the voice call, login, the full-screen
  previews. Those are modes, not places. A test asserts that distinction so a new "place" cannot
  quietly land at the root and lose the bar again.

- 9a1a0db: Give the app a home screen and a tab bar.

  Navigation previously lived in exactly one place: a hamburger inside a chat thread that opened a
  modal sheet. The screen the app launches into could therefore not reach Apps, Data Explorer or
  Profile at all — you had to open a conversation to find the way out of conversations. The landing
  screen also carried two controls with no `onPress` at all: a filter button and a search button that
  rendered, depressed, and did nothing.

  There is now a persistent four-tab bar (Home, Chats, Apps, You) and a real Home: a greeting, the two
  primary actions (type, or talk), the threads worth continuing, the agents you can address, and doors
  to Data Explorer and Apps. Home is the app's INITIAL route rather than somewhere it redirects to
  after booting, and the boot gate wraps the shell instead of sitting in it as a route.

  MJ Explorer uses a sidebar and this deliberately does not mirror it: a phone has no room for one,
  and both platforms' users read a bottom bar as "these are the places this app has". The screens
  inside still match Explorer element for element — only the chrome differs.

  Also pins `@babel/core` and `@types/react` as singletons in the workspace overrides. Their peer
  variation was producing **two copies of `react-native@0.81.5`**, and therefore two copies of
  `@react-navigation/native` — so `expo-router` populated one `LinkingContext` while the tab bar read
  another and threw `MISSING_CONTEXT_ERROR` on render. Same failure mode as the CodeMirror singleton
  collapse, and it would have bitten anything else relying on a React context from those packages.

- d61b425: Voice and text now share a conversation properly, in both directions and on both surfaces.

  **Context flows into a voice session.** `ConversationMessages` was a hardcoded `[]` with an MVP
  note, so a call started mid-thread opened knowing nothing about what had been typed — the symptom
  being the agent asking the user to repeat something they had just written. The consumer had been
  written all along; only the plumbing was missing. The conversation's turns are now hydrated at
  session mint under the same caps the session-resume path uses (newest 30 turns, 8,000 characters,
  oldest dropped first). Because voice turns are themselves conversation rows, a resumed session
  would otherwise receive its previous leg twice, so the prior-transcript loader returns its leg ids
  and those legs are excluded; earlier calls that are not being resumed stay in.

  **Voice sessions collapse in the mobile thread.** The realtime-session timeline grouping and the
  card's presentation logic move from `ng-conversations` to `@memberjunction/conversations-runtime`
  (`BuildConversationTimeline`, `SessionCardTitle`, `SessionCardStatusChip`,
  `SessionCardIsSameDayRange`, `CollectRealtimeSessionIDs`, `MapRealtimeSessionMeta`,
  `FindRealtimeSessionMeta`, `IsVisibleRealtimeTurn`). The module was always pure TypeScript — and
  its own header already said rendering session-stamped rows as chat bubbles was wrong — but living
  behind an Angular import meant the React Native thread did exactly that. Both surfaces now run the
  same pass. `ng-conversations` re-exports from `lib/utils/realtime-session-timeline`, so its call
  sites are unchanged, and the Angular card delegates to the promoted functions instead of keeping
  its own copies.

  Mobile renders the collapsed card natively, expandable in place to the turns it counted, with a new
  `realtimeSessionCard` slot so a host can replace it.

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [37891d3]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [5df9486]
- Updated dependencies [c157749]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [7658d68]
- Updated dependencies [9160fd9]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [3977917]
- Updated dependencies [d61b425]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8d1a373]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e962151]
- Updated dependencies [af57e8d]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ai-realtime-client@6.2.0-edge.0
  - @memberjunction/graphql-dataprovider@6.2.0-edge.0
  - @memberjunction/conversations-runtime@6.2.0-edge.0
  - @memberjunction/realtime-runtime@6.2.0-edge.0
  - @memberjunction/react-runtime@6.2.0-edge.0
  - @memberjunction/interactive-component-types@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0
  - @memberjunction/markdown-core@6.2.0-edge.0

## 6.1.0

### Patch Changes

- 92f2ac9: Repo-wide sweep of code that assumed an entity's primary key is a single column named `ID`, plus a `PrimaryKeyCompliance` gate in `@memberjunction/core` so the pattern cannot come back.

  MJ supports primary keys with any column name(s) and type(s). Every MJ core entity happens to use `ID`, so hardcoding it works across the whole core product and silently breaks on customer entities mapped from external schemas — `Load()` rejects the invented field name, or a composite key is truncated to its first column. #4179 (search result click-through) was one instance; this sweep found the same shape in ~90 files and fixes all of it on top of the `CompositeKey.FromURLSegment` / `FromEntityRecord` / `ToCompactURLSegment` primitives introduced with that fix.

  **What changed, by kind**
  - **Literal `ID` key construction** (`{ FieldName: 'ID', Value: x }`, `LoadFromSingleKeyValuePair('ID', …)`, `FromKeyValuePair('ID', …)`) — ~135 sites. Where the entity is a literal MJ core entity the key is now `CompositeKey.FromID(x)`, the one sanctioned way to say "this entity's key is `ID`". Where the entity is a variable (an event's `EntityName`, an `entityInfo`, a configured entity) the key is `CompositeKey.FromURLSegment(entityInfo, recordId)`, which reads a bare value or a `F1|v1||F2|v2` segment against the entity's real primary key(s).
  - **`PrimaryKeys[0]` → `FirstPrimaryKey`** — 39 sites. Same semantics, a named accessor the gate can track. IS-A shared-key and keyset uses are annotated `// first-pk-ok`.
  - **Real defects fixed** (arbitrary entity keyed as `ID`): Mobile app record load/edit/offline sync; the generic form overlay; the ERD "open record" path; version-history label/diff/micro-view links (which stripped `ID|` off a stored key and re-wrapped the value as `ID`); `RestoreEngine` and `buildPrimaryKeyForLoad`; the Apollo enrichment connector (six `GetEntityObject(configuredEntity, FromID(record.ID))` calls); geocoding record reload; List Detail record-open (composite keys now open instead of showing a notice); `EmbeddedRecord`; `DatabaseReferenceScanner`; hardcoded `ID` filters on a variable entity in Data Explorer's record load, Predictive Studio's label lookup, the realtime-widget visitor identity lookup, `DuplicateRecordDetector.LoadRecordsByListID`, and MetadataSync's `@lookup` GUID conversion.
  - **REST API**: `EntityCRUDHandler` / `RESTEndpointHandler` built the key from the `:id` segment for single-column keys only and threw "Composite primary keys are not supported". Both now accept a bare value or a URL-encoded `Field1|Value1||Field2|Value2` segment. Single-column behavior is unchanged.
  - **One serializer instead of eight**: `ListOperations.serializeRecordId`, `list-set-operations.serializeRecordId`, RecordSetProcessor's `serializeRecordId`, `GetListRecordsAction`'s inline copy, `MJListDetailEntityExtended.BuildRecordID` / `GetCompositeKey`, `record.util.buildCompositeKey`, `VersionHistory.buildCompositeKeyFromRecord` and `ChangeDetector.buildDeleteItem` all delegate to `CompositeKey.FromEntityRecord(...).ToCompactURLSegment()` / `FromURLSegment(...)`. Output is byte-identical for single-column keys.

  **`FirstPrimaryKey` triage** — every one of the ~390 `FirstPrimaryKey` / `FromID` uses in the repo was read in context and either rewritten or annotated with a reason (154 annotations). Real defects found and fixed along the way, all of the shape "first key column used as the whole key" on an entity that can be composite-keyed:
  - **Data providers**: the deterministic `ORDER BY` fallback for row-limited queries ordered by the first key column only, leaving composite-key pages in undefined order; it now orders by every key column. Saved-view run logging / exclusion and the `{%UserView%}` template subquery, whose persisted `RecordID` cannot hold a composite key, now refuse loudly instead of excluding wrong rows. The dependency-link subquery now predicates on the full key. Single-column SQL is byte-identical.
  - **CodeGen**: generated cascade delete/update procs bound the child FK to `@<firstPK>` regardless of which parent key column the FK references; a composite key containing an identity column dropped the other key columns from the generated INSERT (both providers); the PostgreSQL JSON-arg `spCreate` inserted only the first key column; the generated join-grid/timeline filters and the GraphQL audit-log `RecordID` truncated composite keys. Single-key generator output verified byte-identical against `HEAD` (168 shapes).
  - **Smart cache** (`ProviderBase` differential merge): keyed rows on the first PK, so composite-key deletes never applied and rows sharing the first column collapsed.
  - **Integration push sync**: composed record identity from the first key column while the record map stores all columns joined, so every already-synced composite-key row was re-created externally as a duplicate on each full push; the changed-record path silently dropped rows.
  - **Scheduled geocoding orphan cleanup** (destructive): compared a cast of the first key column to a `RecordID` holding all columns, so every geocode row for a composite-key entity was deleted on each run.
  - **Lists**: list membership, export and add-record paths filtered on the first key column and wrote only its value into `ListDetail.RecordID`; Explorer "open record" paths on user-selected entities, duplicate detection, omnibar record search, Data Explorer deep links, the sharing center revoke, recent-access, tree dropdowns, the mobile app's record ids and offline queue.
  - **AI**: duplicate detection, vector sync record ids, Predictive Studio list scope and write-back; the Recommendations engine also wrote a record id into `SourceEntityID` (an FK to Entities) and never set `SourceEntityRecordID`.
  - **Apollo enrichment**: `Accounts` (a customer entity) loaded by literal `ID`; the contacts path read its key off an entity that had never been loaded.
  - Every `entityInfo.FirstPrimaryKey?.Name ?? 'ID'` fallback is gone; where the entity can be missing the code now fails loudly instead of inventing `ID`.

  **The gate** — `packages/MJCore/src/__tests__/PrimaryKeyCompliance.test.ts`, modelled on `MultiProviderCompliance` / `UUIDCompliance`:
  1. _Strict_: a key built with a literal `ID` field name. Marker `// pk-literal-ok: <reason>`.
  2. _Strict_: `PrimaryKeys[0]` / `PrimaryKeys.at(0)`.
  3. _Strict_: `FirstPrimaryKey` and `CompositeKey.FromID(`. These are legitimate only where MJ is single-column by design (foreign-key targets, keyset `ORDER BY` / `AfterKey`, IS-A shared keys, core entities), so every use must be self-evidently on a core entity or say why: `FromID` is exempt when a `'MJ: …'` entity literal is on the same line or within 8 lines above (the `GetEntityObject` / `OpenEntityRecord` naming the core entity); everything else carries `// first-pk-ok: <reason>` on the same line, reason mandatory.
  4. _Strict_: an `ID = …` / `ID IN (…)` `ExtraFilter` or `Fields: ['ID']` within eight lines of an `EntityName:` that is a variable rather than a string literal or ALL_CAPS constant. Marker `// pk-filter-ok: <reason>`.

  Generated code, tests, `dist/`, and the `TestingFramework` / `UnitTesting` packages are not scanned. The rule is written up in `.claude/rules/data-access.md` § "Primary keys: never assume a column named ID". There is no baseline file: all four gates are strict.

  No public signatures change; every edit is additive or a same-shape substitution, so this is `patch` throughout.

- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [1940a4d]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [5ecfdb4]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [ada8784]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [11de1a3]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [2197110]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [2e2879e]
- Updated dependencies [80fcb61]
- Updated dependencies [97cbf5f]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [4cdfdcf]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [5c6e36c]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [6cd337d]
- Updated dependencies [1c0d586]
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/ai@6.1.0
  - @memberjunction/graphql-dataprovider@6.1.0
  - @memberjunction/markdown-core@6.1.0
  - @memberjunction/react-runtime@6.1.0
  - @memberjunction/ai-realtime-client@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/graphql-dataprovider@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/react-runtime@6.1.0-edge.7
  - @memberjunction/ai-realtime-client@6.1.0-edge.7
  - @memberjunction/markdown-core@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- 92f2ac9: Repo-wide sweep of code that assumed an entity's primary key is a single column named `ID`, plus a `PrimaryKeyCompliance` gate in `@memberjunction/core` so the pattern cannot come back.

  MJ supports primary keys with any column name(s) and type(s). Every MJ core entity happens to use `ID`, so hardcoding it works across the whole core product and silently breaks on customer entities mapped from external schemas — `Load()` rejects the invented field name, or a composite key is truncated to its first column. #4179 (search result click-through) was one instance; this sweep found the same shape in ~90 files and fixes all of it on top of the `CompositeKey.FromURLSegment` / `FromEntityRecord` / `ToCompactURLSegment` primitives introduced with that fix.

  **What changed, by kind**
  - **Literal `ID` key construction** (`{ FieldName: 'ID', Value: x }`, `LoadFromSingleKeyValuePair('ID', …)`, `FromKeyValuePair('ID', …)`) — ~135 sites. Where the entity is a literal MJ core entity the key is now `CompositeKey.FromID(x)`, the one sanctioned way to say "this entity's key is `ID`". Where the entity is a variable (an event's `EntityName`, an `entityInfo`, a configured entity) the key is `CompositeKey.FromURLSegment(entityInfo, recordId)`, which reads a bare value or a `F1|v1||F2|v2` segment against the entity's real primary key(s).
  - **`PrimaryKeys[0]` → `FirstPrimaryKey`** — 39 sites. Same semantics, a named accessor the gate can track. IS-A shared-key and keyset uses are annotated `// first-pk-ok`.
  - **Real defects fixed** (arbitrary entity keyed as `ID`): Mobile app record load/edit/offline sync; the generic form overlay; the ERD "open record" path; version-history label/diff/micro-view links (which stripped `ID|` off a stored key and re-wrapped the value as `ID`); `RestoreEngine` and `buildPrimaryKeyForLoad`; the Apollo enrichment connector (six `GetEntityObject(configuredEntity, FromID(record.ID))` calls); geocoding record reload; List Detail record-open (composite keys now open instead of showing a notice); `EmbeddedRecord`; `DatabaseReferenceScanner`; hardcoded `ID` filters on a variable entity in Data Explorer's record load, Predictive Studio's label lookup, the realtime-widget visitor identity lookup, `DuplicateRecordDetector.LoadRecordsByListID`, and MetadataSync's `@lookup` GUID conversion.
  - **REST API**: `EntityCRUDHandler` / `RESTEndpointHandler` built the key from the `:id` segment for single-column keys only and threw "Composite primary keys are not supported". Both now accept a bare value or a URL-encoded `Field1|Value1||Field2|Value2` segment. Single-column behavior is unchanged.
  - **One serializer instead of eight**: `ListOperations.serializeRecordId`, `list-set-operations.serializeRecordId`, RecordSetProcessor's `serializeRecordId`, `GetListRecordsAction`'s inline copy, `MJListDetailEntityExtended.BuildRecordID` / `GetCompositeKey`, `record.util.buildCompositeKey`, `VersionHistory.buildCompositeKeyFromRecord` and `ChangeDetector.buildDeleteItem` all delegate to `CompositeKey.FromEntityRecord(...).ToCompactURLSegment()` / `FromURLSegment(...)`. Output is byte-identical for single-column keys.

  **`FirstPrimaryKey` triage** — every one of the ~390 `FirstPrimaryKey` / `FromID` uses in the repo was read in context and either rewritten or annotated with a reason (154 annotations). Real defects found and fixed along the way, all of the shape "first key column used as the whole key" on an entity that can be composite-keyed:
  - **Data providers**: the deterministic `ORDER BY` fallback for row-limited queries ordered by the first key column only, leaving composite-key pages in undefined order; it now orders by every key column. Saved-view run logging / exclusion and the `{%UserView%}` template subquery, whose persisted `RecordID` cannot hold a composite key, now refuse loudly instead of excluding wrong rows. The dependency-link subquery now predicates on the full key. Single-column SQL is byte-identical.
  - **CodeGen**: generated cascade delete/update procs bound the child FK to `@<firstPK>` regardless of which parent key column the FK references; a composite key containing an identity column dropped the other key columns from the generated INSERT (both providers); the PostgreSQL JSON-arg `spCreate` inserted only the first key column; the generated join-grid/timeline filters and the GraphQL audit-log `RecordID` truncated composite keys. Single-key generator output verified byte-identical against `HEAD` (168 shapes).
  - **Smart cache** (`ProviderBase` differential merge): keyed rows on the first PK, so composite-key deletes never applied and rows sharing the first column collapsed.
  - **Integration push sync**: composed record identity from the first key column while the record map stores all columns joined, so every already-synced composite-key row was re-created externally as a duplicate on each full push; the changed-record path silently dropped rows.
  - **Scheduled geocoding orphan cleanup** (destructive): compared a cast of the first key column to a `RecordID` holding all columns, so every geocode row for a composite-key entity was deleted on each run.
  - **Lists**: list membership, export and add-record paths filtered on the first key column and wrote only its value into `ListDetail.RecordID`; Explorer "open record" paths on user-selected entities, duplicate detection, omnibar record search, Data Explorer deep links, the sharing center revoke, recent-access, tree dropdowns, the mobile app's record ids and offline queue.
  - **AI**: duplicate detection, vector sync record ids, Predictive Studio list scope and write-back; the Recommendations engine also wrote a record id into `SourceEntityID` (an FK to Entities) and never set `SourceEntityRecordID`.
  - **Apollo enrichment**: `Accounts` (a customer entity) loaded by literal `ID`; the contacts path read its key off an entity that had never been loaded.
  - Every `entityInfo.FirstPrimaryKey?.Name ?? 'ID'` fallback is gone; where the entity can be missing the code now fails loudly instead of inventing `ID`.

  **The gate** — `packages/MJCore/src/__tests__/PrimaryKeyCompliance.test.ts`, modelled on `MultiProviderCompliance` / `UUIDCompliance`:
  1. _Strict_: a key built with a literal `ID` field name. Marker `// pk-literal-ok: <reason>`.
  2. _Strict_: `PrimaryKeys[0]` / `PrimaryKeys.at(0)`.
  3. _Strict_: `FirstPrimaryKey` and `CompositeKey.FromID(`. These are legitimate only where MJ is single-column by design (foreign-key targets, keyset `ORDER BY` / `AfterKey`, IS-A shared keys, core entities), so every use must be self-evidently on a core entity or say why: `FromID` is exempt when a `'MJ: …'` entity literal is on the same line or within 8 lines above (the `GetEntityObject` / `OpenEntityRecord` naming the core entity); everything else carries `// first-pk-ok: <reason>` on the same line, reason mandatory.
  4. _Strict_: an `ID = …` / `ID IN (…)` `ExtraFilter` or `Fields: ['ID']` within eight lines of an `EntityName:` that is a variable rather than a string literal or ALL_CAPS constant. Marker `// pk-filter-ok: <reason>`.

  Generated code, tests, `dist/`, and the `TestingFramework` / `UnitTesting` packages are not scanned. The rule is written up in `.claude/rules/data-access.md` § "Primary keys: never assume a column named ID". There is no baseline file: all four gates are strict.

  No public signatures change; every edit is additive or a same-shape substitution, so this is `patch` throughout.

- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [80fcb61]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/graphql-dataprovider@6.1.0-edge.6
  - @memberjunction/react-runtime@6.1.0-edge.6
  - @memberjunction/ai-realtime-client@6.1.0-edge.6
  - @memberjunction/markdown-core@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [2197110]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/markdown-core@6.1.0-edge.5
  - @memberjunction/graphql-dataprovider@6.1.0-edge.5
  - @memberjunction/ai-realtime-client@6.1.0-edge.5
  - @memberjunction/react-runtime@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ai-realtime-client@6.1.0-edge.4
  - @memberjunction/graphql-dataprovider@6.1.0-edge.4
  - @memberjunction/react-runtime@6.1.0-edge.4
  - @memberjunction/markdown-core@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [199eb2b]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [2e2879e]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [6cd337d]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/graphql-dataprovider@6.1.0-edge.3
  - @memberjunction/ai-realtime-client@6.1.0-edge.3
  - @memberjunction/react-runtime@6.1.0-edge.3
  - @memberjunction/markdown-core@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/graphql-dataprovider@6.1.0-edge.2
  - @memberjunction/ai-realtime-client@6.1.0-edge.2
  - @memberjunction/react-runtime@6.1.0-edge.2
  - @memberjunction/markdown-core@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/graphql-dataprovider@6.1.0-edge.1
  - @memberjunction/react-runtime@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/ai-realtime-client@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
  - @memberjunction/markdown-core@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [5c6e36c]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/react-runtime@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/ai-realtime-client@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0
  - @memberjunction/markdown-core@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/react-runtime@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/ai-realtime-client@6.0.0
  - @memberjunction/global@6.0.0
  - @memberjunction/markdown-core@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/react-runtime@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/ai-realtime-client@5.51.0
  - @memberjunction/global@5.51.0
  - @memberjunction/markdown-core@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [c221553]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/react-runtime@5.50.0
  - @memberjunction/ai-realtime-client@5.50.0
  - @memberjunction/global@5.50.0
  - @memberjunction/markdown-core@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [9e2278c]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/ai-realtime-client@5.49.0
  - @memberjunction/react-runtime@5.49.0
  - @memberjunction/markdown-core@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [a101255]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/markdown-core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/ai-realtime-client@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/graphql-dataprovider@5.48.0
  - @memberjunction/react-runtime@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/graphql-dataprovider@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/react-runtime@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/ai-realtime-client@5.47.0
  - @memberjunction/global@5.47.0
  - @memberjunction/markdown-core@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/graphql-dataprovider@5.46.0
  - @memberjunction/react-runtime@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/ai-realtime-client@5.46.0
  - @memberjunction/global@5.46.0
  - @memberjunction/markdown-core@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/graphql-dataprovider@5.45.1
- @memberjunction/react-runtime@5.45.1
- @memberjunction/ai@5.45.1
- @memberjunction/ai-realtime-client@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1
- @memberjunction/markdown-core@5.45.1

## 5.45.0

### Patch Changes

- 1c4e0bb: Add repository.url to MobileApp package.json to satisfy the validate-package-repository CI gate, which was failing on every PR since the package landed without it
- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/graphql-dataprovider@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/react-runtime@5.45.0
  - @memberjunction/ai@5.45.0
  - @memberjunction/ai-realtime-client@5.45.0
  - @memberjunction/markdown-core@5.45.0
