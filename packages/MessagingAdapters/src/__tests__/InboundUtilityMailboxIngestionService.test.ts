import http from 'node:http';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJAIBridgeAgentIdentityEntity } from '@memberjunction/core-entities';
import { BaseCommunicationProvider } from '@memberjunction/communication-types';
import { UserCache } from '@memberjunction/generic-database-provider';
import { AgentWakeTriggerService } from '@memberjunction/ai-agents';
import {
    InboundMailboxFetcher,
    InboundUtilityMailboxIngestionService,
} from '../email/InboundUtilityMailboxIngestionService.js';
import {
    CommunicationProviderInboundMailboxFetcher,
    ExtractBareEmailAddress,
    InMemoryInboundMailboxFetcher,
    NormalizeInboundMailProviderName,
} from '../email/CommunicationProviderInboundMailboxFetcher.js';
import {
    EmailUtilityMailboxExtension,
    NormalizeGmailPubSubPayload,
    NormalizeMSGraphWebhookPayload,
    VerifyEmailWebhookSecret,
} from '../email/EmailUtilityMailboxExtension.js';

function makeUser(id: string, email: string, type: 'User' | 'Owner' = 'User'): UserInfo {
    return {
        ID: id,
        Name: email.split('@')[0],
        Email: email,
        IsActive: true,
        Type: type,
        UserRoles: [],
    } as unknown as UserInfo;
}

async function postJson(
    app: express.Application,
    urlPath: string,
    body: unknown,
    headers: Record<string, string> = {}
): Promise<{ status: number; text: string; json: unknown }> {
    const server = await new Promise<http.Server>((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        const resp = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...headers,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await resp.text();
        let json: unknown = null;
        try {
            json = JSON.parse(text);
        } catch {
            json = null;
        }
        return { status: resp.status, text, json };
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
}

describe('InboundUtilityMailboxIngestionService & EmailUtilityMailboxExtension', () => {
    const alice = makeUser('user-alice', 'alice@example.com');
    const systemUser = makeUser('user-system', 'system@example.com', 'Owner');

    beforeEach(() => {
        vi.restoreAllMocks();
        InboundUtilityMailboxIngestionService.Instance.ResetState();
        InboundUtilityMailboxIngestionService.Instance.ClearFetcher();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
    });

    it('deduplicates messageIDs and sweeps active Email bridge identities', async () => {
        const identity = {
            ID: 'id-mail-1',
            AgentID: 'agent-cos',
            IdentityType: 'Email',
            IdentityValue: 'cos@example.com',
            IsActive: true,
        } as unknown as MJAIBridgeAgentIdentityEntity;

        const md = {} as IMetadataProvider;
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [identity] }),
        } as unknown as RunView);

        const routeSpy = vi
            .spyOn(AgentWakeTriggerService.Instance, 'RouteInboundUtilityMailboxWake')
            .mockResolvedValue({
                triggered: true,
                resultCode: 'WAKE_SCHEDULED',
                reason: 'ok',
                routineID: 'r-1',
                targetUserID: alice.ID,
                targetAgentID: 'agent-cos',
                workstreamKey: 'inbound-utility-mailbox',
                nextRunAtISO: new Date().toISOString(),
            });

        const fetcher: InboundMailboxFetcher = {
            FetchMessages: vi.fn().mockResolvedValue([
                {
                    messageID: 'msg-100',
                    toAddress: 'cos@example.com',
                    fromAddress: 'alice@example.com',
                    subject: 'Follow up with finance',
                    bodyPreview: 'Please check Q3 forecast.',
                },
                {
                    messageID: 'msg-100',
                    toAddress: 'cos@example.com',
                    fromAddress: 'alice@example.com',
                    subject: 'Follow up with finance',
                    bodyPreview: 'Duplicate delivery.',
                },
            ]),
        };

        const sweep = await InboundUtilityMailboxIngestionService.Instance.PollActiveUtilityMailboxes(
            systemUser,
            md,
            fetcher
        );

        expect(sweep.identitiesScanned).toBe(1);
        expect(sweep.messagesSeen).toBe(2);
        expect(sweep.wakesScheduled).toBe(1);
        expect(sweep.duplicatesSkipped).toBe(1);
        expect(routeSpy).toHaveBeenCalledTimes(1);
    });

    it('persists durable DB deduplication in MJ: User Settings surviving ResetState() and multi-instance unique races', async () => {
        const persistedSettings = new Map<string, { UserID: string; Setting: string; Value: string }>();

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async (params: { EntityName: string; ExtraFilter?: string }) => {
                if (params.EntityName === 'MJ: User Settings') {
                    const match = Array.from(persistedSettings.values()).filter(
                        (row) => params.ExtraFilter?.includes(row.Setting)
                    );
                    return { Success: true, Results: match };
                }
                return { Success: true, Results: [] };
            }),
        } as unknown as RunView);

        let simulateUniqueRace = false;
        const md = {
            GetEntityObject: vi.fn(async () => {
                const record = {
                    UserID: '',
                    Setting: '',
                    Value: '',
                    LatestResult: { CompleteMessage: '' },
                    NewRecord: vi.fn(),
                    Save: vi.fn(async () => {
                        if (simulateUniqueRace || persistedSettings.has(record.Setting)) {
                            record.LatestResult = {
                                CompleteMessage: 'Violation of UNIQUE KEY constraint UQ_UserSetting_UserID_Setting',
                            };
                            return false;
                        }
                        persistedSettings.set(record.Setting, {
                            UserID: record.UserID,
                            Setting: record.Setting,
                            Value: record.Value,
                        });
                        return true;
                    }),
                };
                return record;
            }),
        } as unknown as IMetadataProvider;

        const routeSpy = vi
            .spyOn(AgentWakeTriggerService.Instance, 'RouteInboundUtilityMailboxWake')
            .mockResolvedValue({
                triggered: true,
                resultCode: 'WAKE_SCHEDULED',
                reason: 'ok',
                routineID: 'r-durable',
                targetUserID: alice.ID,
                targetAgentID: 'agent-cos',
                workstreamKey: 'inbound-utility-mailbox',
                nextRunAtISO: new Date().toISOString(),
            });

        const msg = {
            messageID: 'durable-msg-1',
            toAddress: 'cos@example.com',
            fromAddress: 'alice@example.com',
            subject: 'Board prep',
            receivedAtISO: '2026-11-21T10:00:00.000Z',
        };

        // 1. Initial delivery claims durable MJ: User Settings record and routes wake
        const first = await InboundUtilityMailboxIngestionService.Instance.HandleWebhookMessage(
            msg,
            systemUser,
            md
        );
        expect(first.duplicate).toBe(false);
        expect(first.wakeResult?.triggered).toBe(true);
        const expectedKey = InboundUtilityMailboxIngestionService.BuildDedupSettingKey(
            'cos@example.com',
            'durable-msg-1'
        );
        expect(persistedSettings.has(expectedKey)).toBe(true);
        expect(JSON.parse(persistedSettings.get(expectedKey)!.Value)).toMatchObject({
            toAddress: 'cos@example.com',
            messageID: 'durable-msg-1',
        });

        // 2. Simulate full server restart by clearing L1 in-memory state — L2 DB row still blocks duplicate!
        InboundUtilityMailboxIngestionService.Instance.ResetState();
        const afterRestart = await InboundUtilityMailboxIngestionService.Instance.HandleWebhookMessage(
            msg,
            systemUser,
            md
        );
        expect(afterRestart.duplicate).toBe(true);
        expect(afterRestart.wakeResult).toBeNull();
        expect(routeSpy).toHaveBeenCalledTimes(1);

        // 3. Simulate concurrent multi-instance unique constraint race on a brand-new message ID
        simulateUniqueRace = true;
        const raced = await InboundUtilityMailboxIngestionService.Instance.HandleWebhookMessage(
            { ...msg, messageID: 'raced-msg-2' },
            systemUser,
            md
        );
        expect(raced.duplicate).toBe(true);
        expect(raced.wakeResult).toBeNull();
        expect(routeSpy).toHaveBeenCalledTimes(1);
    });

    it('CommunicationProviderInboundMailboxFetcher supports both Microsoft Graph and Gmail and filters outbound/self messages', async () => {
        expect(ExtractBareEmailAddress('Alice Executive <ALICE@Example.com>')).toBe('alice@example.com');
        expect(NormalizeInboundMailProviderName('MSGraph')).toBe('Microsoft Graph');
        expect(NormalizeInboundMailProviderName('Gmail')).toBe('Gmail');

        const graphProvider = {
            supportsOperation: vi.fn(() => true),
            GetMessages: vi.fn().mockResolvedValue({
                Success: true,
                Messages: [
                    {
                        ExternalSystemRecordID: 'graph-msg-1',
                        From: 'alice@example.com',
                        To: 'cos@example.com',
                        Direction: 'Inbound',
                        Subject: 'From Graph',
                        Body: 'Please review Q4 numbers',
                        ReceivedAt: new Date('2026-11-21T09:00:00Z'),
                    },
                    {
                        ExternalSystemRecordID: 'graph-sent-self',
                        From: 'cos@example.com',
                        To: 'alice@example.com',
                        Direction: 'Outbound',
                        Subject: 'Re: From Graph',
                        Body: 'Sent by utility mailbox',
                    },
                ],
            }),
            GetSingleMessage: vi.fn().mockResolvedValue({
                Success: true,
                Message: {
                    ExternalSystemRecordID: 'graph-msg-99',
                    From: 'alice@example.com',
                    To: 'cos@example.com',
                    Direction: 'Inbound',
                    Subject: 'Single Graph Message',
                    Body: 'Fetched via GetSingleMessage',
                },
            }),
        } as unknown as BaseCommunicationProvider;

        const gmailProvider = {
            supportsOperation: vi.fn(() => true),
            GetMessages: vi.fn().mockResolvedValue({
                Success: true,
                Messages: [
                    {
                        ExternalSystemRecordID: 'gmail-msg-7',
                        From: 'Alice Executive <alice@example.com>',
                        To: 'cos@example.com',
                        Subject: 'From Gmail',
                        Body: 'Check Friday calendar',
                    },
                ],
            }),
        } as unknown as BaseCommunicationProvider;

        const fetcher = new CommunicationProviderInboundMailboxFetcher({
            providerResolver: async (name) => (name === 'Microsoft Graph' ? graphProvider : gmailProvider),
        });

        const graphIdentity = {
            ID: 'id-graph',
            IdentityValue: 'cos@example.com',
            ProviderID: 'prov-graph',
            Configuration: JSON.stringify({ providerName: 'MSGraph' }),
        } as unknown as MJAIBridgeAgentIdentityEntity;

        const graphMessages = await fetcher.FetchMessages(graphIdentity, '2026-11-21T08:00:00Z', systemUser);
        expect(graphMessages).toHaveLength(1);
        expect(graphMessages[0]).toMatchObject({
            messageID: 'graph-msg-1',
            toAddress: 'cos@example.com',
            fromAddress: 'alice@example.com',
            subject: 'From Graph',
        });

        const singleGraph = await fetcher.FetchSingleMessage(
            'cos@example.com',
            'graph-msg-99',
            systemUser,
            'Microsoft Graph'
        );
        expect(singleGraph).toMatchObject({
            messageID: 'graph-msg-99',
            fromAddress: 'alice@example.com',
            subject: 'Single Graph Message',
        });

        const gmailIdentity = {
            ID: 'id-gmail',
            IdentityValue: 'cos@example.com',
            ProviderID: 'prov-gmail',
            Configuration: JSON.stringify({ providerName: 'Gmail' }),
        } as unknown as MJAIBridgeAgentIdentityEntity;

        const gmailMessages = await fetcher.FetchMessages(gmailIdentity, null, systemUser);
        expect(gmailMessages).toHaveLength(1);
        expect(gmailMessages[0]).toMatchObject({
            messageID: 'gmail-msg-7',
            fromAddress: 'alice@example.com',
            subject: 'From Gmail',
        });
    });

    it('normalizes MS Graph handshake/change notifications and Gmail Pub/Sub payloads', () => {
        const handshake = NormalizeMSGraphWebhookPayload({}, 'graph-validation-xyz');
        expect(handshake).toEqual({ kind: 'handshake', validationToken: 'graph-validation-xyz' });

        const graphBatch = NormalizeMSGraphWebhookPayload({
            value: [
                {
                    subscriptionId: 'sub-1',
                    clientState: 'my-secret',
                    changeType: 'created',
                    resource: 'Users/cos@example.com/Messages/AAMk-123',
                    resourceData: { id: 'AAMk-123' },
                },
            ],
        });
        expect(graphBatch.kind).toBe('notifications');
        if (graphBatch.kind === 'notifications') {
            expect(graphBatch.items[0]).toMatchObject({
                subscriptionId: 'sub-1',
                clientState: 'my-secret',
                toAddress: 'cos@example.com',
                messageID: 'AAMk-123',
            });
        }

        const encodedGmail = Buffer.from(
            JSON.stringify({ emailAddress: 'cos@example.com', historyId: 987654 }),
            'utf8'
        ).toString('base64');
        const gmailNorm = NormalizeGmailPubSubPayload({
            message: { data: encodedGmail, messageId: 'pubsub-1' },
        });
        expect(gmailNorm).toEqual({
            kind: 'notification',
            emailAddress: 'cos@example.com',
            historyId: '987654',
        });
    });

    it('verifies shared webhook secrets in constant time', () => {
        expect(VerifyEmailWebhookSecret('super-secret-token', 'super-secret-token')).toBe(true);
        expect(VerifyEmailWebhookSecret('super-secret-token', 'wrong-secret-token')).toBe(false);
        expect(VerifyEmailWebhookSecret('super-secret-token', 'short')).toBe(false);
        expect(VerifyEmailWebhookSecret('super-secret-token', undefined)).toBe(false);
        expect(VerifyEmailWebhookSecret('', 'anything')).toBe(false);
    });

    it('skips initialization when neither WebhookSecret nor PollIntervalMs is configured', async () => {
        const app = express();
        const ext = new EmailUtilityMailboxExtension();
        const prevEnv = process.env.MJ_EMAIL_WEBHOOK_SECRET;
        delete process.env.MJ_EMAIL_WEBHOOK_SECRET;
        try {
            const init = await ext.Initialize(app, {
                Enabled: true,
                DriverClass: 'EmailUtilityMailboxExtension',
                RootPath: '/webhook/email',
                Settings: {},
            });
            expect(init.Success).toBe(false);
            expect(init.Skipped).toBe(true);
        } finally {
            if (prevEnv !== undefined) {
                process.env.MJ_EMAIL_WEBHOOK_SECRET = prevEnv;
            }
        }
    });

    it('mounts native /inbound, /inbound/msgraph, and /inbound/gmail routes, handles handshakes and fetcher hydration, and auto-registers fetcher when PollIntervalMs > 0', async () => {
        const app = express();
        const ext = new EmailUtilityMailboxExtension();
        const init = await ext.Initialize(app, {
            Enabled: true,
            DriverClass: 'EmailUtilityMailboxExtension',
            RootPath: '/webhook/email',
            Settings: {
                WebhookSecret: 'test-webhook-secret',
                PollIntervalMs: 60_000,
            },
        });

        try {
            expect(init.Success).toBe(true);
            expect(init.RegisteredRoutes).toEqual([
                'POST /webhook/email/inbound',
                'POST /webhook/email/inbound/msgraph',
                'POST /webhook/email/inbound/gmail',
                'GET /webhook/email/health',
            ]);
            expect(InboundUtilityMailboxIngestionService.Instance.HasRegisteredFetcher).toBe(true);

            // Swap in InMemoryInboundMailboxFetcher to exercise hint hydration end-to-end over HTTP
            const memFetcher = new InMemoryInboundMailboxFetcher();
            memFetcher.SetMessages('cos@example.com', [
                {
                    messageID: 'AAMk-graph-1',
                    toAddress: 'cos@example.com',
                    fromAddress: 'alice@example.com',
                    subject: 'MS Graph Hint Hydration',
                    bodyPreview: 'Hydrated from Graph change notification.',
                },
                {
                    messageID: 'gmail-hydrated-2',
                    toAddress: 'cos@example.com',
                    fromAddress: 'alice@example.com',
                    subject: 'Gmail Pub/Sub Hydration',
                    bodyPreview: 'Hydrated from Gmail Pub/Sub notification.',
                },
            ]);
            InboundUtilityMailboxIngestionService.Instance.RegisterFetcher(memFetcher);

            const routeSpy = vi
                .spyOn(AgentWakeTriggerService.Instance, 'RouteInboundUtilityMailboxWake')
                .mockResolvedValue({
                    triggered: true,
                    resultCode: 'WAKE_SCHEDULED',
                    reason: 'ok',
                    routineID: 'r-http-1',
                    targetUserID: alice.ID,
                    targetAgentID: 'agent-cos',
                    workstreamKey: 'inbound-utility-mailbox',
                    nextRunAtISO: new Date().toISOString(),
                });

            // 1. MS Graph validationToken handshake
            const handshakeResp = await postJson(
                app,
                '/webhook/email/inbound/msgraph?validationToken=hello-graph-token',
                {}
            );
            expect(handshakeResp.status).toBe(200);
            expect(handshakeResp.text).toBe('hello-graph-token');

            // 2. MS Graph value[] change notification authenticated via clientState -> fetches AAMk-graph-1
            const graphResp = await postJson(app, '/webhook/email/inbound/msgraph', {
                value: [
                    {
                        subscriptionId: 'sub-99',
                        clientState: 'test-webhook-secret',
                        changeType: 'created',
                        resource: 'Users/cos@example.com/Messages/AAMk-graph-1',
                        resourceData: { id: 'AAMk-graph-1' },
                    },
                ],
            });
            expect(graphResp.status).toBe(202);
            expect(graphResp.json).toMatchObject({
                accepted: true,
                processed: 1,
                triggered: 1,
            });

            // 3. Gmail Pub/Sub push authenticated via Authorization Bearer -> fetches mailbox, deduplicates AAMk-graph-1, triggers gmail-hydrated-2
            const gmailData = Buffer.from(
                JSON.stringify({ emailAddress: 'cos@example.com', historyId: '445566' }),
                'utf8'
            ).toString('base64');
            const gmailResp = await postJson(
                app,
                '/webhook/email/inbound/gmail',
                { message: { data: gmailData, messageId: 'ps-1' } },
                { authorization: 'Bearer test-webhook-secret' }
            );
            expect(gmailResp.status).toBe(200);
            expect(gmailResp.json).toMatchObject({
                accepted: true,
                emailAddress: 'cos@example.com',
                historyId: '445566',
                processed: 2,
                triggered: 1,
                duplicates: 1,
            });
            expect(routeSpy).toHaveBeenCalledTimes(2);

            // 4. Unauthorized Gmail webhook rejected with 401
            const unauthResp = await postJson(
                app,
                '/webhook/email/inbound/gmail',
                { message: { data: gmailData } },
                { 'x-mj-webhook-secret': 'wrong-secret' }
            );
            expect(unauthResp.status).toBe(401);

            const health = await ext.HealthCheck();
            expect(health.Healthy).toBe(true);
            expect(health.Name).toBe('EmailUtilityMailboxExtension');
        } finally {
            await ext.Shutdown();
        }

        const afterShutdown = await ext.HealthCheck();
        expect(afterShutdown.Healthy).toBe(false);
    });
});
