import { describe, it, expect, afterEach, vi } from 'vitest';
import { RunView } from '@memberjunction/core';
import { GenerateDiagnosticKeyPair, SignSenderRequest } from '@memberjunction/diagnostics';
import { EnrolSenderAtCollector } from '../intakeEnrolment.js';
import { ResolveSender, UnknownInstallCache } from '../intakeAuth.js';
import { SenderRegistry } from '../senderRegistry.js';
import { DiagnosticsIssueSenderRegistrationCodeServerOperation } from '../remoteOperations.js';
import {
    AUDIENCE,
    CodeHash,
    COLLECTOR_KEYS,
    CreateFakeRegistrationStore,
    INSTALL_ID,
    NewEnrolBody,
    PlainUser,
    SeedRegistration,
    SystemUser,
} from './review-registration.fixtures.js';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogWarning: vi.fn(), LogDebug: vi.fn() };
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('registration code consumption', () => {
    it('lets only one of two parallel enrolments with one code succeed', async () => {
        const store = CreateFakeRegistrationStore();
        const id = SeedRegistration(store, {
            Status: 'Pending',
            KeyID: null,
            PublicKeyBase64: null,
            RegistrationCodeHash: CodeHash('CODE-123'),
            RegistrationCodeExpiresAt: new Date(Date.now() + 60_000),
        });
        const first = await NewEnrolBody('CODE-123', 'sender-key-a');
        const second = await NewEnrolBody('CODE-123', 'sender-key-b');
        const data = { ContextUser: SystemUser, Provider: store.Provider };

        const outcomes = await Promise.all([
            EnrolSenderAtCollector(first.Body, AUDIENCE, COLLECTOR_KEYS, data),
            EnrolSenderAtCollector(second.Body, AUDIENCE, COLLECTOR_KEYS, data),
        ]);

        const statuses = outcomes.map((o) => (o.Ok ? 200 : o.Status)).sort();
        expect(statuses).toEqual([200, 401]);
        const winner = outcomes[0].Ok ? first : second;
        expect(store.Rows.get(id)?.KeyID).toBe(winner.Key.keyId);
    });
});

describe('enrolment database faults after a valid code and proof', () => {
    async function enrolWithFaultyReload(fault: 'load' | 'save') {
        const store = CreateFakeRegistrationStore();
        SeedRegistration(store, {
            Status: 'Pending',
            KeyID: null,
            PublicKeyBase64: null,
            RegistrationCodeHash: CodeHash('CODE-123'),
            RegistrationCodeExpiresAt: new Date(Date.now() + 60_000),
        });
        const createRow = store.Provider.GetEntityObject.bind(store.Provider);
        vi.spyOn(store.Provider, 'GetEntityObject').mockImplementation(async (...args: Parameters<typeof createRow>) => {
            const row = await createRow(...args);
            if (fault === 'load') row.Load = async () => false;
            else row.Save = async () => false;
            return row;
        });
        const enrol = await NewEnrolBody('CODE-123', 'sender-key-a');
        return EnrolSenderAtCollector(enrol.Body, AUDIENCE, COLLECTOR_KEYS, { ContextUser: SystemUser, Provider: store.Provider });
    }

    it('answers 503 when the registration cannot be reloaded', async () => {
        const outcome = await enrolWithFaultyReload('load');
        expect(outcome.Ok ? 200 : outcome.Status).toBe(503);
    });

    it('answers 503 when the activated registration cannot be saved', async () => {
        const outcome = await enrolWithFaultyReload('save');
        expect(outcome.Ok ? 200 : outcome.Status).toBe(503);
    });
});

describe('sender lookup failures', () => {
    it('does not cache an install as unknown when the registration query fails', async () => {
        const data = { ContextUser: SystemUser, Provider: CreateFakeRegistrationStore().Provider };
        const sender = await GenerateDiagnosticKeyPair('Ed25519', 'sender-key-1');
        let queries = 0;
        const fakeRunView = {
            RunView: async () => {
                queries++;
                return { Success: false, Results: [], TotalRowCount: 0, ErrorMessage: 'connection reset' };
            },
        };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView as unknown as RunView);
        const signed = await SignSenderRequest({
            Method: 'POST',
            Path: '/api/diagnostics/intake/v1/bundles',
            Audience: AUDIENCE,
            InstallID: INSTALL_ID,
            KeyID: sender.keyId,
            PrivateKeyBase64: sender.privateKeyBase64,
            Body: '{}',
        });
        const cache = new UnknownInstallCache();

        const firstTry = await ResolveSender(signed.AuthorizationHeader, new SenderRegistry(), data, cache);
        const secondTry = await ResolveSender(signed.AuthorizationHeader, new SenderRegistry(), data, cache);

        expect(firstTry.Ok).toBe(false);
        expect(secondTry.Ok).toBe(false);
        expect(cache.Size).toBe(0);
        expect(queries).toBe(2);
    });
});

describe('IssueSenderRegistrationCode authorization', () => {
    it('refuses a user without Diagnostics: Manage Intake and leaves the row unchanged', async () => {
        const store = CreateFakeRegistrationStore();
        const id = SeedRegistration(store, { Status: 'Pending', KeyID: null, PublicKeyBase64: null, RegistrationCodeHash: null, RegistrationCodeExpiresAt: null });

        const issued = await new DiagnosticsIssueSenderRegistrationCodeServerOperation().ExecuteServer(
            { RegistrationID: id },
            { provider: store.Provider, user: PlainUser }
        );

        expect(issued.Success).toBe(false);
        expect(issued.ResultCode).toBe('FORBIDDEN');
        expect(store.Rows.get(id)?.RegistrationCodeHash).toBeNull();
        expect(store.Saves()).toBe(0);
    });
});
