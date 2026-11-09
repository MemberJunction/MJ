import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
    BaseSignatureProvider,
    CreateEnvelopeRequest,
    EnvelopeResult,
    EnvelopeStatusResult,
    NormalizedSignatureEvent,
    OperationResult,
    SignatureOperation,
    SignatureProviderConfig,
    SignedDocumentResult,
    WebhookVerificationResult,
} from '../index';
import { SignatureEngine } from '../server/SignatureEngine';

/**
 * Audit finding (MJ#6240): the pre-auth eSignature webhook must be default-strict. These tests
 * pin that an event which is not `Verified` never changes a signature request's status.
 */

// ---- Test doubles ---------------------------------------------------------------------------------

interface FakeRequest {
    ID: string;
    Status: string;
    SignatureAccountID: string;
    CompletedAt: Date | null;
    Save: () => Promise<boolean>;
}

interface FakeLog {
    SignatureRequestID?: string;
    Operation?: string;
    Success?: boolean;
    StatusBefore?: string;
    StatusAfter?: string;
    Detail?: string;
    Save: () => Promise<boolean>;
}

const state = vi.hoisted(() => ({
    request: null as unknown,
    logError: vi.fn(),
    logStatus: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class FakeRunView {
        public static FromMetadataProvider(): FakeRunView {
            return new FakeRunView();
        }
        public async RunView(): Promise<{ Success: boolean; Results: unknown[] }> {
            return { Success: true, Results: state.request ? [state.request] : [] };
        }
    }
    return { ...actual, RunView: FakeRunView, LogError: state.logError, LogStatus: state.logStatus };
});

// The webhook path never touches credential decryption or artifact storage; stub those packages so
// the test does not load the Credential Engine / storage drivers.
vi.mock('@memberjunction/credentials', () => ({ CredentialEngine: { Instance: {} } }));
vi.mock('@memberjunction/storage', () => ({ FileStorageEngine: { Instance: {} } }));

const DRIVER_KEY = 'WebhookTestDriver';
const ENVELOPE_ID = 'env-123';

/** Driver whose verification outcome is set per test. */
class WebhookTestDriver extends BaseSignatureProvider {
    public static Verification: WebhookVerificationResult = 'NotConfigured';
    protected readonly providerKey = DRIVER_KEY;

    public async initialize(_config: SignatureProviderConfig): Promise<void> {}
    public get IsConfigured(): boolean {
        return true;
    }
    public async CreateEnvelope(_req: CreateEnvelopeRequest): Promise<EnvelopeResult> {
        return { Success: true, externalEnvelopeId: ENVELOPE_ID, status: 'Sent' };
    }
    public async GetEnvelopeStatus(_id: string): Promise<EnvelopeStatusResult> {
        return { Success: true, status: 'Sent' };
    }
    public async DownloadSignedDocument(_id: string): Promise<SignedDocumentResult> {
        return { Success: false, ErrorMessage: 'n/a' };
    }
    public async VoidEnvelope(_id: string, _reason: string): Promise<OperationResult> {
        return { Success: true };
    }
    public getSupportedOperations(): SignatureOperation[] {
        return ['CreateEnvelope', 'ParseWebhookEvent', 'VerifyWebhookSignature'];
    }
    public override ParseWebhookEvent(payload: unknown): NormalizedSignatureEvent | null {
        const status = (payload as { status: NormalizedSignatureEvent['status'] }).status;
        return { externalEnvelopeId: ENVELOPE_ID, status, occurredAt: '2026-01-01T00:00:00Z', raw: payload };
    }
    public override VerifyWebhookSignature(): WebhookVerificationResult {
        return WebhookTestDriver.Verification;
    }
}
MJGlobal.Instance.ClassFactory.Register(BaseSignatureProvider, WebhookTestDriver, DRIVER_KEY);

const contextUser = { ID: 'user-1' } as unknown as UserInfo;

function makeHarness(): { request: FakeRequest; logs: FakeLog[]; provider: IMetadataProvider } {
    const request: FakeRequest = {
        ID: 'req-1',
        Status: 'Sent',
        SignatureAccountID: 'acct-1',
        CompletedAt: null,
        Save: vi.fn(async () => true),
    };
    state.request = request;
    const logs: FakeLog[] = [];
    const provider = {
        GetEntityObject: async (): Promise<FakeLog> => {
            const log: FakeLog = { Save: async () => true };
            logs.push(log);
            return log;
        },
    } as unknown as IMetadataProvider;
    return { request, logs, provider };
}

async function sendForgedCompleted(provider: IMetadataProvider, allowUnverified?: boolean) {
    return SignatureEngine.Instance.RecordWebhookEvent(
        DRIVER_KEY,
        { status: 'Completed' },
        {},
        contextUser,
        Buffer.from('{"status":"Completed"}'),
        provider,
        allowUnverified === undefined ? undefined : { AllowUnverified: allowUnverified },
    );
}

describe('SignatureEngine.RecordWebhookEvent — authenticity (default-strict)', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        state.logError.mockClear();
        state.logStatus.mockClear();
        process.env.NODE_ENV = 'test';
        vi.spyOn(SignatureEngine.Instance, 'GetDriver').mockResolvedValue(new WebhookTestDriver());
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        vi.restoreAllMocks();
    });

    it('rejects a payload when no webhook secret is configured (status unchanged, audited, logged)', async () => {
        WebhookTestDriver.Verification = 'NotConfigured';
        const { request, logs, provider } = makeHarness();

        const result = await sendForgedCompleted(provider);

        expect(result.Success).toBe(false);
        expect(result.Rejection).toBe('VerificationNotConfigured');
        expect(request.Status).toBe('Sent');
        expect(request.CompletedAt).toBeNull();
        expect(request.Save).not.toHaveBeenCalled();
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({ SignatureRequestID: 'req-1', Operation: 'Webhook', Success: false, StatusBefore: 'Sent' });
        expect(state.logError).toHaveBeenCalledTimes(1);
        const message = String(state.logError.mock.calls[0][0]);
        expect(message).toContain(DRIVER_KEY);
        expect(message).toContain('acct-1');
        expect(message).toContain('connectHmacKey');
    });

    it('rejects when AllowUnverified is explicitly false', async () => {
        WebhookTestDriver.Verification = 'NotConfigured';
        const { request, provider } = makeHarness();

        const result = await sendForgedCompleted(provider, false);

        expect(result.Rejection).toBe('VerificationNotConfigured');
        expect(request.Status).toBe('Sent');
    });

    it('applies an unverified payload when AllowUnverified is set outside production', async () => {
        WebhookTestDriver.Verification = 'NotConfigured';
        const { request, logs, provider } = makeHarness();

        const result = await sendForgedCompleted(provider, true);

        expect(result.Success).toBe(true);
        expect(result.Rejection).toBeUndefined();
        expect(request.Status).toBe('Completed');
        expect(request.CompletedAt).toBeInstanceOf(Date);
        expect(logs[0]).toMatchObject({ Operation: 'Webhook', Success: true });
        expect(state.logStatus).toHaveBeenCalledTimes(1);
    });

    it('ignores AllowUnverified when NODE_ENV=production', async () => {
        process.env.NODE_ENV = 'production';
        WebhookTestDriver.Verification = 'NotConfigured';
        const { request, provider } = makeHarness();

        const result = await sendForgedCompleted(provider, true);

        expect(result.Success).toBe(false);
        expect(result.Rejection).toBe('VerificationNotConfigured');
        expect(request.Status).toBe('Sent');
        expect(request.Save).not.toHaveBeenCalled();
        expect(String(state.logError.mock.calls[0][0])).toContain('NODE_ENV=production');
    });

    it('rejects an invalid signature, even with AllowUnverified', async () => {
        WebhookTestDriver.Verification = 'Failed';
        const { request, logs, provider } = makeHarness();

        const result = await sendForgedCompleted(provider, true);

        expect(result.Success).toBe(false);
        expect(result.Rejection).toBe('VerificationFailed');
        expect(request.Status).toBe('Sent');
        expect(request.Save).not.toHaveBeenCalled();
        expect(logs[0]).toMatchObject({ Operation: 'Webhook', Success: false });
    });

    it('rejects an unrecognized verification outcome (allow-list, not deny-list)', async () => {
        WebhookTestDriver.Verification = 'SomethingElse' as WebhookVerificationResult;
        const { request, provider } = makeHarness();

        const result = await sendForgedCompleted(provider, true);

        expect(result.Rejection).toBe('VerificationFailed');
        expect(request.Status).toBe('Sent');
    });

    it('applies a verified payload', async () => {
        WebhookTestDriver.Verification = 'Verified';
        const { request, logs, provider } = makeHarness();

        const result = await sendForgedCompleted(provider);

        expect(result.Success).toBe(true);
        expect(result.event?.status).toBe('Completed');
        expect(request.Status).toBe('Completed');
        expect(request.Save).toHaveBeenCalledTimes(1);
        expect(logs[0]).toMatchObject({ Operation: 'Webhook', Success: true, StatusBefore: 'Sent', StatusAfter: 'Completed' });
        expect(state.logError).not.toHaveBeenCalled();
    });
});
