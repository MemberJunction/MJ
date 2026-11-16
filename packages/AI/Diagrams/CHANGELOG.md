# @memberjunction/ai-diagrams

## 6.2.2

## 6.2.1

## 6.2.0

### Minor Changes

- 56d7614: Follow-up improvements for interactive architecture diagrams (`@memberjunction/ai-diagrams` and `@memberjunction/ng-markdown`):
  - Keep the diagram stage at full width when the side inspector opens (`scroll-padding-right` + `::after` spacer) and scroll clicked or jumped-to nodes and edges into view so the panel never covers the selected element.
  - Render edges underneath nodes with a roving `tabindex` (`ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown`), scope lit marker IDs per diagram instance in Light DOM, and animate comet flow and node arrival glows on user selection or trace (stopping on clear for WCAG 2.2.2 compliance, while respecting sequence message order, upstream + downstream traces, and disconnected cycles).
  - Repair smartypants-mangled CSS custom properties inside `<svg><style>`, provide SVG presentation fallbacks, and deduplicate `DIAGRAM_CSS`.
  - Support `mj-diagram` JSON code fences in `<mj-markdown>` with deferred `@memberjunction/ai-diagrams` loading, chunk-load error guards, and async render/destroy race guards, and register `Render Architecture Diagram` and `Get Architecture Diagram Reference` on `Sage` and `Infographic Agent`.
- e69634e: Add interactive architecture diagrams. `@memberjunction/ai-diagrams` validates an MJ Diagram spec (workflow, lifecycle, sequence, dataflow), renders a self-contained SVG whose colors come from `--mj-*` design tokens, and mounts a click-to-inspect viewer with path tracing. New CoreActions `Render Architecture Diagram` and `Get Architecture Diagram Reference`, with `Data Visualization` skill and `Research Report Writer` agent metadata. `@memberjunction/ng-markdown` upgrades embedded diagrams in place, and the `@memberjunction/ng-artifacts` SVG viewer shows every SVG artifact sanitized with `MarkdownService.SanitizeHtml` and inside a shadow root, so the artifact's own CSS stays in the preview. The viewer's `SafeSvgContent` property is removed.

### Patch Changes

- 62857b4: Tests: raise the wall-clock ceiling on the two "rejects pathological input quickly" checks from 250 ms to 2000 ms. They guard against quadratic comparison, not machine speed, and failed the v6.2.0-edge.8 publish gate at 807 ms on a CI runner.

## 6.2.0-edge.8

### Minor Changes

- 56d7614: Follow-up improvements for interactive architecture diagrams (`@memberjunction/ai-diagrams` and `@memberjunction/ng-markdown`):
  - Keep the diagram stage at full width when the side inspector opens (`scroll-padding-right` + `::after` spacer) and scroll clicked or jumped-to nodes and edges into view so the panel never covers the selected element.
  - Render edges underneath nodes with a roving `tabindex` (`ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown`), scope lit marker IDs per diagram instance in Light DOM, and animate comet flow and node arrival glows on user selection or trace (stopping on clear for WCAG 2.2.2 compliance, while respecting sequence message order, upstream + downstream traces, and disconnected cycles).
  - Repair smartypants-mangled CSS custom properties inside `<svg><style>`, provide SVG presentation fallbacks, and deduplicate `DIAGRAM_CSS`.
  - Support `mj-diagram` JSON code fences in `<mj-markdown>` with deferred `@memberjunction/ai-diagrams` loading, chunk-load error guards, and async render/destroy race guards, and register `Render Architecture Diagram` and `Get Architecture Diagram Reference` on `Sage` and `Infographic Agent`.
- e69634e: Add interactive architecture diagrams. `@memberjunction/ai-diagrams` validates an MJ Diagram spec (workflow, lifecycle, sequence, dataflow), renders a self-contained SVG whose colors come from `--mj-*` design tokens, and mounts a click-to-inspect viewer with path tracing. New CoreActions `Render Architecture Diagram` and `Get Architecture Diagram Reference`, with `Data Visualization` skill and `Research Report Writer` agent metadata. `@memberjunction/ng-markdown` upgrades embedded diagrams in place, and the `@memberjunction/ng-artifacts` SVG viewer shows every SVG artifact sanitized with `MarkdownService.SanitizeHtml` and inside a shadow root, so the artifact's own CSS stays in the preview. The viewer's `SafeSvgContent` property is removed.

### Patch Changes

- 62857b4: Tests: raise the wall-clock ceiling on the two "rejects pathological input quickly" checks from 250 ms to 2000 ms. They guard against quadratic comparison, not machine speed, and failed the v6.2.0-edge.8 publish gate at 807 ms on a CI runner.
