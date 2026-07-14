import { describe, it, expect, beforeEach } from 'vitest';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { RealtimeProxyRegistry, REALTIME_PROXY_PATH } from '@memberjunction/ai';
import { RealtimeProxyServer } from '../realtimeProxy/RealtimeProxyServer';

/** A fake upgrade socket capturing whether it was written to / destroyed (the rejection path). */
class FakeSocket {
    public Written: string[] = [];
    public Destroyed = false;
    public write(data: string): boolean {
        this.Written.push(data);
        return true;
    }
    public destroy(): void {
        this.Destroyed = true;
    }
}

function req(url: string): IncomingMessage {
    return { url } as unknown as IncomingMessage;
}
function sock(fake: FakeSocket): Duplex {
    return fake as unknown as Duplex;
}
const HEAD = Buffer.alloc(0);

describe('RealtimeProxyServer.TryHandleUpgrade', () => {
    let proxy: RealtimeProxyServer;

    beforeEach(() => {
        proxy = RealtimeProxyServer.Instance;
    });

    it('does NOT claim a non-proxy path (leaves the socket for the graphql-ws server)', () => {
        const fake = new FakeSocket();
        const owned = proxy.TryHandleUpgrade(req('/graphql'), sock(fake), HEAD);
        expect(owned).toBe(false);
        expect(fake.Destroyed).toBe(false);
        expect(fake.Written).toHaveLength(0);
    });

    it('claims the proxy path but rejects a MISSING ticket with 401 + destroy', () => {
        const fake = new FakeSocket();
        const owned = proxy.TryHandleUpgrade(req(REALTIME_PROXY_PATH), sock(fake), HEAD);
        expect(owned).toBe(true);
        expect(fake.Written[0]).toContain('401');
        expect(fake.Destroyed).toBe(true);
    });

    it('rejects an UNKNOWN ticket with 401 + destroy', () => {
        const fake = new FakeSocket();
        const owned = proxy.TryHandleUpgrade(req(`${REALTIME_PROXY_PATH}?ticket=does-not-exist`), sock(fake), HEAD);
        expect(owned).toBe(true);
        expect(fake.Written[0]).toContain('401');
        expect(fake.Destroyed).toBe(true);
    });

    it('consumes a valid ticket exactly once (single-use)', () => {
        // A valid ticket exists in the shared registry until consumed. We assert single-use by consuming
        // it here first (proving it was live), then confirming the proxy would 401 a second attempt.
        const ticket = RealtimeProxyRegistry.Instance.Issue({ UpstreamUrl: 'ws://hf.internal/v1/realtime', TTLSeconds: 60 });
        expect(RealtimeProxyRegistry.Instance.Consume(ticket.ID)).not.toBeNull();

        const fake = new FakeSocket();
        const owned = proxy.TryHandleUpgrade(req(`${REALTIME_PROXY_PATH}?ticket=${ticket.ID}`), sock(fake), HEAD);
        expect(owned).toBe(true);
        expect(fake.Destroyed).toBe(true); // already consumed → treated as invalid
    });
});
