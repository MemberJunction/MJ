import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Mutable server config the mocked `config.js` serves. */
const config = vi.hoisted(() => ({
    configInfo: {
        publicUrl: 'https://api.example.com',
        baseUrl: 'http://localhost',
        graphqlPort: 4000,
        graphqlRootPath: '/',
        realtime: {
            enabled: true,
            identityVerification: {
                enabled: true as boolean,
                communicationProvider: 'SendGrid' as string | undefined,
                hmacSecret: 'unit-test-hmac-secret-0123456789' as string | undefined,
                deliveryMode: 'send' as 'send' | 'dry-run',
                fromAddress: 'noreply@example.com' as string | undefined,
                publicBaseUrl: undefined as string | undefined,
                contextUserForVerification: undefined as string | undefined,
                policy: {} as Record<string, unknown>,
                rateLimits: {} as Record<string, number>,
            },
        },
    },
}));
vi.mock('../../config.js', () => config);

const mocks = vi.hoisted(() => ({
    serviceUser: { ID: 'SERVICE-USER' } as { ID: string } | null,
    sendSingleMessage: vi.fn(),
    engineConfig: vi.fn(),
}));

vi.mock('../../auth/principals.js', () => ({ ResolveConfiguredPrincipal: vi.fn(() => mocks.serviceUser) }));
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: () => mocks.serviceUser, Users: [], SYSTEM_USER_ID: 'SYS' } },
}));
vi.mock('@memberjunction/communication-engine', () => ({
    CommunicationEngine: { Instance: { Config: mocks.engineConfig, SendSingleMessage: mocks.sendSingleMessage } },
}));
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { IsTrustedSessionConfigWriteActive } from '@memberjunction/core-entities-server';
import { RealtimeSessionVerificationService, RuntimeVerificationPorts } from '../../realtimeSessions/RealtimeSessionVerificationService.js';
import { REALTIME_IDENTITY_VERIFIED_AUDIT_TYPE } from '../../realtimeSessions/SessionVerificationPortsBase.js';
import { RealtimeSessionEventService } from '../../realtimeSessions/RealtimeSessionEventService.js';
import type { VerificationCaller } from '../../realtimeSessions/verificationWorkflow.js';

const OWNER = 'AAAAAAAA-0000-4000-8000-000000000001';
const SESSION_ID = 'BBBBBBBB-0000-4000-8000-000000000001';

/** A session entity double that records Save() calls and whether the trusted scope was active during them. */
interface FakeSessionEntity {
    ID: string;
    UserID: string;
    Status: 'Active' | 'Idle' | 'Closed';
    ConversationID: string | null;
    Config_: string | null;
    __mj_CreatedAt: Date;
    LatestResult?: { CompleteMessage: string };
    Load: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
}

interface Harness {
    provider: IMetadataProvider;
    session: FakeSessionEntity;
    saveScopes: boolean[];
    auditRows: Array<Record<string, unknown>>;
    loadedAs: Array<string>;
}

function harness(over: { externalId?: string | null; saveResult?: boolean; auditTypes?: Array<{ ID: string; Name: string }>; auditSaves?: boolean } = {}): Harness {
    const saveScopes: boolean[] = [];
    const auditRows: Array<Record<string, unknown>> = [];
    const loadedAs: string[] = [];
    const session: FakeSessionEntity = {
        ID: SESSION_ID,
        UserID: OWNER,
        Status: 'Active',
        ConversationID: 'CONV-1',
        Config_: JSON.stringify({ targetAgentID: 't' }),
        __mj_CreatedAt: new Date('2026-10-02T12:00:00.000Z'),
        Load: vi.fn(async () => true),
        Save: vi.fn(async () => {
            saveScopes.push(IsTrustedSessionConfigWriteActive());
            return over.saveResult ?? true;
        }),
    };
    if (over.saveResult === false) {
        session.LatestResult = { CompleteMessage: 'validation refused' };
    }
    const provider = {
        AuditLogTypes: over.auditTypes ?? [{ ID: 'TYPE-1', Name: REALTIME_IDENTITY_VERIFIED_AUDIT_TYPE }],
        EntityByName: (name: string) => (name === 'MJ: AI Agent Sessions' ? { ID: 'ENTITY-SESSIONS' } : undefined),
        GetEntityObject: vi.fn(async (name: string, user: { ID: string }) => {
            loadedAs.push(`${name}@${user.ID}`);
            if (name === 'MJ: AI Agent Sessions') return session;
            if (name === 'MJ: Conversations') return { ExternalID: over.externalId ?? null, Load: vi.fn(async () => true) };
            if (name === 'MJ: Audit Logs') {
                const row: Record<string, unknown> = {
                    NewRecord: vi.fn(),
                    Save: vi.fn(async () => over.auditSaves ?? true),
                    LatestResult: { CompleteMessage: 'audit refused' },
                };
                auditRows.push(row);
                return row;
            }
            throw new Error(`unexpected entity ${name}`);
        }),
    } as unknown as IMetadataProvider;
    Metadata.Provider = provider; // the public link and the audit write use the global provider
    return { provider, session, saveScopes, auditRows, loadedAs };
}

const principalCaller = (provider: IMetadataProvider): VerificationCaller => ({
    Kind: 'principal',
    ContextUser: { ID: OWNER } as UserInfo,
    Provider: provider,
    ClientIp: '203.0.113.7',
});

describe('RuntimeVerificationPorts', () => {
    let ports: RuntimeVerificationPorts;

    beforeEach(() => {
        ports = new RuntimeVerificationPorts();
        mocks.serviceUser = { ID: 'SERVICE-USER' };
        mocks.sendSingleMessage.mockReset();
        mocks.engineConfig.mockReset();
        const cfg = config.configInfo.realtime.identityVerification;
        cfg.enabled = true;
        cfg.communicationProvider = 'SendGrid';
        cfg.hmacSecret = 'unit-test-hmac-secret-0123456789';
        cfg.deliveryMode = 'send';
        cfg.fromAddress = 'noreply@example.com';
        cfg.publicBaseUrl = undefined;
        cfg.policy = {};
        cfg.rateLimits = {};
        config.configInfo.publicUrl = 'https://api.example.com';
    });

    describe('GetSettings', () => {
        it('is enabled only when switched on AND a communication provider is configured', () => {
            expect(ports.GetSettings().Enabled).toBe(true);
            config.configInfo.realtime.identityVerification.communicationProvider = undefined;
            expect(ports.GetSettings().Enabled).toBe(false);
            config.configInfo.realtime.identityVerification.communicationProvider = 'SendGrid';
            config.configInfo.realtime.identityVerification.enabled = false;
            expect(ports.GetSettings().Enabled).toBe(false);
        });

        it('is unavailable without a usable hmacSecret (fail closed), and exposes the key only as CodeHashKey', () => {
            const cfg = config.configInfo.realtime.identityVerification;
            expect(ports.GetSettings().CodeHashKey).toBe('unit-test-hmac-secret-0123456789');
            cfg.hmacSecret = undefined;
            expect(ports.GetSettings().Enabled).toBe(false);
            cfg.hmacSecret = 'too-short';
            expect(ports.GetSettings().Enabled).toBe(false);
        });

        it('builds the public base URL from the explicit setting, else publicUrl, else baseUrl:port — without a trailing slash', () => {
            const cfg = config.configInfo.realtime.identityVerification;
            expect(ports.GetSettings().PublicBaseUrl).toBe('https://api.example.com');
            cfg.publicBaseUrl = 'https://verify.example.com//';
            expect(ports.GetSettings().PublicBaseUrl).toBe('https://verify.example.com');
            cfg.publicBaseUrl = undefined;
            config.configInfo.publicUrl = '';
            expect(ports.GetSettings().PublicBaseUrl).toBe('http://localhost:4000');
        });

        it('reads the policy base layer and the rate limits, with defaults', () => {
            const cfg = config.configInfo.realtime.identityVerification;
            cfg.policy = { requireBusinessDomain: true, linkTtlMinutes: 10, maxSendsPerSession: 'nope' };
            cfg.rateLimits = { perIpSends: 4 };
            const settings = ports.GetSettings();
            expect(settings.PolicyDefaults).toEqual({ requireBusinessDomain: true, linkTtlMinutes: 10 });
            expect(settings.RateLimits).toMatchObject({ PerIpSends: 4, PerEmailDomainSends: 30, PerEmailSends: 3, PerSessionCodeAttempts: 10, SendWindowMs: 3_600_000 });
        });
    });

    describe('LoadSession', () => {
        it('loads a principal\'s session AS THE PRINCIPAL on their own provider (RLS is the first gate)', async () => {
            const h = harness({ externalId: 'scope-1' });
            const snapshot = await ports.LoadSession(SESSION_ID, principalCaller(h.provider));
            expect(snapshot).toMatchObject({ AgentSessionID: SESSION_ID, OwnerUserID: OWNER, ConversationExternalID: 'scope-1', Status: 'Active', StartedAtMs: Date.parse('2026-10-02T12:00:00.000Z') });
            expect(h.loadedAs).toEqual([`MJ: AI Agent Sessions@${OWNER}`, `MJ: Conversations@${OWNER}`]);
        });

        it('loads for the public link as the SERVICE principal on the global provider', async () => {
            const h = harness();
            await ports.LoadSession(SESSION_ID, { Kind: 'link' });
            expect(h.loadedAs[0]).toBe('MJ: AI Agent Sessions@SERVICE-USER');
        });

        it('returns null when there is no service principal for the link', async () => {
            harness();
            mocks.serviceUser = null;
            expect(await ports.LoadSession(SESSION_ID, { Kind: 'link' })).toBeNull();
        });
    });

    describe('MutateSessionConfig', () => {
        it('re-reads the session as the SERVICE principal, writes the mutation INSIDE the trusted scope, and leaves the scope afterwards', async () => {
            const h = harness();
            const result = await ports.MutateSessionConfig(SESSION_ID, principalCaller(h.provider), (current) => ({
                NextConfigRaw: JSON.stringify({ ...JSON.parse(current.ConfigRaw as string), identityVerification: { SendCount: 1 } }),
                Outcome: 'done',
            }));
            expect(result).toMatchObject({ Persisted: true, Outcome: 'done' });
            expect(h.loadedAs[0]).toBe('MJ: AI Agent Sessions@SERVICE-USER'); // never the owner: the owner's own write is exactly what the entity guard refuses
            expect(JSON.parse(h.session.Config_ as string)).toEqual({ targetAgentID: 't', identityVerification: { SendCount: 1 } });
            expect(h.saveScopes).toEqual([true]);
            expect(IsTrustedSessionConfigWriteActive()).toBe(false);
        });

        it('does not write when the mutation declines', async () => {
            const h = harness();
            const result = await ports.MutateSessionConfig(SESSION_ID, principalCaller(h.provider), () => ({ NextConfigRaw: null, Outcome: 'noop' }));
            expect(result).toMatchObject({ Persisted: false, Outcome: 'noop' });
            expect(h.session.Save).not.toHaveBeenCalled();
        });

        it('reports a refused save with its reason', async () => {
            const h = harness({ saveResult: false });
            const result = await ports.MutateSessionConfig(SESSION_ID, principalCaller(h.provider), () => ({ NextConfigRaw: '{}', Outcome: 1 }));
            expect(result).toMatchObject({ Persisted: false, Outcome: 1, ErrorMessage: 'validation refused' });
        });

        it('reports a missing session and a missing service principal without writing', async () => {
            const h = harness();
            h.session.Load.mockResolvedValueOnce(false);
            expect(await ports.MutateSessionConfig(SESSION_ID, principalCaller(h.provider), () => ({ NextConfigRaw: '{}', Outcome: 1 }))).toMatchObject({ Persisted: false, ErrorMessage: expect.stringContaining('could not be read') });
            mocks.serviceUser = null;
            expect(await ports.MutateSessionConfig(SESSION_ID, principalCaller(h.provider), () => ({ NextConfigRaw: '{}', Outcome: 1 }))).toMatchObject({ Persisted: false, ErrorMessage: expect.stringContaining('service principal') });
            expect(h.session.Save).not.toHaveBeenCalled();
        });

        it('turns a thrown error into a failed result instead of rejecting', async () => {
            const h = harness();
            h.session.Save.mockRejectedValueOnce(new Error('connection reset'));
            const result = await ports.MutateSessionConfig(SESSION_ID, principalCaller(h.provider), () => ({ NextConfigRaw: '{}', Outcome: 1 }));
            expect(result).toMatchObject({ Persisted: false, ErrorMessage: 'connection reset' });
        });
    });

    describe('SendEmail', () => {
        const email = { To: 'pat@acme.com', Subject: 'Confirm', Text: 'text', Html: '<p>html</p>' };

        it('sends through the configured communication provider as the service principal', async () => {
            mocks.sendSingleMessage.mockResolvedValue({ Success: true });
            expect(await ports.SendEmail(email)).toEqual({ Success: true });
            expect(mocks.engineConfig).toHaveBeenCalledWith(false, mocks.serviceUser);
            const [providerName, type, message] = mocks.sendSingleMessage.mock.calls[0];
            expect(providerName).toBe('SendGrid');
            expect(type).toBe('Email');
            expect(message).toMatchObject({ From: 'noreply@example.com', To: 'pat@acme.com', Subject: 'Confirm', Body: 'text', HTMLBody: '<p>html</p>' });
        });

        it('rehearsal delivery mode builds and logs the message but marks it DryRun so nothing is delivered', async () => {
            config.configInfo.realtime.identityVerification.deliveryMode = 'dry-run';
            mocks.sendSingleMessage.mockResolvedValue({ Success: true, DryRun: true });
            expect(await ports.SendEmail(email)).toEqual({ Success: true });
            expect(mocks.sendSingleMessage.mock.calls[0][2]).toMatchObject({ DryRun: true });
        });

        it('delivers for real by default (DryRun off)', async () => {
            mocks.sendSingleMessage.mockResolvedValue({ Success: true });
            await ports.SendEmail(email);
            expect(mocks.sendSingleMessage.mock.calls[0][2].DryRun).toBe(false);
        });

        it('reports a provider failure', async () => {
            mocks.sendSingleMessage.mockResolvedValue({ Success: false, Error: 'quota' });
            expect(await ports.SendEmail(email)).toEqual({ Success: false, ErrorMessage: 'quota' });
        });

        it('reports a thrown error and a missing configuration without throwing', async () => {
            mocks.sendSingleMessage.mockRejectedValue(new Error('network'));
            expect(await ports.SendEmail(email)).toEqual({ Success: false, ErrorMessage: 'network' });
            config.configInfo.realtime.identityVerification.communicationProvider = undefined;
            expect(await ports.SendEmail(email)).toMatchObject({ Success: false, ErrorMessage: expect.stringContaining('No communication provider') });
        });
    });

    describe('PublishVerified', () => {
        it('publishes identity.verified through the event service with the routing it was given', () => {
            const spy = vi.spyOn(RealtimeSessionEventService.Instance, 'PublishRouted').mockReturnValue({ Success: true });
            const payload = { VerifiedEmail: 'a@b.co', VerifiedName: 'A', VerifiedAt: '2026-10-02T12:00:00.000Z', Method: 'link' as const };
            const routing = { AgentSessionID: SESSION_ID, OwnerUserID: OWNER, ScopeKey: 'scope-1' };
            expect(ports.PublishVerified(routing, payload)).toEqual({ Success: true });
            expect(spy).toHaveBeenCalledWith(routing, 'identity.verified', payload);
            spy.mockRestore();
        });
    });

    describe('WriteAudit', () => {
        const entry = { AgentSessionID: SESSION_ID, OwnerUserID: OWNER, Email: 'pat@acme.com', Method: 'code' as const, ClientIp: '203.0.113.7', MaxSessionDeadlineIso: '2026-10-02T13:00:00.000Z' };

        it('writes an MJ audit-log row as the service principal, about the session', async () => {
            const h = harness();
            await ports.WriteAudit(entry);
            expect(h.auditRows).toHaveLength(1);
            expect(h.loadedAs).toContain('MJ: Audit Logs@SERVICE-USER');
            expect(h.auditRows[0]).toMatchObject({
                UserID: OWNER,
                AuditLogTypeID: 'TYPE-1',
                Status: 'Success',
                EntityID: 'ENTITY-SESSIONS',
                RecordID: SESSION_ID,
            });
            expect(String(h.auditRows[0].Description)).toContain('pat@acme.com');
            expect(JSON.parse(h.auditRows[0].Details as string)).toEqual({ email: 'pat@acme.com', method: 'code', ipAddress: '203.0.113.7', maxSessionDeadlineIso: '2026-10-02T13:00:00.000Z' });
        });

        it('degrades to a server-log line (never throws, never silently drops) when the audit type is not seeded', async () => {
            const h = harness({ auditTypes: [] });
            await expect(ports.WriteAudit(entry)).resolves.toBeUndefined();
            expect(h.auditRows).toHaveLength(0);
        });

        it('survives a refused audit save', async () => {
            harness({ auditSaves: false });
            await expect(ports.WriteAudit(entry)).resolves.toBeUndefined();
        });
    });
});

describe('RealtimeSessionVerificationService', () => {
    it('is a process-wide singleton and reflects whether verification is enabled', () => {
        expect(RealtimeSessionVerificationService.Instance).toBe(RealtimeSessionVerificationService.Instance);
        config.configInfo.realtime.identityVerification.enabled = true;
        config.configInfo.realtime.identityVerification.communicationProvider = 'SendGrid';
        config.configInfo.realtime.identityVerification.hmacSecret = 'unit-test-hmac-secret-0123456789';
        expect(RealtimeSessionVerificationService.Instance.IsEnabled).toBe(true);
        config.configInfo.realtime.identityVerification.enabled = false;
        expect(RealtimeSessionVerificationService.Instance.IsEnabled).toBe(false);
    });

    it('answers every operation with a uniform "unavailable" when disabled', async () => {
        config.configInfo.realtime.identityVerification.enabled = false;
        const service = RealtimeSessionVerificationService.Instance;
        const h = harness();
        const caller = principalCaller(h.provider) as Extract<VerificationCaller, { Kind: 'principal' }>;
        expect(await service.RequestVerification({ AgentSessionID: SESSION_ID, Name: 'Pat', Email: 'pat@acme.com' }, caller)).toMatchObject({ ErrorCode: 'verification_unavailable' });
        expect(await service.SubmitCode({ AgentSessionID: SESSION_ID, Code: '123456' }, caller)).toMatchObject({ ErrorCode: 'verification_unavailable' });
        expect(await service.GetStatus({ AgentSessionID: SESSION_ID }, caller)).toMatchObject({ ErrorCode: 'verification_unavailable' });
        expect(await service.RedeemLink('mj_rv_x', '192.0.2.1')).toMatchObject({ ErrorCode: 'verification_unavailable' });
    });
});
