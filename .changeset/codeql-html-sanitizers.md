---
"@memberjunction/core-actions": patch
"@memberjunction/ai-vectors": patch
"@memberjunction/search-engine": patch
---

Replace regex HTML/SVG sanitizing that CodeQL flagged as bypassable: `SVGUtils.SanitizeSVG` (and the deprecated `sanitizeSVG`, so every chart, diagram, network, word cloud, sketch, infographic, Mermaid and architecture action) now uses DOMPurify on jsdom, keeps `dominant-baseline`, `pointer-events` and caller-supplied ids, still empties external links, and throws if DOMPurify is unsupported; pan/zoom scripts are built from a new `GeneratePanZoomScriptBody` instead of stripping `<script>` tags from a string; `TextExtractor.ExtractFromHTML` removes script and style elements in one linear walk that also catches end tags with spaces or attributes; RSS and storage-search tag stripping loops to a fixed point.
