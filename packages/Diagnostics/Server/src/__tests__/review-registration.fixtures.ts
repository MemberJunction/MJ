import * as crypto from 'node:crypto';
import { vi } from 'vitest';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { GenerateDiagnosticKeyPair, DiagnosticKeyPair, SignEnrolProof } from '@memberjunction/diagnostics';
import { EnrolRequestBody } from '../intakeEnrolment.js';

export const REGISTRATION_ENTITY = 'MJ: Diagnostic Sender Registrations';
export const AUDIENCE = 'https://collector.test/api/diagnostics/intake/v1';
export const INSTALL_ID = '6B1D7C70-2C1E-4A55-9C1E-7D2E0B9A1F01';

type FieldValue = string | number | boolean | Date | null | undefined;
export type Fields = Record<string, FieldValue>;

interface FakeRow {
    ID: string;
    LatestResult: { CompleteMessage: string };
    Save: () => Promise<boolean>;
    Load: (id: string) => Promise<boolean>;
    [field: string]: FieldValue | FakeRow['LatestResult'] | FakeRow['Save'] | FakeRow['Load'];
}

/** Registration rows kept in memory, served through a fake provider and a fake `RunView`. */
export interface FakeRegistrationStore {
    Provider: IMetadataProvider;
    Rows: Map<string, Fields>;
    Saves: () => number;
}

function fieldsOf(row: FakeRow): Fields {
    const out: Fields = {};
    for (const [key, value] of Object.entries(row)) {
        if (typeof value !== 'function' && key !== 'LatestResult') out[key] = value as FieldValue;
    }
    return out;
}

/** Builds the store. `authorizations` lists the authorization names every caller holds. */
export function CreateFakeRegistrationStore(authorizations: string[] = []): FakeRegistrationStore {
    const rows = new Map<string, Fields>();
    let saves = 0;
    const createRow = (initial: Fields = {}): FakeRow => {
        const row: FakeRow = {
            ID: '',
            LatestResult: { CompleteMessage: 'save failed' },
            Save: async () => {
                saves++;
                if (!row.ID) row.ID = crypto.randomUUID().toUpperCase();
                rows.set(row.ID, fieldsOf(row));
                return true;
            },
            Load: async (id: string) => {
                const stored = rows.get(id);
                if (!stored) return false;
                Object.assign(row, stored);
                return true;
            },
        };
        Object.assign(row, initial);
        return row;
    };
    const fakeRunView = {
        RunView: async (params: { ExtraFilter?: string }) => {
            const installId = /InstallID = '([^']*)'/.exec(params.ExtraFilter ?? '')?.[1]?.toLowerCase();
            const matches = [...rows.values()].filter((r) => String(r.InstallID).toLowerCase() === installId);
            return { Success: true, Results: matches.map((r) => createRow(r)), TotalRowCount: matches.length, ErrorMessage: '' };
        },
    };
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView as unknown as RunView);
    return {
        Provider: {
            GetEntityObject: async () => createRow(),
            Authorizations: authorizations.map((Name) => ({ Name, UserCanExecute: () => true })),
        } as unknown as IMetadataProvider,
        Rows: rows,
        Saves: () => saves,
    };
}

/** Adds a registration row and returns its ID. */
export function SeedRegistration(store: FakeRegistrationStore, fields: Fields): string {
    const id = crypto.randomUUID().toUpperCase();
    store.Rows.set(id, {
        ID: id,
        InstallID: INSTALL_ID,
        Name: 'Customer',
        KeyAlgorithm: 'Ed25519',
        MaxBundlesPerDay: 0,
        EnrolledAt: null,
        RevokedAt: null,
        LastSeenAt: null,
        ...fields,
    });
    return id;
}

/** Hex SHA-256 of a registration code, as stored on the row. */
export function CodeHash(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
}

/** A new sender key and a signed enrolment body for `code`. */
export async function NewEnrolBody(code: string, keyId: string): Promise<{ Body: EnrolRequestBody; Key: DiagnosticKeyPair }> {
    const key = await GenerateDiagnosticKeyPair('Ed25519', keyId);
    const proof = await SignEnrolProof({
        InstallID: INSTALL_ID,
        KeyID: key.keyId,
        RegistrationCode: code,
        Audience: AUDIENCE,
        PrivateKeyBase64: key.privateKeyBase64,
    });
    return {
        Body: { installId: INSTALL_ID, registrationCode: code, keyId: key.keyId, publicKeyBase64: key.publicKeyBase64, proof },
        Key: key,
    };
}

export const COLLECTOR_KEYS = { PublicKeyBase64: 'collector-x25519', SigningPublicKeyBase64: 'collector-ed25519' };

export const SystemUser = { ID: 'system-user', Name: 'System', IsActive: true, Type: 'Owner', UserRoles: [] } as unknown as UserInfo;

/** An active non-Owner user with no roles. */
export const PlainUser = {
    ID: '33333333-3333-3333-3333-333333333333',
    Name: 'Plain',
    IsActive: true,
    Type: 'User',
    UserRoles: [],
} as unknown as UserInfo;
