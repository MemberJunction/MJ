import * as crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    BuildMjdiagArchive,
    DiagnosticBundleData,
    DiagnosticKeyPair,
    EncryptDiagnosticBundle,
    GenerateDiagnosticKeyPair,
} from '@memberjunction/diagnostics';
import { DiagnosticIntakeService, IntakeCreateBundleRequest } from '../intakeService.js';
import { SenderIdentity } from '../intakeAuth.js';
import { SetDiagnosticsApiRoute } from '../apiRoute.js';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogWarning: vi.fn() };
});

const INSTALL_ID = '6B1D7C70-2C1E-4A55-9C1E-7D2E0B9A1F01';
const systemUser = { ID: 'system-user', Name: 'System', IsActive: true, Type: 'Owner', UserRoles: [] } as unknown as UserInfo;

interface Fixture {
    Request: IntakeCreateBundleRequest;
    Encrypted: Uint8Array;
}

async function createZip(bundleId: string): Promise<Uint8Array> {
    const data: DiagnosticBundleData = {
        environment: { mjVersion: '6.2.0', nodeVersion: process.version, osPlatform: process.platform, osArch: process.arch },
        repro: { breadcrumbs: [] },
        clientLogs: [],
        clientWaterfall: [],
        clientTelemetry: [],
        serverTraces: [],
        serverSql: [],
        serverLogs: [],
        findings: [],
    };
    return BuildMjdiagArchive(data, { bundleId, captureReason: 'Manual', scrubberProfile: 'Standard' });
}

/** Encrypts a bundle to `collectorKey`, naming `senderKeyId` in the envelope and signing with `signer`. */
async function createFixture(collectorKey: DiagnosticKeyPair, senderKeyId: string, signer: DiagnosticKeyPair): Promise<Fixture> {
    const bundleId = `bundle-${crypto.randomUUID()}`;
    const zip = await createZip(bundleId);
    const plaintextSha256 = crypto.createHash('sha256').update(zip).digest('hex');
    const encrypted = await EncryptDiagnosticBundle(zip, {
        recipientKeyId: collectorKey.keyId,
        recipientPublicKeyBase64: collectorKey.publicKeyBase64,
        senderEnvironmentId: INSTALL_ID,
        manifestSha256: plaintextSha256,
        senderKeyId,
        senderSigningPrivateKeyBase64: signer.privateKeyBase64,
    });
    return {
        Encrypted: encrypted,
        Request: {
            installId: INSTALL_ID,
            bundleId,
            formatVersion: 1,
            mjVersion: '6.2.0',
            scrubLiterals: true,
            sizeBytes: encrypted.byteLength,
            plaintextSha256,
            encryptedSha256: crypto.createHash('sha256').update(encrypted).digest('hex'),
            keyId: collectorKey.keyId,
        },
    };
}

function identityFor(key: DiagnosticKeyPair): SenderIdentity {
    return {
        Ok: true,
        InstallID: INSTALL_ID,
        KeyID: key.keyId,
        Registration: { InstallID: INSTALL_ID, KeyID: key.keyId, PublicKeyBase64: key.publicKeyBase64, Status: 'Active', MaxBundlesPerDay: 0, Row: null },
    };
}

/** Runs create, upload and complete for an authenticated sender and returns the complete response. */
async function runSignedIntake(intake: DiagnosticIntakeService, fixture: Fixture, sender: SenderIdentity) {
    const created = intake.InitiateBundleIntake(fixture.Request, sender);
    const uploaded = await intake.UploadEncryptedPayload(created.referenceId, fixture.Encrypted, sender);
    expect(uploaded.accepted).toBe(true);
    return intake.CompleteBundleIntake(
        created.referenceId,
        { encryptedSha256: fixture.Request.encryptedSha256, plaintextSha256: fixture.Request.plaintextSha256 },
        sender
    );
}

describe('DiagnosticIntakeService sender checks', () => {
    let collectorKey: DiagnosticKeyPair;
    let senderKey: DiagnosticKeyPair;
    let intake: DiagnosticIntakeService;

    beforeEach(async () => {
        collectorKey = await GenerateDiagnosticKeyPair('X25519', 'collector-key-1');
        senderKey = await GenerateDiagnosticKeyPair('Ed25519', 'sender-key-1');
        SetDiagnosticsApiRoute((subpath: string, options?: { absolute?: boolean }) =>
            options?.absolute ? `https://collector.test/api${subpath}` : `/api${subpath}`);
        intake = DiagnosticIntakeService.Instance;
        intake.ResetForTests();
        intake.RegisterKeyPair(collectorKey);
        intake.Configure({ enabled: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('requires a valid sender signature on decrypt-on-ingest for an authenticated sender', async () => {
        const impostor = await GenerateDiagnosticKeyPair('Ed25519', senderKey.keyId);
        const fixture = await createFixture(collectorKey, senderKey.keyId, impostor);

        const result = await runSignedIntake(intake, fixture, identityFor(senderKey));

        expect(result.status).toBe('rejected');
        expect(result.reasonCode).toBe('INVALID_SENDER_SIGNATURE');
    });

    it('refuses an envelope whose senderKeyId is not the authenticated key on decrypt-on-ingest', async () => {
        const fixture = await createFixture(collectorKey, 'sender-key-other', senderKey);

        const result = await runSignedIntake(intake, fixture, identityFor(senderKey));

        expect(result.status).toBe('rejected');
        expect(result.reasonCode).toBe('SENDER_KEY_MISMATCH');
    });

    it('refuses an envelope whose senderKeyId is not the authenticated key when DecryptOnIngest is off', async () => {
        intake.Configure({ decryptOnIngest: false });
        const fixture = await createFixture(collectorKey, 'sender-key-other', senderKey);

        const result = await runSignedIntake(intake, fixture, identityFor(senderKey));

        expect(result.status).toBe('rejected');
        expect(result.reasonCode).toBe('SENDER_KEY_MISMATCH');
    });

    it('refuses enrolment when no collector signing key is registered', async () => {
        const provider = { GetEntityObject: async () => ({}) } as unknown as IMetadataProvider;
        intake.Configure({ contextUser: systemUser, provider });

        const outcome = await intake.EnrolSender({
            installId: INSTALL_ID,
            registrationCode: 'CODE-123',
            keyId: senderKey.keyId,
            publicKeyBase64: senderKey.publicKeyBase64,
            proof: 'proof',
        });

        expect(outcome).toMatchObject({ Ok: false, Status: 401, Reason: 'enrolment is not configured' });
    });
});
