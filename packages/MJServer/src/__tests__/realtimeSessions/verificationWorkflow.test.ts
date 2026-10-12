import { describe, it, expect, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { IdentityVerifiedEventPayload } from '@memberjunction/ai-core-plus';
import {
    RealtimeSessionVerificationWorkflow,
    type ConfigMutation,
    type ConfigMutationResult,
    type OutboundEmail,
    type PrincipalCaller,
    type SessionSnapshot,
    type VerificationAuditEntry,
    type VerificationCaller,
    type VerificationPorts,
    type VerificationSettings,
} from '../../realtimeSessions/verificationWorkflow.js';
import { parseConfigObjectForTest } from './helpers.js';

const OWNER = 'AAAAAAAA-0000-4000-8000-000000000001';
const STRANGER = 'AAAAAAAA-0000-4000-8000-000000000002';
const SESSION_ID = 'BBBBBBBB-0000-4000-8000-000000000001';
const OTHER_SESSION_ID = 'BBBBBBBB-0000-4000-8000-000000000002';
const T0 = Date.parse('2026-10-02T12:00:00.000Z');

/** In-memory ports that behave like the real ones: a session store with read-modify-write, an outbox, an event log, an audit log. */
class FakePorts implements VerificationPorts {
    public Now_ = T0;
    public Settings: VerificationSettings = {
        Enabled: true,
        PolicyDefaults: {},
        PublicBaseUrl: 'https://api.example.com',
        CodeHashKey: 'unit-test-code-hash-key-0123456789',
        RateLimits: { SendWindowMs: 3_600_000, PerIpSends: 100, PerEmailDomainSends: 100, PerEmailSends: 100, CodeAttemptWindowMs: 600_000, PerSessionCodeAttempts: 100 },
    };
    public Sessions = new Map<string, SessionSnapshot>();
    public Emails: OutboundEmail[] = [];
    public EmailResult: { Success: boolean; ErrorMessage?: string } = { Success: true };
    public Published: Array<{ routing: { AgentSessionID: string; OwnerUserID: string; ScopeKey: string | null }; payload: IdentityVerifiedEventPayload }> = [];
    public Audits: VerificationAuditEntry[] = [];
    public PersistFails = false;
    public Writes = 0;
    /** When true, a write yields to the event loop between reading the session and persisting — like a real database round trip. */
    public Latency = false;

    public GetSettings(): VerificationSettings {
        return this.Settings;
    }

    public Now(): number {
        return this.Now_;
    }

    public async LoadSession(id: string): Promise<SessionSnapshot | null> {
        const found = this.Sessions.get(id.toLowerCase());
        return found ? { ...found } : null;
    }

    public async MutateSessionConfig<T>(id: string, _caller: VerificationCaller, mutate: ConfigMutation<T>): Promise<ConfigMutationResult<T>> {
        const stored = this.Sessions.get(id.toLowerCase());
        if (!stored) {
            return { Persisted: false, ErrorMessage: 'not found' };
        }
        const session = { ...stored };
        const { NextConfigRaw, Outcome } = mutate(session);
        if (this.Latency) {
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
        if (NextConfigRaw === null) {
            return { Session: session, Outcome, Persisted: false };
        }
        if (this.PersistFails) {
            return { Session: session, Outcome, Persisted: false, ErrorMessage: 'disk full' };
        }
        stored.ConfigRaw = NextConfigRaw;
        this.Writes++;
        return { Session: session, Outcome, Persisted: true };
    }

    public async SendEmail(email: OutboundEmail): Promise<{ Success: boolean; ErrorMessage?: string }> {
        if (this.EmailResult.Success) {
            this.Emails.push(email);
        }
        return this.EmailResult;
    }

    public PublishVerified(routing: { AgentSessionID: string; OwnerUserID: string; ScopeKey: string | null }, payload: IdentityVerifiedEventPayload) {
        this.Published.push({ routing, payload });
        return { Success: true };
    }

    public async WriteAudit(entry: VerificationAuditEntry): Promise<void> {
        this.Audits.push(entry);
    }

    public AddSession(over: Partial<SessionSnapshot> = {}): SessionSnapshot {
        const session: SessionSnapshot = {
            AgentSessionID: SESSION_ID,
            OwnerUserID: OWNER,
            ConversationExternalID: null,
            Status: 'Active',
            ConfigRaw: JSON.stringify({ targetAgentID: 'target-1' }),
            StartedAtMs: T0,
            ...over,
        };
        this.Sessions.set(session.AgentSessionID.toLowerCase(), session);
        return session;
    }

    public Config(id = SESSION_ID): Record<string, unknown> {
        return parseConfigObjectForTest(this.Sessions.get(id.toLowerCase())?.ConfigRaw ?? null);
    }
}

const principal = (over: Partial<UserInfo> = {}, ClientIp = '203.0.113.7'): PrincipalCaller => ({
    Kind: 'principal',
    ContextUser: { ID: OWNER, ...over } as UserInfo,
    Provider: {} as IMetadataProvider,
    ClientIp,
});

const REQUEST = { AgentSessionID: SESSION_ID, Name: 'Pat Smith', Email: 'Pat@Acme.com' };

/** Pulls the link token and typed code out of the last verification email. */
function secretsFrom(ports: FakePorts): { token: string; code: string } {
    const email = ports.Emails[ports.Emails.length - 1];
    const token = /mj_rv_[0-9a-f]{32}_[0-9a-f]{64}/.exec(email.Text)?.[0];
    const code = /\n(\d{6})\n/.exec(email.Text)?.[1];
    if (!token || !code) throw new Error('no secrets in email');
    return { token, code };
}

describe('RealtimeSessionVerificationWorkflow', () => {
    let ports: FakePorts;
    let workflow: RealtimeSessionVerificationWorkflow;

    const rebuild = () => {
        workflow = new RealtimeSessionVerificationWorkflow(ports);
    };

    beforeEach(() => {
        ports = new FakePorts();
        ports.AddSession();
        rebuild();
    });

    describe('RequestVerification — success path', () => {
        it('stores a pending verification (hashes only), emails a link and a code, and reports what is left', async () => {
            const result = await workflow.RequestVerification(REQUEST, principal());
            expect(result).toMatchObject({ Success: true, VerificationState: 'pending', SendsRemaining: 2 });
            expect(Date.parse(result.ExpiresAt as string)).toBe(T0 + 30 * 60_000);

            expect(ports.Emails).toHaveLength(1);
            expect(ports.Emails[0].To).toBe('pat@acme.com');
            const { token, code } = secretsFrom(ports);
            expect(ports.Emails[0].Text).toContain(`https://api.example.com/realtime/verify/${token}`);
            expect(ports.Emails[0].Html).toContain(code);

            const stored = JSON.stringify(ports.Config());
            expect(stored).not.toContain(token);
            expect(stored).not.toContain(code);
            expect(ports.Config()['identityVerification']).toMatchObject({ SendCount: 1, Pending: { Email: 'pat@acme.com', Name: 'Pat Smith' } });
            expect(ports.Config()['targetAgentID']).toBe('target-1'); // other keys preserved
        });

        it('never reveals the verified state before redemption: nothing is published or audited on request', async () => {
            await workflow.RequestVerification(REQUEST, principal());
            expect(ports.Published).toHaveLength(0);
            expect(ports.Audits).toHaveLength(0);
        });

        it('uses the TTL from policy', async () => {
            ports.Settings.PolicyDefaults = { linkTtlMinutes: 5 };
            const result = await workflow.RequestVerification(REQUEST, principal());
            expect(Date.parse(result.ExpiresAt as string)).toBe(T0 + 5 * 60_000);
            expect(ports.Emails[0].Text).toContain('expire in 5 minutes');
        });

        it('replaces an earlier pending verification (resend) and consumes another send', async () => {
            await workflow.RequestVerification(REQUEST, principal());
            const first = secretsFrom(ports);
            await workflow.RequestVerification(REQUEST, principal());
            const second = secretsFrom(ports);
            expect(second.token).not.toBe(first.token);
            expect((ports.Config()['identityVerification'] as { SendCount: number }).SendCount).toBe(2);
            // The superseded link is dead; the new one works.
            expect(await workflow.RedeemLink(first.token, { Kind: 'link' })).toMatchObject({ Success: false, ErrorCode: 'invalid_link' });
            expect(await workflow.RedeemLink(second.token, { Kind: 'link' })).toMatchObject({ Success: true });
        });
    });

    describe('RequestVerification — refusals', () => {
        it('refuses when the feature is disabled or cannot build a link', async () => {
            ports.Settings.Enabled = false;
            expect(await workflow.RequestVerification(REQUEST, principal())).toMatchObject({ Success: false, ErrorCode: 'verification_unavailable' });
            ports.Settings.Enabled = true;
            ports.Settings.PublicBaseUrl = undefined;
            expect(await workflow.RequestVerification(REQUEST, principal())).toMatchObject({ ErrorCode: 'verification_unavailable' });
            expect(ports.Emails).toHaveLength(0);
        });

        it('refuses a blank name and a malformed email before touching the session', async () => {
            expect(await workflow.RequestVerification({ ...REQUEST, Name: '   ' }, principal())).toMatchObject({ ErrorCode: 'invalid_input' });
            expect(await workflow.RequestVerification({ ...REQUEST, Email: 'not an email' }, principal())).toMatchObject({ ErrorCode: 'invalid_email' });
            expect(ports.Writes).toBe(0);
        });

        it('refuses an unknown session and a malformed session id identically', async () => {
            expect(await workflow.RequestVerification({ ...REQUEST, AgentSessionID: OTHER_SESSION_ID }, principal())).toMatchObject({ ErrorCode: 'session_not_found' });
            expect(await workflow.RequestVerification({ ...REQUEST, AgentSessionID: 'nope' }, principal())).toMatchObject({ ErrorCode: 'session_not_found' });
        });

        it('refuses a non-owner with the same result as a missing session (no enumeration)', async () => {
            const stranger = await workflow.RequestVerification(REQUEST, principal({ ID: STRANGER }));
            const missing = await workflow.RequestVerification({ ...REQUEST, AgentSessionID: OTHER_SESSION_ID }, principal());
            expect(stranger).toEqual(missing);
            expect(ports.Emails).toHaveLength(0);
            expect(ports.Writes).toBe(0);
        });

        it('refuses another anonymous guest sharing the Anonymous user (scope mismatch) and a scope-less anonymous caller', async () => {
            ports.AddSession({ ConversationExternalID: 'scope-A' });
            expect(
                await workflow.RequestVerification(REQUEST, principal({ IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceID: 'scope-B' } })),
            ).toMatchObject({ ErrorCode: 'session_not_found' });
            expect(await workflow.RequestVerification(REQUEST, principal({ IsMagicLinkAnonymous: true }))).toMatchObject({ ErrorCode: 'session_not_found' });
            expect(
                await workflow.RequestVerification(REQUEST, principal({ IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceID: 'scope-A' } })),
            ).toMatchObject({ Success: true });
        });

        it('refuses a closed session', async () => {
            ports.AddSession({ Status: 'Closed' });
            expect(await workflow.RequestVerification(REQUEST, principal())).toMatchObject({ ErrorCode: 'session_closed' });
        });

        it('treats an already-verified session as success without sending anything', async () => {
            await workflow.RequestVerification(REQUEST, principal());
            const { code } = secretsFrom(ports);
            await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal());
            ports.Emails.length = 0;
            expect(await workflow.RequestVerification(REQUEST, principal())).toMatchObject({ Success: true, VerificationState: 'verified', VerifiedEmail: 'pat@acme.com' });
            expect(ports.Emails).toHaveLength(0);
        });
    });

    describe('RequestVerification — email domain policy', () => {
        it('requireBusinessDomain refuses consumer domains and allows business ones', async () => {
            ports.Settings.PolicyDefaults = { requireBusinessDomain: true };
            expect(await workflow.RequestVerification({ ...REQUEST, Email: 'pat@gmail.com' }, principal())).toMatchObject({ Success: false, ErrorCode: 'consumer_domain' });
            expect(await workflow.RequestVerification({ ...REQUEST, Email: 'pat@yahoo.co.uk' }, principal())).toMatchObject({ ErrorCode: 'consumer_domain' });
            expect(await workflow.RequestVerification(REQUEST, principal())).toMatchObject({ Success: true });
            expect(ports.Emails).toHaveLength(1); // only the business address was ever mailed
        });

        it('blockedDomains refuses even business addresses', async () => {
            ports.Settings.PolicyDefaults = { blockedDomains: ['acme.com'] };
            expect(await workflow.RequestVerification(REQUEST, principal())).toMatchObject({ ErrorCode: 'domain_blocked' });
        });

        it('the per-session policy snapshot (from the cascade at mint) overrides server defaults, and the client cannot supply one', async () => {
            ports.Settings.PolicyDefaults = { requireBusinessDomain: false };
            ports.AddSession({ ConfigRaw: JSON.stringify({ identityVerification: { SendCount: 0, Policy: { requireBusinessDomain: true } } }) });
            expect(await workflow.RequestVerification({ ...REQUEST, Email: 'pat@gmail.com' }, principal())).toMatchObject({ ErrorCode: 'consumer_domain' });
        });

        it('honours a custom consumer-domain list', async () => {
            ports.Settings.PolicyDefaults = { requireBusinessDomain: true, consumerDomains: ['freemail.example'] };
            expect(await workflow.RequestVerification({ ...REQUEST, Email: 'pat@freemail.example' }, principal())).toMatchObject({ ErrorCode: 'consumer_domain' });
            expect(await workflow.RequestVerification({ ...REQUEST, Email: 'pat@gmail.com' }, principal())).toMatchObject({ Success: true });
        });
    });

    describe('RequestVerification — send limits', () => {
        it('maxSendsPerSession caps emails per session and survives re-creating the workflow (persisted, not in memory)', async () => {
            ports.Settings.PolicyDefaults = { maxSendsPerSession: 2 };
            expect(await workflow.RequestVerification(REQUEST, principal())).toMatchObject({ Success: true, SendsRemaining: 1 });
            rebuild(); // a different replica / a restart
            expect(await workflow.RequestVerification(REQUEST, principal())).toMatchObject({ Success: true, SendsRemaining: 0 });
            rebuild();
            expect(await workflow.RequestVerification(REQUEST, principal())).toMatchObject({ Success: false, ErrorCode: 'send_limit_reached', SendsRemaining: 0 });
            expect(ports.Emails).toHaveLength(2);
        });

        it('rate limits per client IP', async () => {
            ports.Settings.RateLimits.PerIpSends = 2;
            rebuild();
            expect((await workflow.RequestVerification({ ...REQUEST, Email: 'a@one.com' }, principal({}, '198.51.100.1'))).Success).toBe(true);
            expect((await workflow.RequestVerification({ ...REQUEST, Email: 'b@two.com' }, principal({}, '198.51.100.1'))).Success).toBe(true);
            const limited = await workflow.RequestVerification({ ...REQUEST, Email: 'c@three.com' }, principal({}, '198.51.100.1'));
            expect(limited).toMatchObject({ Success: false, ErrorCode: 'rate_limited' });
            expect(limited.RetryAfterSeconds).toBeGreaterThan(0);
            // A different IP has its own budget.
            expect((await workflow.RequestVerification({ ...REQUEST, Email: 'c@three.com' }, principal({}, '198.51.100.2'))).Success).toBe(true);
        });

        it('rate limits per recipient email domain', async () => {
            ports.Settings.RateLimits.PerEmailDomainSends = 2;
            ports.Settings.PolicyDefaults = { maxSendsPerSession: 10 };
            rebuild();
            expect((await workflow.RequestVerification({ ...REQUEST, Email: 'a@acme.com' }, principal({}, '10.0.0.1'))).Success).toBe(true);
            expect((await workflow.RequestVerification({ ...REQUEST, Email: 'b@acme.com' }, principal({}, '10.0.0.2'))).Success).toBe(true);
            expect(await workflow.RequestVerification({ ...REQUEST, Email: 'c@acme.com' }, principal({}, '10.0.0.3'))).toMatchObject({ ErrorCode: 'rate_limited' });
            expect((await workflow.RequestVerification({ ...REQUEST, Email: 'a@other.com' }, principal({}, '10.0.0.4'))).Success).toBe(true);
        });

        it('rate limits per recipient address (no mail-bombing one inbox through many sessions)', async () => {
            ports.Settings.RateLimits.PerEmailSends = 1;
            ports.Settings.PolicyDefaults = { maxSendsPerSession: 10 };
            rebuild();
            expect((await workflow.RequestVerification(REQUEST, principal({}, '10.0.0.1'))).Success).toBe(true);
            ports.AddSession({ AgentSessionID: OTHER_SESSION_ID });
            expect(await workflow.RequestVerification({ ...REQUEST, AgentSessionID: OTHER_SESSION_ID }, principal({}, '10.0.0.2'))).toMatchObject({ ErrorCode: 'rate_limited' });
            expect(ports.Emails).toHaveLength(1);
        });

        it('treats a zero limit as disabled', async () => {
            ports.Settings.RateLimits = { ...ports.Settings.RateLimits, PerIpSends: 0, PerEmailDomainSends: 0, PerEmailSends: 0 };
            ports.Settings.PolicyDefaults = { maxSendsPerSession: 10 };
            rebuild();
            for (let i = 0; i < 5; i++) {
                expect((await workflow.RequestVerification(REQUEST, principal())).Success).toBe(true);
            }
        });
    });

    describe('RequestVerification — delivery failure', () => {
        it('rolls the pending verification and the send count back, so nothing is consumed and no secret stays live', async () => {
            ports.EmailResult = { Success: false, ErrorMessage: 'provider 500' };
            expect(await workflow.RequestVerification(REQUEST, principal())).toMatchObject({ Success: false, ErrorCode: 'email_send_failed' });
            const state = ports.Config()['identityVerification'] as { SendCount: number; Pending?: unknown };
            expect(state.SendCount).toBe(0);
            expect(state.Pending).toBeUndefined();
        });

        it('fails with persist_failed (and sends nothing) when the pending state cannot be stored', async () => {
            ports.PersistFails = true;
            expect(await workflow.RequestVerification(REQUEST, principal())).toMatchObject({ Success: false, ErrorCode: 'persist_failed' });
            expect(ports.Emails).toHaveLength(0);
        });
    });

    describe('SubmitCode', () => {
        async function requested(): Promise<{ token: string; code: string }> {
            await workflow.RequestVerification(REQUEST, principal());
            return secretsFrom(ports);
        }

        it('verifies, records the identity, publishes identity.verified, audits, and never changes the principal', async () => {
            const { code } = await requested();
            ports.Now_ = T0 + 60_000;
            const result = await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: ` ${code.slice(0, 3)} ${code.slice(3)} ` }, principal());
            expect(result).toMatchObject({ Success: true, VerificationState: 'verified', VerifiedEmail: 'pat@acme.com' });

            expect(ports.Config()['identityVerification']).toMatchObject({ Verified: { Email: 'pat@acme.com', Name: 'Pat Smith', Method: 'code' } });
            expect((ports.Config()['identityVerification'] as { Pending?: unknown }).Pending).toBeUndefined();

            expect(ports.Published).toHaveLength(1);
            expect(ports.Published[0].routing).toEqual({ AgentSessionID: SESSION_ID, OwnerUserID: OWNER, ScopeKey: null });
            expect(ports.Published[0].payload).toMatchObject({ VerifiedEmail: 'pat@acme.com', VerifiedName: 'Pat Smith', Method: 'code' });
            expect(ports.Audits).toEqual([expect.objectContaining({ AgentSessionID: SESSION_ID, OwnerUserID: OWNER, Email: 'pat@acme.com', Method: 'code', ClientIp: '203.0.113.7' })]);
            expect(ports.Sessions.get(SESSION_ID.toLowerCase())?.OwnerUserID).toBe(OWNER);
        });

        it('routes the event with the session scope so an anonymous guest\'s event reaches only that guest', async () => {
            ports.AddSession({ ConversationExternalID: 'scope-A' });
            const guest = principal({ IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceID: 'scope-A' } });
            await workflow.RequestVerification(REQUEST, guest);
            await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: secretsFrom(ports).code }, guest);
            expect(ports.Published[0].routing.ScopeKey).toBe('scope-A');
        });

        it('is single-use: the same code does not verify twice and publishes once', async () => {
            const { code } = await requested();
            await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal());
            const again = await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal());
            expect(again).toMatchObject({ Success: true, VerificationState: 'verified' }); // idempotent for the caller...
            expect(ports.Published).toHaveLength(1); // ...but nothing is re-announced
            expect(ports.Audits).toHaveLength(1);
        });

        it('two simultaneous submissions of the right code verify exactly once (even with database latency)', async () => {
            const { code } = await requested();
            ports.Latency = true;
            const results = await Promise.all([
                workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal()),
                workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal()),
            ]);
            expect(results.every((r) => r.Success)).toBe(true);
            expect(ports.Published).toHaveLength(1);
        });

        it('counts wrong codes, reports attempts left, and voids the verification at the cap', async () => {
            ports.Settings.PolicyDefaults = { maxCodeAttempts: 3 };
            const { code } = await requested();
            const wrong = code === '000000' ? '111111' : '000000';
            expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: wrong }, principal())).toMatchObject({ ErrorCode: 'invalid_code', AttemptsRemaining: 2, VerificationState: 'pending' });
            expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: wrong }, principal())).toMatchObject({ ErrorCode: 'invalid_code', AttemptsRemaining: 1 });
            expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: wrong }, principal())).toMatchObject({ ErrorCode: 'attempts_exhausted' });
            // The right code no longer works: a new email is required.
            expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal())).toMatchObject({ ErrorCode: 'no_pending_verification' });
            expect(ports.Published).toHaveLength(0);
        });

        it('counts attempts across replicas (the counter is persisted on the session)', async () => {
            ports.Settings.PolicyDefaults = { maxCodeAttempts: 2 };
            const { code } = await requested();
            const wrong = code === '000000' ? '111111' : '000000';
            await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: wrong }, principal());
            rebuild();
            expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: wrong }, principal())).toMatchObject({ ErrorCode: 'attempts_exhausted' });
        });

        it('a malformed code is refused without burning an attempt', async () => {
            const { code } = await requested();
            for (const bad of ['12345', 'abcdef', '', '1234567']) {
                expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: bad }, principal())).toMatchObject({ ErrorCode: 'invalid_code' });
            }
            expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal())).toMatchObject({ Success: true });
        });

        it('rejects an expired code', async () => {
            const { code } = await requested();
            ports.Now_ = T0 + 31 * 60_000;
            expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal())).toMatchObject({ ErrorCode: 'code_expired' });
            expect(ports.Published).toHaveLength(0);
        });

        it('says so when nothing was requested', async () => {
            expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: '123456' }, principal())).toMatchObject({ ErrorCode: 'no_pending_verification' });
        });

        it('rate limits submissions per session before any state is read', async () => {
            ports.Settings.RateLimits.PerSessionCodeAttempts = 2;
            rebuild();
            await workflow.RequestVerification(REQUEST, principal());
            const bad = { AgentSessionID: SESSION_ID, Code: '000000' };
            await workflow.SubmitCode(bad, principal());
            await workflow.SubmitCode(bad, principal());
            const limited = await workflow.SubmitCode(bad, principal());
            expect(limited).toMatchObject({ ErrorCode: 'rate_limited' });
            expect(limited.RetryAfterSeconds).toBeGreaterThan(0);
        });

        it('refuses a non-owner and an anonymous guest of another scope', async () => {
            const { code } = await requested();
            expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal({ ID: STRANGER }))).toMatchObject({ ErrorCode: 'session_not_found' });
            ports.AddSession({ ConversationExternalID: 'scope-A', ConfigRaw: ports.Sessions.get(SESSION_ID.toLowerCase())?.ConfigRaw ?? null });
            expect(
                await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal({ IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceID: 'scope-B' } })),
            ).toMatchObject({ ErrorCode: 'session_not_found' });
            expect(ports.Published).toHaveLength(0);
        });

        it('refuses a closed session', async () => {
            const { code } = await requested();
            ports.Sessions.get(SESSION_ID.toLowerCase())!.Status = 'Closed';
            expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal())).toMatchObject({ ErrorCode: 'session_closed' });
        });

        it('reports persist_failed (and publishes nothing) when the verified state cannot be recorded', async () => {
            const { code } = await requested();
            ports.PersistFails = true;
            expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal())).toMatchObject({ ErrorCode: 'persist_failed' });
            expect(ports.Published).toHaveLength(0);
            expect(ports.Audits).toHaveLength(0);
        });

        it('is unavailable when the feature is off', async () => {
            ports.Settings.Enabled = false;
            expect(await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: '123456' }, principal())).toMatchObject({ ErrorCode: 'verification_unavailable' });
        });
    });

    describe('RedeemLink', () => {
        const link: Extract<VerificationCaller, { Kind: 'link' }> = { Kind: 'link', ClientIp: '192.0.2.9' };

        async function requestedToken(): Promise<string> {
            await workflow.RequestVerification(REQUEST, principal());
            return secretsFrom(ports).token;
        }

        it('verifies from a different device with no identity at all, publishes the event and audits', async () => {
            const token = await requestedToken();
            const result = await workflow.RedeemLink(token, link);
            expect(result).toMatchObject({ Success: true, VerificationState: 'verified', VerifiedEmail: 'pat@acme.com' });
            expect(ports.Published[0].payload).toMatchObject({ Method: 'link', VerifiedEmail: 'pat@acme.com' });
            expect(ports.Audits[0]).toMatchObject({ Method: 'link', ClientIp: '192.0.2.9' });
        });

        it('is single-use', async () => {
            const token = await requestedToken();
            expect((await workflow.RedeemLink(token, link)).Success).toBe(true);
            expect(await workflow.RedeemLink(token, link)).toMatchObject({ Success: false, ErrorCode: 'invalid_link' });
            expect(ports.Published).toHaveLength(1);
        });

        it('two simultaneous redemptions of the same link verify exactly once (even with database latency)', async () => {
            const token = await requestedToken();
            ports.Latency = true;
            const results = await Promise.all([workflow.RedeemLink(token, link), workflow.RedeemLink(token, link)]);
            expect(results.filter((r) => r.Success)).toHaveLength(1);
            expect(ports.Published).toHaveLength(1);
        });

        it('a typed code and a link are one verification: whichever is used first wins and kills the other', async () => {
            const token = await requestedToken();
            const { code } = secretsFrom(ports);
            await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: code }, principal());
            expect(await workflow.RedeemLink(token, link)).toMatchObject({ Success: false, ErrorCode: 'invalid_link' });
        });

        it('gives ONE uniform failure for malformed, unknown-session, wrong-secret, expired and used tokens', async () => {
            const token = await requestedToken();
            const forOtherSession = token.replace(SESSION_ID.replace(/-/g, '').toLowerCase(), OTHER_SESSION_ID.replace(/-/g, '').toLowerCase());
            const wrongSecret = token.slice(0, -4) + (token.endsWith('0000') ? '1111' : '0000');
            const outcomes = [
                await workflow.RedeemLink('garbage', link),
                await workflow.RedeemLink(forOtherSession, link), // session does not exist
                await workflow.RedeemLink(wrongSecret, link),
            ];
            ports.Now_ = T0 + 31 * 60_000;
            outcomes.push(await workflow.RedeemLink(token, link)); // expired
            for (const outcome of outcomes) {
                expect(outcome).toEqual({ Success: false, VerificationState: 'unverified', ErrorCode: 'invalid_link', Message: 'This link is no longer valid.' });
            }
        });

        it('does not let a wrong token burn the pending verification', async () => {
            const token = await requestedToken();
            await workflow.RedeemLink(token.slice(0, -4) + (token.endsWith('0000') ? '1111' : '0000'), link);
            expect((await workflow.RedeemLink(token, link)).Success).toBe(true);
        });

        it('records the verification on a CLOSED session (resume after the cap) but announces and extends nothing', async () => {
            ports.Settings.PolicyDefaults = { verifiedMaxSeconds: 3600 };
            ports.AddSession({ ConfigRaw: JSON.stringify({ maxSessionDeadlineIso: new Date(T0 + 300_000).toISOString() }) });
            const token = await requestedToken();
            ports.Sessions.get(SESSION_ID.toLowerCase())!.Status = 'Closed';
            const result = await workflow.RedeemLink(token, link);
            expect(result).toMatchObject({ Success: true, VerificationState: 'verified' });
            expect(result.MaxSessionDeadlineIso).toBeUndefined();
            expect(ports.Config()['maxSessionDeadlineIso']).toBe(new Date(T0 + 300_000).toISOString());
            expect(ports.Published).toHaveLength(0);
            expect(ports.Audits).toHaveLength(1);
        });

        it('reports persist_failed when a valid link cannot be recorded, leaving it redeemable', async () => {
            const token = await requestedToken();
            ports.PersistFails = true;
            expect(await workflow.RedeemLink(token, link)).toMatchObject({ Success: false, ErrorCode: 'persist_failed' });
            ports.PersistFails = false;
            expect((await workflow.RedeemLink(token, link)).Success).toBe(true);
        });

        it('is unavailable when the feature is off', async () => {
            const token = await requestedToken();
            ports.Settings.Enabled = false;
            expect(await workflow.RedeemLink(token, link)).toMatchObject({ ErrorCode: 'verification_unavailable' });
        });
    });

    describe('deadline extension', () => {
        const deadlineAt = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

        async function verifyViaCode(): Promise<string | undefined> {
            await workflow.RequestVerification(REQUEST, principal());
            const result = await workflow.SubmitCode({ AgentSessionID: SESSION_ID, Code: secretsFrom(ports).code }, principal());
            return result.MaxSessionDeadlineIso;
        }

        it('extends maxSessionDeadlineIso to start + verifiedMaxSeconds, writes it, and tells the session', async () => {
            ports.Settings.PolicyDefaults = { verifiedMaxSeconds: 1800 };
            ports.AddSession({ ConfigRaw: JSON.stringify({ maxSessionDeadlineIso: deadlineAt(300_000) }) });
            ports.Now_ = T0 + 120_000;
            expect(await verifyViaCode()).toBe(deadlineAt(1_800_000));
            expect(ports.Config()['maxSessionDeadlineIso']).toBe(deadlineAt(1_800_000));
            expect(ports.Published[0].payload.MaxSessionDeadlineIso).toBe(deadlineAt(1_800_000));
            expect(ports.Audits[0].MaxSessionDeadlineIso).toBe(deadlineAt(1_800_000));
        });

        it('takes verifiedMaxSeconds from the per-session snapshot', async () => {
            ports.AddSession({ ConfigRaw: JSON.stringify({ maxSessionDeadlineIso: deadlineAt(300_000), identityVerification: { SendCount: 0, Policy: { verifiedMaxSeconds: 900 } } }) });
            expect(await verifyViaCode()).toBe(deadlineAt(900_000));
        });

        it('never shortens a deadline', async () => {
            ports.Settings.PolicyDefaults = { verifiedMaxSeconds: 60 };
            ports.AddSession({ ConfigRaw: JSON.stringify({ maxSessionDeadlineIso: deadlineAt(300_000) }) });
            expect(await verifyViaCode()).toBeUndefined();
            expect(ports.Config()['maxSessionDeadlineIso']).toBe(deadlineAt(300_000));
        });

        it('leaves an uncapped session uncapped', async () => {
            ports.Settings.PolicyDefaults = { verifiedMaxSeconds: 1800 };
            expect(await verifyViaCode()).toBeUndefined();
            expect(ports.Config()['maxSessionDeadlineIso']).toBeUndefined();
        });

        it('leaves the deadline alone when no verified cap is configured', async () => {
            ports.AddSession({ ConfigRaw: JSON.stringify({ maxSessionDeadlineIso: deadlineAt(300_000) }) });
            expect(await verifyViaCode()).toBeUndefined();
            expect(ports.Config()['maxSessionDeadlineIso']).toBe(deadlineAt(300_000));
        });
    });

    describe('GetStatus', () => {
        it('reports unverified with the sends left', async () => {
            expect(await workflow.GetStatus({ AgentSessionID: SESSION_ID }, principal())).toMatchObject({ Success: true, VerificationState: 'unverified', SendsRemaining: 3 });
        });

        it('reports a live pending verification with its expiry and attempts left, and not an expired one', async () => {
            await workflow.RequestVerification(REQUEST, principal());
            const live = await workflow.GetStatus({ AgentSessionID: SESSION_ID }, principal());
            expect(live).toMatchObject({ VerificationState: 'pending', SendsRemaining: 2, AttemptsRemaining: 5 });
            expect(live.ExpiresAt).toBeDefined();
            ports.Now_ = T0 + 31 * 60_000;
            expect((await workflow.GetStatus({ AgentSessionID: SESSION_ID }, principal())).VerificationState).toBe('unverified');
        });

        it('reports verified (the durable backstop for a missed event) and works on a closed session', async () => {
            await workflow.RequestVerification(REQUEST, principal());
            await workflow.RedeemLink(secretsFrom(ports).token, { Kind: 'link' });
            ports.Sessions.get(SESSION_ID.toLowerCase())!.Status = 'Closed';
            expect(await workflow.GetStatus({ AgentSessionID: SESSION_ID }, principal())).toMatchObject({ Success: true, VerificationState: 'verified', VerifiedEmail: 'pat@acme.com' });
        });

        it('never leaks pending hashes and refuses non-owners like a missing session', async () => {
            await workflow.RequestVerification(REQUEST, principal());
            const status = await workflow.GetStatus({ AgentSessionID: SESSION_ID }, principal());
            expect(JSON.stringify(status)).not.toMatch(/Hash|Salt|mj_rv_/);
            expect(await workflow.GetStatus({ AgentSessionID: SESSION_ID }, principal({ ID: STRANGER }))).toMatchObject({ ErrorCode: 'session_not_found' });
        });
    });
});
