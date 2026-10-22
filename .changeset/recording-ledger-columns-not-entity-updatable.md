---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ai-agents": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Recording-ledger columns of `MJ: AI Agent Sessions` are no longer updatable through an entity save (#6010).

- `RecordingStatus`, `RecordingExpectedShards`, `RecordingCapturedSamples`, `RecordingGaps`, `RecordingAssemblyVersion`, `RecordingFileID` and `RecordingMedia` carry `AllowUpdateAPI=false` (`metadata/entities/.ai-agent-session-recording-ledger-fields.json`). The regenerated `spCreate`/`spUpdateAIAgentSession` leave them out, so a stale session save (from any entity class, an app's own subclass included) can no longer clear a terminal stamp and mislabel a complete recording as `Partial`. The generated `MJAIAgentSessionEntity` drops their setters and the GraphQL create/update inputs drop the fields. `RecordingStartedAt` stays updatable.
- New proc `spStampAIAgentSessionRecordingFile` and `IRealtimeRecordingLedger.StampFile(sessionID, { fileID?, media?, startedAt? })` write the recording file, media kind and t0. The end-of-call upload and the recording-start stamp use it.
- `MJAIAgentSessionEntityServer` no longer overrides `Save`; it keeps only the protected-`Config`-keys guard.

Migration: `V202610222240__v6.2.x__Recording_Ledger_Columns_Not_Entity_Updatable.sql`. Run `mj sync push` with the release metadata so the field flags land with the regenerated procs.
