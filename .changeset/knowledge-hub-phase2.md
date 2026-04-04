---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-agent-client": patch
"@memberjunction/server": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/content-autotagging": patch
"@memberjunction/actions-content-autotag": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/core-entities-server": patch
---

Knowledge Hub Phase 2: autotagging pipeline, duplicate detection dashboards, and client tool invocation system.

Autotagging: Run Pipeline button with real-time progress, direct vectorization of content items (bypasses entity documents), pipeline stage visualization, Gemini 3 Flash tagging.

Duplicate Detection: Run Detection button with entity document picker, progress via PubSub, Kanban approve/reject with persistence.

Client Tools: New 'ClientTools' step type in BaseAgent enabling browser-side tool invocation (navigation, UI display, tab switching) during agent execution. Includes ClientToolRequestManager server singleton, GraphQL subscription transport, runtime tool decoration, three-level timeout, loop agent integration, and 646-line documentation guide.
