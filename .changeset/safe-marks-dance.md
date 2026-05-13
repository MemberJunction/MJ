---
"@memberjunction/global": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-conversations": patch
---

Fix XSS vulnerability in search-result highlighters across form-field labels, collapsible-panel section names, and conversation search snippets. Extracted shared `HighlightSearchMatches` helper in `@memberjunction/global` that escapes each text segment individually after a literal-string match, so HTML in the source can never leak into `[innerHTML]` as live markup. Also restored multi-match highlighting that had regressed to single-match.
