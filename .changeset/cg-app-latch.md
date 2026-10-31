---
"@memberjunction/codegen-lib": patch
---

CodeGen looks up, and creates when absent, a new entity's schema application on every new entity instead of only the schema's first, so one failed create no longer leaves the schema without an application (#4034). When the application is created late, the schema's entities that are in no application are linked to it.
