import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJAIBridgeAgentIdentityEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { AgentWakeTriggerService } from '@memberjunction/ai-agents';
import {
    InboundMailboxFetcher,
    InboundUtilityMailboxIngestionService,
} from '../email/InboundUtilityMailboxIngestionService.js';
import {
    EmailUtilityMailboxExtension,
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

describe('InboundUtilityMailboxIngestionService & EmailUtilityMailboxExtension', () => {
    const alice = makeUser('user-alice', 'alice@example.com');
    const systemUser = makeUser('user-system', 'system@example.com', 'Owner');

    beforeEach(() => {
        vi.restoreAllMocks();
        InboundUtilityMailboxIngestionService.Instance.ResetState();
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

    it('mounts webhook routes and reports healthy when WebhookSecret is configured', async () => {
        const app = express();
        const ext = new EmailUtilityMailboxExtension();
        const init = await ext.Initialize(app, {
            Enabled: true,
            DriverClass: 'EmailUtilityMailboxExtension',
            RootPath: '/webhook/email',
            Settings: {
                WebhookSecret: 'test-webhook-secret',
            },
        });

        expect(init.Success).toBe(true);
        expect(init.RegisteredRoutes).toEqual(['POST /webhook/email/inbound', 'GET /webhook/email/health']);

        const health = await ext.HealthCheck();
        expect(health.Healthy).toBe(true);
        expect(health.Name).toBe('EmailUtilityMailboxExtension');

        await ext.Shutdown();
        const afterShutdown = await ext.HealthCheck();
        expect(afterShutdown.Healthy).toBe(false);
    });
});
