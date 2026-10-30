---
"@memberjunction/core": minor
"@memberjunction/ai-diagrams": minor
"@memberjunction/core-actions": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-markdown": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add interactive architecture diagrams. `@memberjunction/ai-diagrams` validates an MJ Diagram spec (workflow, lifecycle, sequence, dataflow), renders a self-contained SVG whose colors come from `--mj-*` design tokens, and mounts a click-to-inspect viewer with path tracing. New CoreActions `Render Architecture Diagram` and `Get Architecture Diagram Reference`, with `Data Visualization` skill and `Research Report Writer` agent metadata. `@memberjunction/ng-markdown` upgrades embedded diagrams in place, and `@memberjunction/ng-artifacts` mounts them in the SVG artifact viewer after sanitizing with `MarkdownService.SanitizeHtml`.
