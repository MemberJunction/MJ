---
"@memberjunction/core-actions": patch
"@memberjunction/ai-vectors": patch
"@memberjunction/search-engine": patch
---

Replace regex HTML/SVG sanitizing that CodeQL flagged as bypassable: `SVGUtils.SanitizeSVG` (Mermaid and architecture diagram output) now uses DOMPurify on jsdom and still empties external links; pan/zoom scripts are built from a new `GeneratePanZoomScriptBody` instead of stripping `<script>` tags from a string; RSS, text-extraction and storage-search tag stripping repeats until stable, and script/style removal matches end tags with spaces or attributes.
