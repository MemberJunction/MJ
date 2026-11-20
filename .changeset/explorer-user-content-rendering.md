---
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-code-editor": patch
"@memberjunction/ng-artifacts": patch
---

The entity data grid accepts only plain CSS colours from a saved view's column styles. Every value that the grid's cell renderer writes into an HTML attribute (link, image source, title, data attribute, style) is escaped, and `HighlightUtil.EscapeHtml` now escapes `&`, `<`, `>`, `"` and `'` in every environment. A URL cell links with `http:` or `https:` only. The composition token tooltip in the code editor shows the query category as text, and `BuildCompositionTooltipDOM` is now exported. The Component artifact viewer and the Preview tab of the component version compare view ask before they run code from a version that a different user wrote, and name that user.
