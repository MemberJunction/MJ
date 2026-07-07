import { describe, it, expect } from 'vitest';
import { TeamsAcsMediaRegistry, type IAcsMediaTransport } from '../telephony/teamsAcsMediaRegistry.js';
import type { AcsInboundAudioFrame } from '@memberjunction/ai-bridge-teams';

class FakeTransport implements IAcsMediaTransport {
    public readonly Sent: ArrayBuffer[] = [];
    public Closed = false;
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.Sent.push(pcm);
    }
    public close(): void {
        this.Closed = true;
    }
}

const frame = (bytes: number): ArrayBuffer => new ArrayBuffer(bytes);

describe('TeamsAcsMediaRegistry', () => {
    it('exposes the configured ACS sample rate', () => {
        expect(new TeamsAcsMediaRegistry().SampleRate).toBe(16000);
        expect(new TeamsAcsMediaRegistry(8000).SampleRate).toBe(8000);
    });

    it('buffers outbound PCM before the transport attaches, then flushes on attach', () => {
        const registry = new TeamsAcsMediaRegistry();
        const a = frame(4);
        const b = frame(8);
        registry.Send('call-1', a);
        registry.Send('call-1', b);

        const transport = new FakeTransport();
        registry.AttachTransport('call-1', transport);

        expect(transport.Sent).toEqual([a, b]);
    });

    it('sends immediately once the transport is attached', () => {
        const registry = new TeamsAcsMediaRegistry();
        const transport = new FakeTransport();
        registry.AttachTransport('call-1', transport);
        const a = frame(4);
        registry.Send('call-1', a);
        expect(transport.Sent).toEqual([a]);
    });

    it('dispatches inbound frames to all registered handlers for the call', () => {
        const registry = new TeamsAcsMediaRegistry();
        const seen: AcsInboundAudioFrame[] = [];
        registry.OnFrame('call-1', (f) => seen.push(f));
        registry.OnFrame('call-1', (f) => seen.push(f));
        const f: AcsInboundAudioFrame = { Pcm: frame(2), ParticipantId: 'p1' };
        registry.DispatchInbound('call-1', f);
        expect(seen).toEqual([f, f]);
    });

    it('dispatches hand-raise signals to registered hand-raise handlers', () => {
        const registry = new TeamsAcsMediaRegistry();
        let raised: boolean | undefined;
        registry.OnHandRaise('call-1', (_p, r) => (raised = r));
        registry.DispatchHandRaise('call-1', 'p1', true);
        expect(raised).toBe(true);
    });

    it('ignores inbound dispatch + hand-raise for unknown calls (no throw)', () => {
        const registry = new TeamsAcsMediaRegistry();
        expect(() => registry.DispatchInbound('nope', { Pcm: frame(2), ParticipantId: 'p1' })).not.toThrow();
        expect(() => registry.DispatchHandRaise('nope', 'p1', true)).not.toThrow();
    });

    it('closes the transport and forgets the call on EndCall', () => {
        const registry = new TeamsAcsMediaRegistry();
        const transport = new FakeTransport();
        registry.AttachTransport('call-1', transport);
        expect(registry.HasCall('call-1')).toBe(true);

        registry.EndCall('call-1');
        expect(transport.Closed).toBe(true);
        expect(registry.HasCall('call-1')).toBe(false);
        // EndCall on an unknown call is a silent no-op.
        expect(() => registry.EndCall('unknown')).not.toThrow();
    });
});
