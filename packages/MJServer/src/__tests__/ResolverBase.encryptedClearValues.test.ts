/**
 * A field with `Encrypt` set can hold a value that is not in the encrypted format (a value stored
 * before the field was encrypted). The API read path never sends that value as it is unless the
 * field allows decryption in the API: it sends the ciphertext when the field sends encrypted
 * values, else the sentinel.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { encryptMock } = vi.hoisted(() => ({ encryptMock: vi.fn() }));

vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return {
                Config: vi.fn().mockResolvedValue(undefined),
                Encrypt: encryptMock,
                Decrypt: vi.fn(),
                IsEncrypted: (v: string | null | undefined) => typeof v === 'string' && v.startsWith('$ENC$'),
                GetKeyByID: vi.fn().mockReturnValue({ Marker: '$ENC$' }),
            };
        },
    },
    IsEncryptionKeyUnavailable: () => false,
    ReportEncryptionKeyUnavailable: vi.fn(),
}));

import { EntityFieldInfo, EntityInfo, UserInfo } from '@memberjunction/core';
import { ENCRYPTED_SENTINEL } from '@memberjunction/global';
import { ResolverBase } from '../generic/ResolverBase.js';

const ENTITY_ID = 'ent-servers-001';
const KEY_ID = '11111111-2222-3333-4444-555555555555';
const CLEAR_MARKER = 'clear-marker-value';

function secretField(name: string, sendEncryptedValue: boolean): Record<string, unknown> {
    return {
        ID: `f-${name}`,
        EntityID: ENTITY_ID,
        Sequence: 2,
        Name: name,
        Type: 'nvarchar',
        Length: -1,
        AllowsNull: true,
        Encrypt: true,
        EncryptionKeyID: KEY_ID,
        AllowDecryptInAPI: false,
        SendEncryptedValue: sendEncryptedValue,
        Status: 'Active',
    };
}

function entity(): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Servers',
        SchemaName: '__mj',
        BaseTable: 'Server',
        BaseView: 'vwServers',
        Status: 'Active',
        EntityFields: [secretField('RedactedSecret', false), secretField('SealedSecret', true)],
    });
}

class ProbeResolver extends ResolverBase {}

function decryptRow(row: Record<string, unknown>, fields: EntityFieldInfo[]): Promise<void> {
    const user = new UserInfo(null, { ID: 'u-1', Name: 'Reader', Email: 'reader@example.test', IsActive: true, UserRoles: [] });
    return (new ProbeResolver() as unknown as {
        decryptRowEncryptedFields(r: Record<string, unknown>, f: EntityFieldInfo[], u: UserInfo): Promise<void>;
    }).decryptRowEncryptedFields(row, fields, user);
}

describe('ResolverBase read path for encrypted fields that hold a clear value', () => {
    beforeEach(() => {
        encryptMock.mockReset();
        encryptMock.mockResolvedValue(`$ENC$${KEY_ID}$AES-256-GCM$iv$cipher$tag`);
    });

    it('sends the sentinel for a field that does not send encrypted values', async () => {
        const field = entity().Fields.find((f) => f.Name === 'RedactedSecret')!;
        const row: Record<string, unknown> = { RedactedSecret: CLEAR_MARKER };

        await decryptRow(row, [field]);

        expect(row.RedactedSecret).toBe(ENCRYPTED_SENTINEL);
    });

    it('sends ciphertext for a field that sends encrypted values', async () => {
        const field = entity().Fields.find((f) => f.Name === 'SealedSecret')!;
        const row: Record<string, unknown> = { SealedSecret: CLEAR_MARKER };

        await decryptRow(row, [field]);

        expect(row.SealedSecret).toBe(`$ENC$${KEY_ID}$AES-256-GCM$iv$cipher$tag`);
        expect(JSON.stringify(row)).not.toContain(CLEAR_MARKER);
    });
});
