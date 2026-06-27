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
## 2024-06-06 - [XSS in Angular innerHTML bindings]
**Vulnerability:** Angular components using `[innerHTML]` bindings without explicitly sanitizing rich text.
**Learning:** While Angular's native `[innerHTML]` sanitizes standard HTML, it can aggressively strip expected content like SVGs or inline styles, or miss specific attack vectors when custom templates are involved. Developers often bypass this improperly or render unsanitized content directly if they assume the data is safe.
**Prevention:** Always use the centralized `mjSafeRichHtml` pipe (from `@memberjunction/ng-shared-generic`), which utilizes DOMPurify with HTML and SVG profiles, to securely render rich text via `[innerHTML]`.
## 2024-06-07 - [XSS in DOM innerHTML assignments]
**Vulnerability:** Direct assignment of user-controlled properties (like title, queryInfo, entityName) to element `innerHTML` without HTML escaping.
**Learning:** Constructing complex HTML structures dynamically using template strings and injecting variables into `innerHTML` exposes the application to XSS. Angular's built-in `[innerHTML]` sanitization doesn't protect against direct DOM manipulation in component logic.
**Prevention:** Always wrap dynamically interpolated variables with the `EscapeHTML` utility from `@memberjunction/global` when directly constructing `.innerHTML` strings in TypeScript code.
