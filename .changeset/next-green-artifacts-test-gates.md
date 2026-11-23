---
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-conversations": patch
---

Tests only: bring `next` back to green after the unified-artifacts merge. The spreadsheet and permission test doubles match the current types again (`test:types`), the agent-presence DOM spec moves next to its components so it runs, the chat-area spec stubs its children instead of using a blanket schema, and `RealtimeArtifactWorkspaceSurfaceComponent` gets a DOM spec.
