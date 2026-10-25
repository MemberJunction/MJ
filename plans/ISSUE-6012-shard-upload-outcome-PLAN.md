# MJ#6012 Shard upload outcome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The recording retry queue logs why a shard upload failed (transport/server error, thrown error, or a final server refusal) instead of "server refused the shard" for every failure, and stops retrying a shard the server refused for good.

**Architecture:** `ShardUpload` resolves the transport's existing `RecordingUploadOutcome` (`'Acked' | 'Refused' | 'Retry'`) instead of a boolean. `RecordingShardQueue.send()` picks the warn reason from the outcome and gives up on `Refused` at once. The runtime's queue lambda passes the outcome through unchanged.

**Tech Stack:** TypeScript, vitest, package `packages/RealtimeRuntime`.

**Spec:** the agent brief on issue MJ#6012 ("Design decided" and "Done when").

## Global Constraints

- Change only `packages/RealtimeRuntime`.
- Do not change `FetchRecordingTransport.post`, `PERMANENT_REFUSAL_STATUSES`, or the transport's log lines.
- Do not change `RecordingShardDrain.ts`.
- Do not change `MAX_SHARD_UPLOAD_ATTEMPTS`, `MAX_CONCURRENT_FLUSHES`, `MAX_RETAINED_SHARDS`, `SHARD_UPLOAD_TIMEOUT_MS`.
- Do not change the keepalive path (`trackKeepalive`, `SendRecordingTerminal`) in `RealtimeSessionRuntime.ts`.
- Reason strings: `Retry` without a throw → `transport or server error; will be retried`; thrown error → `describeFailure(error)`; `Refused` → `server refused the shard for good`.
- No console warn in `src` may contain `server refused the shard` except on the `Refused` path.

## Review Focus

- A `Refused` shard on the last attempt (Attempts already 2): must still go through the refusal path, not the "after 3/3 failed uploads" path. Covered: refusal branch is checked before the attempts cap.
- A `Refused` outcome after `Close()`: the closed branch still wins (no `onGivenUp` after Close). Test in Task 1.
- A timeout (thrown `upload timed out`) keeps `describeFailure` text; existing timeout test already pins this.
- Retry give-up line on a dead network must not contain `refused`. Test in Task 1.
- No transport in the runtime returns `'Retry'` (shards stay in store, retried). Existing runtime tests cover the no-transport path.

---

### Task 1: Queue consumes the upload outcome

**Files:**
- Modify: `packages/RealtimeRuntime/src/session/RecordingShardQueue.ts` (fileoverview, `ShardUpload`, `uploadWithTimeout`, `send`)
- Modify: `packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts` (queue lambda in the recording start path only)
- Test: `packages/RealtimeRuntime/src/__tests__/RecordingShardQueue.test.ts`, `packages/RealtimeRuntime/src/__tests__/RecordingShardQueue.outcome.test.ts`

**Interfaces:**
- Produces: `export type ShardUpload = (shard: RecordingShard) => Promise<RecordingUploadOutcome>;` (type imported from `./RecordingTransport`).

- [ ] **Step 1: Update tests to the new contract (failing)**
  - `recordingUpload`'s `outcome` callback returns `RecordingUploadOutcome | Error`, default `'Acked'`. Replace `true` → `'Acked'`, `false` → `'Retry'` across existing tests (including hand-written uploads and `createDeferred<boolean>` → `createDeferred<RecordingUploadOutcome>`). Rename the "refused" test names that now expect retries to say "failed".
  - Repro file: change the lambda to `(s) => transport.UploadShard('session-1', s)`.
  - New test `gives up on a shard the server refused for good after one attempt`: upload resolves `'Refused'`; after `Flush([shardOf(0)])` and two `Flush([])`: calls for index 0 = 1, `Unacknowledged()` = `[]`, `RetainedCount` 0, `gaveUp` called once with `[0]`, a warn contains `refused` and `will not be re-sent`.
  - New test `a Retry outcome is retried up to MAX_SHARD_UPLOAD_ATTEMPTS and no warn says refused`: always `'Retry'`; calls = 3; no warn includes `refused`; the drop warn contains `transport or server error`.
  - New test `a throwing upload is retried up to MAX_SHARD_UPLOAD_ATTEMPTS and the warn carries the thrown message`: throws `new Error('socket hang up')`; calls = 3; every queue warn includes `socket hang up`.
  - New test `a Refused outcome after Close is not reported as given up`: hold an upload, Close, resolve `'Refused'`; `gaveUp` not called.
- [ ] **Step 2:** Run `npx vitest run src/__tests__/RecordingShardQueue` from `packages/RealtimeRuntime`. Expected: the refused / repro tests FAIL.
- [ ] **Step 3: Implement** in `RecordingShardQueue.ts`: `uploadWithTimeout(): Promise<RecordingUploadOutcome>`; `send()` sets `outcome` to `'Retry'` and `failure` to the thrown error on a catch; `'Acked'` deletes from outstanding and returns; closed branch unchanged; then a `'Refused'` branch (delete from outstanding, warn, `onGivenUp([shard])`, return) before the attempts cap. Update `@fileoverview` and `ShardUpload` doc comment. Runtime lambda: return `'Retry'` with no transport, otherwise return the outcome; ack side effects only on `'Acked'`.
- [ ] **Step 4:** Run the queue tests again. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 2: Runtime sends a refused shard once from the queue

**Files:**
- Test: `packages/RealtimeRuntime/src/__tests__/RealtimeSessionRuntime.recording.test.ts`

- [ ] **Step 1:** Widen `startRecorded`'s `script` parameter to `FakeUploadOutcome[]`. Add test `sends a shard the server refused for good once from the queue, and the recovery drain still clears it from the store`: `startRecorded(['refused'])`; `Capture(WINDOW - 2)`, advance `FLUSH_MS` three times; expect uploads of index 0 = 1 (on next it is 3). Then `Capture(WINDOW - 2)`, advance `FLUSH_MS`; expect `store.Keys` = `[]` (shard 1's ack triggers the recovery drain, which re-sends shard 0 and deletes it).
- [ ] **Step 2:** Run against Task 1's code; expected PASS (and FAIL if the queue still retries `Refused`; confirm by checking the count assertion on `next` behavior by reasoning: three queue attempts).
- [ ] **Step 3:** Commit.

### Task 3: Verify

- [ ] `npx vitest run` and `pnpm run build` in `packages/RealtimeRuntime`; lint the changed files; grep `src` for `server refused the shard` and confirm only the `Refused` branch has it.
