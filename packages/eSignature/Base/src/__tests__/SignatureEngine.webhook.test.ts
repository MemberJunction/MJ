import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { BaseSignatureProvider } from '../BaseSignatureProvider';
import { SignatureEngine } from '../server/SignatureEngine';
import type { EnvelopeStatus, NormalizedSignatureEvent, WebhookVerificationResult } from '../types';

const USER = { ID: 'user-1', Email: 'sys@example.com' } as unknown as UserInfo;

function makeDriver(verification: WebhookVerificationResult): BaseSignatureProvider {
    const event: NormalizedSignatureEvent = {
        externalEnvelopeId: 'env-123',
        status: 'Completed',
        occurredAt: new Date('2026-11-23T00:00:00Z'),
        rawPayload: {},
    };
    return {
        ParseWebhookEvent: vi.fn(() => event),
        VerifyWebhookSignature: vi.fn(() => verification),
    } as unknown as BaseSignatureProvider;
}

describe('SignatureEngine.RecordWebhookEvent — webhook authenticity policy', () => {
    const originalEnv = process.env.MJ_ESIGNATURE_ALLOW_UNVERIFIED_WEBHOOKS;

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.MJ_ESIGNATURE_ALLOW_UNVERIFIED_WEBHOOKS;
        } else {
            process.env.MJ_ESIGNATURE_ALLOW_UNVERIFIED_WEBHOOKS = originalEnv;
        }
        vi.restoreAllMocks();
    });

    function setupEngine(verification: WebhookVerificationResult) {
        const engine = SignatureEngine.Instance;
        const driver = makeDriver(verification);
        const requestRecord = {
            ID: 'req-1',
            SignatureAccountID: 'acct-1',
            Status: 'Sent' as EnvelopeStatus,
        };
        vi.spyOn(
            engine as unknown as { resolveDriverByKey(): BaseSignatureProvider },
            'resolveDriverByKey'
        ).mockReturnValue(driver);
        vi.spyOn(
            engine as unknown as { findRequestByEnvelopeId(): Promise<typeof requestRecord> },
            'findRequestByEnvelopeId'
        ).mockResolvedValue(requestRecord);
        vi.spyOn(engine, 'GetDriver').mockResolvedValue(driver);
        const applyStatus = vi
            .spyOn(engine as unknown as { applyStatus(): Promise<void> }, 'applyStatus')
            .mockResolvedValue(undefined);
        const logOperation = vi
            .spyOn(engine as unknown as { logOperation(): Promise<void> }, 'logOperation')
            .mockResolvedValue(undefined);

        return { engine, applyStatus, logOperation };
    }

    it('refuses NotConfigured webhooks by default without mutating status', async () => {
        delete process.env.MJ_ESIGNATURE_ALLOW_UNVERIFIED_WEBHOOKS;
        const { engine, applyStatus, logOperation } = setupEngine('NotConfigured');

        const result = await engine.RecordWebhookEvent(
            'DocuSign',
            { envelopeId: 'env-123' },
            {},
            USER,
            Buffer.from('{}'),
            {} as IMetadataProvider
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('no HMAC key is configured');
        expect(applyStatus).not.toHaveBeenCalled();
        expect(logOperation).toHaveBeenCalledTimes(1);
    });

    it('accepts NotConfigured webhooks only when MJ_ESIGNATURE_ALLOW_UNVERIFIED_WEBHOOKS=true', async () => {
        process.env.MJ_ESIGNATURE_ALLOW_UNVERIFIED_WEBHOOKS = 'true';
        const { engine, applyStatus } = setupEngine('NotConfigured');

        const result = await engine.RecordWebhookEvent(
            'DocuSign',
            { envelopeId: 'env-123' },
            {},
            USER,
            Buffer.from('{}'),
            {} as IMetadataProvider
        );

        expect(result.Success).toBe(true);
        expect(applyStatus).toHaveBeenCalledTimes(1);
    });

    it('always rejects Failed signature verification even when unverified opt-in is enabled', async () => {
        process.env.MJ_ESIGNATURE_ALLOW_UNVERIFIED_WEBHOOKS = 'true';
        const { engine, applyStatus } = setupEngine('Failed');

        const result = await engine.RecordWebhookEvent(
            'DocuSign',
            { envelopeId: 'env-123' },
            {},
            USER,
            Buffer.from('{}'),
            {} as IMetadataProvider
        );

        expect(result.Success).toBe(false);
        expect(applyStatus).not.toHaveBeenCalled();
    });
});
