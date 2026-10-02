# Rendering — Artifacts, Markdown, Charts & Dashboards

The mobile app renders everything **natively**: no WebView, no `innerHTML`, no
`dangerouslySetInnerHTML`. Agent output (markdown, code, charts, HTML, JSON) and
dashboards are parsed to a data model and mapped to React Native primitives
(`<View>` / `<Text>` / `react-native-svg`). This keeps scrolling, selection, and
theming native, and avoids the security surface of embedding a browser.

---

## 1. Artifact classification

Artifacts are stored as text on `MJ: Conversation Artifact Versions.Content`. The
UI must decide *how* to render each one. That decision is made once, in
[`src/data/services/artifacts.ts`](../src/data/services/artifacts.ts), which
returns a `LoadedArtifact` carrying both the raw content and a `kind`:

```
ArtifactRenderKind = 'json-table' | 'json' | 'markdown' | 'code' | 'html' | 'chart' | 'text'
```

`classify(typeName, content)` sniffs the content in priority order:

1. **Structured JSON** (starts with `{`/`[`, parses): try `parseChartSpec` → if it
   looks like a chart, `kind = 'chart'`; else an array of objects →
   `kind = 'json-table'`; else `kind = 'json'`.
2. **HTML** — the artifact type name mentions HTML, or `looksLikeHtml` detects a
   recognizable block/inline tag → `kind = 'html'`.
3. **Code** — type name mentions code/sql/script → `kind = 'code'` (with a
   language hint derived from the type name).
4. **Markdown** — type name mentions markdown/report/document, or the content has
   markdown markers → `kind = 'markdown'`.
5. Fallback → `kind = 'text'`.

The artifact detail screen ([`app/artifact/[id].tsx`](../app/artifact/[id].tsx))
switches on `kind` and delegates to the matching renderer below. The artifact
**dock** ([`app/artifacts/[id].tsx`](../app/artifacts/[id].tsx)) reuses the same
classifier via `categorize()` to bucket artifacts into Tables / Charts / Documents
filter chips.

---

## 2. Markdown — the `markdown-core` AST path

[`src/components/markdown/MarkdownView.tsx`](../src/components/markdown/MarkdownView.tsx)

- Parses markdown to a **token tree** with `@memberjunction/markdown-core`
  (`MarkdownEngine.parseToTokens`) — the *same* engine that drives the web
  `ng-markdown` component. The web component renders those tokens to HTML; the
  mobile app renders the identical AST to native views. One parser, two backends.
- `renderBlock` / `renderInline` walk the token tree and map each token type to a
  primitive:
  - block: headings, paragraphs, lists (incl. task lists with ☑/☐), blockquotes,
    tables, code blocks, horizontal rules, and ```` ```svg ```` blocks.
  - inline: bold / italic / strikethrough, inline code, links (open via
    `Linking.openURL`), images (rendered as a muted label), line breaks.
- **Tables** and **code blocks** render inside a horizontal `ScrollView` so wide
  content scrolls instead of clipping.
- **SVG blocks** (```` ```svg ````) render through `react-native-svg`'s `SvgXml`.
- Parse failure falls back to showing the raw text (never a blank screen).
- **Not yet handled:** Mermaid diagrams (web-only; would need a render step —
  tracked for a later on-device pass).

---

## 3. Code highlighting — prismjs, no DOM

[`src/components/markdown/highlight.ts`](../src/components/markdown/highlight.ts)

- Uses **`prismjs`'s tokenizer only** (`Prism.tokenize`) — no DOM, no CSS classes,
  no `innerHTML`. `highlightCode(code, language)` returns an ordered list of
  `HighlightRun` (`{ text, color }`) whose concatenated text equals the input.
  Callers render each run as a colored `<Text>` span.
- Grammars are registered via **side-effect imports in dependency order** (e.g.
  `typescript` after `javascript`). Registered set: markup, css, javascript,
  typescript, json, bash, python, sql, yaml. `resolveLanguageId` maps common
  aliases (`ts`, `js`, `sh`, `yml`, `html`→`markup`, …).
- `flattenTokens` walks Prism's nested token stream; nested content **inherits**
  the parent token's color unless it has its own type. `TOKEN_COLORS` maps Prism
  token types to the design-token palette (reusing agent identity + status colors)
  for a high-contrast scheme on the light `Colors.surface2` code background.
- **Fail-safe:** an unknown language, empty output, or any thrown error returns a
  single plain run colored `Colors.ink` — highlighting never breaks a render.

---

## 4. Charts — `react-native-svg`

[`src/components/charts/`](../src/components/charts)

- **`chart-spec.ts`** — a *pure* (no React, no SVG) tolerant parser. `parseChartSpec`
  normalizes the many loosely-shaped JSON payloads agents emit (`data`/`values`/
  `points`, Chart.js-style `series`/`datasets`, parallel `labels`/`categories`)
  into a single `ChartSpec { kind, title, data: {label,value}[] }`. It requires an
  explicit chart-type hint (or a `series` field) so ordinary JSON isn't mistaken
  for a chart. Shared by both the chart components and the artifact classifier.
- **`Chart.tsx`** — a pure dispatcher (renders no SVG itself). Switches on
  `spec.kind`: `'line'` → `LineChart`, `'pie'` → `PieChart`, `'bar'` **and any
  unrecognized kind** (the `default`) → `BarChart`. Forwards `data`, `title`, and
  the container `width`.
- **`BarChart.tsx`** — horizontal bars (`Svg`/`G`/`Rect`/`Text`), one row per
  datum sized against the max value, with a left label gutter and right value
  annotation; bars colored from the categorical palette (`chartColorAt`).
- **`LineChart.tsx`** — a single accent series (`Line`/`Path`/`Circle`/`Text`) with
  a soft area fill; the y-range includes zero; a single point is centered; the line
  and fill only render with 2+ points; min/max y and first/last x are labeled.
- **`PieChart.tsx`** — a donut of `Path` arcs (`INNER_RATIO` hole) plus a native
  `View` legend (label · value · percent); slices sweep clockwise from 12 o'clock;
  negatives clamp to zero.
- Palette lives in `chart-spec.ts` (`ChartPalette` / `chartColorAt`), drawn from
  the agent-identity + status design tokens so charts stay on-brand.

---

## 5. HTML — a dependency-free subset renderer

[`src/components/artifacts/html-renderer.tsx`](../src/components/artifacts/html-renderer.tsx)

Intentionally **not** a full HTML engine — it renders the "clean report HTML"
agents emit, not arbitrary web pages.

- **Parse:** a regex tokenizer (`parseHtml`) builds a flat node tree of text and
  element nodes, tolerating bad nesting by popping the stack to the matching open
  tag. Comments / CDATA / doctype are skipped; a curated set of named + numeric
  HTML entities is decoded.
- **Map to primitives:** headings, paragraphs, lists, `<pre>`, `<hr>`, blockquote,
  and `<table>` render as **blocks**; `a`, `b`/`strong`, `i`/`em`, `u`, `s`/`del`,
  `code`, `span`, etc. render as **inline** `<Text>` spans. Adjacent inline nodes
  are grouped into paragraph `<Text>` runs.
- **Safety by whitelist:** there is no HTML sanitizer — only *known* tags get
  behavior; unknown tags (including `<script>`/`<style>`) simply yield their text
  children. Links open via `Linking.openURL` (unsupported schemes swallowed).
  Tables and code blocks are horizontally scrollable. All styling comes from design
  tokens.

---

## 6. Dashboard part rendering

[`src/data/services/explorer.ts`](../src/data/services/explorer.ts) +
[`app/explorer/dashboard/[id].tsx`](../app/explorer/dashboard/[id].tsx)

Dashboards persist their layout in `Dashboard.UIConfigDetails` as a **Golden
Layout** config. `loadDashboard`:

1. Loads the dashboard via `GetEntityObject('MJ: Dashboards') + Load`.
2. Walks the layout tree (`collectPanels`) to pull each component's panel state.
3. Resolves each panel's **Part Type** name (via a `RunView` over `MJ: Dashboard
   Part Types`, falling back to the panel's own `config.type`) and normalizes it to
   a renderer `kind`: `view` | `query` | `artifact` | `weburl` | `unknown`.
4. Returns a flat `DashboardPart[]` plus a `desktopOnlyCount`.

On screen, `PartCard` dispatches by kind:

- **`query`** parts execute their query through `useQueryRun` (`RunQuery`) and
  `analyzeResult` auto-classifies the result into **KPI tiles**, a **bar `Chart`**,
  or a **compact table**.
- **`artifact`** parts render inline through `ArtifactContentView` — the same renderer the
  artifact detail screen uses — with an "Open full screen" affordance beneath. An
  agent-authored interactive component on a dashboard therefore *runs* on the dashboard
  rather than becoming a link.
- **`view`**, **`weburl`**, and **`unknown`** parts render a "desktop-optimized"
  placeholder with an "Open on desktop" affordance (`Linking.openURL`) — native
  rendering of arbitrary saved views/embeds is a later phase.

---

## 7. Where each render kind is used

| Kind | Renderer | Primary screens |
|---|---|---|
| markdown | `MarkdownView` (markdown-core) | chat thread (agent messages), artifact detail, markdown-preview |
| code | `highlightCode` → `<Text>` runs | markdown code blocks, artifact detail (code) |
| chart | `Chart` + `chart-spec` (svg) | artifact detail, dashboard query parts, markdown-preview |
| html | `HtmlRenderer` | artifact detail (html), markdown-preview |
| json / json-table | inline JSON tree / data-table cards | artifact detail |
| dashboard parts | `explorer.ts` parser + `PartCard` | dashboard view |
</content>

---

## 8. Interactive components — the library seam

[`src/interactive/library-registry.ts`](../src/interactive/library-registry.ts) +
[`src/interactive/runtime-loader.ts`](../src/interactive/runtime-loader.ts)

An agent-authored component declares its third-party libraries in the spec, and
`@memberjunction/react-runtime` compiles each declaration into a binding:

```js
const _  = libraries['_'];
const ss = libraries['ss'];
```

### What the web does

`ScriptLoaderService` → `LibraryLoader.loadAllLibraries()` appends one `<script>` per approved
library, waits for its UMD bundle to define a global on `window`, and hands the runtime a map keyed
by **global variable name**. The browser therefore ends up with the library in *two* places: in
`RuntimeContext.libraries`, and as a real global.

Both matter, because of a scoping detail in the generated factory: the compiler emits the
`const _ = …` bindings **inside** `DestructureWrapperUserComponent`, but splices the component's own
source one scope out. A component body referencing `_` is reading a *free variable* — which resolves
to the global the script tag defined, not to the runtime's map.

### What mobile does

Hermes has no `document`, so the CDN path cannot run — and it no longer tries: the compiler's guard
now tests for a DOM rather than for `window` (React Native defines `window` but not `document`, which
previously sent it down the script-loading path and threw `Library 'lodash' not found`).

Instead the app performs the same two acts through the module system it actually has:

1. `ResolveMobileLibraries` lazily `import()`s the declared libraries from ordinary npm
   dependencies, keyed by the same `globalVariable`, and merges them into `RuntimeContext.libraries`.
2. `PublishLibraryGlobals` defines each one on `globalThis` — the native equivalent of what a UMD
   bundle does to `window`. Existing globals are never overwritten.

Versions are pinned to exactly what `__mj.ComponentLibrary` declares, so a component behaves the
same on both surfaces.

### What is and isn't available

Provided (13): `lodash`, `dayjs`, `moment`, `luxon`, `mathjs`, `simple-statistics`, `chroma-js`,
`uuid`, `axios`, `marked`, `d3`, `topojson-client`, `xlsx`.

Declined: anything DOM- or canvas-bound — Chart.js, ApexCharts, AG Grid, Ant Design, Leaflet,
Mapbox GL, GSAP, SortableJS, Popper, Emotion, DOMPurify, html2canvas, jsPDF, geo-maps. Shimming
these would render nothing and report no error, which is worse than declining, so `AssessSpec` sends
the component to the desktop-fallback card **naming the library and the reason** rather than issuing
a blanket "uses external libraries".

Bundle cost is paid in app size, not startup: imports are lazy, so a component that never declares a
library never evaluates one.
