# Pair User Speech Onset with Transcript by ItemId Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pair each user speech onset (`input_audio_buffer.speech_started`) with its own user transcript (`conversation.item.input_audio_transcription.completed`) by the OpenAI-protocol `item_id` so late user transcripts never steal a later turn's start offset in recorded calls.

**Architecture:** `BaseRealtimeClient` and `OpenAIProtocolRealtimeClient` forward the provider's `item_id` on `OnUserSpeechStart(itemId?: string)` and attach `ItemId?: string` to emitted user `RealtimeClientTranscript` events (including xAI's streamed repeats and empty-transcript pass-throughs). `RealtimeSessionRuntime` stores keyed speech onsets in a `Map<string, number>` alongside the existing single-slot fallback, consumes and deletes the matching entry when a keyed user final arrives, and prunes any unclaimed earlier map entries to bound the map against VAD false positives.

**Tech Stack:** TypeScript, Vitest, `@memberjunction/ai-realtime-client`, `@memberjunction/realtime-runtime`

**Spec:** `https://github.com/MemberJunction/MJ/issues/5902` (approved brief in run overlay)

## Global Constraints

- Never use `any` or `unknown` as lazy type escapes.
- Do not change the server-side realtime drivers in `packages/AI/Providers/OpenAI`, `packages/AI/Providers/xAI`, or `packages/AI/Providers/HuggingFace`.
- Do not change the `RelayRealtimeTranscript` mutation, its resolver, or how the server stores `UtteranceStartMs`.
- Do not change the single-slot behaviour (`userSpeechStartMs`, `userSpeechStartSuperseded`) for a user final that carries no `ItemId`.
- Do not change `markTurnAudioStart` or how assistant turns take their start from `currentTurnStartMs`.
- Do not change `IsTranscriptContinuation` or the xAI `ReplacesPrevious` collapsing logic beyond adding `ItemId` to the emitted transcripts.
- Every existing test in `packages/RealtimeRuntime/src/__tests__/RealtimeSessionRuntime.turn-timing.test.ts` must pass with no changed expectation (only `FakeFinalOnlyClient.SpeechStart` gains an optional `itemId?: string` parameter, already committed in the repro commit).
- Rebuild `packages/AI/RealtimeClient` before running `packages/RealtimeRuntime` tests so `@memberjunction/ai-realtime-client/dist` is current.

## Review Focus

1. **Mid-sentence pause with the same `item_id`:** A second `speech_started` carrying an `item_id` already present in `userSpeechStartByItemId` must keep the first onset ms and ignore the later offset. (Pinned by test in Task 2.)
2. **Keyed user final whose `ItemId` has no map entry:** Must relay `utteranceStartMs: null` without reading or clearing `userSpeechStartMs` and without falling back to `currentTurnStartMs` (leaving an in-flight assistant turn's start intact). (Pinned by test in Task 2.)
3. **Unclaimed VAD false-positive entry in the map:** When a keyed `speech_started` (`item-cough` at 8000 ms) never receives a transcript and a later keyed user turn (`item-real` at 20000 ms) is relayed, `item-cough` (onset < 20000 ms) must be deleted from the map so the map stays bounded. (Pinned by test in Task 2.)
4. **Keyed correction (`ReplacesPrevious: true` with `ItemId`):** Deletes the `ItemId` entry from the map and relays `utteranceStartMs: null`. (Pinned by test in Task 2.)
5. **xAI empty user transcription with `item_id`:** Passes `itemId` through `super.onUserTranscriptFrame(transcript ?? '', itemId)` so the empty final transcript carries `ItemId`, and `onClientTranscript` releases that `ItemId`'s map entry without clearing the single slot. (Pinned by tests in Task 1 and Task 2.)

---

### Task 1: Forward `item_id` on `OnUserSpeechStart` and `RealtimeClientTranscript.ItemId` in `@memberjunction/ai-realtime-client`

**Files:**
- Modify: `packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts:63-95,291-301,799-808,897-901`
- Modify: `packages/AI/RealtimeClient/src/generic/openAIProtocolClient.ts:53-56,293-302,588-600`
- Modify: `packages/AI/RealtimeClient/src/drivers/xaiRealtimeClient.ts:149-171`
- Test: `packages/AI/RealtimeClient/src/__tests__/openai-realtime-client.test.ts`
- Test: `packages/AI/RealtimeClient/src/__tests__/xai-realtime-client.test.ts`

**Interfaces:**
- Consumes: `OAIProtocolInputTranscriptionCompleted.item_id?: string` (already declared in `openAIProtocolClient.ts:41`)
- Produces:
  - `RealtimeClientTranscript.ItemId?: string` in `baseRealtimeClient.ts`
  - `BaseRealtimeClient.OnUserSpeechStart(handler: (itemId?: string) => void): void`
  - `BaseRealtimeClient.emitUserSpeechStart(itemId?: string): void`
  - `OAIProtocolSpeechStarted.item_id?: string` in `openAIProtocolClient.ts`
  - `OpenAIProtocolRealtimeClient.onUserTranscriptFrame(transcript: string, itemId?: string): void`
  - `xAIRealtimeClient.onUserTranscriptFrame(transcript: string, itemId?: string): void`

- [ ] **Step 1: Write the failing tests in `openai-realtime-client.test.ts` and `xai-realtime-client.test.ts`**

In `packages/AI/RealtimeClient/src/__tests__/openai-realtime-client.test.ts` (inside `describe('OnInterruption — true barge-in only', ...)` after the existing `OnUserSpeechStart` tests):

```ts
        it('forwards item_id from input_audio_buffer.speech_started to OnUserSpeechStart and carries it as ItemId on the completed user transcript', () => {
            const startedIds: Array<string | undefined> = [];
            const { transcripts } = collect(client);
            client.OnUserSpeechStart((itemId) => startedIds.push(itemId));

            channel.EmitServer({ type: 'input_audio_buffer.speech_started', item_id: 'item_abc' });
            channel.EmitServer({
                type: 'conversation.item.input_audio_transcription.completed',
                transcript: 'Hello from item abc',
                item_id: 'item_abc',
            });

            expect(startedIds).toEqual(['item_abc']);
            expect(transcripts).toEqual([
                { Role: 'User', Text: 'Hello from item abc', IsFinal: true, Kind: 'normal', ItemId: 'item_abc' },
            ]);
        });
```

In `packages/AI/RealtimeClient/src/__tests__/xai-realtime-client.test.ts` (inside `describe('transcript translation', ...)`):

```ts
        it('forwards item_id to OnUserSpeechStart and sets ItemId on every emitted user transcript in a streamed utterance, including empty pass-throughs', () => {
            const startedIds: Array<string | undefined> = [];
            const { transcripts } = collect(client);
            client.OnUserSpeechStart((itemId) => startedIds.push(itemId));

            client.Emit({ type: 'input_audio_buffer.speech_started', item_id: 'item_cough' });
            client.Emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: '  ', item_id: 'item_cough' });

            client.Emit({ type: 'input_audio_buffer.speech_started', item_id: 'item_u1' });
            client.Emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'what', item_id: 'item_u1' });
            client.Emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'what is MJ?', item_id: 'item_u1' });

            expect(startedIds).toEqual(['item_cough', 'item_u1']);
            expect(transcripts).toEqual([
                { Role: 'User', Text: '  ', IsFinal: true, Kind: 'normal', ItemId: 'item_cough' },
                { Role: 'User', Text: 'what', IsFinal: true, Kind: 'normal', ReplacesPrevious: false, ItemId: 'item_u1' },
                { Role: 'User', Text: 'what is MJ?', IsFinal: true, Kind: 'normal', ReplacesPrevious: true, ItemId: 'item_u1' },
            ]);
        });
```

- [ ] **Step 2: Run the client tests to verify they fail**

Run: `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/AI/RealtimeClient && npx vitest run src/__tests__/openai-realtime-client.test.ts src/__tests__/xai-realtime-client.test.ts`
Expected: FAIL (`startedIds` receives `[undefined]` instead of `['item_abc']`, and `ItemId` is missing on emitted transcripts).

- [ ] **Step 3: Implement `item_id` / `ItemId` forwarding in `baseRealtimeClient.ts`, `openAIProtocolClient.ts`, and `xaiRealtimeClient.ts`**

1. In `packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts`:
   - Add `ItemId?: string` to `RealtimeClientTranscript` with JSDoc:
     ```ts
     /**
      * The provider's id for the conversation item a user transcript belongs to, which matches the
      * id given to {@link BaseRealtimeClient.OnUserSpeechStart} for the same utterance. Absent on
      * drivers that do not send one.
      */
     ItemId?: string;
     ```
   - Update `private userSpeechStartHandler?: (itemId?: string) => void;`
   - Update `public OnUserSpeechStart(handler: (itemId?: string) => void): void`
   - Update `protected emitUserSpeechStart(itemId?: string): void { this.userSpeechStartHandler?.(itemId); }`

2. In `packages/AI/RealtimeClient/src/generic/openAIProtocolClient.ts`:
   - Add `item_id?: string;` to `OAIProtocolSpeechStarted`.
   - Update `protected onUserTranscriptFrame(transcript: string, itemId?: string): void`:
     ```ts
     protected onUserTranscriptFrame(transcript: string, itemId?: string): void {
         this.emitTranscript({
             Role: 'User',
             Text: transcript,
             IsFinal: true,
             Kind: 'normal',
             ...(itemId !== undefined ? { ItemId: itemId } : {}),
         });
     }
     ```
   - In `handleEvent`:
     - `case 'conversation.item.input_audio_transcription.completed'`:
       ```ts
       case 'conversation.item.input_audio_transcription.completed': {
           const completed = event as OAIProtocolInputTranscriptionCompleted;
           this.onUserTranscriptFrame(completed.transcript, completed.item_id);
           break;
       }
       ```
     - `case 'input_audio_buffer.speech_started'`:
       ```ts
       case 'input_audio_buffer.speech_started':
           this.emitUserSpeechStart((event as OAIProtocolSpeechStarted).item_id);
           this.onSpeechStartedFrame();
           break;
       ```

3. In `packages/AI/RealtimeClient/src/drivers/xaiRealtimeClient.ts`:
   - Update `protected override onUserTranscriptFrame(transcript: string, itemId?: string): void`:
     - Pass `itemId` to `super.onUserTranscriptFrame(transcript ?? '', itemId)` on the empty-transcript branch.
     - Include `...(itemId !== undefined ? { ItemId: itemId } : {})` in `this.emitTranscript({ Role: 'User', Text: transcript, IsFinal: true, Kind: 'normal', ReplacesPrevious: replacesPrevious, ...(itemId !== undefined ? { ItemId: itemId } : {}) })`.

- [ ] **Step 4: Run tests and build `@memberjunction/ai-realtime-client`**

Run: `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/AI/RealtimeClient && pnpm test && pnpm run build`
Expected: PASS (all unit tests in `packages/AI/RealtimeClient` pass and `tsc && tsc-alias -f` exits 0).

- [ ] **Step 5: Commit Task 1**

Stage `packages/AI/RealtimeClient/src/generic/baseRealtimeClient.ts`, `packages/AI/RealtimeClient/src/generic/openAIProtocolClient.ts`, `packages/AI/RealtimeClient/src/drivers/xaiRealtimeClient.ts`, `packages/AI/RealtimeClient/src/__tests__/openai-realtime-client.test.ts`, and `packages/AI/RealtimeClient/src/__tests__/xai-realtime-client.test.ts`, and commit with message `feat(ai-realtime-client): forward speech_started and user transcript item_id (MJ#5902)`.

---

### Task 2: Pair user speech onsets with transcripts by `ItemId` in `@memberjunction/realtime-runtime` and add changeset

**Files:**
- Modify: `packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts:1062-1075,2354-2358,2860-2864,4091,4201-4258,4299-4315,4358-4368,4752-4799,5401-5403`
- Modify: `packages/RealtimeRuntime/src/__tests__/RealtimeSessionRuntime.turn-timing.test.ts`
- Create: `.changeset/pair-user-speech-onset-item-id.md`

**Interfaces:**
- Consumes: `BaseRealtimeClient.OnUserSpeechStart(handler: (itemId?: string) => void)` and `RealtimeClientTranscript.ItemId?: string` from Task 1.
- Produces: Keyed onset tracking in `RealtimeSessionRuntime` (`userSpeechStartByItemId: Map<string, number>`).

- [ ] **Step 1: Add edge-case unit tests to `packages/RealtimeRuntime/src/__tests__/RealtimeSessionRuntime.turn-timing.test.ts`**

Alongside the committed repro test (`gives each user turn its own onset when a transcript arrives after the next onset`), add tests in the second `describe` block of `packages/RealtimeRuntime/src/__tests__/RealtimeSessionRuntime.turn-timing.test.ts` covering the Review Focus items:

```ts
    it('keeps the first onset for an itemId when speech_started fires again for the same item after a pause', async () => {
        const { provider, client, advanceTo } = await startRecorded();
        speakAssistantTurn(client, advanceTo);

        advanceTo(8400);
        client.SpeechStart('item-a');
        advanceTo(10000);
        client.SpeechStart('item-a'); // mid-sentence resume with the same item id
        advanceTo(13000);
        client.Emit({ Role: 'User', Text: 'Paused then continued', IsFinal: true, Kind: 'normal', ItemId: 'item-a' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(2));

        expect(provider.Relayed[1]).toEqual({ role: 'user', utteranceStartMs: 8400, utteranceEndMs: 13000 });
    });

    it('relays null for a keyed user transcript whose ItemId has no recorded onset, without reading the single slot or currentTurnStartMs', async () => {
        const { provider, client, advanceTo } = await startRecorded();
        speakAssistantTurn(client, advanceTo);

        advanceTo(8400);
        client.SpeechStart(); // unkeyed single-slot onset
        advanceTo(9000);
        client.Emit({ Role: 'Assistant', Text: 'Working', IsFinal: false, Kind: 'normal' }); // stamps currentTurnStartMs = 9000
        advanceTo(9500);
        client.Emit({ Role: 'User', Text: 'Keyed turn with unknown id', IsFinal: true, Kind: 'normal', ItemId: 'item-unknown' });
        advanceTo(12000);
        client.Emit({ Role: 'Assistant', Text: 'Working on that', IsFinal: true, Kind: 'normal' });
        advanceTo(14000);
        client.Emit({ Role: 'User', Text: 'Unkeyed turn claims single slot', IsFinal: true, Kind: 'normal' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(4));

        expect(provider.Relayed[1]).toEqual({ role: 'user', utteranceStartMs: null, utteranceEndMs: 9500 });
        expect(provider.Relayed[2]).toEqual({ role: 'assistant', utteranceStartMs: 9000, utteranceEndMs: 12000 });
        expect(provider.Relayed[3]).toEqual({ role: 'user', utteranceStartMs: 8400, utteranceEndMs: 14000 });
    });

    it('deletes a keyed onset and relays null start on a ReplacesPrevious correction with an ItemId', async () => {
        const { provider, client, advanceTo } = await startRecorded();
        speakAssistantTurn(client, advanceTo);

        advanceTo(8000);
        client.SpeechStart('item-1');
        advanceTo(10000);
        client.Emit({ Role: 'User', Text: 'I would like', IsFinal: true, Kind: 'normal', ItemId: 'item-1' });
        advanceTo(11000);
        client.SpeechStart('item-1'); // mid-sentence pause re-fires with same id
        advanceTo(12000);
        client.Emit({ Role: 'User', Text: 'I would like to apply', IsFinal: true, Kind: 'normal', ReplacesPrevious: true, ItemId: 'item-1' });
        advanceTo(15000);
        client.Emit({ Role: 'User', Text: 'Late duplicate of item-1', IsFinal: true, Kind: 'normal', ItemId: 'item-1' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(4));

        expect(provider.Relayed[1]).toEqual({ role: 'user', utteranceStartMs: 8000, utteranceEndMs: 10000 });
        expect(provider.Relayed[2]).toEqual({ role: 'user', utteranceStartMs: null, utteranceEndMs: 12000 });
        expect(provider.Relayed[3]).toEqual({ role: 'user', utteranceStartMs: null, utteranceEndMs: 15000 });
    });

    it('drops earlier unclaimed keyed onsets when a later keyed user turn is relayed, and ignores typed turns', async () => {
        const { runtime, provider, client, advanceTo } = await startRecorded();
        client.GoLive();
        speakAssistantTurn(client, advanceTo);

        advanceTo(8000);
        client.SpeechStart('item-stale'); // VAD false positive whose transcription failed
        advanceTo(10000);
        client.SpeechStart('item-real');
        advanceTo(11000);
        runtime.SendText('Typed in between');
        advanceTo(12000);
        client.Emit({ Role: 'User', Text: 'Real spoken question', IsFinal: true, Kind: 'normal', ItemId: 'item-real' });
        advanceTo(14000);
        client.Emit({ Role: 'User', Text: 'Stale item finally arrives', IsFinal: true, Kind: 'normal', ItemId: 'item-stale' });
        await vi.waitFor(() => expect(provider.Relayed).toHaveLength(4));

        expect(provider.Relayed[1]).toEqual({ role: 'user', utteranceStartMs: null, utteranceEndMs: 11000 });
        expect(provider.Relayed[2]).toEqual({ role: 'user', utteranceStartMs: 10000, utteranceEndMs: 12000 });
        expect(provider.Relayed[3]).toEqual({ role: 'user', utteranceStartMs: null, utteranceEndMs: 14000 });
    });
```

- [ ] **Step 2: Run the runtime turn-timing test file to verify the new tests fail**

Run: `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/RealtimeRuntime && npx vitest run src/__tests__/RealtimeSessionRuntime.turn-timing.test.ts`
Expected: FAIL on the repro test and new keyed-onset tests.

- [ ] **Step 3: Implement keyed onset tracking in `packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts` and create `.changeset/pair-user-speech-onset-item-id.md`**

In `packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts`:
1. Add `private readonly userSpeechStartByItemId = new Map<string, number>();` next to `userSpeechStartMs` and `userSpeechStartSuperseded`.
2. In `wireClientHandlers` (line ~4091):
   `client.OnUserSpeechStart((itemId?: string) => this.markUserSpeechStart(itemId));`
3. In `markUserSpeechStart(itemId?: string)`:
   ```ts
   private markUserSpeechStart(itemId?: string): void {
     if (itemId !== undefined && itemId.length > 0) {
       if (this.userSpeechStartByItemId.has(itemId)) {
         return;
       }
       const offset = this.nowTurnOffsetMs();
       if (offset === null) {
         return;
       }
       this.userSpeechStartByItemId.set(itemId, offset);
       return;
     }
     if (this.userSpeechStartMs !== null && !this.userSpeechStartSuperseded) {
       return;
     }
     const offset = this.nowTurnOffsetMs();
     if (offset === null) {
       return;
     }
     this.userSpeechStartMs = offset;
     this.userSpeechStartSuperseded = false;
   }
   ```
4. Update `releaseUserSpeechStart(itemId?: string)`:
   ```ts
   private releaseUserSpeechStart(itemId?: string): void {
     if (itemId !== undefined && itemId.length > 0) {
       this.userSpeechStartByItemId.delete(itemId);
       return;
     }
     this.userSpeechStartMs = null;
     this.userSpeechStartSuperseded = false;
   }
   ```
   And add `takeKeyedUserSpeechStart(itemId: string): number | null`:
   ```ts
   private takeKeyedUserSpeechStart(itemId: string): number | null {
     const onset = this.userSpeechStartByItemId.get(itemId) ?? null;
     this.userSpeechStartByItemId.delete(itemId);
     if (onset !== null) {
       for (const [otherId, otherOnset] of this.userSpeechStartByItemId) {
         if (otherOnset < onset) {
           this.userSpeechStartByItemId.delete(otherId);
         }
       }
     }
     return onset;
   }
   ```
5. In `onClientTranscript`:
   - Pass `transcript.ItemId` to `this.releaseUserSpeechStart(transcript.ItemId)` when `transcript.Role === 'User' && transcript.Text.trim().length === 0`.
   - Pass `transcript.ItemId` on the three user `relayTranscript` / `onUserTranscript` branches:
     - `hasActiveInterimUserCaption`: `await this.relayTranscript('user', transcript.Text, false, 'speech', transcript.ItemId);`
     - `transcript.ReplacesPrevious`: `await this.relayTranscript('user', transcript.Text, true, 'speech', transcript.ItemId);`
     - `else`: `await this.onUserTranscript(transcript.Text, 'speech', transcript.ItemId);`
6. In `onUserTranscript(transcript: string, source: 'speech' | 'typed' = 'speech', itemId?: string)`:
   - Pass `itemId` to `await this.relayTranscript('user', transcript, false, source, itemId);`.
7. In `relayTranscript(role: 'user' | 'assistant', text: string, replacesPrevious: boolean = false, source: 'speech' | 'typed' = 'speech', itemId?: string)`:
   ```ts
    const hasItemId = role === 'user' && source === 'speech' && itemId !== undefined && itemId.length > 0;
    let userSpeechStartMs: number | null = null;
    if (hasItemId) {
      userSpeechStartMs = this.takeKeyedUserSpeechStart(itemId);
    } else if (role === 'user' && source === 'speech') {
      userSpeechStartMs = this.userSpeechStartMs;
      this.releaseUserSpeechStart();
    }
    const utteranceEndMs = this.nowTurnOffsetMs();
    const opensTurn = utteranceEndMs !== null && !replacesPrevious;
    let utteranceStartMs: number | null = null;
    if (opensTurn && (hasItemId || userSpeechStartMs !== null)) {
      utteranceStartMs = userSpeechStartMs;
      if (!this.turnAudioStartCaptured) {
        this.currentTurnStartMs = null;
      }
    } else if (opensTurn) {
   ```
8. Clear `this.userSpeechStartByItemId.clear()` in `startRecording`, `finishRecording`, and `resetState` alongside `userSpeechStartMs = null` and `userSpeechStartSuperseded = false`.
9. Create `.changeset/pair-user-speech-onset-item-id.md` with `patch` bumps for `@memberjunction/ai-realtime-client` and `@memberjunction/realtime-runtime`.

- [ ] **Step 4: Run tests and builds across all required packages**

Run:
- `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/RealtimeRuntime && pnpm test && pnpm run build`
- `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ/packages/Angular/Generic/conversations && pnpm test && pnpm run build`
- `cd /Users/sohamdesai/Projects/mj-slots/e1/MJ && npm run check:changeset && npm run check:guards && npm run check:standards`
Expected: PASS on all commands.

- [ ] **Step 5: Commit Task 2**

Stage `packages/RealtimeRuntime/src/session/RealtimeSessionRuntime.ts`, `packages/RealtimeRuntime/src/__tests__/RealtimeSessionRuntime.turn-timing.test.ts`, and `.changeset/pair-user-speech-onset-item-id.md`, and commit with message `fix(realtime-runtime): pair user speech onset with transcript by item_id (MJ#5902)`.
