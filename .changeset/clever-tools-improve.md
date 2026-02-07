---
"@memberjunction/core": minor
"@memberjunction/codegen-lib": patch
"@memberjunction/db-auto-doc": patch
"@memberjunction/cli": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/query-gen": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Enable cascade deletes for AI Agent and Prompt entities, add cross-file dependency detection and --delete-db-only flag to MetadataSync for proper deletion ordering, fix CodeGen duplicate variable names for self-referential FKs, add requireConnectivity config to QueryGen, and add Gemini JSON parser support to DBAutoDoc.
