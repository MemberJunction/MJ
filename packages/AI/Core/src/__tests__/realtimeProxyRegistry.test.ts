import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    BuildRealtimeRelayUrl,
    HttpOriginToWs,
    RealtimeProxyRegistry,
    REALTIME_RELAY_MAX_CONNECTIONS,
    REALTIME_RELAY_OPEN_WINDOW_SECONDS,
    REALTIME_RELAY_PATH,
    REALTIME_RELAY_SESSION_LIFETIME_SECONDS,
    ResolveRealtimeProxyBaseHttpUrl,
    ResolveRealtimeProxyBaseWsUrl,
    type IRealtimeRelayPolicy,
    type RealtimeRelayFrameVerdict,
    type RealtimeRelayGrant,
    type RealtimeRelayIssueParams,
    type RealtimeRelayOpenIntent,
    type RealtimeRelayOpenResult,
    type RealtimeRelayRefusal,
} from '../generic/realtimeProxyRegistry';

/** A policy that counts every call, so a test can prove the registry calls none. */
class CountingPolicy implements IRealtimeRelayPolicy {
    public Calls = 0;
    public async UpstreamHeaders(): Promise<Record<string, string>> {
        this.Calls += 1;
        return {};
    }
    public ReadOpenIntent(): RealtimeRelayOpenIntent | null {
        this.Calls += 1;
        return null;
    }
    public OpeningFrames(): string[] {
        this.Calls += 1;
        return [];
    }
    public FilterClientFrame(frame: string): RealtimeRelayFrameVerdict {
        this.Calls += 1;
        return { Forward: frame };
    }
    public ObserveServerFrame(): string | null {
        this.Calls += 1;
        return null;
    }
}

const FRESH: RealtimeRelayOpenIntent = { ResumeHandle: null, AudioOnly: false };
const resume = (handle: string): RealtimeRelayOpenIntent => ({ ResumeHandle: handle, AudioOnly: false });
const T0 = new Date('2026-10-08T12:00:00.000Z').getTime();
const registry = (): RealtimeProxyRegistry => RealtimeProxyRegistry.Instance;

function issue(params: Partial<RealtimeRelayIssueParams> = {}): string {
    return registry().IssueRelaySession({ UpstreamUrl: 'wss://upstream.example/ws?key=server-only', Policy: new CountingPolicy(), ...params }).ID;
}

function granted(result: RealtimeRelayOpenResult): RealtimeRelayGrant {
    if ('Refused' in result) {
        throw new Error(`expected a grant, got a refusal: ${result.Refused}`);
    }
    return result.Granted;
}

function refusal(result: RealtimeRelayOpenResult): RealtimeRelayRefusal | null {
    return 'Refused' in result ? result.Refused : null;
}

/** Moves the fake clock forward by `seconds`. */
function advance(seconds: number): void {
    vi.setSystemTime(Date.now() + seconds * 1000);
}

describe('RealtimeProxyRegistry relay sessions', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(T0);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('pins the decided defaults: open within 5 minutes, live 30 minutes, 10 connections', () => {
        expect(REALTIME_RELAY_OPEN_WINDOW_SECONDS).toBe(300);
        expect(REALTIME_RELAY_SESSION_LIFETIME_SECONDS).toBe(1800);
        expect(REALTIME_RELAY_MAX_CONNECTIONS).toBe(10);
    });

    it('issues a session that ends after 30 minutes and calls nothing on the policy', () => {
        const policy = new CountingPolicy();
        const ticket = registry().IssueRelaySession({ UpstreamUrl: 'wss://u.example/ws', Policy: policy });
        expect(ticket.ID).toMatch(/^[0-9a-f-]{36}$/);
        expect(ticket.ExpiresAt).toBe(new Date(T0 + 1800 * 1000).toISOString());
        expect(policy.Calls).toBe(0); // headers are minted per upstream open, never at issue
        expect(registry().FindRelaySession(ticket.ID)?.Policy).toBe(policy);
    });

    it('ends at MaxSessionSeconds when that comes first, and never later than LifetimeSeconds', () => {
        const expiresAfter = (params: Partial<RealtimeRelayIssueParams>): number =>
            (new Date(registry().IssueRelaySession({ UpstreamUrl: 'wss://u/ws', Policy: new CountingPolicy(), ...params }).ExpiresAt).getTime() - T0) / 1000;
        expect(expiresAfter({ MaxSessionSeconds: 600 })).toBe(600);
        expect(expiresAfter({ MaxSessionSeconds: 7200 })).toBe(1800);
        expect(expiresAfter({ LifetimeSeconds: 120, MaxSessionSeconds: 600 })).toBe(120);
        expect(expiresAfter({ MaxSessionSeconds: 0 })).toBe(1800); // no cap
        expect(expiresAfter({ LifetimeSeconds: Number.NaN })).toBe(1800);
        expect(expiresAfter({ LifetimeSeconds: 0 })).toBe(1); // at least a second, never the default
    });

    it('opens one fresh connection; a second fresh intent is refused', () => {
        const id = issue();
        const first = granted(registry().OpenRelaySession(id, FRESH));
        expect(first.ConnectionNumber).toBe(1);
        expect(first.Resumed).toBe(false);
        expect(first.MaxConnections).toBe(10);
        expect(first.UpstreamUrl).toBe('wss://upstream.example/ws?key=server-only');
        expect(refusal(registry().OpenRelaySession(id, FRESH))).toBe('fresh-used');
    });

    it('takes the fresh connection only within the open window', () => {
        const onTime = issue();
        advance(300);
        expect(granted(registry().OpenRelaySession(onTime, FRESH)).ConnectionNumber).toBe(1);

        const late = issue();
        advance(301);
        expect(refusal(registry().OpenRelaySession(late, FRESH))).toBe('fresh-window');
        expect(registry().FindRelaySession(late)).toBeNull();
        expect(refusal(registry().OpenRelaySession(late, FRESH))).toBe('unknown'); // pruned
    });

    it('a resume opens only with a handle the relay forwarded to this session', () => {
        const id = issue();
        const other = issue();
        granted(registry().OpenRelaySession(id, FRESH));
        granted(registry().OpenRelaySession(other, FRESH));
        registry().RecordRelayHandle(other, 'handle-of-other');
        expect(refusal(registry().OpenRelaySession(id, resume('h-1')))).toBe('unknown-handle');
        expect(refusal(registry().OpenRelaySession(id, resume('handle-of-other')))).toBe('unknown-handle');

        registry().RecordRelayHandle(id, 'h-1');
        const second = granted(registry().OpenRelaySession(id, resume('h-1')));
        expect(second.ConnectionNumber).toBe(2);
        expect(second.Resumed).toBe(true);
    });

    it('resumes after the open window, until the session ends', () => {
        const id = issue();
        granted(registry().OpenRelaySession(id, FRESH));
        registry().RecordRelayHandle(id, 'h-1');
        advance(20 * 60);
        expect(granted(registry().OpenRelaySession(id, resume('h-1'))).Resumed).toBe(true);
        advance(10 * 60);
        expect(refusal(registry().OpenRelaySession(id, resume('h-1')))).toBe('expired');
        expect(refusal(registry().OpenRelaySession(id, resume('h-1')))).toBe('unknown'); // pruned
        expect(registry().FindRelaySession(id)).toBeNull();
    });

    it('takes at most MaxConnections connections, and refused attempts do not count', () => {
        const id = issue({ MaxConnections: 3 });
        granted(registry().OpenRelaySession(id, FRESH));
        registry().RecordRelayHandle(id, 'h');
        for (let i = 0; i < 5; i++) {
            expect(refusal(registry().OpenRelaySession(id, resume('guess')))).toBe('unknown-handle');
        }
        expect(granted(registry().OpenRelaySession(id, resume('h'))).ConnectionNumber).toBe(2);
        expect(granted(registry().OpenRelaySession(id, resume('h'))).ConnectionNumber).toBe(3);
        expect(refusal(registry().OpenRelaySession(id, resume('h')))).toBe('connection-cap');
        expect(registry().FindRelaySession(id)).toBeNull();
    });

    it('defaults to 10 connections: the fresh one and 9 resumes', () => {
        const id = issue();
        granted(registry().OpenRelaySession(id, FRESH));
        registry().RecordRelayHandle(id, 'h');
        for (let n = 2; n <= 10; n++) {
            expect(granted(registry().OpenRelaySession(id, resume('h'))).ConnectionNumber).toBe(n);
        }
        expect(refusal(registry().OpenRelaySession(id, resume('h')))).toBe('connection-cap');
    });

    it('FindRelaySession reports whether any connection can still open', () => {
        const id = issue({ MaxConnections: 2 });
        expect(registry().FindRelaySession(id)).not.toBeNull(); // fresh available
        granted(registry().OpenRelaySession(id, FRESH));
        expect(registry().FindRelaySession(id)).toBeNull(); // fresh used, no handle yet
        registry().RecordRelayHandle(id, 'h');
        expect(registry().FindRelaySession(id)).not.toBeNull(); // a resume is possible
        granted(registry().OpenRelaySession(id, resume('h')));
        expect(registry().FindRelaySession(id)).toBeNull(); // at the cap
        expect(registry().FindRelaySession('not-a-session')).toBeNull();
        expect(registry().FindRelaySession('')).toBeNull();
    });

    it('refuses an unknown or empty id', () => {
        expect(refusal(registry().OpenRelaySession('nope', FRESH))).toBe('unknown');
        expect(refusal(registry().OpenRelaySession('', FRESH))).toBe('unknown');
    });

    it('prunes a session whose fresh connection never opened within its window', () => {
        const before = registry().RelaySessionCount;
        const id = issue();
        expect(registry().RelaySessionCount).toBe(before + 1);
        advance(301);
        expect(registry().RelaySessionCount).toBe(before);
        expect(registry().FindRelaySession(id)).toBeNull();
    });

    it('keeps the open window inside the lifetime', () => {
        const id = issue({ LifetimeSeconds: 60, OpenWithinSeconds: 300 });
        advance(61);
        expect(refusal(registry().OpenRelaySession(id, FRESH))).toBe('expired');
    });

    it('clamps limits: a 0-second window lasts 1 second, a 0-connection cap allows 1', () => {
        const id = issue({ OpenWithinSeconds: 0, MaxConnections: 0 });
        advance(1.5);
        expect(refusal(registry().OpenRelaySession(id, FRESH))).toBe('fresh-window');
        const capped = issue({ MaxConnections: 0 });
        expect(granted(registry().OpenRelaySession(capped, FRESH)).MaxConnections).toBe(1);
    });

    it('RecordRelayHandle ignores unknown sessions and empty handles', () => {
        expect(() => registry().RecordRelayHandle('no-such-session', 'h')).not.toThrow();
        const id = issue({ LifetimeSeconds: 60 });
        granted(registry().OpenRelaySession(id, FRESH));
        registry().RecordRelayHandle(id, '');
        expect(refusal(registry().OpenRelaySession(id, resume('')))).toBe('unknown-handle');
        expect(registry().FindRelaySession(id)).toBeNull(); // the empty handle was not recorded
    });

    it('remembers the 64 most recent handles and records a repeat once', () => {
        const id = issue({ MaxConnections: 1000 });
        granted(registry().OpenRelaySession(id, FRESH));
        registry().RecordRelayHandle(id, 'kept');
        for (let i = 0; i < 100; i++) {
            registry().RecordRelayHandle(id, 'repeat'); // one entry, not a hundred
        }
        expect(granted(registry().OpenRelaySession(id, resume('kept'))).Resumed).toBe(true);
        for (let i = 0; i < 64; i++) {
            registry().RecordRelayHandle(id, `h-${i}`);
        }
        expect(refusal(registry().OpenRelaySession(id, resume('kept')))).toBe('unknown-handle'); // pushed out
        expect(refusal(registry().OpenRelaySession(id, resume('repeat')))).toBe('unknown-handle');
        expect(granted(registry().OpenRelaySession(id, resume('h-0'))).Resumed).toBe(true);
        expect(granted(registry().OpenRelaySession(id, resume('h-63'))).Resumed).toBe(true);
    });

    it('carries the driver class and user to the grant and to FindRelaySession', () => {
        const id = issue({ DriverClass: 'FakeRelayDriver', UserID: 'user-1' });
        expect(registry().FindRelaySession(id)?.DriverClass).toBe('FakeRelayDriver');
        const grant = granted(registry().OpenRelaySession(id, FRESH));
        expect(grant.DriverClass).toBe('FakeRelayDriver');
        expect(grant.UserID).toBe('user-1');
        expect(grant.ExpiresAtMs).toBe(T0 + 1800 * 1000);
    });

    it('keeps relay sessions and single-use proxy tickets apart', () => {
        const relayId = issue();
        const proxy = registry().Issue({ UpstreamUrl: 'ws://hf.internal/v1/realtime', TTLSeconds: 60 });
        expect(registry().Consume(relayId)).toBeNull();
        expect(registry().FindRelaySession(proxy.ID)).toBeNull();
        expect(registry().Consume(proxy.ID)?.UpstreamUrl).toBe('ws://hf.internal/v1/realtime');
        expect(registry().FindRelaySession(relayId)).not.toBeNull();
    });
});

describe('relay and proxy URLs', () => {
    const ENV_KEYS = ['MJAPI_PUBLIC_URL', 'GRAPHQL_BASE_URL', 'GRAPHQL_PORT'];
    const saved: Record<string, string | undefined> = {};
    beforeEach(() => {
        for (const key of ENV_KEYS) {
            saved[key] = process.env[key];
            delete process.env[key];
        }
    });
    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    });

    it('builds the relay URL with the ticket as a path segment and no trailing slash', () => {
        expect(REALTIME_RELAY_PATH).toBe('/realtime/relay');
        expect(BuildRealtimeRelayUrl('wss://mjapi.example.com', 'abc-123')).toBe('wss://mjapi.example.com/realtime/relay/abc-123');
        expect(BuildRealtimeRelayUrl('wss://mjapi.example.com///', 'abc')).toBe('wss://mjapi.example.com/realtime/relay/abc');
        expect(BuildRealtimeRelayUrl('ws://h:4000', 'a/b?c')).toBe('ws://h:4000/realtime/relay/a%2Fb%3Fc');
    });

    it('keeps the ticket in the path when an SDK appends its own path', () => {
        const base = BuildRealtimeRelayUrl('wss://mjapi.example.com', 'ticket-1');
        const url = new URL(`${base}/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`);
        expect(url.pathname).toBe('/realtime/relay/ticket-1/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent');
        expect(url.search).toBe('');
    });

    it('HttpOriginToWs converts http(s) to ws(s) and drops any path', () => {
        expect(HttpOriginToWs('http://localhost:4000')).toBe('ws://localhost:4000');
        expect(HttpOriginToWs('https://api.example.com/graphql')).toBe('wss://api.example.com');
        expect(HttpOriginToWs('wss://already.ws')).toBe('wss://already.ws');
        expect(HttpOriginToWs('ws://plain:81/x')).toBe('ws://plain:81');
        expect(HttpOriginToWs('not a url//')).toBe('not a url');
    });

    it('ResolveRealtimeProxyBaseWsUrl: Config.proxyBaseUrl, then MJAPI_PUBLIC_URL, then GRAPHQL_BASE_URL + GRAPHQL_PORT', () => {
        expect(ResolveRealtimeProxyBaseWsUrl({})).toBe('ws://localhost:4000');
        process.env['GRAPHQL_BASE_URL'] = 'https://api.deployment.io';
        process.env['GRAPHQL_PORT'] = '8443';
        expect(ResolveRealtimeProxyBaseWsUrl({})).toBe('wss://api.deployment.io:8443');
        process.env['MJAPI_PUBLIC_URL'] = 'https://mjapi.example.com/api';
        expect(ResolveRealtimeProxyBaseWsUrl({ Config: {} })).toBe('wss://mjapi.example.com');
        expect(ResolveRealtimeProxyBaseWsUrl({ Config: { proxyBaseUrl: ' http://override:9000/x ' } })).toBe('ws://override:9000');
        expect(ResolveRealtimeProxyBaseWsUrl({ Config: { proxyBaseUrl: '   ' } })).toBe('wss://mjapi.example.com');
    });

    it("ResolveRealtimeProxyBaseHttpUrl: the same precedence with an http(s) scheme, defaulting to MJAPI's port 4000", () => {
        expect(ResolveRealtimeProxyBaseHttpUrl({})).toBe('http://localhost:4000');
        process.env['GRAPHQL_PORT'] = '4100';
        expect(ResolveRealtimeProxyBaseHttpUrl({})).toBe('http://localhost:4100');
        process.env['GRAPHQL_BASE_URL'] = 'https://api.deployment.io';
        process.env['GRAPHQL_PORT'] = '8443';
        expect(ResolveRealtimeProxyBaseHttpUrl({})).toBe('https://api.deployment.io:8443');
        process.env['MJAPI_PUBLIC_URL'] = 'https://abc123.ngrok.io/graphql';
        expect(ResolveRealtimeProxyBaseHttpUrl({ Config: {} })).toBe('https://abc123.ngrok.io');
        expect(ResolveRealtimeProxyBaseHttpUrl({ Config: { proxyBaseUrl: ' http://override:9000/x ' } })).toBe('http://override:9000');
        expect(ResolveRealtimeProxyBaseHttpUrl({ Config: { proxyBaseUrl: 'wss://edge.example.com/' } })).toBe('https://edge.example.com');
        expect(ResolveRealtimeProxyBaseHttpUrl({ Config: { proxyBaseUrl: 'ws://edge.local:81' } })).toBe('http://edge.local:81');
        expect(ResolveRealtimeProxyBaseHttpUrl({ Config: { proxyBaseUrl: '   ' } })).toBe('https://abc123.ngrok.io');
    });

    it('ResolveRealtimeProxyBaseHttpUrl keeps a relative override relative, without trailing slashes', () => {
        process.env['MJAPI_PUBLIC_URL'] = 'https://mjapi.example.com';
        expect(ResolveRealtimeProxyBaseHttpUrl({ Config: { proxyBaseUrl: '/mjapi/' } })).toBe('/mjapi');
        expect(ResolveRealtimeProxyBaseHttpUrl({ Config: { proxyBaseUrl: '/' } })).toBe('');
    });

    it('the http and websocket origins name the same host and port', () => {
        const cases: Array<{ env: Record<string, string>; config?: { proxyBaseUrl: string } }> = [
            { env: {} },
            { env: { GRAPHQL_PORT: '4100' } },
            { env: { GRAPHQL_BASE_URL: 'https://api.deployment.io', GRAPHQL_PORT: '8443' } },
            { env: { MJAPI_PUBLIC_URL: 'https://abc123.ngrok.io/graphql' } },
            { env: { MJAPI_PUBLIC_URL: 'http://10.0.2.2:4001' }, config: { proxyBaseUrl: 'https://edge.example.com/some/path' } },
        ];
        for (const { env, config } of cases) {
            for (const key of ENV_KEYS) delete process.env[key];
            Object.assign(process.env, env);
            const params = config ? { Config: config } : {};
            const http = ResolveRealtimeProxyBaseHttpUrl(params);
            expect(ResolveRealtimeProxyBaseWsUrl(params)).toBe(http.replace(/^http/, 'ws'));
        }
    });

    it("an empty GRAPHQL_PORT counts as unset, as MJAPI's configuration reads it", () => {
        process.env['GRAPHQL_PORT'] = '';
        expect(ResolveRealtimeProxyBaseWsUrl({})).toBe('ws://localhost:4000');
        expect(ResolveRealtimeProxyBaseHttpUrl({})).toBe('http://localhost:4000');
    });
});
