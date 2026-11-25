---
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-code-editor": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/core": patch
---

The entity data grid accepts only plain CSS colours from a saved view's column styles. Every value that the grid's cell renderer writes into an HTML attribute (link, image source, title, data attribute, style) is escaped, and `HighlightUtil.EscapeHtml` now escapes `&`, `<`, `>`, `"` and `'` in every environment. A URL cell links with `http:` or `https:` only. The composition token tooltip in the code editor shows the query category as text. The Component artifact viewer and the Preview tab of the component version compare view ask before they run any component spec from a version that a different user wrote, and name that user; `IsArtifactVersionWrittenByUser` is exported from `@memberjunction/ng-artifacts`. The realtime interactive component channel loads only Component artifact versions that the signed-in user wrote. `CoerceImageSrc` removes the tab, line feed, carriage return and leading control characters that a browser ignores before it checks the scheme, and returns the cleaned value.
