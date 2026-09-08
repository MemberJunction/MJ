---
"@memberjunction/ng-markdown": patch
---

Markdown renderer: close the cross-site scripting vectors found by the first full CodeQL scan.

- **Passthrough sanitizer replaced.** When `enableHtml` or `enableSvgRenderer` is on, the component bypasses Angular's sanitizer (which strips SVG and layout HTML) and used a hand-written deny-list to strip script. That list missed `</script >`-style end tags, event handlers not spelled `on*=...`, and `data:` URLs outside `data:text/html`. It is replaced by DOMPurify with the HTML + SVG profiles, the same sanitizer `@memberjunction/ng-shared-generic` already uses: structural HTML, inline styles, data attributes and inline SVG survive; `<script>`, `on*` handlers, `javascript:`/`vbscript:`/`data:` link and script URLs, `<iframe>`, `<object>`, `<embed>`, `<base>` and `<foreignObject>` do not. `enableJavaScript` still opts out, as before.
- **No script execution during code-block unwrapping.** With `enableHtml`, the service unwraps HTML that marked miscoded into a code block. It built the replacement by assigning `innerHTML` on an element of the live `document`, which fires image error handlers and similar at parse time, before the component's sanitizer sees the output. The nodes are now built inside the inert `DOMParser` documents.
- **SVG post-render sanitizer hardened.** `sanitizeSvgContent` now removes every `on*` attribute rather than a fixed list of thirteen, and blocks `javascript:`, `vbscript:` and `data:` on `href`, `xlink:href`, `src`, `action` and `formaction` after stripping the whitespace and control characters browsers ignore. `data:image/*` (non-SVG) on `<image>` is still allowed.
- **No-DOM fallback renders as text.** Where there is no `window` to sanitize with, passthrough markup is escaped and shown as text instead of trusted.

New dependency: `dompurify ^3.3.0`.
