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
- **`artifact`** parts link to `/artifact/:id`.
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
