# @memberjunction/markdown-core

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

## 6.2.0-edge.0

## 6.1.0

### Patch Changes

- 2197110: Keep embedded HTML blocks intact across blank lines so SVG charts render.

  A blank line ends an HTML block in CommonMark, and the markup after it is
  re-tokenized by indentation: 4+ spaces becomes an indented code block, which
  `html-block-repair` already rescues, while 0-3 spaces becomes a paragraph
  rendered as `<p>…<br>…</p>`. Because `normalizeHtmlBlockIndentation` strips
  indentation, the paragraph case is the one that arises whenever `enableHtml` is
  on — and `<p>` and `<br>` are on the HTML5 foreign-content breakout list, so
  inside an `<svg>` the browser leaves the SVG namespace and auto-closes the
  chart. Every shape after the blank line then renders as an unknown HTML
  element: `<text>` as bare document text, `<path>`/`<circle>`/`<rect>` as
  nothing. The visible result is a chart whose top renders and whose middle is
  blank, which is how this was reported.

  `normalizeHtmlBlockIndentation` now drops blank lines while an element is still
  open, guarded so it stays narrow: only when `tagStack` is non-empty, so blank
  lines between sibling top-level blocks are not swallowed and unrelated blocks
  cannot merge; and never inside `<pre>`, where a blank line is content rather
  than layout. Whitespace between tags is insignificant, so no rendered output
  changes apart from the repair.

## 6.1.0-edge.7

## 6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- 2197110: Keep embedded HTML blocks intact across blank lines so SVG charts render.

  A blank line ends an HTML block in CommonMark, and the markup after it is
  re-tokenized by indentation: 4+ spaces becomes an indented code block, which
  `html-block-repair` already rescues, while 0-3 spaces becomes a paragraph
  rendered as `<p>…<br>…</p>`. Because `normalizeHtmlBlockIndentation` strips
  indentation, the paragraph case is the one that arises whenever `enableHtml` is
  on — and `<p>` and `<br>` are on the HTML5 foreign-content breakout list, so
  inside an `<svg>` the browser leaves the SVG namespace and auto-closes the
  chart. Every shape after the blank line then renders as an unknown HTML
  element: `<text>` as bare document text, `<path>`/`<circle>`/`<rect>` as
  nothing. The visible result is a chart whose top renders and whose middle is
  blank, which is how this was reported.

  `normalizeHtmlBlockIndentation` now drops blank lines while an element is still
  open, guarded so it stays narrow: only when `tagStack` is non-empty, so blank
  lines between sibling top-level blocks are not swallowed and unrelated blocks
  cannot merge; and never inside `<pre>`, where a blank line is content rather
  than layout. Whitespace between tags is insignificant, so no rendered output
  changes apart from the repair.

## 6.1.0-edge.4

## 6.1.0-edge.3

## 6.1.0-edge.2

## 6.1.0-edge.1

## 6.1.0-edge.0

## 6.0.0

## 5.51.0

## 5.50.0

## 5.49.0

## 5.48.0

### Patch Changes

- a101255: Fix: `@memberjunction/markdown-core` is published as a pure ESM package (`"type": "module"`) but its source used extensionless relative import/export specifiers. The base tsconfig's `moduleResolution: "bundler"` tolerated them, so `tsc` and bundler-based app builds stayed green — but Node's native ESM resolver is strict and threw `ERR_MODULE_NOT_FOUND` at load time for any native-ESM consumer (Vitest, plain Node), blocking downstream adoption. All relative specifiers now carry explicit `.js` extensions, and the package tsconfig moves to `module`/`moduleResolution: "nodenext"` so an extensionless specifier is a compile error going forward. Fixes #3137.

## 5.47.0

## 5.46.0

## 5.45.1

## 5.45.0
