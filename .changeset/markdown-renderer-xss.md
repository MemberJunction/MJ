---
"@memberjunction/ng-markdown": patch
---

Markdown renderer: close the cross-site scripting vectors found by the first full CodeQL scan, with sanitization moved to the service so every consumer gets it.

- **Sanitization now happens in `MarkdownService.parse()`**, with DOMPurify (HTML + SVG profiles), unless `enableJavaScript` opts out. Previously only the component sanitized, with a hand-written deny-list that missed `</script >`-style end tags, unlisted `on*` handlers and `data:` URLs. Any consumer that binds `parse()` output to `innerHTML` directly is now covered too; `sanitizeHtml()` is public for consumers that build HTML themselves.
- **What survives, deliberately**: structural HTML, inline styles, data attributes, inline SVG, a leading `<style>` block, heading ids (including ones like `title` or `location` that DOMPurify's DOM-clobbering guard would otherwise strip), `target` on links (with `rel="noopener noreferrer"` enforced), and same-document `<use href="#id">` sprite references. **What does not**: `<script>`, `on*` handlers, `javascript:`/`vbscript:`/`data:` link and script URLs, `<iframe>`, `<object>`, `<embed>`, `<base>`, `<foreignObject>`, external `<use>` references, and SMIL `<animate>`/`<set>` (they can rewrite `href`).
- **Code-block unwrapping is inert.** With `enableHtml`, HTML that marked miscoded into a code block was rebuilt by assigning `innerHTML` on an element of the live document, which fires image error handlers before any sanitizer runs. The nodes are now built in a `<template>` of the inert parser document, which also keeps a leading `<style>`.
- **The post-render SVG sanitizer** removes every `on*` attribute, blocks `javascript:`, `vbscript:` and `data:` on all URL attributes after stripping the characters browsers ignore, and keeps only same-document `<use>` references.
- Where no DOM is available, passthrough markup is escaped to text rather than trusted.

New dependency: `dompurify ^3.3.0`.
