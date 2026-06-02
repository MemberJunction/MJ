---
"@memberjunction/global": minor
"@memberjunction/core": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-shared-generic": minor
---

Auto-detect and render Markdown/HTML in long-text form fields. `MjFormFieldComponent`
now honors an explicit `EntityField.ExtendedType` (`Markdown`/`HTML`/`Code`) and, when it
is null, runs lightweight client-side content detection on eligible long-text fields
(TS-type string with `MaxLength >= 255` or unlimited — generic across SQL Server/PostgreSQL).
Read mode renders `<mj-markdown>` for Markdown, DOMPurify-sanitized `[innerHTML]` for HTML
(via the new `mjSafeRichHtml` pipe — see below), and a read-only `<mj-code-editor>` for code;
edit mode uses `<mj-code-editor>` with syntax highlighting for non-plain modes (mode frozen at
edit entry), while plain fields keep the existing textbox/textarea.

Widens the `EntityFieldExtendedType` union and the `CK_EntityField_ExtendedType` CHECK
constraint to include `Markdown` and `HTML` (migration included — run CodeGen after applying
to regenerate `EntityFieldEntity` types and metadata).

Adds a reusable, dependency-free `detectRichTextFormat(value, maxScanLength?)` text classifier
to `@memberjunction/global` (defaults to scanning the first 500 characters) so any consumer can
sniff Markdown/HTML/plain content.

Adds reusable safe-HTML rendering to `@memberjunction/ng-shared-generic`: a `PurifyRichTextHtml()`
function and an `mjSafeRichHtml` pure pipe backed by DOMPurify (HTML + SVG profiles). Unlike
Angular's built-in `[innerHTML]` sanitizer (which strips all SVG and inline styles), this keeps
safe inline SVG and richer markup while still removing `<script>`, `on*` handlers, and
`javascript:`/`data:` URLs — so it's safe for untrusted content yet renders richer HTML. Any
Angular component can use `[innerHTML]="value | mjSafeRichHtml"`.
