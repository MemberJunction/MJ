---
"@memberjunction/core": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/storage": minor
"@memberjunction/server": minor
"@memberjunction/ng-file-storage": minor
"@memberjunction/integration-engine": minor
---

Reads of per-user data now follow the records they describe. A Record Changes row reaches a caller only when the caller can read the entity it describes, and, when that entity has a row filter (from a role or an API key) or read hooks for the caller, the record itself. A read of one record by ID, through GraphQL or REST, runs the same read hooks as a view read, and a record the hooks remove is reported as not found. A read of Record Changes by a caller other than the system user that filters, sorts or searches on change content must be limited to one entity whose records the caller can all read, or to one record the caller can read; a filter or sort that names the entity's own view or table, or that is not plain SQL, is refused. A file linked to records is readable only when the caller can read at least one of those records; files with no links are unchanged. Record attachments store the full key of a record with a composite key. Peer sync refuses to page the change history of an entity unless the sync user is the system user or can read every record of that entity. The UI role now reads only its own diagnostic sessions, session chunks and bundles, its own agent run media and prompt run media, and its own or shared agent examples, it updates only its own agent run media, and it no longer reads diagnostic sender registrations. New core helpers `ParseStoredRecordKey`, `RecordKeyText`, `UserReadsEveryRecord`, `ReadableRecordKeyTexts` and `RecordPassesReadHooks` check which stored record keys a user can read.
