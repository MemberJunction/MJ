---
"@memberjunction/ng-rich-text-editor": patch
"@memberjunction/ng-base-forms": patch
---

Rich text editor: editing engine, Angular component, clipboard, browser tier, and adoption for HTML form fields.

`@memberjunction/ng-rich-text-editor` is now usable. It is a DOM-native WYSIWYG editor: the `contenteditable` DOM *is* the document, there is no internal model or schema, and normalization runs only at load, at paste, and at the seams of the command being executed — so HTML the user did not touch (Outlook reply chains, layout tables, conditional comments, inline styles) survives load → edit → serialize. A CI-gated fixture suite and a Playwright browser tier enforce that.

**Engine (Angular-free)**

- Undo as pure snapshots: raw HTML plus the selection as index paths. The loaded document is the first entry; each command checkpoints before and after, so typing after a command undoes separately; native typing coalesces; IME compositions checkpoint at `compositionstart`.
- Inline formats (bold, italic, underline, strikethrough, inline code, links) with alias awareness — `<strong>` reads as bold, `<em>` as italic — because tags are never rewritten on load. Pending formats at a collapsed caret.
- Block formats: quotes, lists, headings. List nesting always places the sublist inside the previous item (valid markup, unlike the reference implementation).
- Keyboard: Enter (with escape-from-empty-item), Shift+Enter, Backspace, Delete, Tab, Space with autolinking, standard shortcuts, and `beforeinput` intents routed to the same handlers.
- Clipboard: copy and cut write HTML with its context plus plain text; paste runs the clean pipeline and merges into the caret block; plain-text paste, Ctrl/Cmd+Shift+V, drop, and images handed to the host. Forward Delete is engine-owned and grapheme-aware.

**Angular**

- `<mj-rich-text-editor>`: `ControlValueAccessor`, `Html`/`MinHeight`/`MaxHeight`/`ImagePaste` inputs, placeholder, `Disabled`/`ReadOnly`, `BeforePaste`/`AfterPaste` cancelable pair, `PasteImage`, Ctrl/Cmd+K for links, click below a trailing quote to add a line.
- `<mj-rich-text-toolbar>`: token-styled, one Tab stop with arrow-key navigation, pressed state from the document.
- `<mj-rich-text-link-editor>`: inline popover, not a modal.

**`ng-base-forms`**

- Fields with `ExtendedType = 'HTML'` now edit in the visual editor with a Visual / Source switch (`<mj-view-toggle>`). A value that is a whole document (`<html>`, `<head>`, doctype) opens in Source, because a visual editor can only hold a body fragment. Markdown and Code fields are unchanged. **Behavior change**: long-text fields without an `ExtendedType` that already auto-detected as HTML previously opened in the raw code editor and now open in the visual editor.

**Testing**

- 625 jsdom specs (engine plus DOM specs with axe scans), 332 in `ng-base-forms`, and `pnpm run test:live`, a Playwright tier over an esbuild-bundled harness. `pnpm run playground` serves a manual smoke-test bench with a semantic diff against the loaded document.
