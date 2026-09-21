---
"@memberjunction/react-runtime": patch
"@memberjunction/mobile-app": patch
---

Interactive components get their declared libraries **and their child components** on mobile, the same way the Angular react bridge supplies them.

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
`const _ = …` bindings *inside* `DestructureWrapperUserComponent` but splices the component's source
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

---

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
against *its own* `spec.libraries`, so a parent using lodash whose child uses d3 needs both loaded
before any of it compiles. `CollectHierarchyLibraries` walks the tree once up front.

**`generateComponentHierarchyHash` moved into the runtime.** It derives the registry version key for
a spec with no explicit `version`, and it lived as a private method on the Angular component — so a
second host had to reimplement it, and two implementations of a registry key is how two surfaces
silently compile two copies of the same component. `MJReactComponent` now delegates to the runtime's
copy.

**What mobile still declines, and why it is not "dependencies".** A child whose code the spec does
not carry: `location: 'registry'` without inline `code` needs a component-registry fetch this app
cannot perform, and a child with no code at all cannot compile. The fallback names the missing part.

---

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
values but has no stylesheet to read them from — feeds them through the *identical* mapping instead
of a copy. Mobile then applies `ApplyStyleOverrides` on top, as the bridge does.

**`savedUserSettings` / `onSaveUserSettings` — were absent**, so every sort order, selected tab and
collapsed panel reset on each open while the same component remembered them on the web. Mobile now
uses the same four `react-runtime` helpers and the same `UserInfoEngine` (`MJ: User Settings`)
storage, which means the same key: settings saved on a desktop open on a phone. A mobile-only key
format would have quietly given each user two profiles.

**`callbacks.OpenEntityRecord` — was `key.GetValueByIndex(0)`.** Components routinely identify a
record by something that is *not* its primary key, because that is what their query returned. The
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

---

## Registry-backed child components, and Hermes's async limit

Two things were still stopping real agent-authored components from rendering, both found by
running the deployment's actual component registry rather than hand-written samples.

**Children named instead of inlined.** A spec routinely references `DataGrid`, `OpenRecordButton`,
`SingleRecordView` by name with no code — that is what `metadata/components/CLAUDE.md` prescribes
for anything non-trivial. `loadHierarchy` fetches those itself, but it *compiles each child as it
fetches it*, and a component's library bindings are emitted at the top of its factory — so a
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

---

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
*receives*: both get the same `utilities`, `styles`, `savedUserSettings` and callbacks.

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

---

## A crash no longer costs the reader the data

By the time most components throw, the fetching has succeeded — the failure is in the drawing.
Replacing the whole thing with "this component ran into an error" discards rows the reader came for
and could still read perfectly well.

`utilities` is wrapped so every view and query result is recorded, and a component that fails after
loading shows those rows instead of a dead card, under an explanation that does not pretend anything
worked. `MJReactComponent` captures for the same reason and calls it a fallback snapshot; the
difference here is that it is *shown*, because on a phone there is no second pane to offer it in.

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
