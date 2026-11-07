# Gemini Live Reconnect Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Gemini Live voice call keeps its conversation across the 10-minute reconnect: the model continues from the last turn, with no greeting and no restart, in the same agent session.

**Architecture:** A pure, provider-neutral notebook (`RealtimeConversationMemory` in `@memberjunction/ai`) records every final turn the model saw. The Gemini browser driver (and the server-side Gemini session, as the second adapter) seeds the notebook onto the new connection with one `sendClientContent({ turns, turnComplete: false })` right after `setupComplete` and before any held mic audio. The server tells the browser the connection lifetime in the mint pact, and the driver arms a planned move at 540 s through the existing `RealtimeSessionResumption.ConnectionEnding()` so most reconnects happen at a turn boundary; Google's 1011 at 600 s stays the fallback.

**Tech Stack:** TypeScript, pnpm workspace, Vitest with fake timers, `@google/genai` Live API (`sendClientContent`), existing test fakes `MultiConnectionClient` / `FakeGeminiSession`.

**Spec:** `docs/superpowers/specs/2026-11-06-gemini-live-reconnect-memory-design.md`

## Global Constraints

- No `any`, no `as any`, no `unknown` as a shortcut. PascalCase public members, camelCase private members, SCREAMING_SNAKE constants.
- `@memberjunction/ai-realtime-client` must not import `@memberjunction/ai-gemini`; the mint pact (`SessionConfig`) is the only way a provider fact reaches the browser driver.
- No change to what the ephemeral token locks (`BuildConstraintConfig`) or to `BuildConnectConfig`.
- Seeding never triggers generation: always `turnComplete: false`, always before held mic audio.
- Seed failure is non-fatal and never silent: `OnError({ Code: 'resume-seed-failed', Fatal: false })` plus a `RealtimeDiagLog` line.
- Defaults: `REALTIME_MEMORY_MAX_SEED_CHARS = 24_000`, `REALTIME_MEMORY_MAX_ENTRY_CHARS = 2_000`, `GEMINI_PLANNED_MOVE_MARGIN_SECONDS = 60`, `GEMINI_LIVE_CONNECTION_SECONDS = 600` (exists).
- Branch: `fix/6403-gemini-live-reconnect-memory` cut from `origin/next`, pushed with `git push -u origin fix/6403-gemini-live-reconnect-memory` (never tracking `next`). Stage files explicitly; never `git add -A`.
- Definition of done: unit tests of the three touched packages pass, `pnpm run test:integration` passes, `pnpm run check:guards` passes, the live smoke (Task 6) passes on desktop Chrome and iPhone Safari, one `patch` changeset lists every touched package.

## Review Focus

1. A reconnect before anyone has spoken (empty notebook): no `sendClientContent` goes out and the resume behaves exactly as today. (Task 2 test "an empty notebook seeds nothing".)
2. A turn cut mid-stream by the close: its partial text is finalized first and therefore IS in the seed, so the model does not lose the half-sentence. (Task 2 test "the cut-off partial transcript is in the seed".)
3. A second drop in the same call reseeds the FULL notebook, not "since the last resume" — Google restores an empty session each time. (Task 2 test "a second drop reseeds the full ledger".)
4. A planned move must happen once per connection, not once per call: a 25-minute call moves at 9, 18 and 27 minutes, and the timer never fires after `Disconnect`. (Task 3 tests "arms again on the new connection" and "no move after Disconnect".)
5. A context note queued during the move must land AFTER the seed, so the history stays in order. (Task 2 test "the seed precedes queued sends".)

---

### Task 1: `RealtimeConversationMemory` in `@memberjunction/ai`

**Files:**
- Create: `packages/AI/Core/src/generic/realtimeConversationMemory.ts`
- Modify: `packages/AI/Core/src/index.ts:33` (add `export * from './generic/realtimeConversationMemory';` beside the resumption export)
- Test: `packages/AI/Core/src/__tests__/realtimeConversationMemory.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2 and 4):

```ts
export const REALTIME_MEMORY_MAX_SEED_CHARS = 24_000;
export const REALTIME_MEMORY_MAX_ENTRY_CHARS = 2_000;
export const REALTIME_MEMORY_TRUNCATED_TAIL = '…[truncated]';

export type RealtimeMemoryEntry =
    | { Kind: 'user'; Text: string }
    | { Kind: 'assistant'; Text: string }
    | { Kind: 'note'; Text: string }
    | { Kind: 'toolCall'; Name: string; ArgumentsJson: string }
    | { Kind: 'toolResult'; Name: string; OutputJson: string };

export interface RealtimeConversationMemoryOptions {
    MaxSeedChars?: number;
    MaxEntryChars?: number;
    Log?: (message: string) => void;
}

export interface RealtimeMemorySeed {
    readonly Entries: readonly RealtimeMemoryEntry[];
    readonly DroppedEntries: number;
    readonly Chars: number;
}

export class RealtimeConversationMemory {
    constructor(options?: RealtimeConversationMemoryOptions);
    public Record(entry: RealtimeMemoryEntry): void;
    public Seed(): RealtimeMemorySeed;
    public Clear(): void;
    public get Length(): number;
}
```

Entry "chars" = `Text.length`, or `Name.length + ArgumentsJson.length` / `Name.length + OutputJson.length`. Truncation applies to `Text`, `ArgumentsJson` and `OutputJson` at `Record` time (so `Seed()` is pure).

- [ ] **Step 1: Write the failing tests**

```ts
describe('RealtimeConversationMemory', () => {
    it('records entries in order and Seed returns them oldest first', () => {
        const m = new RealtimeConversationMemory();
        m.Record({ Kind: 'user', Text: 'hi' });
        m.Record({ Kind: 'assistant', Text: 'Question 1' });
        expect(m.Seed().Entries.map((e) => e.Kind)).toEqual(['user', 'assistant']);
        expect(m.Length).toBe(2);
    });
    it('ignores blank text', () => { /* Record({Kind:'user', Text:'  '}) → Length 0 */ });
    it('truncates a long entry with the tail marker at Record time', () => {
        const m = new RealtimeConversationMemory({ MaxEntryChars: 10 });
        m.Record({ Kind: 'toolResult', Name: 'lookup_order', OutputJson: 'x'.repeat(50) });
        const e = m.Seed().Entries[0];
        expect(e.Kind === 'toolResult' && e.OutputJson.endsWith(REALTIME_MEMORY_TRUNCATED_TAIL)).toBe(true);
        expect(e.Kind === 'toolResult' && e.OutputJson.length).toBe(10 + REALTIME_MEMORY_TRUNCATED_TAIL.length);
    });
    it('drops the oldest whole entries when the seed cap is exceeded and counts them', () => {
        const m = new RealtimeConversationMemory({ MaxSeedChars: 12 });
        m.Record({ Kind: 'user', Text: 'aaaaa' });      // 5
        m.Record({ Kind: 'assistant', Text: 'bbbbb' }); // 5
        m.Record({ Kind: 'user', Text: 'ccccc' });      // 5 → only the newest two fit
        const seed = m.Seed();
        expect(seed.Entries.map((e) => (e as { Text: string }).Text)).toEqual(['bbbbb', 'ccccc']);
        expect(seed.DroppedEntries).toBe(1);
        expect(seed.Chars).toBe(10);
    });
    it('Seed is pure and Clear empties the ledger', () => { /* Seed twice equal; Clear → Length 0, Seed().Entries [] */ });
    it('uses the default caps', () => { /* REALTIME_MEMORY_MAX_SEED_CHARS 24_000, REALTIME_MEMORY_MAX_ENTRY_CHARS 2_000 */ });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/AI/Core && pnpm vitest run src/__tests__/realtimeConversationMemory.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the class and the export**

`Seed()`: walk entries newest→oldest, accumulate chars, stop at the first entry that would exceed `MaxSeedChars`; everything older is dropped. Log one line per `Seed()` with entries/chars/dropped when `Log` is given.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/AI/Core && pnpm vitest run src/__tests__/realtimeConversationMemory.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Build and commit**

Run: `cd packages/AI/Core && pnpm run build` — Expected: no TypeScript errors.

```bash
git add packages/AI/Core/src/generic/realtimeConversationMemory.ts packages/AI/Core/src/index.ts packages/AI/Core/src/__tests__/realtimeConversationMemory.test.ts
git commit -m "feat(ai): RealtimeConversationMemory, the notebook a Gemini Live resume reseeds from (MJ#6403)"
```

---

### Task 1b: `RealtimeSessionResumption` — turn-end moves and handle-optional reconnects

**Files:**
- Modify: `packages/AI/Core/src/generic/realtimeSessionResumption.ts` — options interface (~top), `RecordHandle` (~152), `TurnEnded` (~183), `ConnectionEnding` (~194), `ConnectionLost` (~211), `startReconnect` (~230), `attempt` (~246)
- Test: `packages/AI/Core/src/__tests__/realtimeSessionResumption.test.ts` (existing; add two `describe`s)

**Interfaces:**
- Produces (used by Tasks 2, 3, 4):
  - `RealtimeSessionResumptionOptions.ResumableAtTurnEnd?: boolean` (default `false`): when `true`, `ConnectionEnding` moves at once if no turn is open; `TurnEnded()` starts the move when an ending was announced and no reconnect is running; `RecordHandle` stores the handle but never gates the move.
  - `RealtimeSessionResumptionOptions.RequiresHandle?: boolean` (default `true`): when `false`, `ConnectionLost()` returns `true` with no handle, `startReconnect`/`attempt` proceed, and `Reconnect` is called with `null`.
  - `RealtimeSessionResumptionOptions.Reconnect: (handle: string | null, attempt: RealtimeResumeAttempt) => Promise<void>` (type widened; existing callers compile because they only read `handle`).
  - Default mode (both options at their defaults) is behaviour-identical: the existing tests in this file and "h1 predates the answer…" in the driver test must not change.

- [ ] **Step 1: Write the failing tests**

```ts
describe('ResumableAtTurnEnd', () => {
    it('moves at once on ConnectionEnding when no turn is open, with the stored handle', () => { /* RecordHandle('h1', true); TurnStarted(); TurnEnded(); ConnectionEnding(60_000) → Reconnect called with 'h1' before any timer */ });
    it('waits for TurnEnded when a turn is open, then moves', () => { /* TurnStarted(); ConnectionEnding(60_000); advance 1 s → not called; TurnEnded() → called */ });
    it('moves at the deadline when the turn never ends', () => { /* TurnStarted(); ConnectionEnding(60_000); advance 50_000 → called ('connection-ending') */ });
    it('does not move at TurnEnded when no ending was announced', () => { /* TurnEnded() alone → not called */ });
});
describe('RequiresHandle: false', () => {
    it('ConnectionLost reconnects without a handle and passes null', () => { /* no RecordHandle; ConnectionLost() === true; Reconnect(null, attempt) */ });
    it('ConnectionEnding without a handle also moves', () => { /* ResumableAtTurnEnd + RequiresHandle false; ConnectionEnding(60_000) → Reconnect(null) */ });
    it('default mode still refuses without a handle', () => { /* ConnectionLost() === false */ });
});
```

- [ ] **Step 2: Run to verify they fail** — `cd packages/AI/Core && pnpm vitest run src/__tests__/realtimeSessionResumption.test.ts -t "ResumableAtTurnEnd|RequiresHandle"` — Expected: FAIL (option unknown / Reconnect not called).

- [ ] **Step 3: Implement** the two options as described in Interfaces. In `TurnEnded()`: `this._turnOpen = false; if (this.options.ResumableAtTurnEnd && this._endingAnnounced) this.startReconnect('connection-ending');`. In `ConnectionEnding`: the immediate-move condition becomes `(this.options.ResumableAtTurnEnd ? !this._turnOpen : this._resumableNow) && (this._handle || !this.requiresHandle)`. In `ConnectionLost`, `startReconnect`, `attempt`: replace `!this._handle` guards with `(this.requiresHandle && !this._handle)`.

- [ ] **Step 4: Run the whole file** — `cd packages/AI/Core && pnpm test` — Expected: PASS, no existing test modified.

- [ ] **Step 5: Build and commit**

```bash
git add packages/AI/Core/src/generic/realtimeSessionResumption.ts packages/AI/Core/src/__tests__/realtimeSessionResumption.test.ts
git commit -m "feat(ai): RealtimeSessionResumption can move at turn end and reconnect without a handle (MJ#6403)"
```

---

### Task 2: The browser driver records and seeds on resume

**Files:**
- Modify: `packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts` — `Connect` (~439), `Disconnect` (~666), `SendText` (~720), `SendContextNote` (~813), `SendToolResult` (~858), `handleToolCallFrame` (~1651), `finalizeUserTranscript` (~1750), `finalizeAssistantTranscript` (~1759), `handleResumed` (~1311), `resumeSession` (~1212), `createResumption` (~1297)
- Test: `packages/AI/RealtimeClient/src/__tests__/gemini-client-session-resumption.test.ts` (new `describe('conversation memory across a resume')`)

**Interfaces:**
- Consumes: Task 1's `RealtimeConversationMemory`, `RealtimeMemoryEntry`, `RealtimeMemorySeed`; Task 1b's `ResumableAtTurnEnd` / `RequiresHandle` options and nullable `Reconnect` handle.
- Produces: driver-private
  - `createResumption()` passes `ResumableAtTurnEnd: true, RequiresHandle: false`.
  - `resumeSession(handle: string | null, attempt)`: with `null`, `resumeTarget.Config` is `target.Config` unchanged (no `handle` key); otherwise as today.
  - `private memory: RealtimeConversationMemory` (new instance in `Connect` via `resetForConnect`, `Clear()` in `Disconnect`)
  - `private seedConversation(session: GeminiLiveClientSession): void`
  - `private static renderSeed(seed: RealtimeMemorySeed): Content[]`
  - `public static readonly RESUME_SEED_PREAMBLE(dropped: number): string` is NOT public — keep it a module-level `function ResumeSeedPreamble(dropped: number): string` in the same file. Exact copy: `[Connection resumed. Transcript so far, for continuity; ${dropped} earlier entries omitted. Continue exactly where the conversation left off. Do not greet again and do not restart. If you already remember this conversation, this is the same one.]` — when `dropped === 0` omit the "; … omitted" clause.
  - Error code string: `'resume-seed-failed'`.

Recording rules (spec §3.1): `SendText` → `user`; `SendContextNote` → `note`; `SendToolResult(callID, outputJson)` → `toolResult` with the name looked up from the pending call (the driver already maps call ids to names for `sendToolResponse`); `handleToolCallFrame` → one `toolCall` per function call (`ArgumentsJson = JSON.stringify(args ?? {})`); `finalizeUserTranscript` → `user`; `finalizeAssistantTranscript` → `assistant` only when `activeResponseKind === 'normal'` (narration and thought turns never recorded). `RequestSpokenUpdate` is not recorded.

Rendering rules (spec §3.2): preamble first as `{ role: 'user', parts: [{ text }] }`; `user`/`note` → role `user`; `assistant` → role `model`; `toolCall` → role `model`, text `[called ${Name} ${ArgumentsJson}]`; `toolResult` → role `user`, text `[${Name} returned ${OutputJson}]`; adjacent same-role entries merge into one `Content` with several text parts. Text parts only.

`handleResumed` order after this task:
`avatarOutput?.Resumed(); emitAvatarVideoSeconds(); finalizeUserTranscript(); finalizeAssistantTranscript(); responseActive=false; interactionInProgress=false; activeResponseKind='normal'; clearSafetyBackstop(); endTurn(); seedConversation(session); connectionReady=true; setState('listening'); sendHeldMicAudio(); flushQueuedSends();`

`seedConversation`: `const seed = this.memory.Seed(); if (seed.Entries.length === 0) { log; return; } try { session.sendClientContent({ turns: renderSeed(seed), turnComplete: false }); this.openClientTurn = true; log(entries/chars/dropped) } catch (err) { this.emitError({ Message: \`Gemini Live resumed without the conversation so far: ${msg}\`, Code: 'resume-seed-failed', Fatal: false }); log }`.

- [ ] **Step 1: Write the failing tests** (in the existing file, using `client`, `emitted`, `HEARD`, `SAID`, `TURN_COMPLETE`, `TOOL_CALL`, `RESUMABLE`, `CloseOn`)

```ts
describe('conversation memory across a resume', () => {
    const firstSeed = () => client.Connections[1].Session.ClientContents[0];
    const texts = (turns: Content[] | undefined) => (turns ?? []).map((t) => `${t.role}:${(t.parts ?? []).map((p) => p.text).join('|')}`);

    it('seeds the preamble and every entry, in order, with turnComplete false, before any mic audio', async () => {
        client.EmitOn(0, RESUMABLE('h1'));
        client.EmitOn(0, HEARD('hi')); client.EmitOn(0, SAID('Question 1')); client.EmitOn(0, TURN_COMPLETE);
        client.SendText('typed answer');
        client.SendContextNote('note');
        client.EmitOn(0, TOOL_CALL('c1')); client.SendToolResult('c1', '{"ok":true}');
        client.EmitOn(0, HEARD('more')); client.EmitOn(0, SAID('Question 2')); client.EmitOn(0, TURN_COMPLETE);
        client.CloseOn(0, 1011);
        await vi.advanceTimersByTimeAsync(0);
        const seed = firstSeed();
        expect(seed.turnComplete).toBe(false);
        expect(texts(seed.turns)).toEqual([
            'user:[Connection resumed. Transcript so far, for continuity. Continue exactly where the conversation left off. Do not greet again and do not restart. If you already remember this conversation, this is the same one.]|hi',
            'model:Question 1',
            'user:typed answer|note',
            'model:[called lookup_order {}]',
            'user:[lookup_order returned {"ok":true}]|more',
            'model:Question 2',
        ]);
        // audio released after the seed: the fake records calls in order
        expect(client.Connections[1].Session.ClientContents).toHaveLength(1);
        expect(client.Connections[1].Session.RealtimeInputs.length).toBeGreaterThanOrEqual(0); // see Step 1b
    });
    it('an empty notebook seeds nothing', async () => { /* RESUMABLE, CloseOn(0,1011) → ClientContents [] and state 'listening' */ });
    it('the cut-off partial transcript is in the seed', async () => { /* SAID('Half a sen') without TURN_COMPLETE; close → seed contains 'model:Half a sen' */ });
    it('narration and thought turns are not in the seed', async () => { /* RequestSpokenUpdate path produces Kind narration — assert absent; a thought part (see ~1595) — assert absent */ });
    it('a 1011 with no handle recorded resumes and seeds instead of ending the call', async () => { /* no RESUMABLE; HEARD/SAID/TURN_COMPLETE; CloseOn(0, 1011) → Connections[1] exists, its Args.Config.sessionResumption has no handle, ClientContents[0] is the seed, no fatal error */ });
    it('drops the oldest entries past the cap and says so in the preamble', async () => { /* connectAnother({ … }) is not needed: construct with 60 turns of 1_000 chars → preamble contains 'earlier entries omitted' and DroppedEntries > 0 */ });
    it('a failing seed is a non-fatal error and the resume still completes', async () => {
        client.EmitOn(0, RESUMABLE('h1')); client.EmitOn(0, HEARD('hi')); client.EmitOn(0, TURN_COMPLETE);
        client.HangNextConnect = false;
        client.CloseOn(0, 1011);
        await vi.advanceTimersByTimeAsync(0);
        // make the NEW session throw on sendClientContent before setup confirms (see Step 1b)
        expect(emitted.errors.some((e) => e.Code === 'resume-seed-failed' && e.Fatal === false)).toBe(true);
        expect(emitted.states.at(-1)).toBe('listening');
    });
    it('a second drop reseeds the full ledger', async () => { /* two closes; Connections[2].Session.ClientContents[0] has all entries from both connections */ });
    it('the seed precedes queued sends', async () => { /* SendContextNote while the old socket is closed → on connection 1, ClientContents[0] is the seed and [1] is the note */ });
    it('Disconnect clears the notebook', async () => { /* Disconnect(); Connect again; close → no seed */ });
});
```

- [ ] **Step 1b: Extend the fakes only as the tests above need**

In `packages/AI/RealtimeClient/src/__tests__/helpers/realtime-fakes.ts`: give `FakeGeminiSession` a `public ThrowOnClientContent: Error | null = null` honoured by `sendClientContent`, and a `public Calls: Array<'clientContent' | 'realtimeInput'>` appended by both send methods so a test can assert the seed came before the first audio. Add `errors` and `states` to `CollectedEmissions` if `collect()` does not already gather them (check first; it may).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/AI/RealtimeClient && pnpm vitest run src/__tests__/gemini-client-session-resumption.test.ts -t "conversation memory"`
Expected: FAIL — `ClientContents[0]` undefined / preamble missing.

- [ ] **Step 3: Implement the recording, rendering and `seedConversation` as specified in Interfaces**

- [ ] **Step 4: Run the whole file, then the package**

Run: `cd packages/AI/RealtimeClient && pnpm vitest run src/__tests__/gemini-client-session-resumption.test.ts` — Expected: PASS, including the pre-existing test "ends the cut-off turn and sends queued messages on the new connection" (its `ClientContents` count changes from 1 to 2 — the seed now precedes the queued note; update that assertion to `[seed, note]`) and "keeps the old behavior with no handle: an abnormal close is fatal" — which is now the opposite by design: rename it to "resumes without a handle" and assert a second connection and no fatal error (the handle-less case above covers the seed).
Run: `cd packages/AI/RealtimeClient && pnpm test` — Expected: PASS.

- [ ] **Step 5: Build and commit**

Run: `cd packages/AI/RealtimeClient && pnpm run build` — Expected: no errors.

```bash
git add packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts packages/AI/RealtimeClient/src/__tests__/gemini-client-session-resumption.test.ts packages/AI/RealtimeClient/src/__tests__/helpers/realtime-fakes.ts
git commit -m "fix(realtime-client): reseed the conversation on a Gemini Live resume (MJ#6403)"
```

---

### Task 3: Planned move before Google's 10-minute cut

**Files:**
- Modify: `packages/AI/Providers/Gemini/src/geminiRealtime.ts` — constants (~122-125), `CreateClientSession` uses (~379), `SessionPactFor` (~428)
- Modify: `packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts` — `GeminiParsedSessionConfig` + `parseSessionConfig` (~996), `useConnection`, `Disconnect`, next to the `goAway` handling (~1182)
- Test: `packages/AI/Providers/Gemini/src/__tests__/geminiRealtime.test.ts` (client-direct describe, ~100-180)
- Test: `packages/AI/RealtimeClient/src/__tests__/gemini-client-session-resumption.test.ts` (new `describe('planned move before the connection lifetime')`)

**Interfaces:**
- Produces (server): pact field `connectionLifetimeSeconds: number` in `SessionPactFor` = `GEMINI_LIVE_CONNECTION_SECONDS`; new `const GEMINI_PLANNED_MOVE_MARGIN_SECONDS = 60`; token uses become `Math.ceil(capSeconds / (GEMINI_LIVE_CONNECTION_SECONDS - GEMINI_PLANNED_MOVE_MARGIN_SECONDS)) + GEMINI_CLIENT_TOKEN_RESUME_MARGIN`.
- Produces (driver): `GeminiParsedSessionConfig.connectionLifetimeSeconds?: number` (a positive finite number, else `undefined`); `const REALTIME_PLANNED_MOVE_MARGIN_MS = 60_000`; `private plannedMoveTimer: ReturnType<typeof setTimeout> | null`; `private armPlannedMove(): void` called whenever a connection becomes the one in use (first connect and every `useConnection`), `private clearPlannedMove(): void` on every swap and in `Disconnect`. When the timer fires: `this.resumption?.ConnectionEnding(REALTIME_PLANNED_MOVE_MARGIN_MS)`. The driver never imports the provider package; the number travels in the pact.

- [ ] **Step 1: Write the failing provider test**

```ts
it('tells the browser the connection lifetime and budgets one token use per planned move', async () => {
    const cfg = await driver.CreateClientSession(makeParams({ MaxSessionSeconds: 1800 }));
    expect(cfg.SessionConfig['connectionLifetimeSeconds']).toBe(600);
    expect(mintConfig?.uses).toBe(Math.ceil(1800 / 540) + 3); // 7
});
```
Update the existing assertions at ~146 and ~174-175 to the new formula.

- [ ] **Step 2: Write the failing driver tests**

```ts
describe('planned move before the connection lifetime', () => {
    it('moves at lifetime minus the margin, at a turn boundary, with the seed', async () => {
        const c = await connectAnother({ connectionLifetimeSeconds: 600 });
        c.EmitOn(0, RESUMABLE('h1')); c.EmitOn(0, HEARD('hi')); c.EmitOn(0, SAID('Q1')); c.EmitOn(0, TURN_COMPLETE);
        c.EmitOn(0, SAID('Half'));                       // a turn is open at 540 s
        await vi.advanceTimersByTimeAsync(540_000);
        expect(c.Connections).toHaveLength(1);           // waits for the turn to end
        c.EmitOn(0, TURN_COMPLETE);
        await vi.advanceTimersByTimeAsync(0);
        expect(c.Connections).toHaveLength(2);
        expect(c.Connections[1].Session.ClientContents[0].turnComplete).toBe(false);
    });
    it('moves at once when no turn is open at 540 s', async () => { /* HEARD/SAID/TURN_COMPLETE then advance 540_000 → Connections length 2 at once */ });
    it('moves at the deadline when a turn runs through the whole minute', async () => { /* SAID('long') and no TURN_COMPLETE; advance 540_000 + 50_000 → length 2; the partial 'long' is in the seed */ });
    it('arms again on the new connection (a 25-minute call moves three times)', async () => { /* advance 540 s twice more with turns closed → Connections length 3 then 4 */ });
    it('does not move when the pact carries no lifetime', async () => { /* default connectAnother(); advance 700 s → 1 connection */ });
    it('no move after Disconnect', async () => { /* Disconnect at 100 s; advance 600 s → 1 connection, no error */ });
});
```

- [ ] **Step 3: Run both test files to verify they fail**

Run: `cd packages/AI/Providers/Gemini && pnpm vitest run src/__tests__/geminiRealtime.test.ts -t "connection lifetime"` — Expected: FAIL.
Run: `cd packages/AI/RealtimeClient && pnpm vitest run src/__tests__/gemini-client-session-resumption.test.ts -t "planned move"` — Expected: FAIL.

- [ ] **Step 4: Implement the pact field, the uses formula, the parse, and the timer**

Note for the timer: `ConnectionEnding` takes the notice in ms; with `ResumableAtTurnEnd` (Task 1b, set in Task 2) the helper moves at once with no turn open, at `TurnEnded` otherwise, and at its own deadline (notice minus the 1/3 margin, clamped 1.5–10 s) as the last resort — do not re-implement any of that wait in the driver.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd packages/AI/Providers/Gemini && pnpm test` — Expected: PASS.
Run: `cd packages/AI/RealtimeClient && pnpm test` — Expected: PASS.

- [ ] **Step 6: Build and commit**

Run: `cd packages/AI/Providers/Gemini && pnpm run build && cd ../../RealtimeClient && pnpm run build` — Expected: no errors.

```bash
git add packages/AI/Providers/Gemini/src/geminiRealtime.ts packages/AI/Providers/Gemini/src/__tests__/geminiRealtime.test.ts packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts packages/AI/RealtimeClient/src/__tests__/gemini-client-session-resumption.test.ts
git commit -m "feat(realtime): planned Gemini Live move at 540 s from the mint's connectionLifetimeSeconds (MJ#6403)"
```

---

### Task 4: The server-side Gemini session as the second adapter

**Files:**
- Modify: `packages/AI/Providers/Gemini/src/geminiRealtime.ts` — `GeminiRealtimeSession`: field beside `live` (~1304), `emitTranscript` (~2337, record final `user`/`assistant` of kind normal), `SendContextNote` (~1958), `handleToolCall` (~2357) and the tool-response path (~1896), the `RealtimeSessionResumption` construction (~1485: pass `ResumableAtTurnEnd: true, RequiresHandle: false`), `resume(handle: string | null, …)` (~1810: `openConnection(handle ?? undefined)`), `handleResumed` (~1830: `seedConversation(live)` before `sendHeldAudio()`), close/teardown (`Clear()`).
- Test: `packages/AI/Providers/Gemini/src/__tests__/geminiRealtime.resume-seed.test.ts` (new); `geminiRealtime.resumption.test.ts` (existing — keep green; add one case: a close with no handle resumes)

**Interfaces:**
- Consumes: Task 1. Same rendering rules and preamble copy as Task 2 — to avoid two copies, move `ResumeSeedPreamble(dropped)` and the entry→`{role, text}` rendering (provider-neutral: roles `'user' | 'model'` as strings, text parts) into `realtimeConversationMemory.ts` as `export function RenderRealtimeMemorySeed(seed: RealtimeMemorySeed): ReadonlyArray<{ Role: 'user' | 'model'; Texts: readonly string[] }>`; both drivers map that to `Content`. Do this move in this task and update Task 2's driver to call it (its tests stay green).
- Produces: `private seedConversation(live: GeminiLiveSession): void` on `GeminiRealtimeSession`; the error goes through `this.errorHandler?.({ Message, Code: 'resume-seed-failed', Fatal: false })`.

- [ ] **Step 1: Write the failing test** with a fake `GeminiLiveSession` (records `sendClientContent` calls, `sendRealtimeInput`, `close`) installed through `session.SetConnector((handle, callbacks) => …)`; drive `callbacks` with `setupComplete`, a `sessionResumptionUpdate`, `inputTranscription`/`outputTranscription` with `finished: true`, `turnComplete`, then the connection's close with code 1011; assert the second fake's first `sendClientContent` has `turnComplete: false`, preamble then `user:hi`, `model:Question 1`; assert it precedes the first `sendRealtimeInput` on the second fake; a second test makes `sendClientContent` throw and asserts a non-fatal error with code `'resume-seed-failed'` and that held audio still goes out.

- [ ] **Step 2: Run it to verify it fails** — `cd packages/AI/Providers/Gemini && pnpm vitest run src/__tests__/geminiRealtime.resume-seed.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** (move the renderer to Core, use it from both drivers, add recording and seeding to the server session).

- [ ] **Step 4: Run all three packages' tests** — `pnpm test` in `packages/AI/Core`, `packages/AI/RealtimeClient`, `packages/AI/Providers/Gemini` — Expected: PASS.

- [ ] **Step 5: Build and commit**

```bash
git add packages/AI/Core/src/generic/realtimeConversationMemory.ts packages/AI/Core/src/__tests__/realtimeConversationMemory.test.ts packages/AI/RealtimeClient/src/drivers/geminiRealtimeClient.ts packages/AI/Providers/Gemini/src/geminiRealtime.ts packages/AI/Providers/Gemini/src/__tests__/geminiRealtime.resume-seed.test.ts
git commit -m "fix(ai-gemini): the server-side Gemini session reseeds the conversation on resume (MJ#6403)"
```

---

### Task 5: Repo gates and changeset

**Files:**
- Create: `.changeset/gemini-live-reconnect-memory.md`

- [ ] **Step 1: Write the changeset** (`patch` for `@memberjunction/ai`, `@memberjunction/ai-realtime-client`, `@memberjunction/ai-gemini`; one paragraph: a Gemini Live call keeps its conversation across the 10-minute reconnect — the driver reseeds every final turn on the new connection, moves at 540 s at a turn boundary, and resumes even when Google issued no handle; a failed seed is a non-fatal `resume-seed-failed` error).

- [ ] **Step 2: Run the gates**

Run: `pnpm run check:guards` — Expected: pass.
Run: `pnpm run check:changeset` — Expected: pass.
Run: `pnpm run check:standards` — Expected: pass (naming on the new public members).
Run: `pnpm run test:integration` — Expected: the deterministic tier passes; report pass/fail/skip counts. (Before running: confirm no other session uses this `DB_DATABASE`; the tier shares the DB.)

- [ ] **Step 3: Commit**

```bash
git add .changeset/gemini-live-reconnect-memory.md
git commit -m "chore: changeset for Gemini Live reconnect memory (MJ#6403)"
```

---

### Task 6: Live smoke test (real Gemini, past 10 minutes)

Two layers; both must pass. Nothing is "done" on unit tests alone — the bug only shows on a real 10-minute Google socket.

**Files:**
- Create: `packages/AI/RealtimeClient/scripts/smoke/gemini-reconnect-memory.mjs` (driver-level smoke, committed; it is the reproduction tool for MJ#6403 going forward)
- Create: `docs/superpowers/plans/2026-11-06-gemini-live-reconnect-memory-smoke.md` (the run log with evidence: timestamps, transcripts, screenshots paths)

**Layer A — driver-level, no browser, ~12 min.** Port the session probe (scratchpad `probe/probe.mjs`, `PROBE_SEED=1` variant, see the spec §1) into the script above, but drive the REAL built `GeminiRealtimeClient` from `dist/` instead of a hand-rolled loop: Node 20+, a fake `MediaStream`/`AudioContext` shim (reuse `FakeMediaStream`/`FakeTrack` patterns from the test helpers or a minimal shim), mint the token exactly as `CreateClientSession` does (`uses`, `liveConnectConstraints`, `lockAdditionalFields: []`) with `AI_VENDOR_API_KEY__GeminiRealtime` from `.env`, feed 16 kHz PCM utterances (`say --data-format=LEI16@16000`) every ~6 s after each `turnComplete`, and after the reconnect say "Sorry, please repeat the question. Which question number are we on, and what is my name?".

- [ ] **Step 1: Run Layer A for the planned move**: `node packages/AI/RealtimeClient/scripts/smoke/gemini-reconnect-memory.mjs --model gemini-3.8-live --minutes 12`
Expected log lines, in order: `planned move armed at 540s`; a second connection opened at ≥540 s at a turn boundary; `seeded N entries (chars C, dropped 0)`; the model's answer after the question names the SAME question number it was on before the move and the participant's name (`Alex`); no `resume-seed-failed`; no greeting ("Hello", "Am I speaking with") after the move.

- [ ] **Step 2: Run Layer A with the planned move disabled** (`--no-planned-move`, which strips `connectionLifetimeSeconds` from the pact) so Google's 1011 at ~600 s is the trigger: Expected: `CLOSED 1011` at ~600 s, then the same seeded continuation.

- [ ] **Step 3: Run Layer A once more on `gemini-3.8-live` with the Extended Thinking model id from `metadata/ai-models/.ai-models.json` ("Gemini 3.8 Live Extended Thinking")**: Expected: same outcome (thought turns are excluded from the seed; the model still continues).

**Layer B — the real interview widget, a human on the call.** Run the branch on a private MJAPI (see memory notes `mj-edge-worktree-setup`, `mj-worktree-private-api-smoke`: own worktree under `~/Projects/mj-edge/MJ/.claude/worktrees/`, `pnpm install --frozen-lockfile`, build, private `GRAPHQL_PORT`, `scheduledJobs` disabled, Explorer or the widget host on a free port). Then:

- [ ] **Step 4: Desktop Chrome.** Open an interview link against the private API; talk for ≥ 11 minutes, answering every question. At 9:00 (planned move) and/or 10:00 (Google's cut) the loading indicator may flash ≤ 1 s. Immediately after it, ask: "Which question number are we on, and what is my name?" Expected: the correct number and name; no greeting; one `AIAgentSession` row; `RecordingStatus = Complete` with `RecordingGaps = []`; the conversation details show no restart. Save the browser WebSocket trace (DevTools → Network → WS) showing the second socket's first client message is the seed.

- [ ] **Step 5: iPhone Safari.** Same call, same checks, from the phone on the same private API (LAN or tunnel). This is the device that happened to keep its memory on 2026-11-05; it must now keep it by design.

- [ ] **Step 6: Mute case (the Realmic reproduction).** Desktop again: talk for 6 minutes, then stay silent (mic muted) through 9:00 and 10:00, then unmute and ask the same question. Expected: continuation from the last question asked before the silence.

- [ ] **Step 7: Write the run log** with per-run: date/time UTC, model, trigger (planned/1011), move timestamp, seed line (entries/chars/dropped), the question-and-answer after the move, session id, `q.mjs`-style read-only SQL evidence for the session row and the last three conversation details. Attach the DevTools trace path.

- [ ] **Step 8: Commit the script and the log**

```bash
git add packages/AI/RealtimeClient/scripts/smoke/gemini-reconnect-memory.mjs docs/superpowers/plans/2026-11-06-gemini-live-reconnect-memory-smoke.md
git commit -m "test(realtime-client): live smoke for Gemini Live reconnect memory (MJ#6403)"
```

If any run fails: do not patch around it. Record the log, return to the spec's §7 fallback (the `systemInstruction` addendum — the token does not lock it) only if seeded turns are ignored by that model, and say so in the PR.

---

### Task 7: Pull request

- [ ] **Step 1: Verify tracking** — `git branch -vv` shows `[origin/fix/6403-gemini-live-reconnect-memory]`.
- [ ] **Step 2: Push** — `git push -u origin fix/6403-gemini-live-reconnect-memory` (the pre-push hook runs `check:guards` and `check:standards`).
- [ ] **Step 3: Open the PR against `next`** with the `open-pr` skill. Body: the problem in two sentences (10-minute close, empty resume with the ephemeral token, Google bug), the fix in three bullets (notebook, seed before audio, planned move at 540 s), test counts per package, the integration-tier counts, and the smoke-test log link. Link MJ#6403. No applicant names.
- [ ] **Step 4: Comment on MJ#6403** with the two production call findings (one session each; Realmic restarted after silence, Umar continued) and the PR link — only after Soham approves the comment text.
