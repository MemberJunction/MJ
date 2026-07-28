# @memberjunction/ng-rich-text-editor

A DOM-native WYSIWYG rich text editor for MemberJunction.

> **Status: in development.** The engine core is complete and the fidelity suite is green
> (353 tests). Editing commands, clipboard, and the Angular component are still to come, so
> this package is not yet usable by consumers.

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
│   ├── range/             boundaries, block-range, insert-delete, contents
│   ├── (core)             config, events, selection, path, undo, format engines, SetHTML/GetHTML
│   ├── keyboard/          key handlers, enter, backspace, delete, tab, space + beforeinput dispatch
│   ├── clean              the boundary-only sanitize/normalize pipeline
│   └── clipboard          cut/copy/paste, mso-strip, paste-merge
├── rich-text-editor.types.ts     public config + event contract
├── rich-text-editor.component    Angular wrapper, ControlValueAccessor
└── toolbar/                      toolbar, link dialog, toolbar config
```

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

## Phase plan

| Phase | Scope | Status |
|---|---|---|
| P0 | Package scaffold, constants, public type contract | ✅ complete |
| P1 | Engine core: node → range → merge/split → insert/delete; `SetHTML`/`GetHTML`; clean pipeline; fixture harness | ✅ complete |
| P2 | Undo; inline + block format engines; `splitBlock`; keyboard and `beforeinput` layer | not started |
| P3 | Clipboard, mso-strip, plain-text paste, IME hardening, Safari delete path | not started |
| P4 | Angular component, CVA, toolbar, link dialog, tokens + a11y | not started |
| P5 | Adoption in `@memberjunction/ng-base-forms` HTML fields | not started |

## Non-goals for v1

Table *editing* (tables must round-trip untouched and never be corrupted by an adjacent
edit, but there's no creation or cell-editing UI); images; font family / size / color;
alignment; RTL controls; mentions; collaboration; Markdown mode. Mobile must not break, but
isn't optimized, and Android IME is explicitly best-effort.

New capabilities beyond this list require a PRD amendment, not just a PR.

## Development

```bash
cd packages/Angular/Generic/rich-text-editor
npm run build      # ngc
npm run test       # vitest (jsdom)
npm run test:watch
```

The whole package runs on the jsdom preset: the engine is Angular-free but still DOM-bound,
since every algorithm operates on real `Node` / `Range` / `Selection` objects.

**jsdom can't cover everything.** It has no `contenteditable` editing behavior, only partial
`Selection`, and no real `beforeinput` or composition events. Engine algorithms invoked
directly are well covered; the native-path behaviors (native delete plus deferred cleanup,
`insertText`, IME) need a real-browser tier and are verified there instead.

## License

ISC
