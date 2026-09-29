# Visual tour — MemberJunction Mobile, v6

A screen-by-screen walkthrough of what this app does, what it shares with MJ Explorer, and where it
deliberately differs. Every screenshot is from a real build against a live MemberJunction instance —
nothing here is a mockup, and nothing is stubbed data.

Each capability is shown on **both platforms**, because "works on mobile" that means "works on the
simulator I happened to have open" is not a claim worth making.

> Images are hosted on the `pr-4459-screenshots` branch so this document stays readable on GitHub
> without adding binaries to the main tree.

---

## Contents

1. [Conversations](#1-conversations)
2. [A chat thread](#2-a-chat-thread)
3. [Voice](#3-voice)
4. [Applications](#4-applications)
5. [A hosted application](#5-a-hosted-application)
6. [Data Explorer](#6-data-explorer)
7. [Entities and records](#7-entities-and-records)
8. [Saved queries](#8-saved-queries)
9. [Dashboards](#9-dashboards)
10. [Interactive components — the native renderer](#10-interactive-components--the-native-renderer)
11. [Interactive components — the DOM host](#11-interactive-components--the-dom-host)
12. [Nested components and drill-downs](#12-nested-components-and-drill-downs)
13. [When a component fails](#13-when-a-component-fails)
14. [Markdown and artifacts](#14-markdown-and-artifacts)
15. [Profile](#15-profile)
16. [What is deliberately absent](#16-what-is-deliberately-absent)

---

## 1. Conversations

The app opens on the work you were doing. Conversations are the same `MJ: Conversations` rows
Explorer reads, with the same agents and the same history — not a mobile-only inbox.

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-01-conversations.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-01-conversations.png" width="300"> |

---

## 2. A chat thread

Agent messages render through `@memberjunction/markdown-core` — the same AST the web renders, drawn
with React Native primitives rather than HTML. Mentions, agent attribution and artifacts all appear
in the thread.

An artifact produced by a turn appears as a card **under that turn**. The artifact dock above the
composer stays: "what did this conversation produce" and "what did *that* turn produce" are
different questions, and neither answer replaces the other.

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-02-chat.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-02-chat.png" width="300"> |

**Enter sends, Shift+Enter inserts a newline** — but only when a hardware keyboard is attached. On a
soft keyboard the return key inserts a newline, because a phone keyboard has no shift-enter and
sending on every return makes the composer unusable.

---

## 3. Voice

A realtime voice session runs on `@memberjunction/realtime-runtime`, the runtime extracted out of
Angular so both surfaces share one implementation. Mobile's session is a small subclass that
supplies the microphone; everything about turns, tools and delegation is the shared code.

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-14-voice.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-14-voice.png" width="300"> |

Voice turns blend into the conversation rather than living in a separate pane, and the session's
prior messages are hydrated into its context — so a voice session started mid-thread knows what was
already said.

---

## 4. Applications

The apps a user can see come from `MJ: Applications` and their `DefaultNavItems`, exactly as they do
in Explorer. Ordering honours the user's own application preferences.

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-03-apps.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-03-apps.png" width="300"> |

---

## 5. A hosted application

An application contributes screens by registering against `BaseMobileResource` with the **same
driver class name** its metadata already declares — the string Explorer resolves against
`BaseResourceComponent`. One navigation model, two hosts, no duplicated routing.

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-04-sample-app.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-04-sample-app.png" width="300"> |

The one real asymmetry: a native app cannot discover code at runtime, so *which* applications a
build hosts is a build-time manifest (`src/host/registry.ts`). Everything else — the metadata, the
nav items, the driver names, the ClassFactory resolution — is identical.

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-05-app-shell.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-05-app-shell.png" width="300"> |

**Data Explorer opened from Apps resolves to this app's own surfaces**, through those same driver
classes — `DataExplorerResource`, `QueryBrowserResource`, `DashboardBrowserResource`:

| Queries | Dashboards |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/dex-queries.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/dex-dashboards.png" width="300"> |

A deployment can override any of them by registering a higher-priority subclass for the same driver
name — which a special case in the host would have made impossible.

---

## 6. Data Explorer

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-06-explorer.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-06-explorer.png" width="300"> |

---

## 7. Entities and records

Entity metadata is read from the in-memory `Metadata.Entities` list — no round trip. Records load
through `RunView` with the user's own permissions; there is no mobile-specific data path.

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-07-entities.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-07-entities.png" width="300"> |

---

## 8. Saved queries

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-08-queries.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-08-queries.png" width="300"> |

---

## 9. Dashboards

The list shows `Type = 'Config'` dashboards only.

That is a deliberate exclusion, not a gap. A `Code` dashboard's panels **are** an Angular component,
and a `Dynamic Code` dashboard's are generated at runtime for a browser — neither has anything a
native surface could render. Listing them and then apologising, which is what this screen used to
do, turns the list from a menu of what you can do into a menu of what you mostly cannot.

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-09-dashboards.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-09-dashboards.png" width="300"> |

A `Config` dashboard is data — panels of queries and artifacts — and renders here properly. Users
compose them on the phone, and they persist as **ordinary Golden Layout**, the same
`UIConfigDetails` tree Explorer writes, so a dashboard built on a phone opens correctly on a desktop.

Golden Layout's rows, columns and tabbed stacks are **flattened to one stacked column** on a phone,
in layout order. The stored config keeps the real arrangement; only the rendering simplifies.

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-10-dashboard.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-10-dashboard.png" width="300"> |

Artifact panels render **inline** — an agent-authored component on a dashboard runs there, rather
than becoming a link:

<img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/lib-dash-top.png" width="330">

---

## 10. Interactive components — the native renderer

Agent-authored components are compiled by `@memberjunction/react-runtime` — **the same package the
Angular react bridge uses** — and drawn with React Native primitives through a host shim.

### Libraries

A component's declared libraries reach it through `RuntimeContext.libraries`, keyed by the same
`globalVariable` the web uses. Thirteen are provided from bundled npm dependencies, pinned to the
versions `__mj.ComponentLibrary` declares: lodash, dayjs, moment, luxon, mathjs, simple-statistics,
chroma-js, uuid, axios, marked, d3, topojson-client, xlsx.

| Before | After |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/lib-before.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/lib-after.png" width="300"> |

Every number on the right comes from a different library: `_.sumBy` → 154, `_.maxBy` → top vendor,
`_.meanBy`/`_.round` → 25.7, `ss.median` → 12, `dayjs().format()` → the date.

Filling the map is not sufficient on its own, and the reason is a scoping detail worth knowing: the
compiler emits `const _ = libraries['_']` **inside** `DestructureWrapperUserComponent` but splices
the component's own source one scope out, so a component body referencing `_` reads a *free
variable*. On the web that resolves because the UMD `<script>` already defined `window._`. Mobile
therefore also publishes each library onto `globalThis` — the same act, in the module system Hermes
has.

Five more libraries, on device — d3 scales the bars, chroma's LAB ramp colours them, mathjs computes
the share, luxon formats the date, and `uuid.v4()` returns a real v4:

<img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/lib-wide.png" width="330">

### The rest of the prop contract

Both renderers hand a component the same props, resolved by the same code:

| Prop | Source |
|---|---|
| `components` | `manager.loadHierarchy` — the flat map of every loaded descendant |
| `libraries` | `RuntimeContext.libraries` |
| `utilities` | `createRuntimeUtilities()` — the same factory the Angular bridge calls |
| `styles` | app theme through the runtime's own token mapping, plus the spec's `styleOverrides` |
| `savedUserSettings` / `onSaveUserSettings` | `UserInfoEngine` (`MJ: User Settings`), the same key as the web |
| `callbacks.OpenEntityRecord` | the runtime's shared `resolveEntityRecordKey` |

A component reading real rows through `utilities.rv.RunView`, themed from `styles.colors.primary`:

<img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/utils-1-data.png" width="330">

Settings persist under the **same key the web writes**, so a preference saved on a desktop opens on
a phone. Below: saving, then the same component after a **cold app relaunch**.

| Saved | After a cold relaunch |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/utils-2-saved.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/utils-3-persisted.png" width="300"> |

### Child components

Components are routinely assembled from named children rather than inlined code — that is what the
component authoring guide prescribes. Mobile resolves those through the same
`ComponentMetadataEngine` the runtime uses.

A parent declaring lodash whose child is **not in the spec at all** — fetched from `MJ: Components`,
declaring its own dayjs, using `async`/`await`:

<img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/regpair.png" width="330">

A parent with two inline sub-components, each declaring a different library pair:

<img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/subcomp.png" width="330">

> **Hermes and `async`.** Hermes compiles the app's own modules ahead of time, where `async` is
> fully supported. Components take the other path — compiled at runtime through `new Function` — and
> Hermes's *runtime* compiler rejects async outright. Mobile therefore compiles components with
> `transform-async-to-generator`; Hermes accepts the generators that produces.

---

## 11. Interactive components — the DOM host

Chart.js and ApexCharts are the two most-declared libraries in the component registry, and both draw
into an `HTMLCanvasElement`. AG Grid, antd and Leaflet mount DOM nodes. React Native has neither.

Rather than reimplement five libraries' configuration surfaces against `react-native-svg` — being
subtly wrong forever, against a moving target — a component that needs a browser **gets one**.

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/chart-dom-host.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/chart-android.png" width="300"> |

That is Chart.js on a real canvas, with rows read live through `utilities.rv`, and bars in the app's
brand colour because `styles.colors.primary` crosses the boundary like everything else.

The host page uses the **same** react-runtime UMD bundle the Playwright test harness loads, the
**same** CDN URLs recorded in `MJ: Component Libraries`, and the same compile path. Parity by
construction rather than by imitation.

**The page holds no credential.** It cannot call `RunView` — it has no provider and no token, and
giving it one would put the app's session inside a document that just executed third-party library
code. Data calls proxy over a **closed, named-method** bridge to the native side, served from the
same `ComponentUtilities` object the native renderer uses:

```
rv.RunView · rv.RunViews · rq.RunQuery · md.Entities
ai.ExecutePrompt · ai.EmbedText · ml.listModels · ml.score
search.Search · search.PreviewSearch
```

Three members are deliberately absent, because a lookalike that silently does nothing is worse than
an absence the component contract already tells components to handle:

| Member | Why |
|---|---|
| `md.GetEntityObject` | returns a live `BaseEntity` whose methods cannot cross the bridge |
| `ai.VectorService` | holds in-memory state |
| `geoDataEngine` | `ResolvePointToLocation` is **synchronous**; a bridge can only answer asynchronously, so a proxy would return a Promise and a component reading `.country` would draw a map with no labels |

**Which renderer is used is not a difference in what a component receives.** `AssessSpec` returns a
`RenderMode` — `native`, `dom` or `none` — and both paths supply the same props.

---

## 12. Nested components and drill-downs

The shape agents actually produce: a dashboard parent whose children live in the registry, one
drawing a canvas chart, one a table that drills into a third.

```
ModelDashboard          (lodash)    — parent, holds drill-down state
  ├─ ModelVendorBars    (chart.js)  — canvas, registry child
  ├─ ModelTable         (dayjs)     — table, registry child, raises the drill-down
  └─ ModelDetailPanel   (mathjs)    — detail for the drilled row, registry child
```

Four components, four libraries, three fetched from `MJ: Components`. Tapping a table row crosses
two component boundaries and a WebView.

| Rendered (iOS) | After tapping a row (iOS) |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/nested-1.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/nested-drill.png" width="300"> |

The same hierarchy on Android:

<img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/nested-android.png" width="330">

> **Routing happens after resolution.** A parent using only lodash whose registry-backed child draws
> a Chart.js canvas looks native-renderable right up until the child fails — and the component that
> most needs the DOM host is exactly the one whose canvas library is buried a level down. The
> hierarchy is resolved first, then the renderer is chosen against the resolved tree.

---

## 13. When a component fails

By the time most components throw, the fetching has succeeded — the failure is in the drawing.
Replacing everything with "this component ran into an error" discards rows the reader came for and
could still read.

<img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/libs/crash-fallback.png" width="330">

The component threw `Cannot read property 'someProperty' of null`. The eight rows it had already
fetched are shown under an explanation that does not pretend anything worked — the framing matters,
because a reader who cannot tell a degraded state from a healthy one cannot trust either.

---

## 14. Markdown and artifacts

Artifacts resolve to a renderer through `MJGlobal.ClassFactory`, with the same priority ordering and
tie-break `ng-conversations` uses for its viewer plugins — so an artifact type added to MJ metadata
reaches a renderer by registration rather than by a hardcoded switch.

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-12-markdown.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-12-markdown.png" width="300"> |

Query-builder output is normalised with `NormalizeToTables` from core, so mobile cannot disagree
with the web about what a row is. Rows stack as label/value cards rather than a grid: a 9-column
grid on a 390pt screen is a horizontal scrollbar with a table hidden behind it.

---

## 15. Profile

| iOS | Android |
|---|---|
| <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/ios-13-profile.png" width="300"> | <img src="https://raw.githubusercontent.com/MemberJunction/MJ/pr-4459-screenshots/tour/android-13-profile.png" width="300"> |

---

## 16. What is deliberately absent

Stated plainly, because a list of what a build does not do is worth more than a list of what it does.

- **The host-facing component method API** — `validate`, `isDirty`, `reset`, `scrollTo`, `focus`,
  `invokeMethod`. These exist on the web so an Angular container can drive an embedded component
  through a `ViewChild`. Mobile has no such container, so the surface would have no caller.
  `getCurrentDataState`'s purpose — a fallback when a component cannot show its own data — is served
  by [§13](#13-when-a-component-fails).
- **DOM-hosted components need a connection on first render.** The runtime UMD bundle is fetched
  once and cached by the WebView.
- **`react-native-webview` is a native module**, so a checkout needs an app rebuild
  (`expo run:ios` / `expo run:android`), not just a Metro reload.
- **Application nav items across the estate** are overwhelmingly `ResourceType: Custom` with bespoke
  driver classes. Data Explorer is served; others need their own registrations.
- **Runtime theming.** `src/theme/tokens.ts` is a compile-time mirror of `_tokens.scss`, so a
  deployment's custom theme is not followed. Shipping the token set over the API and resolving it at
  boot is worth doing and not done.

---

## How this was verified

Every screen above was captured from a running build against a live MemberJunction instance, on an
iOS simulator and an Android emulator. Interactive-component behaviour — libraries, registry-resolved
hierarchies, canvas charts, drill-downs, settings persistence across a cold relaunch, and the
failure fallback — was exercised on device rather than asserted from unit tests alone.

| | |
|---|---|
| Unit | MobileApp 430 · react-runtime 124 · ng-react 19 |
| E2E | Maestro flows on both platforms |
| Build | MJExplorer 237/237, class-registration manifests unchanged |
| Gates | `check:browser-manifest`, `check:esm`, `check:changeset` |
