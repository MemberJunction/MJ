---
"@memberjunction/ng-markdown": patch
"@memberjunction/ng-conversations": patch
---

Fix Mermaid flowchart flickering during streaming and scrolling: defer rendering unclosed trailing Mermaid fences while streaming, synchronously reuse cached Mermaid SVGs across re-renders/remounts, keep incremental markdown streaming active in chat messages while streaming, and skip redundant `MessageListComponent.updateMessages` passes on scroll frames when the mounted window has not changed.
