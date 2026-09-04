# @memberjunction/ng-rich-text-editor

A DOM-native WYSIWYG rich text editor for MemberJunction.

> **Status: adopted in MJ forms.** The engine, the Angular component, and a Chromium
> browser-test tier are complete, and `<mj-form-field>` edits `ExtendedType = 'HTML'` fields
> with this editor (with a Visual / Source switch). Remaining: the Izzy message-editor swap,
> which lives in the Izzy repo.

## Overview

A WYSIWYG editor whose `contenteditable` DOM *is* the document: no internal model, no schema,
no re-normalization sweeps, so HTML the user did not touch (Outlook reply chains, layout
tables, conditional comments) survives load → edit → serialize. It ships an Angular-free
engine and `<mj-rich-text-editor>`, a `ControlValueAccessor` with a design-token toolbar.

## Key Features

- **Fidelity by construction** — normalization happens only at `SetHTML`, paste, and the
  seams of the command being executed; a CI-gated fixture suite enforces round-trip equality.
- **Email-safe output** — semantic tags plus inline styles, blank lines as `<div><br></div>`.
- **Full editing surface** — inline formats, quotes, lists, headings, links, undo, clipboard
  and drop, engine-owned forward delete, IME-aware.
- **Angular component** — `ngModel`/reactive forms, placeholder, disabled/read-only, tokens
  and dark mode, accessible toolbar with a single Tab stop.
- **Three test tiers** — jsdom unit specs, Angular DOM specs with axe, and a Playwright
  browser tier.

## Installation

```bash
pnpm add @memberjunction/ng-rich-text-editor
```

Peer dependencies: `@angular/common`, `@angular/core`, `@angular/forms` (^21.1.3). The
component is standalone — import `RichTextEditorComponent` into a standalone component's
`imports` or an `NgModule`'s `imports`.

## Usage

```html
<mj-rich-text-editor
    [(ngModel)]="draft"
    [Config]="{ SanitizeProfile: 'email' }"
    Placeholder="Write your reply…"
    (PasteImage)="upload($event.File)"
/>
```

`<mj-rich-text-editor>` is a standalone component and a `ControlValueAccessor`, so it works
with `[(ngModel)]` and reactive forms alike. Inputs: `Config`, `ToolbarItems` (an ordered
list of commands and `'separator'`s; `null` for the default set), `ShowToolbar`,
`Placeholder`, `AriaLabel`, `MinHeight`, `AutoFocus`, `Disabled`, `ReadOnly`. Outputs:
`ContentChange` (with `IsUserChange`), `PathChange`, `UndoStateChange`, `PasteImage`,
`BeforePaste`/`AfterPaste` (the cancelable pair), `FocusChange`. The `Engine` getter exposes the full command surface for hosts
that need more than the toolbar.

Images: by default the component only emits `PasteImage` and inserts nothing — the host
uploads the file and calls `Engine.InsertImage(url, alt)`. `ImagePaste="data-uri"` inlines
the image instead; MJ forms use that, email composers should not. Ctrl/Cmd+K opens the link
editor. Clicking below a trailing quote, list, table, or code block adds a line to type on;
that is the user's explicit replacement for the automatic bottom-line pass the engine
deliberately does not run.

## API Reference

**`<mj-rich-text-editor>`** — `ControlValueAccessor`.

| Input | Type | Default | Purpose |
|---|---|---|---|
| `Config` | `RichTextEditorConfig` | `{}` | Engine configuration; changing it rebuilds the engine over the current content. |
| `Html` | `string` | — | Value binding for non-form use; re-binding the emitted value is a no-op. |
| `ToolbarItems` | `RichTextToolbarItem[] \| null` | `null` (default set) | Ordered commands and `'separator'`s. |
| `ShowToolbar` | `boolean` | `true` | |
| `Placeholder` | `string` | `''` | Shown while empty. |
| `AriaLabel` | `string` | `'Rich text editor'` | Accessible name of the surface. |
| `MinHeight` / `MaxHeight` | CSS length | `'10rem'` / `null` | Surface bounds; it scrolls beyond `MaxHeight`. |
| `AutoFocus` | `boolean` | `false` | |
| `Disabled` / `ReadOnly` | `boolean` | `false` | Disabled dims and disables the toolbar; read-only presents as content. |
| `ImagePaste` | `'event' \| 'data-uri'` | `'event'` | See Images below. |

| Output | Payload |
|---|---|
| `ContentChange` | `{ Html, IsUserChange }` |
| `PathChange` | `{ Path }` — `'DIV>BLOCKQUOTE>B'` |
| `UndoStateChange` | `{ CanUndo, CanRedo }` |
| `PasteImage` | `{ File }` |
| `BeforePaste` | `BeforePasteEventArgs` — `Fragment` (mutable), `Cancel`, `CancelReason` |
| `AfterPaste` | `AfterPasteEventArgs` — `Html`; not fired when `BeforePaste` was canceled |
| `FocusChange` | `boolean` |

Methods: `GetHTML()`, `SetHTML(html)`, `Focus()`, and the `Engine` getter for the full
`RichTextEngine` surface (`ExecuteCommand`, `IsCommandActive`, `MakeLink`, `InsertHTML`,
`InsertPlainText`, `InsertImage`, `Undo`/`Redo`, `ModifyBlocks`, …).

**`<mj-rich-text-toolbar>`** (`Engine`, `Items`, `Disabled`) and
**`<mj-rich-text-link-editor>`** (`InitialHref`, `HasExistingLink`; `Apply`/`Remove`/`Cancel`)
are exported for hosts composing their own chrome; each carries its own stylesheet.

The toolbar is styled entirely from `--mj-*` tokens, so it follows the host theme and dark
mode. It is one Tab stop with arrow-key navigation, every button has an accessible name and
`aria-pressed` where it toggles, and a click never steals the editor's selection. The link
editor is an inline popover under the toolbar — not a modal — with Apply on the left and
Cancel on the right per MJ convention; bare hosts get `https://`, bare addresses `mailto:`.

## Dependencies

- Peers: `@angular/common`, `@angular/core`, `@angular/forms` (^21.1.3)
- `@memberjunction/ng-ui-components` — `mjButton` for the link editor's actions
- `dompurify` — the sanitize boundary
- `tslib`

## Related Packages

- [`@memberjunction/ng-base-forms`](../base-forms) — edits `ExtendedType = 'HTML'` fields with this editor
- [`@memberjunction/ng-code-editor`](../code-editor) — the Source view beside it, and Markdown/Code fields
- [`@memberjunction/ng-ui-components`](../ui-components) — `mjButton`, `mj-view-toggle`

## Why this exists

Every mainstream rich text editor parses HTML into an internal document model and
re-serializes from it. Anything the model's schema doesn't understand is silently dropped
or rewritten — which is fatal for the driving use case, where a human makes a light edit to
an AI-drafted **HTML email reply** that contains a quoted Outlook thread, conditional
comments, nested layout tables, and inline styles.

This editor has **no internal model and no schema**. The `contenteditable` DOM *is* the
document. Content the user doesn't touch survives load→edit→serialize essentially
byte-for-byte, because nothing ever walks the whole tree and re-canonicalizes it.

That's the same architecture the webmail industry converged on — Fastmail, ProtonMail,
Tutanota, and Zoho Mail all compose on a DOM-native engine — for exactly this reason.

### The core architectural rule

**Normalization runs only at three boundaries:** `SetHTML`, paste insertion, and the local
seams of an executed command. There is no "on change, re-canonicalize the document" pass
anywhere in this package.

This rule is the entire reason the package exists. A change that violates it is an
architecture regression regardless of which bug it fixes, and reviewers should treat it as
one.

## Design commitments

| Commitment | What it means in practice |
|---|---|
| **Fidelity** | `SetHTML(GetHTML(x))` is a fixed point. Untouched regions round-trip modulo the browser's own DOM-parse canonicalization. A CI-gated fixture suite enforces this. |
| **Email-safe output** | Every empty block carries a filler `<br>`, so blank lines actually render in Gmail, Outlook desktop (Word engine), Outlook web, and Apple Mail. Formatting is semantic tags plus inline styles — never classes, never a stylesheet. |
| **Blocks are `<div>` by default** | A blank line is `<div><br></div>`, identical to Gmail's composer — one line-height everywhere. `<p>` carries client-specific default margins, which is why it isn't the default. Configurable via `BlockTag`. |
| **No schema** | Node category (inline / block / container) is computed from *content*, not from a tag allow-list. A `<blockquote>` holding inline content is a block; holding a `<div>` it's a container. |

## Architecture

```
src/lib/
├── engine/          zero Angular imports — pure TypeScript over DOM APIs
│   ├── constants          tag tables, sentinel characters
│   ├── node/              category, tree-iterator, whitespace, merge-split, block
│   ├── range/             boundaries, block-range, containment, contents
│   ├── clean/             the boundary-only sanitize/normalize pipeline
│   ├── format/            inline (bold/italic/…/links) and block (quotes/lists/headings) engines
│   ├── keyboard/          enter, backspace, delete, tab, space, key + beforeinput dispatch
│   ├── html               SetHTML / GetHTML
│   ├── selection, path    reading the caret; index-path serialization for undo
│   ├── undo, zws, events  snapshot history, ballast sweep, typed emitter
│   ├── split-block        what Enter does
│   ├── editor             RichTextEngine — state, listeners, the command surface
│   └── clipboard/         cut/copy/paste/drop handlers; plain text in both directions
├── rich-text-editor.types.ts     public config + event contract
├── rich-text-editor.component    Angular wrapper, ControlValueAccessor, placeholder, a11y
└── toolbar/                      toolbar, inline link editor, command descriptors
```

### Using the engine directly

```ts
const engine = new RichTextEngine(rootElement, { SanitizeProfile: 'email' });
engine.SetHTML(draft);
engine.On('input', () => save(engine.GetHTML()));
engine.On('pathChange', ({ Path }) => toolbar.Refresh(Path));
engine.ExecuteCommand('bold');            // toolbar vocabulary
engine.IsCommandActive('blockquote');     // pressed state
engine.MakeLink('https://example.com');
engine.Undo();
```

Public members are PascalCase per MJ convention. Every command runs the same envelope:
sweep caret ballast, record an undo checkpoint, mutate, reselect, emit `input`.

### Undo

History is a stack of **pure snapshots** — the root's raw HTML plus the selection as index
paths from the root. Nothing is inserted into the document to bookmark a position. The loaded
document is the first entry, so the first keystrokes undo back to it. Each command records
both the state before it and the state after it, so typing that follows a command is its own
step ("Bold, type a word, Undo" removes the word, not the bold). Native typing between
commands coalesces into one step; Space checkpoints so long runs undo a word at a time; an
IME composition is checkpointed at `compositionstart`. Bounded by `UndoLimit` (50 snapshots)
and optionally `UndoSizeThreshold`.

### Keyboard

| Key | Behaviour |
|---|---|
| Enter | Split the block. In an empty list item or quoted block: escape one level. In `<pre>`: newline. |
| Shift+Enter | `<br>` within the block (a second one at a block end, so the new line renders). |
| Backspace / Delete | At a block edge: merge with the neighbouring block. Elsewhere: native, followed by a repair pass. |
| Tab / Shift+Tab | In a list: nest / lift the item. Elsewhere: untouched, so focus can leave the editor. |
| Space | Undo checkpoint; with `AddLinks`, a URL or email just typed becomes a link. |
| Ctrl/Cmd + B, I, U, Shift+X | Bold, italic, underline, strikethrough. |
| Ctrl/Cmd + Shift+7 / Shift+8 | Ordered / unordered list. |
| Ctrl/Cmd + ] / [ | Indent / outdent — list level inside a list, quote level elsewhere. |
| Ctrl/Cmd + Z, Y, Shift+Z | Undo, redo, redo. |

`beforeinput` intents (`insertParagraph`, `formatBold`, `historyUndo`, `insertOrderedList`,
`formatIndent`, …) are routed to the same handlers, so virtual keyboards, the macOS Edit
menu, and assistive technology get identical behaviour.

Forward Delete within a block is **engine-owned**: one grapheme (via `Intl.Segmenter`, so an
emoji sequence is one unit) or one leaf (`<img>`, `<br>`) is removed by the engine, never by
the browser. Native forward-delete is where engines disagree most — Safari deletes nothing,
or the wrong thing, at the end of a text node with an inline element beside it. Backspace
mid-text stays native (it is consistent everywhere) with a repair pass behind it, except
when backspacing into the end of an autolinked address, where the link is removed too.

While an IME composition is in progress (`compositionstart` … `compositionend`, or a
keydown with `keyCode` 229), keys, intents, and the ballast sweep are all suspended. The
IME owns the text node under the caret until it is done.

### Clipboard

Copy and cut write **both** `text/html` and `text/plain`. The HTML carries the inline and
block context of the selection — the `<b>` a selected word sat in, the `<blockquote>` a
selected paragraph sat in — so pasting elsewhere reproduces what the user saw. Cut deletes
through the engine, so the document keeps its invariants. `WillCutCopy` in the config can
rewrite the HTML before it is written.

Paste is the second of the three normalization boundaries. Clipboard HTML runs the full
clean pipeline (sanitize, Word artifact removal, tag rewriting, `<br>` normalization,
container fix) and is then **merged** into the document: the first pasted block joins the
caret's block, the last receives whatever followed the caret, and the middle is inserted as
blocks — inside the enclosing `<blockquote>` if there is one. Pasting a line into the
middle of a paragraph yields one paragraph. `<pre>` and tables are never merged onto a
paragraph. Plain text becomes one default block per line, with addresses linked when
`AddLinks` is on; inside `<pre>` it is inserted verbatim. Ctrl/Cmd+Shift+V pastes as plain
text. An image on the clipboard is handed to the host via `pasteImage`; the engine never
decides what an image becomes. `willPaste` fires with the cleaned fragment before insertion
and can amend or cancel it.

External drops of HTML or text are inserted at the drop point (where the browser exposes
one). A drag that started inside the editor is left to the browser, which moves the content
itself; intercepting would duplicate it.

The engine is deliberately Angular-free and lives behind a clean boundary, so it can be
extracted into its own package if a non-Angular consumer ever appears. About 60% of it is
generic machinery below the feature layer — every user-visible feature is thin on top of it.

## Security

Sanitization happens at the boundaries only, via DOMPurify, with two profiles:

- **`'strict'`** (default) — comments stripped. Use for ordinary MJ forms.
- **`'email'`** — comments preserved on the trusted `SetHTML` path, so `<!--[if mso]>`
  conditionals inside a quoted reply chain survive a round trip.

Untrusted **paste** always strips comments regardless of profile, because DOMPurify comment
retention is a documented mXSS vector (cure53/DOMPurify #528, #932).

### URI policy: nothing is relaxed

`IS_ALLOWED_URI` is never disabled and `ALLOWED_URI_REGEXP` is never widened. Verified
against DOMPurify 3.x, **`cid:` is already permitted by the default regexp** — so the inline
image references that quoted mail depends on work with no configuration at all, while
`javascript:` stays blocked. There is nothing to trade here, and the engine trades nothing.

### Known limit: comments that wrap markup

DOMPurify's `SAFE_FOR_XML` guard removes any comment whose body contains markup. Real
`<!--[if mso]>` blocks usually wrap a table or div, so **those specific conditionals are
stripped even under the `'email'` profile**; text-only conditionals survive intact.

Disabling the guard would buy fidelity with a genuine mXSS regression, so the default keeps
it. A host that has audited its own path can replace the whole stage via the
`SanitizeToDOMFragment` config hook. The limit is pinned by a fixture
(`outlook-conditional-wrapping-markup`) so it stays a recorded decision rather than a
surprise.

## Deviations from the reference architecture

Two places where this engine deliberately does less than the design it is based on, both
for the same reason:

- **Tag rewriting is paste-only.** The reference canonicalizes `STRONG`→`B` and `EM`→`I` on
  load as well. Doing that on load would mean a document loaded with `<strong>` comes back
  out of `GetHTML` as `<b>` having never been edited. The cost moves to the inline format
  engine, which must treat `<b>` and `<strong>` as the same format — a few lookup-table
  entries, versus rewriting every document that passes through.
- **The load path never sweeps.** No whitespace pruning, no empty-inline removal, no `<br>`
  cleanup, and no filler `<br>`s added to existing empty blocks. Only `fixContainer` runs,
  because the root must hold blocks for a caret to exist. The consequence is that content
  loaded with a bare `<div></div>` stays unfocusable until an edit reaches it; that is the
  intended trade.
- **No "ensure bottom line".** The reference appends an empty paragraph after the document
  whenever its last block is a quote, list, or table, so there is always somewhere to click
  below. In a reply whose bottom is the quoted thread, that appends a blank line to content
  the user never touched every time they press Enter anywhere above it — a locality
  violation. The engine does not do it; the P4 component can offer click-below affordance.
- **List level changes work in place, not as block transforms.** Nesting an item means
  moving it *into its previous sibling* — the only valid home for a sublist, and a node no
  selection-derived fragment contains. The reference emits `<ul>` directly inside `<ul>`
  (fastmail/Squire #483); this engine never does.
- **`hasFormat` knows the aliases.** Because tags are not rewritten on load, the inline
  engine treats `B`/`STRONG`, `I`/`EM`, `S`/`STRIKE`/`DEL`, and `CODE`/`TT`/`KBD`/`SAMP`
  as the same format. It *creates* only the canonical spelling.

## Phase plan

| Phase | Scope | Status |
|---|---|---|
| P0 | Package scaffold, constants, public type contract | ✅ complete |
| P1 | Engine core: node → range → merge/split → insert/delete; `SetHTML`/`GetHTML`; clean pipeline; fixture harness | ✅ complete |
| P2 | Undo; inline + block format engines; `splitBlock`; keyboard and `beforeinput` layer; `RichTextEngine` | ✅ complete |
| P3 | Clipboard and drop, plain-text paste, paste-merge, IME hardening, engine-owned forward delete | ✅ complete |
| P4 | Angular component, CVA, toolbar, link editor, tokens + a11y | ✅ complete |
| P5 | Adoption: `@memberjunction/ng-base-forms` HTML fields ✅; Izzy message-editor swap (Izzy repo) pending | in progress |
| P6 | Real-browser tier (`pnpm run test:live`, Playwright + esbuild harness, Chromium) | ✅ complete |

## Smoke testing before adopting

Three layers, cheapest first.

1. **Engine playground** — `pnpm run playground`, then open the printed URL. It bundles the
   engine into a static page with a command bar, an event log, live `GetHTML()` output, and a
   **semantic diff against the loaded document**. Load the `izzy-ai-reply-with-outlook-thread`
   sample, or capture a real message: copy it in Outlook/Gmail/Word, click the capture box,
   paste (the box keeps the clipboard's HTML, which a plain textarea would drop), then click
   "Load this HTML into the editor". Make a light edit to the reply and confirm the diff lists
   only the block you touched. Then exercise
   paste from Word/Outlook/Gmail, an image paste, Ctrl/Cmd+Shift+V, Shift+Enter, undo, and the
   click-below-a-quote affordance. This is the closest stand-in for the Izzy message editor.
2. **The Angular component in Explorer** — set `ExtendedType = 'HTML'` on any nvarchar(max)
   field of a low-risk entity in the Entity Fields admin form (metadata only, no migration),
   then open a record of that entity and edit it. Check the Visual / Source switch, that a
   full `<html>` document opens in Source, that Save round-trips the HTML unchanged when you
   change nothing, and that Record Changes shows a diff only where you edited. Note that
   long-text fields **without** an `ExtendedType` already auto-detect HTML content and will
   also open in the visual editor — the same fields that previously opened in the raw code
   editor.
3. **Browser matrix** — `pnpm exec playwright install webkit firefox` once, then
   `PW_BROWSERS=all pnpm run test:live`. Chromium is the default; WebKit is Safari's engine,
   which is where forward-delete and selection behave differently.

## Non-goals for v1

Table *editing* (tables must round-trip untouched and never be corrupted by an adjacent
edit, but there's no creation or cell-editing UI); images; font family / size / color;
alignment; RTL controls; mentions; collaboration; Markdown mode. Mobile must not break, but
isn't optimized, and Android IME is explicitly best-effort.

New capabilities beyond this list require a PRD amendment, not just a PR.

## Development

```bash
cd packages/Angular/Generic/rich-text-editor
pnpm run build       # ngc
pnpm test            # vitest (jsdom)
pnpm run test:types  # type-check the specs (CI runs this too)
pnpm run test:live   # Playwright, real Chromium (PW_BROWSERS=all adds WebKit + Firefox)
pnpm run playground  # manual smoke-test bench in the browser
pnpm run test:watch
```

Tests address positions with markers: `loadWithSelection(root, '<div>he|llo</div>')` for a
caret, `[`…`]` for a selection, and `htmlWithSelection` to read them back. See
`src/__tests__/support/editor-harness.ts`.

The whole package runs on the jsdom preset: the engine is Angular-free but still DOM-bound,
since every algorithm operates on real `Node` / `Range` / `Selection` objects.

Component specs (`*.dom.test.ts`) render through `@memberjunction/ng-test-utils` and include
an axe scan of the toolbar and link editor.

**Real-browser tier.** `pnpm run test:live` runs Playwright against the Angular-free engine
bundled into a static page (`e2e/`; esbuild builds the harness on the fly, no server or
sign-in). It covers what jsdom cannot: native typing and deletion with the repair pass behind
them, pending formats under real `insertText`, `DataTransfer` paste and copy, grapheme
deletion, undo across native and command edits, and the fidelity fixtures under Chromium's
own parser. Run it whenever the engine changes; it found three behaviours jsdom passed.

**jsdom can't cover everything.** It has no `contenteditable` editing behavior, only partial
`Selection`, no `DataTransfer`, and no real composition events. Engine algorithms invoked
directly are well covered there; the native paths are verified by the browser tier above.
Still unverified anywhere automated: real IME streams, Safari and Firefox (the tier runs
Chromium), `caretPositionFromPoint` on drop, and touch.

## License

BUSL-1.1
