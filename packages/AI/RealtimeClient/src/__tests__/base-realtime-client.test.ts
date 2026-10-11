import { describe, it, expect, vi, afterEach } from 'vitest';
import { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import {
    BaseRealtimeClient,
    RealtimeClientError,
    RealtimeClientState,
    RealtimeClientToolCall,
    RealtimeClientTranscript,
    RealtimeClientUsage,
} from '../generic/baseRealtimeClient';

/**
 * Minimal concrete subclass exposing the protected emit helpers so the base-class
 * handler plumbing can be exercised without any provider wiring.
 */
class StubRealtimeClient extends BaseRealtimeClient {
    public async Connect(_config: ClientRealtimeSessionConfig, _micStream: MediaStream): Promise<void> {
        /* not used in these tests */
    }
    public SendText(_text: string): void {}
    public SendContextNote(_text: string): void {}
    public RequestSpokenUpdate(_instructions: string): void {}
    public SendToolResult(_callID: string, _outputJson: string): void {}
    public CancelActiveResponse(): void {}
    public SetMuted(_muted: boolean): void {}
    public async Disconnect(): Promise<void> {}
    public get IsBusy(): boolean {
        return false;
    }
    public get IsAudioPlaying(): boolean {
        return false;
    }

    // expose the protected emit helpers
    public EmitTranscript(t: RealtimeClientTranscript): void {
        this.emitTranscript(t);
    }
    public EmitToolCall(c: RealtimeClientToolCall): void {
        this.emitToolCall(c);
    }
    public EmitState(s: RealtimeClientState): void {
        this.emitStateChange(s);
    }
    public EmitError(e: RealtimeClientError): void {
        this.emitError(e);
    }
    public EmitInterruption(): void {
        this.emitInterruption();
    }
    public EmitUsage(u: RealtimeClientUsage): void {
        this.emitUsage(u);
    }
    public Publish(s: MediaStream | null): void {
        this.publishRemoteMediaStream(s);
    }
    public Clear(): void {
        this.clearRemoteMediaStream();
    }
}

describe('BaseRealtimeClient', () => {
    describe('handler plumbing', () => {
        it('should deliver transcripts to the registered handler', () => {
            const client = new StubRealtimeClient();
            const received: RealtimeClientTranscript[] = [];
            client.OnTranscript((t) => received.push(t));

            const transcript: RealtimeClientTranscript = { Role: 'Assistant', Text: 'hi', IsFinal: true, Kind: 'normal' };
            client.EmitTranscript(transcript);

            expect(received).toEqual([transcript]);
        });

        it('should deliver tool calls to the registered handler', () => {
            const client = new StubRealtimeClient();
            const received: RealtimeClientToolCall[] = [];
            client.OnToolCall((c) => received.push(c));

            client.EmitToolCall({ CallID: 'c1', ToolName: 'invoke-target-agent', ArgumentsJson: '{"q":1}' });

            expect(received).toEqual([{ CallID: 'c1', ToolName: 'invoke-target-agent', ArgumentsJson: '{"q":1}' }]);
        });

        it('should deliver state changes to the registered handler', () => {
            const client = new StubRealtimeClient();
            const states: RealtimeClientState[] = [];
            client.OnStateChange((s) => states.push(s));

            client.EmitState('connecting');
            client.EmitState('listening');

            expect(states).toEqual(['connecting', 'listening']);
        });

        it('should deliver errors to the registered handler', () => {
            const client = new StubRealtimeClient();
            const errors: RealtimeClientError[] = [];
            client.OnError((e) => errors.push(e));

            client.EmitError({ Message: 'boom', Code: 'x', Fatal: false });

            expect(errors).toEqual([{ Message: 'boom', Code: 'x', Fatal: false }]);
        });

        it('should deliver interruptions to the registered handler', () => {
            const client = new StubRealtimeClient();
            let fired = 0;
            client.OnInterruption(() => fired++);

            client.EmitInterruption();
            client.EmitInterruption();

            expect(fired).toBe(2);
        });

        it('should store a SINGLE handler — re-registering replaces the previous one', () => {
            const client = new StubRealtimeClient();
            const first: RealtimeClientState[] = [];
            const second: RealtimeClientState[] = [];
            client.OnStateChange((s) => first.push(s));
            client.OnStateChange((s) => second.push(s));

            client.EmitState('speaking');

            expect(first).toEqual([]);
            expect(second).toEqual(['speaking']);
        });

        it('should deliver usage updates (deltas) to the registered handler', () => {
            const client = new StubRealtimeClient();
            const received: RealtimeClientUsage[] = [];
            client.OnUsage((u) => received.push(u));

            client.EmitUsage({ InputTokens: 120, OutputTokens: 45, Raw: { input_tokens: 120 } });
            client.EmitUsage({ OutputTokens: 7 });

            expect(received).toEqual([
                { InputTokens: 120, OutputTokens: 45, Raw: { input_tokens: 120 } },
                { OutputTokens: 7 },
            ]);
        });

        it('should replace the usage handler on re-registration (single-handler style)', () => {
            const client = new StubRealtimeClient();
            const first: RealtimeClientUsage[] = [];
            const second: RealtimeClientUsage[] = [];
            client.OnUsage((u) => first.push(u));
            client.OnUsage((u) => second.push(u));

            client.EmitUsage({ InputTokens: 1, OutputTokens: 2 });

            expect(first).toEqual([]);
            expect(second).toEqual([{ InputTokens: 1, OutputTokens: 2 }]);
        });

        it('should be safe to emit with no handler registered', () => {
            const client = new StubRealtimeClient();
            expect(() => {
                client.EmitTranscript({ Role: 'User', Text: 'x', IsFinal: true, Kind: 'normal' });
                client.EmitToolCall({ CallID: 'c', ToolName: 't', ArgumentsJson: '{}' });
                client.EmitState('closed');
                client.EmitError({ Message: 'm', Fatal: true });
                client.EmitInterruption();
                client.EmitUsage({ InputTokens: 1 });
            }).not.toThrow();
        });
    });

    describe('remote media stream slot', () => {
        const fakeStream = (): MediaStream => ({ id: 'remote' }) as unknown as MediaStream;

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('is null before anything is published', () => {
            expect(new StubRealtimeClient().GetRemoteMediaStream()).toBeNull();
        });

        it('fires a handler registered BEFORE publish once, with the stream', () => {
            const client = new StubRealtimeClient();
            const received: MediaStream[] = [];
            client.OnRemoteMediaStream((s) => received.push(s));
            const stream = fakeStream();
            client.Publish(stream);
            expect(received).toEqual([stream]);
            expect(client.GetRemoteMediaStream()).toBe(stream);
        });

        it('fires a handler registered AFTER publish immediately and synchronously', () => {
            const client = new StubRealtimeClient();
            const stream = fakeStream();
            client.Publish(stream);
            const received: MediaStream[] = [];
            client.OnRemoteMediaStream((s) => received.push(s));
            expect(received).toEqual([stream]);
        });

        it('delivers to every registered handler', () => {
            const client = new StubRealtimeClient();
            const a: MediaStream[] = [];
            const b: MediaStream[] = [];
            client.OnRemoteMediaStream((s) => a.push(s));
            client.OnRemoteMediaStream((s) => b.push(s));
            const stream = fakeStream();
            client.Publish(stream);
            expect(a).toEqual([stream]);
            expect(b).toEqual([stream]);
        });

        it('isolates a throwing handler: sibling still fires, nothing throws, console.warn is called', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const client = new StubRealtimeClient();
            const sibling: MediaStream[] = [];
            client.OnRemoteMediaStream(() => {
                throw new Error('host boom');
            });
            client.OnRemoteMediaStream((s) => sibling.push(s));
            expect(() => client.Publish(fakeStream())).not.toThrow();
            expect(sibling).toHaveLength(1);
            expect(warn).toHaveBeenCalled();

            // Late registration against an already-landed stream must isolate too.
            expect(() =>
                client.OnRemoteMediaStream(() => {
                    throw new Error('late boom');
                }),
            ).not.toThrow();
            expect(warn).toHaveBeenCalledTimes(2);
        });

        it('publish(null) sets null and fires nothing', () => {
            const client = new StubRealtimeClient();
            const received: MediaStream[] = [];
            client.OnRemoteMediaStream((s) => received.push(s));
            client.Publish(null);
            expect(client.GetRemoteMediaStream()).toBeNull();
            expect(received).toHaveLength(0);
        });

        it('clear drops the stream AND the handlers, so a later publish reaches only new handlers', () => {
            const client = new StubRealtimeClient();
            const stale: MediaStream[] = [];
            client.OnRemoteMediaStream((s) => stale.push(s));
            client.Publish(fakeStream());
            expect(stale).toHaveLength(1);

            client.Clear();
            expect(client.GetRemoteMediaStream()).toBeNull();

            const fresh: MediaStream[] = [];
            client.OnRemoteMediaStream((s) => fresh.push(s));
            client.Publish(fakeStream());
            expect(stale).toHaveLength(1);
            expect(fresh).toHaveLength(1);
        });
    });
});
