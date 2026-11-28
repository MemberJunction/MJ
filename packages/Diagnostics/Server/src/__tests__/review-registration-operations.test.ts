import { describe, it, expect, afterEach, vi } from 'vitest';
import { EnrolSenderAtCollector, IssueSenderRegistrationCode } from '../intakeEnrolment.js';
import {
    DiagnosticsReactivateSenderServerOperation,
    DiagnosticsRevokeSenderServerOperation,
} from '../senderRegistrationOperations.js';
import {
    AUDIENCE,
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

const MANAGE_INTAKE = 'Diagnostics: Manage Intake';
const activeRow = { Status: 'Active', KeyID: 'sender-key-1', PublicKeyBase64: 'QUJD', EnrolledAt: new Date(), RegistrationCodeHash: null, RegistrationCodeExpiresAt: null };

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Diagnostics.RevokeSender', () => {
    it('revokes the row and clears an outstanding registration code', async () => {
        const store = CreateFakeRegistrationStore([MANAGE_INTAKE]);
        const data = { ContextUser: SystemUser, Provider: store.Provider };
        const id = SeedRegistration(store, activeRow);
        await IssueSenderRegistrationCode(id, data);

        const result = await new DiagnosticsRevokeSenderServerOperation().ExecuteServer({ RegistrationID: id }, { provider: store.Provider, user: PlainUser });

        expect(result.Success).toBe(true);
        expect(result.Output).toMatchObject({ RegistrationID: id, InstallID: INSTALL_ID, Status: 'Revoked' });
        expect(Number.isNaN(Date.parse(result.Output?.RevokedAt ?? ''))).toBe(false);
        const row = store.Rows.get(id);
        expect(row?.Status).toBe('Revoked');
        expect(row?.RevokedAt).toBeInstanceOf(Date);
        expect(row?.RegistrationCodeHash).toBeNull();
        expect(row?.RegistrationCodeExpiresAt).toBeNull();
    });

    it('stops a code issued before the revoke from enrolling', async () => {
        const store = CreateFakeRegistrationStore([MANAGE_INTAKE]);
        const data = { ContextUser: SystemUser, Provider: store.Provider };
        const id = SeedRegistration(store, activeRow);
        const issued = await IssueSenderRegistrationCode(id, data);
        await new DiagnosticsRevokeSenderServerOperation().ExecuteServer({ RegistrationID: id }, { provider: store.Provider, user: PlainUser });

        const attacker = await NewEnrolBody(issued.Code, 'attacker-key');
        const outcome = await EnrolSenderAtCollector(attacker.Body, AUDIENCE, COLLECTOR_KEYS, data);

        expect(outcome.Ok).toBe(false);
        expect(store.Rows.get(id)?.Status).toBe('Revoked');
        expect(store.Rows.get(id)?.KeyID).toBe('sender-key-1');
    });

    it('refuses a user without Diagnostics: Manage Intake', async () => {
        const store = CreateFakeRegistrationStore();
        const id = SeedRegistration(store, activeRow);

        const result = await new DiagnosticsRevokeSenderServerOperation().ExecuteServer({ RegistrationID: id }, { provider: store.Provider, user: PlainUser });

        expect(result.ResultCode).toBe('FORBIDDEN');
        expect(store.Rows.get(id)?.Status).toBe('Active');
    });

    it('refuses a registration ID that is not a UUID', async () => {
        const store = CreateFakeRegistrationStore([MANAGE_INTAKE]);
        const result = await new DiagnosticsRevokeSenderServerOperation().ExecuteServer({ RegistrationID: 'nope' }, { provider: store.Provider, user: PlainUser });
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/RegistrationID/);
    });
});

describe('Diagnostics.ReactivateSender', () => {
    it('sets a Revoked row with an enrolled key back to Active', async () => {
        const store = CreateFakeRegistrationStore([MANAGE_INTAKE]);
        const id = SeedRegistration(store, { ...activeRow, Status: 'Revoked', RevokedAt: new Date() });

        const result = await new DiagnosticsReactivateSenderServerOperation().ExecuteServer({ RegistrationID: id }, { provider: store.Provider, user: PlainUser });

        expect(result.Success).toBe(true);
        expect(result.Output).toEqual({ RegistrationID: id, InstallID: INSTALL_ID, Status: 'Active' });
        expect(store.Rows.get(id)?.Status).toBe('Active');
        expect(store.Rows.get(id)?.RevokedAt).toBeNull();
    });

    it.each([
        ['an Active row', { ...activeRow }],
        ['a Pending row', { ...activeRow, Status: 'Pending', KeyID: null, PublicKeyBase64: null, EnrolledAt: null }],
        ['a Revoked row without a key', { ...activeRow, Status: 'Revoked', KeyID: null, PublicKeyBase64: null, RevokedAt: new Date() }],
    ])('refuses %s', async (_label, fields) => {
        const store = CreateFakeRegistrationStore([MANAGE_INTAKE]);
        const id = SeedRegistration(store, fields);
        const before = { ...store.Rows.get(id) };

        const result = await new DiagnosticsReactivateSenderServerOperation().ExecuteServer({ RegistrationID: id }, { provider: store.Provider, user: PlainUser });

        expect(result.Success).toBe(false);
        expect(store.Rows.get(id)).toEqual(before);
    });

    it('refuses a user without Diagnostics: Manage Intake', async () => {
        const store = CreateFakeRegistrationStore();
        const id = SeedRegistration(store, { ...activeRow, Status: 'Revoked', RevokedAt: new Date() });

        const result = await new DiagnosticsReactivateSenderServerOperation().ExecuteServer({ RegistrationID: id }, { provider: store.Provider, user: PlainUser });

        expect(result.ResultCode).toBe('FORBIDDEN');
        expect(store.Rows.get(id)?.Status).toBe('Revoked');
    });
});
