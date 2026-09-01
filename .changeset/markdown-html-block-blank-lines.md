---
"@memberjunction/markdown-core": patch
---

Keep embedded HTML blocks intact across blank lines so SVG charts render.

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
