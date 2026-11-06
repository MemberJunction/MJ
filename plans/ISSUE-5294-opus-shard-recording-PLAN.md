# Opus shards become the realtime recording — Implementation Plan (MJ#5294)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every byte of audio a client-direct realtime call captured reaches MJAPI no matter how the call ends, as 5 s Opus shards in a SQL ledger that the server assembles into `recording.wav` + `peaks.json` within seconds of a terminal signal.

**Architecture:** The browser recorder captures at 48 kHz and feeds one continuous Opus encoder (WebCodecs, or a libopus WASM Worker). The platform-free runtime cuts the packet stream into `MJOPUS1` shards, commits each to IndexedDB, uploads it as raw bytes to a new REST route, and sends a `keepalive` terminal request (tail shard + counts) on End, `pagehide` and `visibilitychange→hidden`. MJAPI writes shards into `AIAgentSessionRecordingShard` through guarded stored procedures, claims assembly atomically, decodes all packets with one libopus decoder, and stores the WAV through the existing storage path; the janitor is the backstop.

**Tech Stack:** TypeScript, Angular (ng-conversations), WebCodecs `AudioEncoder`, libopus WASM (from `@evan/opus@1.0.3`, already in the lockfile), IndexedDB, Express 5 (`express.raw`), SQL Server T-SQL procs, MJ CodeGen, vitest (+ `fake-indexeddb@6.2.5`, already in the lockfile).

**Spec:** GitHub issue MemberJunction/MJ#5294 — the approved brief ("Design decided", "Done when", "Out of scope").

## Global Constraints

- Capture and shard timing at **48000 Hz**; every shard carries `startSample` and `sampleCount`; never derive timing from wall clock.
- Opus: mono, **32 kbps**, **20 ms** frames (960 samples). One encoder per call, chosen once at start, never switched.
- Shard window **5 s** = 240 000 samples = 250 packets; final/tail shards shorter. Shard flush every **5000 ms**.
- `MJOPUS1` wire format: header `{magic, formatVersion, shardIndex, startSample, sampleCount, packetCount}` then length-prefixed packets. No Ogg.
- Shard route body cap **128 KiB**; terminal body cap **48 KiB**; terminal waits for ack or **3 s**.
- IndexedDB: put **before** upload starts, delete only on server ack; **7-day** retention; failures logged, never block the call; drain bounded per load.
- `RecordingStatus` ∈ `Pending | Assembling | Complete | Partial | Failed` (NULL = not recorded); `RecordingAssemblyVersion` default 0.
- Grace before Partial assembly: `recordingAssemblyGraceSeconds` default **90**; late-shard re-assembly cutoff **24 h** after close.
- Output names stay `recording.wav` / `peaks.json`; `/media/:fileId` and `MJ: Files` link shape unchanged.
- Keep `UploadRealtimeRecordingSegment` / `UploadRealtimeRecording` mutations and the legacy `seg-*.pcm` recovery.
- Migration: T-SQL only (no `migrations-pg/**`); EntityField INSERTs use apply-time `MAX(Sequence)+1`.
- No changes to server-bridged recording, mobile `RNRealtimeMediaHost`, consent gate, Caliber, `closeThresholdMinutes`, `recordingRecoveryLookbackHours`, or recovery backoff constants.
- Changeset bump `minor` (migration branch).

## Review Focus

1. **Tail sent twice with different content** (visibility-hidden terminal, then the call continues and End sends another) — the window must be sealed when a tail is sent so an index is never re-sent with different bytes (which the server treats as a conflict → `Failed`). Test in Task 3.
2. **A terminal with higher counts after `Complete`** (tab returns from background and the call continues) must re-open assembly; a lower one is ignored and logged. Test in Task 6 (proc) and Task 8 (route).
3. **A shard arriving after `Complete` with an index ≥ expected** (call continued, then the browser crashed) must set the session back to `Pending` so the janitor assembles it. Test in Task 6.
4. **VBR spike making a tail exceed 48 KiB** — the window seals early at a byte cap so a tail always fits the keepalive budget. Test in Task 2.
5. **Expired JWT / no provider config at construction** — the IndexedDB drain must defer (not drop) until a transport exists. Test in Task 4.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/AI/CorePlus/src/realtime-recording-shard-format.ts` (new) | `MJOPUS1` encode/parse + shared constants; used by runtime, browser tests and server. |
| `packages/RealtimeRuntime/src/session/recording-shard-format.ts` — **not created**: MJ forbids cross-package re-exports, so the runtime imports the format from ai-core-plus directly. |
| `packages/RealtimeRuntime/src/session/RecordingShardWindow.ts` (new) | Cuts the packet stream into indexed shards; seals tails. Pure. |
| `packages/RealtimeRuntime/src/session/RecordingShardQueue.ts` (rewrite) | Sends indexed shards, retains failures, retries oldest-first, bounded. |
| `packages/RealtimeRuntime/src/session/RecordingShardStore.ts` (new) | IndexedDB store + in-memory no-op fallback; retention purge. |
| `packages/RealtimeRuntime/src/session/RecordingTransport.ts` (new) | `fetch`-based shard/terminal transport built from the GraphQL provider config. |
| `packages/RealtimeRuntime/src/hosts/IRealtimeMediaHost.ts` | Recorder contract: `TakeEncodedPackets()`, `Stop(): Promise<number>`, `NowOffsetMs()`. |
| `packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts` | Wires window/queue/store/transport; terminal on End; `SendRecordingTerminal()`; drain on construction/start. |
| `packages/Angular/Generic/conversations/src/lib/services/recording/*` (new) | `LinearResampler`, `OpusPacketEncoder` (WebCodecs + WASM worker), libopus loader source, embedded wasm. |
| `.../services/realtime-audio-recorder.ts`, `browser-realtime-media-host.ts`, `realtime-session.service.ts` | 48 kHz capture → encoder; pagehide/visibility wiring; guard removed. |
| `migrations/v6/V<ts>__v6.2.x__Realtime_Recording_Shard_Ledger.sql` (new) | Columns, table, guarded-write procs, CodeGen tail. |
| `packages/AI/Agents/src/realtime/realtime-recording-ledger.ts` (new) | Proc calls (insert shard, stamp terminal, claim, finish, load, delete, purge). |
| `packages/AI/Agents/src/realtime/realtime-recording-opus-assembly.ts` (new) | Pure PCM assembly + peaks; orchestrated `AssembleRealtimeRecordingFromLedger`. |
| `packages/MJServer/src/realtimeSessions/ownedRealtimeSession.ts` (new) | Shared ownership gate (`LoadOwnedRealtimeSession`). |
| `packages/MJServer/src/realtimeSessions/RecordingAssemblyScheduler.ts` (new) | Per-session grace timers + fire-and-forget assembly. |
| `packages/MJServer/src/rest/RealtimeRecordingHandler.ts` (new) | `/realtime/recording/:id/shard/:index` and `/end`. |
| `packages/MJServer/src/agentSessions/SessionJanitor.ts` | Ledger backstop sweep, purge, legacy sweep excludes ledger sessions. |
| `guides/REALTIME_CO_AGENTS_GUIDE.md` | Step 6 rewritten. |

---

### Task 1: `MJOPUS1` shard format (ai-core-plus)

**Files:** Create `packages/AI/CorePlus/src/realtime-recording-shard-format.ts`, test `packages/AI/CorePlus/src/__tests__/realtime-recording-shard-format.test.ts`; export from `src/index.ts`.

**Produces:**
```ts
export const RECORDING_SAMPLE_RATE = 48000;
export const RECORDING_FRAME_SAMPLES = 960;           // 20 ms
export const RECORDING_SHARD_WINDOW_PACKETS = 250;    // 5 s
export const RECORDING_SHARD_MAX_BYTES = 128 * 1024;
export const RECORDING_TERMINAL_MAX_BYTES = 48 * 1024;
export const RECORDING_SHARD_HEADER_BYTES = 28;
export interface RecordingShardHeader { ShardIndex: number; StartSample: number; SampleCount: number; PacketCount: number }
export interface RecordingShardContents extends RecordingShardHeader { Packets: Uint8Array[] }
export function EncodeRecordingShard(shard: RecordingShardContents): Uint8Array;
export function ParseRecordingShard(bytes: Uint8Array): RecordingShardContents; // throws RecordingShardFormatError
export class RecordingShardFormatError extends Error {}
```
Layout (little-endian): bytes 0-6 ASCII `MJOPUS1`; 7 u8 formatVersion=1; 8 u32 shardIndex; 12 u32 startSample low; 16 u32 startSample high; 20 u32 sampleCount; 24 u32 packetCount; then per packet u16 length + bytes.
Parse rejects: wrong magic/version, short header, truncated packet, zero-length or >1275-byte packet, trailing bytes, `sampleCount > packetCount*960`, `packetCount > 2*250`, startSample > `Number.MAX_SAFE_INTEGER`.

- [ ] Step 1: tests — round-trip; each rejection; header-only (0 packets, sampleCount 0) round-trips.
- [ ] Step 2: run `cd packages/AI/CorePlus && npx vitest run src/__tests__/realtime-recording-shard-format.test.ts` → FAIL (module missing). **This is the branch's first commit (the failing test).**
- [ ] Step 3: implement; Step 4: PASS; Step 5: commit.

### Task 2: `RecordingShardWindow` (runtime)

**Files:** Create `packages/RealtimeRuntime/src/session/RecordingShardWindow.ts`; test `src/__tests__/RecordingShardWindow.test.ts`.

**Produces:**
```ts
export interface RecordingShard { Index: number; StartSample: number; SampleCount: number; Bytes: Uint8Array }
export class RecordingShardWindow {
  Append(packets: Uint8Array[]): RecordingShard[];          // seals each window reaching 250 packets OR whose encoded body would exceed RECORDING_TERMINAL_MAX_BYTES
  SealTail(sampleCount?: number): RecordingShard | null;    // seals the partial window now; default sampleCount = packets*960; clamps to [0, packets*960]; null when no packets
  get LastSealedIndex(): number;                            // -1 before any seal
  get SealedSamples(): number;                              // end sample of the last sealed shard
  get PendingSamples(): number;                             // SealedSamples + pending packets*960
}
```
Each shard's `StartSample` = previous shard end; indexes contiguous from 0.

- [ ] Tests: 600 packets → shards 0,1 sealed (250 each, startSample 0 / 240000), 100 pending; `SealTail(captured - 480000)` gives index 2 with that sampleCount; contiguous ranges; byte-cap seal when packets are large (e.g. 200-byte packets → seal before 48 KiB); `SealTail` twice → second null; after a tail seal, next window continues at the next index and sample (Review Focus 1).
- [ ] Implement, pass, commit.

### Task 3: `RecordingShardQueue` rewrite (indexed shards)

**Files:** Modify `packages/RealtimeRuntime/src/session/RecordingShardQueue.ts`; rewrite `src/__tests__/RecordingShardQueue.test.ts`.

**Produces:**
```ts
export type ShardUpload = (shard: RecordingShard) => Promise<boolean>;
export class RecordingShardQueue {
  constructor(upload: ShardUpload);
  Flush(fresh: RecordingShard[]): Promise<void>; // retained (oldest first) then fresh; skips when MAX_CONCURRENT_FLUSHES in flight (fresh shards are retained instead, never lost)
  Close(): void; get RetainedCount(): number;
}
```
Keep `MAX_SHARD_UPLOAD_ATTEMPTS = 3`, `MAX_CONCURRENT_FLUSHES = 2`, `SHARD_UPLOAD_TIMEOUT_MS`. A dropped shard stays in IndexedDB (drained later) — say so in the warn text. A retry keeps its index.

- [ ] Port the existing behaviours (retry same index, oldest first, cap, timeout, close stops sends) to the new API; at-capacity flush retains fresh shards. Implement, pass, commit.

### Task 4: `RecordingShardStore` (IndexedDB) + `RecordingTransport`

**Files:** Create `RecordingShardStore.ts`, `RecordingTransport.ts` in `packages/RealtimeRuntime/src/session/`; tests `RecordingShardStore.test.ts` (uses `fake-indexeddb`), `RecordingTransport.test.ts`. Add `fake-indexeddb: 6.2.5` devDependency (hand-add the importer entry to `pnpm-lock.yaml`; resolution already present; link `node_modules/fake-indexeddb` in the slot).

**Produces:**
```ts
export interface PendingRecordingShard { SessionID: string; Index: number; Bytes: Uint8Array; SavedAt: number }
export interface IRecordingShardStore {
  Put(shard: PendingRecordingShard): Promise<void>;          // logs + resolves on failure
  Delete(sessionID: string, index: number): Promise<void>;
  ListOldest(limit: number): Promise<PendingRecordingShard[]>; // purges entries older than 7 days first
}
export const RECORDING_SHARD_RETENTION_MS = 7 * 24 * 3600_000;
export function CreateRecordingShardStore(factory: IDBFactory | null | undefined): IRecordingShardStore; // null → NullRecordingShardStore
export interface IRecordingTransport {
  UploadShard(sessionID: string, shard: RecordingShard | PendingRecordingShard): Promise<boolean>;
  SendTerminal(sessionID: string, input: { Tail: Uint8Array | null; LastShardIndex: number; CapturedSamples: number }): Promise<boolean>; // keepalive: true
}
export class FetchRecordingTransport implements IRecordingTransport {
  constructor(config: { BaseURL: string; Headers: () => Record<string, string>; Fetch?: typeof fetch });
}
export function RecordingBaseURLFromGraphQLURL(url: string): string; // strips trailing '/' and a trailing '/graphql'
```
Routes: `POST {base}/realtime/recording/{id}/shard/{index}` and `POST {base}/realtime/recording/{id}/end?lastShardIndex=&capturedSamples=`, `Content-Type: application/octet-stream`. Ack = `response.ok`. Headers: `authorization: Bearer <token>`, `x-mj-api-key`, `x-api-key`, `x-session-id` when present.

- [ ] Tests: put→list→delete; failing IDB open resolves and logs; 7-day purge; transport sends correct URL/method/body/`keepalive:true` on terminal, non-ok → false, throw → false.
- [ ] Implement, pass, commit.

### Task 5: Recorder contract + runtime wiring

**Files:** Modify `hosts/IRealtimeMediaHost.ts`, `session/RealtimeSessionRuntime.ts`, `src/index.ts` (export new types); tests `src/__tests__/RealtimeSessionRuntime.recording.test.ts` (new), update `RealtimeSessionRuntime.test.ts` fakes.

**Recorder contract (replaces SampleRate/MimeType/GetPeaks/SnapshotNewSegmentBase64/StopAndEncode):**
```ts
export interface IRealtimeSessionRecorder {
  readonly IsRecording: boolean;
  Start(micStream: MediaStream, remoteStream: MediaStream | null): void;
  AttachRemoteStream(stream: MediaStream): void;
  NowOffsetMs(): number;                 // from captured samples at 48 kHz
  TakeEncodedPackets(): Uint8Array[];    // 20 ms Opus packets encoded since the last call; sync; never encodes
  Stop(): Promise<number>;               // stops capture, flushes the encoder, resolves total captured samples; idempotent
}
```
**Runtime behaviour:**
- `startRecording`: creates `RecordingShardWindow`, `RecordingShardQueue(upload)`, store, transport; 5000 ms timer calls `flushRecordingShards()`: `window.Append(recorder.TakeEncodedPackets())` → for each sealed shard `await store.Put(...)` then `queue.Flush(sealed)`. Upload = `transport.UploadShard` then on `true` `store.Delete`.
- `SendRecordingTerminal(): void` (public, sync, for hosts' pagehide/visibility): appends `TakeEncodedPackets()`, seals the tail, `transport.SendTerminal` with `LastShardIndex = window.LastSealedIndex`, `CapturedSamples = window.SealedSamples`; no store, no recorder Stop. No-op without recorder or session id.
- Teardown: after Disconnect, `finishRecording()` → `recorder.Stop()` → append remaining packets → full windows go through store+queue → tail sealed with `captured - SealedSamples` → terminal sent (keepalive) **before** usage flush/close, awaited **after** close, bounded by `RECORDING_TERMINAL_ACK_TIMEOUT_MS = 3000`. `SavingRecording$` true during that wait. Consolidated `UploadRealtimeRecording` and the segment mutation are no longer called. If nothing was ever captured, no terminal.
- `protected createRecordingTransport(): IRecordingTransport | null` — default builds `FetchRecordingTransport` from `GraphQLDataProvider.ConfigData` (null when no URL/credentials). `protected createRecordingShardStore(): IRecordingShardStore` — default `CreateRecordingShardStore(globalThis.indexedDB)`.
- `DrainPendingRecordingShards(): Promise<number>` — runs once per runtime instance after success: lists up to `MAX_DRAINED_SHARDS_PER_LOAD = 50` oldest, uploads each under its own session/index, deletes on ack; deferred (not marked done) when transport is null. Called from the constructor via `setTimeout(0)` and at session start.
- `segmentFlushMs` 15000 → 5000.

- [ ] Tests (done-when rows 1-3): shards every 5 s with contiguous `StartSample`; final `SampleCount = captured − Σ earlier`; Put before upload (ordered call log); delete only after true ack; failed ack leaves entry; new runtime drains pending shard under original session/index; End sends terminal with `keepalive`, tail bytes, `{lastShardIndex, capturedSamples}`; `EndRealtimeSession` resolves after ack, or after 3 s (fake timers) without; legacy mutations not sent; `SendRecordingTerminal` does not call `Stop`/store.
- [ ] Implement, pass full runtime suite, build, commit.

### Task 6: Migration + CodeGen

**Files:** `migrations/v6/V<YYYYMMDDHHMM>__v6.2.x__Realtime_Recording_Shard_Ledger.sql`; regenerated `packages/MJCoreEntities/src/generated/*`, `packages/MJServer/src/generated/*` (and whatever CodeGen emits for Explorer forms/rosters).

Hand DDL:
```sql
ALTER TABLE ${flyway:defaultSchema}.AIAgentSession ADD
    RecordingStatus NVARCHAR(20) NULL CONSTRAINT CK_AIAgentSession_RecordingStatus CHECK (RecordingStatus IN ('Pending','Assembling','Complete','Partial','Failed')),
    RecordingExpectedShards INT NULL,
    RecordingCapturedSamples BIGINT NULL,
    RecordingGaps NVARCHAR(MAX) NULL,
    RecordingAssemblyVersion INT NOT NULL CONSTRAINT DF_AIAgentSession_RecordingAssemblyVersion DEFAULT 0;
CREATE TABLE ${flyway:defaultSchema}.AIAgentSessionRecordingShard (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentSessionID UNIQUEIDENTIFIER NOT NULL,
    [Index] INT NOT NULL, StartSample BIGINT NOT NULL, SampleCount INT NOT NULL, Bytes INT NOT NULL,
    Sha256 NVARCHAR(64) NOT NULL, Data VARBINARY(MAX) NOT NULL,
    ReceivedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_AIAgentSessionRecordingShard PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentSessionRecordingShard_AgentSession FOREIGN KEY (AgentSessionID) REFERENCES ${flyway:defaultSchema}.AIAgentSession(ID),
    CONSTRAINT UQ_AIAgentSessionRecordingShard_Session_Index UNIQUE (AgentSessionID, [Index]),
    CONSTRAINT CK_AIAgentSessionRecordingShard_Index CHECK ([Index] >= 0));
```
Plus extended properties for every new column/table, then guarded-write procs (pattern: `V202610061701__v6.2.x__Work_Queue_Guarded_Write_Sprocs.sql`; `GRANT EXECUTE … TO [cdp_Developer], [cdp_Integration]`, as the work-queue procs do; MJAPI calls them under its own login):
- `spRecordAIAgentSessionRecordingShard(@AgentSessionID, @Index, @StartSample, @SampleCount, @Bytes, @Sha256, @Data)` → one row `{Outcome: 'Inserted'|'Duplicate'|'Conflict', RecordingStatus, RecordingExpectedShards, ClosedAt}`. Insert-if-absent under `UPDLOCK, HOLDLOCK` (MERGE). On insert: status NULL → `Pending`; status `Complete`/`Partial` with `@Index >= ISNULL(expected,0)` → `Pending`. Conflict → status `Failed`.
- `spStampAIAgentSessionRecordingTerminal(@AgentSessionID, @ExpectedShards, @CapturedSamples)` → `{Outcome: 'Stamped'|'Ignored', RecordingStatus}`; accepts when both ≥ stored (or stored NULL); a strictly higher value on `Complete`/`Partial` sets `Pending`; NULL status → `Pending`; `Failed` stays.
- `spClaimAIAgentSessionRecordingAssembly(@AgentSessionID, @StaleBefore DATETIMEOFFSET NULL)` → `{RecordingAssemblyVersion}` or no row. Claims from `Pending`/`Partial`, or `Assembling` with `__mj_UpdatedAt < @StaleBefore`.
- `spFinishAIAgentSessionRecordingAssembly(@AgentSessionID, @Version, @Status, @Gaps, @FileID)` → `{AffectedRows}`; fenced on `RecordingAssemblyVersion=@Version AND RecordingStatus='Assembling'`; sets status, gaps, `RecordingFileID`, `RecordingMedia='Audio'` (FileID NULL → unchanged, for `Failed`).
- `spDeleteAIAgentSessionRecordingShards(@AgentSessionID, @IndexBelow)` → `{AffectedRows}`.
- `spPurgeAIAgentSessionRecordingShards(@ClosedBefore, @MaxRows)` → `{AffectedRows}` (shards of sessions closed before the cutoff).

- [ ] Bring `SBX_e1` to the frontier (`mj migrate`), write migration, `mj migrate`, `mj codegen`, `node scripts/append-codegen.mjs <migration>`, check `Data` is a binary field in `MJAIAgentSessionRecordingShardEntity`; `node .github/scripts/check-migration-entityfield-sequence.mjs`; `npm run check:codegen-tail`; a node script against `SBX_e1` proves each proc's outcomes (insert/duplicate/conflict, two concurrent claims → one row). Commit migration + generated files together.

### Task 7: Ledger + Opus assembly (ai-agents)

**Files:** Create `packages/AI/Agents/src/realtime/realtime-recording-ledger.ts`, `realtime-recording-opus-assembly.ts`; tests in `packages/AI/Agents/src/__tests__/`; export from index; add `@evan/opus: 1.0.3` dependency (lockfile importer hand-edit; link in slot).

**Produces:**
```ts
// ledger
export type RecordShardOutcome = 'Inserted' | 'Duplicate' | 'Conflict';
export interface RecordShardResult { Outcome: RecordShardOutcome; RecordingStatus: string | null; ExpectedShards: number | null; ClosedAt: Date | null }
export interface IRealtimeRecordingLedger {
  RecordShard(input: { SessionID: string; Index: number; StartSample: number; SampleCount: number; Data: Buffer; Sha256: string }): Promise<RecordShardResult>;
  StampTerminal(sessionID: string, expectedShards: number, capturedSamples: number): Promise<{ Outcome: 'Stamped' | 'Ignored'; RecordingStatus: string | null }>;
  ClaimAssembly(sessionID: string, staleBefore: Date | null): Promise<number | null>;
  FinishAssembly(input: { SessionID: string; Version: number; Status: 'Complete' | 'Partial' | 'Failed'; Gaps: RecordingGap[]; FileID: string | null }): Promise<boolean>;
  LoadShards(sessionID: string): Promise<LedgerShard[]>;
  CountShardsBelow(sessionID: string, indexBelow: number): Promise<number>;
  DeleteShardsBelow(sessionID: string, indexBelow: number): Promise<number>;
  PurgeClosedBefore(closedBefore: Date, maxRows: number): Promise<number>;
}
export class SqlRealtimeRecordingLedger implements IRealtimeRecordingLedger { constructor(provider: DatabaseProviderBase, contextUser: UserInfo) }
// assembly
export interface RecordingGap { startSample: number; sampleCount: number; indexes: number[] }
export interface IOpusPacketDecoder { Decode(packet: Uint8Array): Int16Array }
export function AssembleOpusRecordingPcm(shards: RecordingShardContents[], expectedShards: number | null, capturedSamples: number | null, decoder: IOpusPacketDecoder): { Pcm: Int16Array; Gaps: RecordingGap[]; Complete: boolean };
export function ComputeRecordingPeaks(pcm: Int16Array, buckets?: number): number[];
export function EncodePcm16Wav(pcm: Int16Array, sampleRate: number): Buffer;
export function CreateLibopusDecoder(): IOpusPacketDecoder; // @evan/opus Decoder, 48 kHz mono
export async function AssembleRealtimeRecordingFromLedger(input: { SessionID: string; Version: number; Ledger: IRealtimeRecordingLedger; ContextUser: UserInfo; Provider: IMetadataProvider; ForcePartial?: boolean }): Promise<'Complete' | 'Partial' | 'Failed' | 'Superseded'>;
```
Assembly: present shard → decode its packets with the one decoder, take exactly `SampleCount` (trim/zero-pad); missing index run → silence of `[prevEnd, nextStart)` (trailing run → `[prevEnd, captured)`), listed with its indexes; a present shard whose `StartSample` > position → silent gap with `indexes: []`; < position → throws (corrupt). Final length = `capturedSamples ?? end`. `Complete` iff expected known, all `0..expected-1` present, no gaps. Orchestrator: storage account from agent (fail → `Failed`), WAV upload: first time via `FileStorageEngine.UploadFile` (`recording.wav`, prefix `realtime-recordings/<id>`) + link row; re-assembly overwrites the existing file's object (`driver.PutObject(file.ProviderKey, …)`) keeping the same FileID; `peaks.json` via `WriteRecordingPeaksSidecar`; `FinishAssembly` fenced; on `Complete` → `DeleteShardsBelow(expected)`. Lost fence → `Superseded`.

- [ ] Tests (done-when row 8): real libopus-encoded fixture shards (`@evan/opus` Encoder); all present → WAV PCM length == captured, peaks from that PCM, `Complete`, rows deleted; one missing → `Partial`, exactly that range silent, listed in gaps; re-run after the shard arrives removes the gap and bumps version (fake ledger); ledger SQL builders call the right procs with placeholders.
- [ ] Implement, pass, build, commit.

### Task 8: Shared gate, REST routes, scheduler, config (MJServer)

**Files:** Create `realtimeSessions/ownedRealtimeSession.ts`, `realtimeSessions/RecordingAssemblyScheduler.ts`, `rest/RealtimeRecordingHandler.ts`; modify `resolvers/RealtimeClientSessionResolver.ts` (delegate `loadOwnedSession`), `index.ts` (mount post-auth when `realtime.enabled`), `config.ts` (`realtime.recordingAssemblyGraceSeconds` default 90). Tests `src/__tests__/realtimeRecordingHandler.test.ts`, `RecordingAssemblyScheduler.test.ts`.

**Produces:**
```ts
export async function LoadOwnedRealtimeSession(agentSessionId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<MJAIAgentSessionEntity>; // throws RealtimeSessionNotFoundError / RealtimeSessionOwnershipError
export function CreateRealtimeRecordingRouter(deps: RealtimeRecordingRouterDeps): Router;
export interface RealtimeRecordingRouterDeps {
  ResolveCaller(req: Request): { ContextUser: UserInfo; Provider: IMetadataProvider } | null;
  LoadOwnedSession: typeof LoadOwnedRealtimeSession;
  CreateLedger(provider: IMetadataProvider): IRealtimeRecordingLedger;
  Scheduler: { ScheduleAssembly(sessionID: string, delayMs: number): void };
  GraceMs: () => number;
}
export const REALTIME_RECORDING_MOUNT_PATH = '/realtime/recording';
```
Shard route: `express.raw({ type: 'application/octet-stream', limit: 128 KiB })` → 413 over cap; parse (400 on format error or header index ≠ path index); owner gate (403/404); sha256; `RecordShard`; `Conflict` → `LogError` with session + index, 409; `Inserted` on `Partial` with index < expected and closed < 24 h ago → schedule now. Terminal route: 48 KiB cap; `lastShardIndex` ≥ -1 integer, `capturedSamples` ≥ 0 integer; optional tail recorded like a shard (index must equal lastShardIndex); `StampTerminal`; `Ignored` → `LogStatus` warning; if status `Pending` → all `0..expected-1` present → schedule now, else schedule after grace. Never decodes in the request.
Scheduler: one timer per session (later call replaces a later timer only if sooner), unref'd; fire → `ClaimAssembly(null)` → `AssembleRealtimeRecordingFromLedger` (ForcePartial when the grace timer fired); errors logged; system user via `UserCache.Instance.GetSystemUser()`.

- [ ] Tests (done-when rows 6-7): via an express app on an ephemeral port with a fake ledger + fake gate: row insert w/ sha, duplicate same hash 200 single row, different hash 409 + Failed + logged, >128 KiB 413, non-owner 403, end stamps + idempotent duplicate + lower ignored, two concurrent `/end` → only the claim winner assembles (fake ledger claim is atomic per version), body never decoded (decoder spy).
- [ ] Implement, pass, build, commit.

### Task 9: Janitor backstop + purge

**Files:** Modify `packages/MJServer/src/agentSessions/SessionJanitor.ts`; tests in its existing test file(s).

- Legacy recovery filter gains `AND RecordingStatus IS NULL AND ID NOT IN (SELECT AgentSessionID FROM <schema>.vwAIAgentSessionRecordingShards)`.
- New `RunRecordingLedgerSweep(provider, systemUser)`: closed, grace (existing 10 min) and lookback window, `RecordingStatus = 'Pending'`, or `'Assembling'` with `__mj_UpdatedAt` older than `recordingRecoveryAttemptTimeoutMinutes`, or `RecordingStatus IS NULL` with ledger rows; per candidate `ClaimAssembly(staleBefore)` → `AssembleRealtimeRecordingFromLedger({ForcePartial: true})`; capped at `MAX_RECOVERIES_PER_SWEEP`. Runs inside the existing recovery pass before legacy recovery.
- `PurgeClosedBefore(lookbackCutoff, 500)` each pass.

- [ ] Tests (done-when row 9): Pending closed session with shards assembled as Partial; stale Assembling re-claimed (staleBefore passed); fresh Assembling not claimed. Implement, pass, commit.

### Task 10: Browser encoder + recorder + service (ng-conversations)

**Files (create under `packages/Angular/Generic/conversations/src/lib/services/recording/`):** `linear-resampler.ts`, `opus-packet-encoder.ts` (interface + `SelectOpusPacketEncoder`), `webcodecs-opus-encoder.ts`, `wasm-opus-encoder.ts` (Worker wrapper), `libopus-worker-source.ts` (worker JS source string with loader + 960-sample framing + float→int16), `libopus-wasm-binary.ts` (generated base64 of `@evan/opus` `wasm/opus.wasm`, MIT/BSD notice), `scripts/embed-libopus-wasm.mjs` (generator). Modify `realtime-audio-recorder.ts`, `browser-realtime-media-host.ts`, `realtime-session.service.ts`; delete `browser-recording-unload-guard.ts` and its test.

**Produces:**
```ts
export interface IOpusPacketEncoder { readonly Kind: 'webcodecs' | 'wasm'; Encode(pcm48k: Float32Array): void; Flush(): Promise<void>; TakePackets(): Uint8Array[]; Close(): void }
export async function SelectOpusPacketEncoder(env?: OpusEncoderEnvironment): Promise<IOpusPacketEncoder>;
export class LinearResampler { constructor(fromRate: number, toRate: number); Process(input: Float32Array): Float32Array }
```
Recorder: `new AudioContext({ sampleRate: 48000 })` (fallback to default + resampler when refused or when the context reports another rate), capture node forwards frames → resampler → encoder, counts captured samples; `TakeEncodedPackets()` → `encoder.TakePackets()`; `Stop()` → `encoder.Flush()` → captured; WASM encoder loaded via a justified dynamic `import('./libopus-wasm-binary')` (bundle-size deferral, category 3). Service: `pagehide` → `SendRecordingTerminal()`; `visibilitychange` when `document.visibilityState === 'hidden'` → `SendRecordingTerminal()`; no `beforeunload`.

- [ ] Tests (done-when rows 4-5): WebCodecs selected when `isConfigSupported` true, WASM otherwise; WASM worker source run in node against the real wasm → `ParseRecordingShard`-able shards (via runtime window) that libopus decodes to input length ±960; fake `AudioEncoder` path produces the same wire format; pagehide/visibility handlers call `SendRecordingTerminal` only, no `indexedDB.open`, no encoder `Encode`/`Flush`; guard file gone, no `beforeunload` listener.
- [ ] Implement, pass node + dom projects, build, commit.

### Task 11: Guide, changeset, verification, live smoke

- [ ] `guides/REALTIME_CO_AGENTS_GUIDE.md` step 6; `.changeset/*.md` (`minor`) listing touched packages.
- [ ] Fresh runs: `pnpm test` in RealtimeRuntime, ng-conversations, MJServer, AI/Agents, AI/CorePlus; builds; lint; `npm run check:standards`, `check:changeset`, `check:codegen-tail`; `pnpm run test:integration`.
- [ ] Live in slot e1 (`:4511` / `:4611`): restart API, Chromium with fake mic, live client-direct session; scenarios (a)-(d) and the legacy recovery smoke; record outcomes.
