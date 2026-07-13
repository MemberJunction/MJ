import { describe, it, expect } from 'vitest';
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
});
