import { describe, it, expect, vi } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogWarning: vi.fn() };
});

// The generated registration entity is replaced by a stub with plain fields and per-field dirty
// state, so the server subclass can be tested without a database or entity metadata.
vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    class StubSenderRegistrationEntity {
        [field: string]: unknown;
        public IsSaved = false;
        public ContextCurrentUser: unknown = null;
        public StubProvider: unknown = null;
        public SuperSaves = 0;
        public SuperDeletes = 0;
        public Refusals: string[] = [];
        private snapshot: Record<string, unknown> = {};

        public get ProviderToUse(): unknown {
            return this.StubProvider;
        }
        protected get ActiveUser(): unknown {
            return this.ContextCurrentUser;
        }
        /** Records the current values as the stored row. */
        public MarkStored(): void {
            this.IsSaved = true;
            this.snapshot = {};
            for (const [key, value] of Object.entries(this)) this.snapshot[key] = value;
        }
        public GetFieldByName(name: string): { Name: string; Dirty: boolean; OldValue: unknown } {
            return { Name: name, Dirty: this.IsSaved && this.snapshot[name] !== this[name], OldValue: this.snapshot[name] };
        }
        public async Save(): Promise<boolean> {
            this.SuperSaves++;
            return true;
        }
        public async Delete(): Promise<boolean> {
            this.SuperDeletes++;
            return true;
        }
        public RegisterResultHistoryEntry(result: { Message: string }): void {
            this.Refusals.push(result.Message);
        }
    }
    return { ...actual, MJDiagnosticSenderRegistrationEntity: StubSenderRegistrationEntity };
});

import { MJDiagnosticSenderRegistrationEntityServer, MarkTrustedRegistrationWrite } from '../senderRegistrationEntityServer.js';

/** The stub members the tests drive. */
interface StubControls {
    ContextCurrentUser: UserInfo | null;
    StubProvider: IMetadataProvider;
    SuperSaves: number;
    SuperDeletes: number;
    Refusals: string[];
    MarkStored(): void;
}
type TestRow = MJDiagnosticSenderRegistrationEntityServer & StubControls;

const MANAGE_INTAKE = 'Diagnostics: Manage Intake';

const integrationUser = {
    ID: '44444444-4444-4444-4444-444444444444',
    Name: 'Integration',
    IsActive: true,
    Type: 'User',
    UserRoles: [{ RoleID: 'dfafccec-6a37-ef11-86d4-000d3a4e707e', Role: 'Integration' }],
} as unknown as UserInfo;

const intakeManager = {
    ID: '55555555-5555-5555-5555-555555555555',
    Name: 'Intake Manager',
    IsActive: true,
    Type: 'User',
    UserRoles: [{ RoleID: 'e0afccec-6a37-ef11-86d4-000d3a4e707e', Role: 'UI' }],
} as unknown as UserInfo;

/** A provider whose Manage Intake authorization admits only `intakeManager`. */
const provider = {
    Authorizations: [{ Name: MANAGE_INTAKE, UserCanExecute: (user: UserInfo) => user.ID === intakeManager.ID }],
} as unknown as IMetadataProvider;

function newRow(user: UserInfo, fields: Record<string, unknown>): TestRow {
    const row = new MJDiagnosticSenderRegistrationEntityServer(undefined as never) as TestRow;
    row.ContextCurrentUser = user;
    row.StubProvider = provider;
    Object.assign(row, {
        ID: '66666666-6666-6666-6666-666666666666',
        InstallID: 'install-1',
        Name: 'Customer',
        Status: 'Pending',
        KeyAlgorithm: 'Ed25519',
        KeyID: null,
        PublicKeyBase64: null,
        RegistrationCodeHash: null,
        RegistrationCodeExpiresAt: null,
        EnrolledAt: null,
        RevokedAt: null,
        LastSeenAt: null,
        MaxBundlesPerDay: 0,
        ...fields,
    });
    return row;
}

function storedRow(user: UserInfo, fields: Record<string, unknown>): TestRow {
    const row = newRow(user, fields);
    row.MarkStored();
    return row;
}

const activeKey = { Status: 'Active', KeyID: 'attacker-key', PublicKeyBase64: 'QUJD', EnrolledAt: new Date() };

describe('MJ: Diagnostic Sender Registrations server guard', () => {
    describe('a user without Diagnostics: Manage Intake', () => {
        it('cannot create an Active row with a key', async () => {
            const row = newRow(integrationUser, activeKey);
            expect(await row.Save()).toBe(false);
            expect(row.SuperSaves).toBe(0);
        });

        it('cannot set Status from Revoked to Active', async () => {
            const row = storedRow(integrationUser, { ...activeKey, Status: 'Revoked', RevokedAt: new Date() });
            row.Status = 'Active';
            row.RevokedAt = null;
            expect(await row.Save()).toBe(false);
            expect(row.SuperSaves).toBe(0);
        });

        it('cannot change PublicKeyBase64', async () => {
            const row = storedRow(integrationUser, activeKey);
            row.PublicKeyBase64 = 'WFla';
            expect(await row.Save()).toBe(false);
            expect(row.SuperSaves).toBe(0);
        });

        it('cannot delete a row', async () => {
            const row = storedRow(integrationUser, activeKey);
            expect(await row.Delete()).toBe(false);
            expect(row.SuperDeletes).toBe(0);
        });
    });

    describe('a user with Diagnostics: Manage Intake', () => {
        it('can create a Pending row with no key', async () => {
            const row = newRow(intakeManager, {});
            expect(await row.Save()).toBe(true);
            expect(row.SuperSaves).toBe(1);
        });

        it('can edit Name', async () => {
            const row = storedRow(intakeManager, activeKey);
            row.Name = 'Renamed customer';
            expect(await row.Save()).toBe(true);
            expect(row.SuperSaves).toBe(1);
        });

        it('can delete a row', async () => {
            const row = storedRow(intakeManager, activeKey);
            expect(await row.Delete()).toBe(true);
            expect(row.SuperDeletes).toBe(1);
        });

        it.each([
            ['an Active status', { Status: 'Active' }],
            ['a key ID', { KeyID: 'k1' }],
            ['a public key', { PublicKeyBase64: 'QUJD' }],
            ['a registration code hash', { RegistrationCodeHash: 'a'.repeat(64) }],
            ['a code expiry', { RegistrationCodeExpiresAt: new Date() }],
            ['an enrolment time', { EnrolledAt: new Date() }],
            ['a revocation time', { RevokedAt: new Date() }],
            ['a last-seen time', { LastSeenAt: new Date() }],
        ])('cannot create a row with %s', async (_label, fields) => {
            const row = newRow(intakeManager, fields);
            expect(await row.Save()).toBe(false);
            expect(row.SuperSaves).toBe(0);
        });

        it.each([
            ['InstallID', 'install-2'],
            ['Status', 'Active'],
            ['KeyID', 'other-key'],
            ['PublicKeyBase64', 'WFla'],
            ['RegistrationCodeHash', 'b'.repeat(64)],
            ['RegistrationCodeExpiresAt', new Date()],
            ['EnrolledAt', new Date()],
            ['RevokedAt', null],
            ['LastSeenAt', new Date()],
        ])('cannot change %s', async (field, value) => {
            const row = storedRow(intakeManager, { ...activeKey, Status: 'Revoked', RevokedAt: new Date() });
            Object.assign(row, { [field]: value });
            expect(await row.Save()).toBe(false);
            expect(row.SuperSaves).toBe(0);
        });

        it('cannot make a ReplayOnly save', async () => {
            const row = storedRow(intakeManager, activeKey);
            row.Name = 'Renamed customer';
            expect(await row.Save({ ReplayOnly: true })).toBe(false);
            expect(row.SuperSaves).toBe(0);
        });
    });

    describe('trusted writes', () => {
        it('pass for any caller and any field', async () => {
            const row = storedRow(integrationUser, { Status: 'Pending' });
            Object.assign(row, activeKey);
            MarkTrustedRegistrationWrite(row);
            expect(await row.Save()).toBe(true);
            expect(row.SuperSaves).toBe(1);
        });

        it('trust only the next save', async () => {
            const row = storedRow(integrationUser, { Status: 'Pending' });
            MarkTrustedRegistrationWrite(row);
            row.Status = 'Revoked';
            expect(await row.Save()).toBe(true);
            row.MarkStored();
            row.Status = 'Active';
            expect(await row.Save()).toBe(false);
            expect(row.SuperSaves).toBe(1);
        });
    });
});
