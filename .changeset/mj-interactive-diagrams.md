---
"@memberjunction/core": minor
"@memberjunction/ai-diagrams": minor
"@memberjunction/core-actions": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-markdown": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add interactive architecture diagrams. `@memberjunction/ai-diagrams` validates an MJ Diagram spec (workflow, lifecycle, sequence, dataflow), renders a self-contained SVG whose colors come from `--mj-*` design tokens, and mounts a click-to-inspect viewer with path tracing. New CoreActions `Render Architecture Diagram` and `Get Architecture Diagram Reference`, with `Data Visualization` skill and `Research Report Writer` agent metadata. `@memberjunction/ng-markdown` upgrades embedded diagrams in place, and the `@memberjunction/ng-artifacts` SVG viewer shows every SVG artifact sanitized with `MarkdownService.SanitizeHtml` and inside a shadow root, so the artifact's own CSS stays in the preview. The viewer's `SafeSvgContent` property is removed.
