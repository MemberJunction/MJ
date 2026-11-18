# Recording ledger columns not entity-updatable (#6010) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A stale `MJ: AI Agent Sessions` save can never write or clear the seven recording-ledger columns, whatever entity subclass the host registers.

**Architecture:** The seven columns get `AllowUpdateAPI=false` in metadata, so CodeGen drops them (and their `_Clear` companions) from `spUpdateAIAgentSession` and the generated class loses their setters. The two legitimate entity writers move to a new hand-written proc `spStampAIAgentSessionRecordingFile`, exposed as `IRealtimeRecordingLedger.StampFile`. The subclass guard in `MJAIAgentSessionEntityServer.Save` is deleted.

**Tech Stack:** T-SQL (Flyway migration), MJ metadata sync JSON, MJ CodeGen, TypeScript, vitest, MJ integration test tier.

**Spec:** the brief in issue #6010 ("Design decided" and "Done when").

## Global Constraints

- Exactly these seven fields get `"AllowUpdateAPI": false`: `RecordingStatus`, `RecordingExpectedShards`, `RecordingCapturedSamples`, `RecordingGaps`, `RecordingAssemblyVersion`, `RecordingFileID`, `RecordingMedia`. `RecordingStartedAt` stays updatable.
- Proc signature: `spStampAIAgentSessionRecordingFile(@AgentSessionID UNIQUEIDENTIFIER, @RecordingFileID UNIQUEIDENTIFIER = NULL, @RecordingMedia NVARCHAR(20) = NULL, @RecordingStartedAt DATETIMEOFFSET = NULL)`; updates only the non-null params on the one row; returns the row's `RecordingStatus`.
- Migration name: `migrations/v6/V<timestamp>__v6.2.x__Recording_Ledger_Columns_Not_Entity_Updatable.sql`; hand DDL, 50 blank lines, CodeGen comment block, CodeGen output. No hand `UPDATE [EntityField]`.
- `mj sync push` before `mj codegen`; revert the `sync` block write-back in the metadata JSON before committing.
- Do not touch the six existing ledger procs, the assembly scheduler, `ClassFactory.Register`, `migrations-pg/**`, or any other field's `AllowUpdateAPI`.
- A `minor` changeset.

## Review Focus

1. A session row that does not exist: `StampFile` must throw with the proc and session id (callForOneRow already does); `linkAndStamp` keeps its "not loaded → link but do not stamp" behaviour by loading first.
2. `stampRecordingStart` must keep `RecordingStartedAt` on the in-memory session (it is saved through the entity), because a later save of that object would otherwise `_Clear` it.
3. `StampFile` with no field set is a no-op call nobody needs: reject it up front (test).
4. A provider that is not a database provider reaching the store: fail with a descriptive message, not a `TypeError` (test).
5. Other checks in the integration process must still resolve `MJAIAgentSessionEntityServer` after RD19 (RD19 restores the previous winner).

---

### Task 1: `StampFile` on the ledger (unit-tested)

**Files:**
- Modify: `packages/AI/Agents/src/realtime/realtime-recording-ledger.ts`
- Test: `packages/AI/Agents/src/__tests__/realtime-recording-ledger.test.ts`

**Interfaces:**
- Produces: `IRealtimeRecordingLedger.StampFile(sessionID: string, file: StampFileInput): Promise<{ RecordingStatus: string | null }>`; `export interface StampFileInput { fileID?: string; media?: 'Audio' | 'AudioVideo' | 'None'; startedAt?: Date }`. Proc const `SP_STAMP_FILE = 'spStampAIAgentSessionRecordingFile'`.

- [ ] Tests: `StampFile calls spStampAIAgentSessionRecordingFile with 4 placeholders in proc order` — params `[SESSION, FILE, 'Audio', startedAt]`, `IsMutation` true, result `{ RecordingStatus: 'Pending' }`; omitted fields pass `null`; rejects `'nope'` session id (`/session id/i`), a malformed `fileID`, an invalid `startedAt` Date, and an input with no field set — all before any SQL call.
- [ ] Run `npx vitest run src/__tests__/realtime-recording-ledger.test.ts` in `packages/AI/Agents` → FAIL.
- [ ] Implement with `callForOneRow` and the existing `assertSessionID` guard.
- [ ] Re-run → PASS. Commit.

### Task 2: metadata, proc, migration, CodeGen (slot DB)

**Files:**
- Create: `metadata/entities/.ai-agent-session-recording-ledger-fields.json` (shape of `.work-queue-entity-fields.json`, `_comments` with the why)
- Create: `migrations/v6/V<ts>__v6.2.x__Recording_Ledger_Columns_Not_Entity_Updatable.sql`
- Modify (generated): `packages/MJCoreEntities/src/generated/entities/__mj.ts`, MJServer generated resolvers, Explorer generated form — whatever CodeGen emits for this entity only.

- [ ] Bring `SBX_e1` to the frontier: `mj migrate`.
- [ ] Write the hand DDL (proc + GRANT to `[cdp_Developer], [cdp_Integration]`, style of `spStampAIAgentSessionRecordingTerminal`); apply with `mj migrate`.
- [ ] `mj sync push` of the new metadata file; confirm the seven flags are 0 in the DB.
- [ ] `mj codegen`; append the generated `spUpdateAIAgentSession` (and any other output for this entity) under the separator; delete the `CodeGen_Run_*.sql`.
- [ ] Verify: the tail's `spUpdateAIAgentSession` has none of the seven `@params` nor their `_Clear`; `@RecordingStartedAt` present; no setter for the seven in the generated entity.
- [ ] Revert `sync` blocks in the metadata JSON; revert unrelated CodeGen drift. Commit migration + metadata + generated files together.

### Task 3: move the two writers to `StampFile`

**Files:**
- Modify: `packages/AI/Agents/src/realtime/realtime-recording-store.ts` (`stampRecordingOnSession` → ledger built from `Provider`, structural check that it is a database provider)
- Modify: `packages/MJServer/src/resolvers/RealtimeClientSessionResolver.ts` (`stampRecordingStart`: `RecordingStartedAt` through the entity, `RecordingMedia: 'Audio'` through `StampFile`; best-effort, failures logged with session id)
- Modify tests: `realtime-recording-recovery-flow.test.ts`, `realtime-recording-recovery-box.test.ts`, MJServer `RealtimeClientSessionResolver.test.ts` — fake providers answer `spStampAIAgentSessionRecordingFile`.

- [ ] Failing test first: store writes the file id through the proc (fake provider's `ExecuteSQL` sees `spStampAIAgentSessionRecordingFile` with `[session, file, media, startedAt]`), and a provider with no `ExecuteSQL` yields a failure result naming the provider problem.
- [ ] Implement; run `pnpm test` in `packages/AI/Agents` and `packages/MJServer` → PASS. Commit.

### Task 4: delete the subclass guard

**Files:**
- Modify: `packages/MJCoreEntitiesServer/src/custom/MJAIAgentSessionEntityServer.server.ts` (drop `recordingLedgerFields`, `Save`; class comment no longer claims ledger protection)
- Modify: `packages/MJCoreEntitiesServer/src/__tests__/MJAIAgentSessionEntityServer.test.ts` (drop the `Save leaves the recording ledger's columns alone` describe)
- Modify: `packages/MJServer/src/agentSessions/SessionJanitor.ts` comment on `restoreLostRecordingStatus` (the cause is fixed; the restore stays for rows hit before)

- [ ] `pnpm test` in `packages/MJCoreEntitiesServer` → PASS. Commit.

### Task 5: verify + ship

- [ ] Rebuild changed packages; restart slot API; IT51 → RD19 PASS; full `npm run test:integration`.
- [ ] `pnpm test` in MJCoreEntitiesServer, AI/Agents, MJServer, MJCore; builds; `check:guards`, `check:standards`, `check:codegen-tail`.
- [ ] `minor` changeset; push; PR body; summary.
