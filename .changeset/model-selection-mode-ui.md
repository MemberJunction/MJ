---
"@memberjunction/ng-core-entity-forms": patch
---

feat(ai-agent-form): Add Model Selection Mode control and reorganize panels

- Added Model Selection Mode dropdown in the Prompts section for better space utilization
- Reordered panels to show Actions first, then Sub-Agents, then Prompts for better workflow
- Fixed Kendo dropdown to properly bind primitive string values using valuePrimitive="true"
- Styled with blue accent to highlight this important configuration option
- Control appears in both edit and read-only modes for transparency