---
"@memberjunction/core": minor
"@memberjunction/ai-diagrams": minor
"@memberjunction/ng-markdown": minor
---

Follow-up improvements for interactive architecture diagrams (`@memberjunction/ai-diagrams` and `@memberjunction/ng-markdown`):
- Keep the diagram stage at full width when the side inspector opens (`scroll-padding-right` + `::after` spacer) and scroll clicked or jumped-to nodes and edges into view so the panel never covers the selected element.
- Render edges underneath nodes with a roving `tabindex` (`ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown`), scope lit marker IDs per diagram instance in Light DOM, and animate comet flow and node arrival glows on user selection or trace (stopping on clear for WCAG 2.2.2 compliance, while respecting sequence message order, upstream + downstream traces, and disconnected cycles).
- Repair smartypants-mangled CSS custom properties inside `<svg><style>`, provide SVG presentation fallbacks, and deduplicate `DIAGRAM_CSS`.
- Support `mj-diagram` JSON code fences in `<mj-markdown>` with deferred `@memberjunction/ai-diagrams` loading, chunk-load error guards, and async render/destroy race guards, and register `Render Architecture Diagram` and `Get Architecture Diagram Reference` on `Sage` and `Infographic Agent`.
