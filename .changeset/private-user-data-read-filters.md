---
"@memberjunction/core": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/storage": minor
"@memberjunction/server": minor
---

Reads of per-user data now follow the records they describe. A Record Changes row reaches a caller only when the caller can read the entity it describes, and, when that entity has a row filter or read hooks for the caller, the record itself. A file linked to records is readable only when the caller can read at least one of those records; files with no links are unchanged. The UI role now reads only its own diagnostic sessions, session chunks and bundles, its own agent run media and prompt run media, and its own or shared agent examples, and it no longer reads diagnostic sender registrations. New core helpers `ParseStoredRecordKey`, `RecordKeyText`, `UserReadsEveryRecord` and `ReadableRecordKeyTexts` check which stored record keys a user can read.
