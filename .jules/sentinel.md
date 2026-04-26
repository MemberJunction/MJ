## 2025-04-25 - XSS in Angular Highlight Search Pipe
**Vulnerability:** XSS vulnerability in `HighlightSearchPipe` due to trusting unescaped HTML.
**Learning:** `sanitizer.bypassSecurityTrustHtml` was applied to strings that were not escaped for HTML entities first, allowing injection of malicious scripts if user data contains `<script>` tags.
**Prevention:** Use `EscapeHTML` (from `@memberjunction/global`) on text parts individually before combining them with `<mark>` tags and trusting the resulting HTML.
