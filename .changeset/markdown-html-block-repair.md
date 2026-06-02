---
"@memberjunction/ng-markdown": patch
---

Fix raw HTML blocks split by a blank line rendering as an escaped code block.

Embedded raw HTML in markdown (e.g. a Skip PRD `## Mockup` section) is meant to be a single HTML block, but CommonMark ends an HTML block at the first blank line; the following indented (4+ space) markup is then tokenized as an indented code block and shown as escaped text — a "black box" of raw markup (often a leading `<!-- ... -->` comment) instead of the intended HTML.

`MarkdownService` now applies a `marked` `processAllTokens` hook (`createHtmlBlockRepairExtension`) that reclassifies the misparsed `code` token back to an `html` token. It only fires when the token is an indented code block (no language — fenced ` ``` ` examples are untouched), starts with an HTML tag/comment, and is adjacent to an `html` token (the signature of a split HTML block), so prose, fenced code examples, and standalone indented code render unchanged.
