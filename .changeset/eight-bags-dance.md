---
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/core": patch
"@memberjunction/server": patch
---

feat: AI Agent UI improvements and server-side context fixes

- Enhanced AI Agent dialogs with resizable and draggable functionality
  using Kendo UI Window component
- Improved dialog positioning with consistent center placement and proper
  container context
- Fixed prompt selector in AI Agent form for better user experience
- Added missing contextUser parameter to GetEntityObject calls in
  BaseResolver for proper multi-user isolation
- Fixed createRecordAccessAuditLogRecord calls in generated resolvers to
  include provider argument
- Added JSDoc documentation to ViewInfo class properties for better code
  documentation
- Applied consistent dialog styling across all AI Agent management
  components
