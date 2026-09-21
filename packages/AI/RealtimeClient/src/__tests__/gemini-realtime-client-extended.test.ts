/**
 * Extended Gemini driver coverage: strict queue-behind-active-turn semantics (drain order,
 * stop-at-trigger, tool-call deadlock guard WITHOUT drain, interruption NOT draining),
 * session-config parse branches, tool-call frame edge shapes, tool-output parsing,
 * transcript accumulation edges, and lifecycle (mic chunks after disconnect, idempotent
 * Disconnect, transport close/error interplay).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import type { LiveServerMessage } from '@google/genai';
import {
    collect,
    FakeMediaStream,
    FakeTrack,
    GeminiTestClient,
    makeGeminiConfig,
} from './helpers/realtime-fakes';
import { GeminiRealtimeClient } from '../drivers/geminiRealtimeClient';

/** Connects the harness client with one fake mic track; returns the track for assertions. */
async function connect(client: GeminiTestClient, config?: ClientRealtimeSessionConfig): Promise<FakeTrack> {
    const track = new FakeTrack();
    await client.Connect(config ?? makeGeminiConfig(), new FakeMediaStream([track]));
    return track;
}

/** Marks a model turn in flight (first output transcription delta sets busy + speaking). */
function beginModelTurn(client: GeminiTestClient, text = 'mid-turn'): void {
    client.Emit({ serverContent: { outputTranscription: { text } } } as LiveServerMessage);
}

/** Completes the in-flight model turn. */
function completeTurn(client: GeminiTestClient): void {
    client.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);
}

describe('GeminiRealtimeClient (extended)', () => {
    let client: GeminiTestClient;

    beforeEach(() => {
        client = new GeminiTestClient();
    });

    // ── Guards when no session is open ─────────────────────────────────────────

    describe('guards when the session is not open', () => {
        it('should no-op SendContextNote before Connect', () => {
            expect(() => client.SendContextNote('void')).not.toThrow();
            expect(client.Fake.ClientContents).toHaveLength(0);
        });

        it('should no-op RequestSpokenUpdate before Connect (and stay idle)', () => {
            expect(() => client.RequestSpokenUpdate('void')).not.toThrow();
            expect(client.Fake.ClientContents).toHaveLength(0);
            expect(client.IsBusy).toBe(false);
        });

        it('should no-op SendToolResult before Connect (and stay idle)', () => {
            expect(() => client.SendToolResult('c1', '{}')).not.toThrow();
            expect(client.Fake.ToolResponses).toHaveLength(0);
            expect(client.IsBusy).toBe(false);
        });

        it('should no-op SetMuted before Connect (no mic stream)', () => {
            expect(() => client.SetMuted(true)).not.toThrow();
        });

        it('should report IsAudioPlaying false before Connect (no playout engine)', () => {
            expect(client.IsAudioPlaying).toBe(false);
        });
    });

    // ── Session-config parsing branches ────────────────────────────────────────

    describe('session config parsing', () => {
        it('should tolerate a missing SessionConfig (model from top level, empty live config)', async () => {
            const config = makeGeminiConfig();
            delete (config as Partial<ClientRealtimeSessionConfig>).SessionConfig;
            await connect(client, config);
            expect(client.LastConnectArgs?.Model).toBe('gemini-live-2.5-flash-preview');
            expect(client.LastConnectArgs?.Config).toEqual({});
        });

        it('should fall back to an empty live config when config is an array', async () => {
            await connect(client, makeGeminiConfig({ model: 'gemini-live-2.5-flash-preview', config: [1, 2] }));
            expect(client.LastConnectArgs?.Config).toEqual({});
        });

        it('should fall back to an empty live config when config is a scalar or null', async () => {
            await connect(client, makeGeminiConfig({ model: 'gemini-live-2.5-flash-preview', config: 'oops' }));
            expect(client.LastConnectArgs?.Config).toEqual({});

            const second = new GeminiTestClient();
            await connect(second, makeGeminiConfig({ model: 'gemini-live-2.5-flash-preview', config: null }));
            expect(second.LastConnectArgs?.Config).toEqual({});
        });

        it('should prefer the SessionConfig model over the top-level Model', async () => {
            await connect(client, makeGeminiConfig({ model: 'gemini-live-override', config: {} }));
            expect(client.LastConnectArgs?.Model).toBe('gemini-live-override');
        });
    });

    // ── Queue semantics (strict queue-behind-active-turn) ──────────────────────

    describe('queue semantics', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should drain queued sends in order and STOP at the first send that starts a new turn', () => {
            // NOTE: SendText now implies barge-in (it cancels + sends immediately), so the
            // triggering QUEUED send exercised here is RequestSpokenUpdate, which still queues.
            beginModelTurn(client);
            client.SendContextNote('note 1'); // non-triggering
            client.RequestSpokenUpdate('typed reply'); // triggering — drain must stop after this
            client.SendContextNote('note 2'); // must stay queued
            expect(client.Fake.ClientContents).toHaveLength(0);
            expect(client.Fake.RealtimeInputs).toHaveLength(0);

            completeTurn(client);
            // drain order: the note (clientContent) goes first, then the narration trigger
            // (realtime text) starts a new turn and stops the drain
            expect(client.Fake.ClientContents).toEqual([
                { turns: [{ role: 'user', parts: [{ text: 'note 1' }] }], turnComplete: false },
            ]);
            expect(client.Fake.RealtimeInputs).toEqual([{ text: 'typed reply' }]);
            expect(client.IsBusy).toBe(true);

            // the second note drains only when the typed-reply turn completes
            completeTurn(client);
            expect(client.Fake.ClientContents).toHaveLength(2);
            expect(client.Fake.ClientContents[1]).toEqual({
                turns: [{ role: 'user', parts: [{ text: 'note 2' }] }],
                turnComplete: false,
            });
        });

        it('LOCKS CURRENT BEHAVIOR: a toolCall frame clears the busy lock WITHOUT draining the queue', () => {
            beginModelTurn(client);
            client.SendContextNote('queued note');
            expect(client.Fake.ClientContents).toHaveLength(0);

            client.Emit({
                toolCall: { functionCalls: [{ id: 'call-1', name: 'run-agent', args: {} }] },
            } as LiveServerMessage);

            // deadlock guard: busy released so a tool result can go out immediately…
            expect(client.IsBusy).toBe(false);
            // …but the queued note is NOT drained by the tool-call frame
            expect(client.Fake.ClientContents).toHaveLength(0);

            // the queued note drains on the next turn boundary
            completeTurn(client);
            expect(client.Fake.ClientContents).toEqual([
                { turns: [{ role: 'user', parts: [{ text: 'queued note' }] }], turnComplete: false },
            ]);
        });

        it('LOCKS CURRENT BEHAVIOR: a tool result sent after a toolCall frame jumps ahead of earlier-queued sends', () => {
            // Order inversion by design: the tool-call frame releases the busy lock so the
            // RESULT is never deadlocked, while sends queued during the (now-yielded) turn
            // still wait for the next turnComplete.
            beginModelTurn(client);
            client.SendContextNote('queued before tool call');
            client.Emit({
                toolCall: { functionCalls: [{ id: 'call-2', name: 'run-agent', args: {} }] },
            } as LiveServerMessage);

            client.SendToolResult('call-2', '{"ok":true}');
            expect(client.Fake.ToolResponses).toHaveLength(1); // sent immediately
            expect(client.Fake.ClientContents).toHaveLength(0); // note still queued
        });

        it('should NOT drain the queue nor clear the busy lock on an interrupted frame alone', () => {
            beginModelTurn(client);
            client.RequestSpokenUpdate('queued update'); // queues behind the in-flight turn
            client.Emit({ serverContent: { interrupted: true } } as LiveServerMessage);

            // interruption flushes playback and yields the floor, but the turn boundary is
            // turnComplete — the queue and busy lock are untouched until then
            expect(client.Fake.RealtimeInputs).toHaveLength(0);
            expect(client.IsBusy).toBe(true);

            completeTurn(client);
            expect(client.Fake.RealtimeInputs).toEqual([{ text: 'queued update' }]);
        });

        it('should tolerate duplicate turnComplete frames without re-draining or throwing', () => {
            beginModelTurn(client);
            client.SendText('once only');
            completeTurn(client);
            expect(client.Fake.RealtimeInputs).toHaveLength(1);

            // duplicate boundary while the triggered turn is in flight → drain stops immediately
            expect(() => completeTurn(client)).not.toThrow();
            expect(client.Fake.RealtimeInputs).toHaveLength(1);
        });

        it('should deliver a queued tool result exactly once across multiple turn boundaries', () => {
            client.Emit({
                toolCall: { functionCalls: [{ id: 'call-3', name: 'run-agent', args: {} }] },
            } as LiveServerMessage);
            client.RequestSpokenUpdate('narrating'); // turn in flight
            client.SendToolResult('call-3', '{"done":true}');
            expect(client.Fake.ToolResponses).toHaveLength(0);

            completeTurn(client); // narration ends → result fires
            completeTurn(client); // result turn ends → nothing left to fire
            completeTurn(client);
            expect(client.Fake.ToolResponses).toHaveLength(1);
        });
    });

    // ── Tool-call frame edge shapes + tool output parsing ──────────────────────

    describe('tool-call frame edges', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should default missing id/name/args on a tool-call frame', () => {
            const { toolCalls } = collect(client);
            client.Emit({ toolCall: { functionCalls: [{}] } } as LiveServerMessage);
            expect(toolCalls).toEqual([{ CallID: '', ToolName: '', ArgumentsJson: '{}' }]);
        });

        it('should ignore a toolCall frame with an empty functionCalls array (busy lock untouched)', () => {
            const { toolCalls } = collect(client);
            beginModelTurn(client);
            client.Emit({ toolCall: { functionCalls: [] } } as LiveServerMessage);
            expect(toolCalls).toEqual([]);
            expect(client.IsBusy).toBe(true); // early return happens BEFORE the lock release
        });

        it('should ignore a toolCall frame with no functionCalls field', () => {
            const { toolCalls } = collect(client);
            client.Emit({ toolCall: {} } as LiveServerMessage);
            expect(toolCalls).toEqual([]);
        });

        it('should surface multiple function calls from one frame and cache every name', () => {
            const { toolCalls } = collect(client);
            client.Emit({
                toolCall: {
                    functionCalls: [
                        { id: 'a', name: 'tool_a', args: { x: 1 } },
                        { id: 'b', name: 'tool_b', args: { y: 2 } },
                    ],
                },
            } as LiveServerMessage);
            expect(toolCalls).toHaveLength(2);

            client.SendToolResult('b', '{"ok":1}');
            completeTurn(client);
            client.SendToolResult('a', '{"ok":2}');
            const names = client.Fake.ToolResponses.map((r) => r.functionResponses[0].name);
            expect(names).toEqual(['tool_b', 'tool_a']);
        });

        it('should send an empty function name for an unknown callID', () => {
            client.SendToolResult('never-seen', '{"ok":true}');
            expect(client.Fake.ToolResponses[0].functionResponses[0].name).toBe('');
        });

        it('should clear the callID→name cache after the result is sent', () => {
            client.Emit({
                toolCall: { functionCalls: [{ id: 'once', name: 'one_shot', args: {} }] },
            } as LiveServerMessage);
            client.SendToolResult('once', '{"n":1}');
            completeTurn(client);
            client.SendToolResult('once', '{"n":2}'); // cache entry gone
            const names = client.Fake.ToolResponses.map((r) => r.functionResponses[0].name);
            expect(names).toEqual(['one_shot', '']);
        });
    });

    describe('tool output parsing', () => {
        beforeEach(async () => {
            await connect(client);
            client.Emit({
                toolCall: { functionCalls: [{ id: 'c', name: 'tool', args: {} }] },
            } as LiveServerMessage);
        });

        it('should wrap a JSON number as { result }', () => {
            client.SendToolResult('c', '42');
            expect(client.Fake.ToolResponses[0].functionResponses[0].response).toEqual({ result: 42 });
        });

        it('should wrap a JSON array as { result }', () => {
            client.SendToolResult('c', '[1,2,3]');
            expect(client.Fake.ToolResponses[0].functionResponses[0].response).toEqual({ result: [1, 2, 3] });
        });

        it('should wrap a JSON null as { result: null }', () => {
            client.SendToolResult('c', 'null');
            expect(client.Fake.ToolResponses[0].functionResponses[0].response).toEqual({ result: null });
        });
    });

    // ── Transcript accumulation edges ──────────────────────────────────────────

    describe('transcript edges', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should emit no final user transcript when the finished flag arrives with no text accumulated', () => {
            const { transcripts } = collect(client);
            client.Emit({ serverContent: { inputTranscription: { finished: true } } } as LiveServerMessage);
            expect(transcripts).toEqual([]);
        });

        it('should tag user transcripts arriving mid-narration as normal (and not finalize them)', () => {
            const { transcripts } = collect(client);
            client.RequestSpokenUpdate('progress');
            client.Emit({ serverContent: { inputTranscription: { text: 'hold on' } } } as LiveServerMessage);
            expect(transcripts).toEqual([{ Role: 'User', Text: 'hold on', IsFinal: false, Kind: 'normal' }]);
            expect(client.IsBusy).toBe(true);
        });

        it('should finalize the accumulated transcript of an interrupted turn on turnComplete', () => {
            const { transcripts } = collect(client);
            beginModelTurn(client, 'I was saying');
            client.Emit({ serverContent: { interrupted: true } } as LiveServerMessage);
            completeTurn(client);
            const finals = transcripts.filter((t) => t.IsFinal);
            expect(finals).toEqual([{ Role: 'Assistant', Text: 'I was saying', IsFinal: true, Kind: 'normal' }]);
        });

        it('should mark generation started by an output transcription frame with NO text (busy + speaking)', () => {
            const { states } = collect(client);
            client.Emit({ serverContent: { outputTranscription: {} } } as LiveServerMessage);
            expect(client.IsBusy).toBe(true);
            expect(states).toEqual(['speaking']);
        });

        it('should not start a turn for a modelTurn frame without parts or without inlineData', () => {
            client.Emit({ serverContent: { modelTurn: { role: 'model' } } } as LiveServerMessage);
            expect(client.IsBusy).toBe(false);
            client.Emit({
                serverContent: { modelTurn: { role: 'model', parts: [{ text: 'thought text' }] } },
            } as LiveServerMessage);
            expect(client.IsBusy).toBe(false);
            expect(client.Playback.Enqueued).toHaveLength(0);
        });

        it('should enqueue every inline-audio part of a multi-part modelTurn', () => {
            client.Emit({
                serverContent: {
                    modelTurn: {
                        role: 'model',
                        parts: [
                            { inlineData: { data: btoa('ab'), mimeType: 'audio/pcm;rate=24000' } },
                            { text: 'interleaved text part' },
                            { inlineData: { data: btoa('cd'), mimeType: 'audio/pcm;rate=24000' } },
                        ],
                    },
                },
            } as LiveServerMessage);
            expect(client.Playback.Enqueued).toHaveLength(2);
            expect(client.IsBusy).toBe(true);
        });
    });

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    describe('lifecycle', () => {
        it('should drop mic chunks arriving after Disconnect', async () => {
            await connect(client);
            await client.Disconnect();
            expect(() => client.OnPcmChunk?.('AAAA')).not.toThrow();
            expect(client.Fake.RealtimeInputs).toHaveLength(0);
        });

        it('should be idempotent — a second Disconnect must not throw and ends closed', async () => {
            await connect(client);
            await client.Disconnect();
            const { states } = collect(client);
            await expect(client.Disconnect()).resolves.toBeUndefined();
            expect(states[states.length - 1]).toBe('closed');
        });

        it('should NOT emit closed when disconnecting after a fatal transport error', async () => {
            await connect(client);
            const { states } = collect(client);
            const errorEvent = Object.assign(new Event('error'), { message: 'dropped' }) as ErrorEvent;
            client.LastConnectArgs?.OnError(errorEvent);
            expect(states[states.length - 1]).toBe('error');

            await client.Disconnect();
            expect(states.filter((s) => s === 'closed')).toEqual([]);
        });

        it('should fall back to an unknown transport-error message when the event carries none', async () => {
            await connect(client);
            const { errors } = collect(client);
            const errorEvent = Object.assign(new Event('error'), { message: '' }) as ErrorEvent;
            client.LastConnectArgs?.OnError(errorEvent);
            expect(errors).toEqual([{ Message: 'Gemini Live transport error: unknown', Fatal: true }]);
        });

        it('should emit closed only once across duplicate socket-close callbacks', async () => {
            await connect(client);
            const { states } = collect(client);
            client.LastConnectArgs?.OnClose(new CloseEvent('close'));
            client.LastConnectArgs?.OnClose(new CloseEvent('close'));
            expect(states.filter((s) => s === 'closed')).toEqual(['closed']);
        });

        it('should reset the full response state machine on Disconnect mid-call', async () => {
            await connect(client);
            beginModelTurn(client);
            client.SendContextNote('queued'); // queues behind the in-flight turn
            client.Emit({
                serverContent: {
                    modelTurn: { role: 'model', parts: [{ inlineData: { data: btoa('zz'), mimeType: 'audio/pcm;rate=24000' } }] },
                },
            } as LiveServerMessage);
            expect(client.IsBusy).toBe(true);
            expect(client.IsAudioPlaying).toBe(true);

            await client.Disconnect();
            expect(client.IsBusy).toBe(false);
            expect(client.IsAudioPlaying).toBe(false);
            // the queued send must NOT leak out on any later (stale) turnComplete
            completeTurn(client);
            expect(client.Fake.ClientContents).toHaveLength(0);
        });
    });

    // ── Phase D: idle signal, async tools, and non-blocking execution ──────────

    describe('Phase D: idle signal, async tools, and non-blocking execution', () => {
        it('idle regression: turnComplete while IN_PROGRESS neither drains queuedSends nor clears busy; subsequent IDLE does both', async () => {
            await connect(
                client,
                makeGeminiConfig({
                    model: 'gemini-3.8-live-extended-thinking',
                    config: {},
                    idleSignal: 'interactionStatus',
                    supportsScheduling: false,
                    supportsBlocking: false,
                })
            );

            // Start an interaction
            client.Emit({
                interaction_status: 'IN_PROGRESS',
            } as unknown as LiveServerMessage);
            expect(client.IsBusy).toBe(true);

            // Queue a send while interaction is in progress
            client.SendContextNote('note during reasoning');
            expect(client.Fake.ClientContents).toHaveLength(0);

            // turnComplete arrives mid-interaction (e.g. intermediate reasoning turn fragment)
            completeTurn(client);

            // Regression guard: must NOT clear busy or drain queued sends
            expect(client.IsBusy).toBe(true);
            expect(client.Fake.ClientContents).toHaveLength(0);

            // Later, IDLE arrives (accepting snake_case or camelCase)
            client.Emit({
                interaction_status: 'IDLE',
            } as unknown as LiveServerMessage);

            // IDLE must clear busy and drain the queued send
            expect(client.IsBusy).toBe(false);
            expect(client.Fake.ClientContents).toHaveLength(1);
            expect(client.Fake.ClientContents[0]).toEqual({
                turns: [{ role: 'user', parts: [{ text: 'note during reasoning' }] }],
                turnComplete: false,
            });
        });

        it('non-blocking tool call with openClientTurn does NOT send bare turnComplete: true mid-generation', async () => {
            await connect(
                client,
                makeGeminiConfig({
                    model: 'gemini-3.8-live-extended-thinking',
                    config: {},
                    idleSignal: 'interactionStatus',
                    supportsScheduling: false,
                    supportsBlocking: false,
                })
            );

            // Seed a context note before the turn, opening a client turn
            client.SendContextNote('background fact');
            expect(client.Fake.ClientContents).toEqual([
                { turns: [{ role: 'user', parts: [{ text: 'background fact' }] }], turnComplete: false },
            ]);

            // Model begins generating
            beginModelTurn(client, 'analyzing context');
            expect(client.IsBusy).toBe(true);

            // Tool call arrives during generation
            client.Emit({
                toolCall: { functionCalls: [{ id: 'call-1', name: 'search', args: { q: 'data' } }] },
            } as LiveServerMessage);

            // Model remains busy in non-blocking mode
            expect(client.IsBusy).toBe(true);

            // Send tool result
            client.SendToolResult('call-1', '{"found":true}');
            expect(client.Fake.ToolResponses).toHaveLength(1);

            // Critical invariant (Punch List item 9 / Hazard 4.1):
            // No bare turnComplete: true was sent to interrupt active generation!
            expect(client.Fake.ClientContents).toHaveLength(1);

            // When IDLE eventually arrives, the deferred openClientTurn is safely committed
            client.Emit({
                interactionStatus: 'IDLE',
            } as unknown as LiveServerMessage);

            expect(client.Fake.ClientContents).toHaveLength(2);
            expect(client.Fake.ClientContents[1]).toEqual({ turnComplete: true });
            expect(client.IsBusy).toBe(false);
        });

        it('coordinates async tool batch with parallel calls, duplicates, and out-of-order results', async () => {
            await connect(
                client,
                makeGeminiConfig({
                    model: 'gemini-3.8-live-extended-thinking',
                    config: {},
                    idleSignal: 'interactionStatus',
                    supportsScheduling: false,
                    supportsBlocking: false,
                })
            );

            // Parallel tool calls arrive
            client.Emit({
                toolCall: {
                    functionCalls: [
                        { id: 'call-a', name: 'toolA', args: {} },
                        { id: 'call-b', name: 'toolB', args: {} },
                    ],
                },
            } as LiveServerMessage);

            expect(client.IsBusy).toBe(true);

            // First result arrives
            client.SendToolResult('call-a', '{"a":1}');
            expect(client.Fake.ToolResponses).toHaveLength(1);
            expect(client.IsBusy).toBe(true); // call-b still pending

            // Duplicate result does not break barrier
            client.SendToolResult('call-a', '{"a":1}');
            expect(client.Fake.ToolResponses).toHaveLength(2);
            expect(client.IsBusy).toBe(true);

            // Unknown result does not break barrier
            client.SendToolResult('unknown-call', '{"x":0}');
            expect(client.Fake.ToolResponses).toHaveLength(3);
            expect(client.IsBusy).toBe(true);

            // Second result arrives (out-of-order completion)
            client.SendToolResult('call-b', '{"b":2}');
            expect(client.Fake.ToolResponses).toHaveLength(4);

            // Once server signals IDLE, session is idle
            client.Emit({ interaction_status: 'IDLE' } as unknown as LiveServerMessage);
            expect(client.IsBusy).toBe(false);
        });

        it('safety backstop timer recovers and unwedges session if IDLE frame is lost', async () => {
            const timers = vi.useFakeTimers();
            try {
                const c = new GeminiTestClient();
                await c.Connect(
                    makeGeminiConfig({
                        model: 'gemini-3.8-live-extended-thinking',
                        config: {},
                        idleSignal: 'interactionStatus',
                        supportsScheduling: false,
                        supportsBlocking: false,
                    }),
                    new FakeMediaStream([new FakeTrack()])
                );

                c.Emit({ interaction_status: 'IN_PROGRESS' } as unknown as LiveServerMessage);
                expect(c.IsBusy).toBe(true);

                c.SendContextNote('deferred note');
                expect(c.Fake.ClientContents).toHaveLength(0);

                // Simulate turnComplete without IDLE (lost IDLE frame)
                c.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);
                expect(c.IsBusy).toBe(true);

                // Advance by backstop duration (15s)
                timers.advanceTimersByTime(GeminiRealtimeClient.ASSISTANT_SAFETY_BACKSTOP_MS);

                // Safety backstop unwedged the session
                expect(c.IsBusy).toBe(false);
                expect(c.Fake.ClientContents).toHaveLength(1);
            } finally {
                timers.useRealTimers();
            }
        });

        it('forwards scheduling hints only when supportsScheduling is true', async () => {
            // Client with scheduling supported
            const schedClient = new GeminiTestClient();
            await schedClient.Connect(
                makeGeminiConfig({
                    model: 'gemini-3.8-live',
                    config: {},
                    idleSignal: 'turnComplete',
                    supportsScheduling: true,
                    supportsBlocking: true,
                }),
                new FakeMediaStream([new FakeTrack()])
            );

            schedClient.Emit({
                toolCall: { functionCalls: [{ id: 'c1', name: 'calc', args: {} }] },
            } as LiveServerMessage);
            schedClient.SendToolResult('c1', JSON.stringify({ ans: 42, scheduling: 'SILENT' }));
            expect(schedClient.Fake.ToolResponses[0].functionResponses[0].scheduling).toBe('SILENT');

            // Client without scheduling supported
            const noSchedClient = new GeminiTestClient();
            await noSchedClient.Connect(
                makeGeminiConfig({
                    model: 'gemini-3.8-live-extended-thinking',
                    config: {},
                    idleSignal: 'interactionStatus',
                    supportsScheduling: false,
                    supportsBlocking: false,
                }),
                new FakeMediaStream([new FakeTrack()])
            );

            noSchedClient.Emit({
                toolCall: { functionCalls: [{ id: 'c2', name: 'calc', args: {} }] },
            } as LiveServerMessage);
            noSchedClient.SendToolResult('c2', JSON.stringify({ ans: 42, scheduling: 'SILENT' }));
            expect(noSchedClient.Fake.ToolResponses[0].functionResponses[0].scheduling).toBeUndefined();
        });

        it('supports __mj_scheduling, accepts INTERRUPTED, strips scheduling keys from payload, and warns on unrecognized (Items 16, 17, 18)', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            try {
                const client = new GeminiTestClient();
                await client.Connect(
                    makeGeminiConfig({
                        model: 'gemini-3.8-live',
                        config: {},
                        idleSignal: 'turnComplete',
                        supportsScheduling: true,
                        supportsBlocking: true,
                    }),
                    new FakeMediaStream([new FakeTrack()])
                );

                // c1: __mj_scheduling with 'INTERRUPTED'
                client.Emit({
                    toolCall: { functionCalls: [{ id: 'c1', name: 'search', args: {} }] },
                } as LiveServerMessage);
                client.SendToolResult('c1', JSON.stringify({ result: 'found', __mj_scheduling: 'INTERRUPTED' }));
                const resp1 = client.Fake.ToolResponses[0].functionResponses[0];
                expect(resp1.scheduling).toBe('INTERRUPT');
                const payload1 = resp1.response as Record<string, unknown>;
                expect(payload1['result']).toBe('found');
                expect(payload1['__mj_scheduling']).toBeUndefined();
                expect(payload1['scheduling']).toBeUndefined();

                // c2: unrecognized scheduling value warns and omits scheduling
                client.Emit({
                    toolCall: { functionCalls: [{ id: 'c2', name: 'calc', args: {} }] },
                } as LiveServerMessage);
                client.SendToolResult('c2', JSON.stringify({ ans: 10, scheduling: 'UNKNOWN_SCHED' }));
                const resp2 = client.Fake.ToolResponses[1].functionResponses[0];
                expect(resp2.scheduling).toBeUndefined();
                expect(warnSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Unrecognized function scheduling value "UNKNOWN_SCHED"')
                );
            } finally {
                warnSpy.mockRestore();
            }
        });

        it('Item 20: generationComplete does NOT drain queued sends; turnComplete drains them', async () => {
            const client = new GeminiTestClient();
            await client.Connect(
                makeGeminiConfig({
                    model: 'gemini-3.8-live',
                    config: {},
                    idleSignal: 'turnComplete',
                    supportsScheduling: true,
                    supportsBlocking: true,
                }),
                new FakeMediaStream([new FakeTrack()])
            );

            // Trigger active turn via outputTranscription
            client.Emit({
                serverContent: {
                    outputTranscription: { text: 'Hello' },
                },
            } as LiveServerMessage);

            // Queue a send while response is active
            client.SendContextNote('note during generation');
            // Not sent yet because response is active
            expect(client.Fake.ClientContents).toHaveLength(0);

            // Emit generationComplete: tokens finished, but playback may still be active
            client.Emit({
                serverContent: { generationComplete: true },
            } as LiveServerMessage);

            // Queued send MUST NOT be flushed yet on generationComplete (Item 20)
            expect(client.Fake.ClientContents).toHaveLength(0);

            // Emit turnComplete: now queue is flushed
            client.Emit({
                serverContent: { turnComplete: true },
            } as LiveServerMessage);

            expect(client.Fake.ClientContents).toHaveLength(1);
        });
    });

    // ── Phase E: Thinking and Narration ────────────────────────────────────────

    describe('Phase E: thinking and narration', () => {
        it('extracts thought parts as narration transcripts (Kind: narration, Role: Assistant) and does not enqueue audio', async () => {
            const client = new GeminiTestClient();
            await connect(client);
            const { transcripts } = collect(client);

            // Emit a model turn containing a thought part and an audio part
            client.Emit({
                serverContent: {
                    modelTurn: {
                        role: 'model',
                        parts: [
                            { text: 'Analyzing database records...', thought: true },
                            { inlineData: { data: Buffer.from('spoken pcm audio').toString('base64'), mimeType: 'audio/pcm;rate=24000' } },
                        ],
                    },
                },
            } as LiveServerMessage);

            // Transcripts contains the interim narration delta
            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: 'Analyzing database records...', IsFinal: false, Kind: 'narration', IsThought: true },
            ]);
            // Playback enqueued only the 1 audio chunk
            expect(client.Playback.Enqueued).toHaveLength(1);

            // Completing the turn finalizes the narration transcript
            completeTurn(client);

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: 'Analyzing database records...', IsFinal: false, Kind: 'narration', IsThought: true },
                { Role: 'Assistant', Text: 'Analyzing database records...', IsFinal: true, Kind: 'narration', IsThought: true },
            ]);
        });

        it('accumulates multiple thought deltas across frames and finalizes on turnComplete', async () => {
            const client = new GeminiTestClient();
            await connect(client);
            const { transcripts } = collect(client);

            client.Emit({
                serverContent: {
                    modelTurn: {
                        role: 'model',
                        parts: [{ text: 'Step 1: check parameters. ', thought: true }],
                    },
                },
            } as LiveServerMessage);

            client.Emit({
                serverContent: {
                    modelTurn: {
                        role: 'model',
                        parts: [{ text: 'Step 2: execute query.', thought: true }],
                    },
                },
            } as LiveServerMessage);

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: 'Step 1: check parameters. ', IsFinal: false, Kind: 'narration', IsThought: true },
                { Role: 'Assistant', Text: 'Step 2: execute query.', IsFinal: false, Kind: 'narration', IsThought: true },
            ]);

            completeTurn(client);

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: 'Step 1: check parameters. ', IsFinal: false, Kind: 'narration', IsThought: true },
                { Role: 'Assistant', Text: 'Step 2: execute query.', IsFinal: false, Kind: 'narration', IsThought: true },
                { Role: 'Assistant', Text: 'Step 1: check parameters. Step 2: execute query.', IsFinal: true, Kind: 'narration', IsThought: true },
            ]);
        });

        it('finalizes thought transcripts on barge-in interruption', async () => {
            const client = new GeminiTestClient();
            await connect(client);
            const { transcripts } = collect(client);

            client.Emit({
                serverContent: {
                    modelTurn: {
                        role: 'model',
                        parts: [{ text: 'Deep thinking before interruption', thought: true }],
                    },
                },
            } as LiveServerMessage);

            // User interrupts
            client.Emit({ serverContent: { interrupted: true } } as LiveServerMessage);

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: 'Deep thinking before interruption', IsFinal: false, Kind: 'narration', IsThought: true },
                { Role: 'Assistant', Text: 'Deep thinking before interruption', IsFinal: true, Kind: 'narration', IsThought: true },
            ]);
        });

        it('finalizes thought transcripts on handleIdleTerminal under interactionStatus', async () => {
            const client = new GeminiTestClient();
            await client.Connect(
                makeGeminiConfig({
                    model: 'gemini-3.8-live-extended-thinking',
                    config: {},
                    idleSignal: 'interactionStatus',
                    supportsScheduling: false,
                    supportsBlocking: false,
                }),
                new FakeMediaStream([new FakeTrack()])
            );
            const { transcripts } = collect(client);

            client.Emit({
                serverContent: {
                    modelTurn: {
                        role: 'model',
                        parts: [{ text: 'Extended thinking stream...', thought: true }],
                    },
                },
            } as LiveServerMessage);

            // Model finishes interaction and signals IDLE
            client.Emit({ interaction_status: 'IDLE' } as LiveServerMessage);

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: 'Extended thinking stream...', IsFinal: false, Kind: 'narration', IsThought: true },
                { Role: 'Assistant', Text: 'Extended thinking stream...', IsFinal: true, Kind: 'narration', IsThought: true },
            ]);
        });
    });
});
