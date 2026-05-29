## 2025-04-25 - XSS in Angular Highlight Search Pipe
**Vulnerability:** XSS vulnerability in `HighlightSearchPipe` due to trusting unescaped HTML.
**Learning:** `sanitizer.bypassSecurityTrustHtml` was applied to strings that were not escaped for HTML entities first, allowing injection of malicious scripts if user data contains `<script>` tags.
**Prevention:** Use `EscapeHTML` (from `@memberjunction/global`) on text parts individually before combining them with `<mark>` tags and trusting the resulting HTML.
## 2026-05-08 - Proper XSS Escaping in Highlight Functions
**Vulnerability:** XSS vulnerability through unsafe regex string replacement bound to innerHTML.
**Learning:** Applying string replacement (like wrapping a search term with a `<mark>` tag) directly on text that is then bound to Angular's `[innerHTML]` exposes the application to XSS. Escaping the string *before* replacement breaks the entity codes when the regex attempts a match and wraps part of the entity.
**Prevention:** Always escape text segments *individually* after the string match and before concatenating the highlighted parts together.
## 2024-05-18 - Proper XSS Escaping in Highlight Functions
**Vulnerability:** XSS vulnerability through unsafe regex string replacement bound to innerHTML.
**Learning:** Applying string replacement (like wrapping a search term with a `<mark>` tag) directly on text that is then bound to Angular's `[innerHTML]` exposes the application to XSS. Escaping the string *before* replacement breaks the entity codes when the regex attempts a match and wraps part of the entity.
**Prevention:** Always escape text segments *individually* after the string match and before concatenating the highlighted parts together. Use the centralized `HighlightSearchMatches` function from `@memberjunction/global` instead of rolling custom highlight functions.
