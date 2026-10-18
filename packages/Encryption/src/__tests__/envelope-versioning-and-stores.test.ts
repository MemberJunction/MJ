import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';
import { EncryptionEngine } from '../EncryptionEngine';
import { EnvVarKeySource } from '../providers/EnvVarKeySource';

const TEST_KEY_ID = '550e8400-e29b-41d4-a716-446655440000';
const KEY_V1_BYTES = crypto.randomBytes(32);
const KEY_V2_BYTES = crypto.randomBytes(32);

describe('Encryption envelope versioning & out-of-band store governance', () => {
    const engine = EncryptionEngine.Instance;
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            MJ_ROTATION_TEST_KEY: KEY_V1_BYTES.toString('base64'),
            MJ_ROTATION_TEST_KEY_V2: KEY_V2_BYTES.toString('base64'),
        };
        engine.ClearCaches();
        engine.ClearRegisteredEncryptedStores();
    });

    afterEach(() => {
        process.env = originalEnv;
        engine.ClearCaches();
        engine.ClearRegisteredEncryptedStores();
        vi.restoreAllMocks();
    });

    describe('ParseEncryptedValue envelope compatibility', () => {
        it('parses inline versioned envelope ($ENC$<keyId>:<keyVersion>$...)', () => {
            const raw = `$ENC$${TEST_KEY_ID}:2$AES-256-GCM$aXZkYXRh$Y2lwaGVydGV4dA==$YXV0aHRhZw==`;
            const parsed = engine.ParseEncryptedValue(raw);

            expect(parsed.marker).toBe('$ENC$');
            expect(parsed.keyId).toBe(TEST_KEY_ID);
            expect(parsed.keyVersion).toBe('2');
            expect(parsed.algorithm).toBe('AES-256-GCM');
            expect(parsed.iv).toBe('aXZkYXRh');
            expect(parsed.ciphertext).toBe('Y2lwaGVydGV4dA==');
            expect(parsed.authTag).toBe('YXV0aHRhZw==');
        });

        it('parses segment versioned envelope ($ENC$<keyId>$v<keyVersion>$...)', () => {
            const raw = `$ENC$${TEST_KEY_ID}$v3$AES-256-GCM$aXZkYXRh$Y2lwaGVydGV4dA==$YXV0aHRhZw==`;
            const parsed = engine.ParseEncryptedValue(raw);

            expect(parsed.keyId).toBe(TEST_KEY_ID);
            expect(parsed.keyVersion).toBe('3');
            expect(parsed.algorithm).toBe('AES-256-GCM');
            expect(parsed.iv).toBe('aXZkYXRh');
            expect(parsed.ciphertext).toBe('Y2lwaGVydGV4dA==');
            expect(parsed.authTag).toBe('YXV0aHRhZw==');
        });

        it('parses legacy unversioned v1 envelope with keyVersion undefined', () => {
            const raw = `$ENC$${TEST_KEY_ID}$AES-256-GCM$aXZkYXRh$Y2lwaGVydGV4dA==$YXV0aHRhZw==`;
            const parsed = engine.ParseEncryptedValue(raw);

            expect(parsed.keyId).toBe(TEST_KEY_ID);
            expect(parsed.keyVersion).toBeUndefined();
            expect(parsed.algorithm).toBe('AES-256-GCM');
        });

        it('rejects empty inline key version after colon', () => {
            const raw = `$ENC$${TEST_KEY_ID}:$AES-256-GCM$aXZkYXRh$Y2lwaGVydGV4dA==$YXV0aHRhZw==`;
            expect(() => engine.ParseEncryptedValue(raw)).toThrow('Invalid key version');
        });
    });

    describe('Multi-version decryption across key rotation', () => {
        it('decrypts both newly rotated v2 envelopes and historical v1 envelopes after key metadata moves to v2', async () => {
            let currentKeyVersion = '1';
            let currentLookupValue = 'MJ_ROTATION_TEST_KEY';

            vi.spyOn(engine, 'Loaded', 'get').mockReturnValue(true);
            vi.spyOn(engine, 'GetKeyConfiguration').mockImplementation(() => ({
                key: {
                    ID: TEST_KEY_ID,
                    Name: 'Rotation Test Key',
                    KeyVersion: currentKeyVersion,
                    Marker: '$ENC$',
                    KeyLookupValue: currentLookupValue,
                    Status: 'Active',
                    IsActive: true,
                } as ReturnType<typeof engine.GetKeyConfiguration> extends { key: infer K } | undefined ? K : never,
                algorithm: {
                    ID: 'alg-1',
                    Name: 'AES-256-GCM',
                    NodeCryptoName: 'aes-256-gcm',
                    KeyLengthBits: 256,
                    IVLengthBytes: 12,
                    IsAEAD: true,
                    IsActive: true,
                } as ReturnType<typeof engine.GetKeyConfiguration> extends { algorithm: infer A } | undefined ? A : never,
                source: {
                    ID: 'src-1',
                    Name: 'Environment Variable',
                    DriverClass: 'EnvVarKeySource',
                    IsActive: true,
                } as ReturnType<typeof engine.GetKeyConfiguration> extends { source: infer S } | undefined ? S : never,
            }));

            // Stub getOrCreateKeySource via EnvVarKeySource instance
            const envSource = new EnvVarKeySource();
            await envSource.Initialize();
            (engine as unknown as { _keySourceCache: Map<string, EnvVarKeySource> })._keySourceCache.set(
                'EnvVarKeySource',
                envSource
            );

            // 1. Encrypt under v1
            const v1Ciphertext = await engine.Encrypt('credential-secret-v1', TEST_KEY_ID);
            const v1Parts = engine.ParseEncryptedValue(v1Ciphertext);
            expect(v1Parts.keyVersion).toBe('1');

            // Also construct a legacy unversioned v1 envelope from the same v1 encryption
            const legacyUnversionedV1 = [
                '$ENC',
                v1Parts.keyId,
                v1Parts.algorithm,
                v1Parts.iv,
                v1Parts.ciphertext,
                v1Parts.authTag,
            ].join('$');

            // 2. Simulate EncryptWithLookup during rotation to v2
            const rotatedV2Ciphertext = await engine.EncryptWithLookup(
                'rotated-record-v2',
                TEST_KEY_ID,
                'MJ_ROTATION_TEST_KEY_V2',
                undefined,
                '2'
            );
            const v2Parts = engine.ParseEncryptedValue(rotatedV2Ciphertext);
            expect(v2Parts.keyVersion).toBe('2');

            // 3. Advance key metadata to v2 (as RotateEncryptionKeyAction does at Step 6)
            currentKeyVersion = '2';
            currentLookupValue = 'MJ_ROTATION_TEST_KEY_V2';
            engine.ClearCaches();

            // 4. Verify v2 ciphertext decrypts using MJ_ROTATION_TEST_KEY_V2
            expect(await engine.Decrypt(rotatedV2Ciphertext)).toBe('rotated-record-v2');

            // 5. Verify historical v1 ciphertext (and legacy unversioned v1 ciphertext) in an
            // unrotated out-of-band store STILL decrypts using MJ_ROTATION_TEST_KEY!
            expect(await engine.Decrypt(v1Ciphertext)).toBe('credential-secret-v1');
            expect(engine.ParseEncryptedValue(legacyUnversionedV1).keyVersion).toBeUndefined();
        });
    });

    describe('Out-of-band EncryptedStoreRegistration registry', () => {
        it('registers, filters by encryptionKeyId, and unregisters encrypted stores', () => {
            const otherKeyId = '11111111-2222-3333-4444-555555555555';

            engine.RegisterEncryptedStore({
                storeName: 'MJ: Credentials.Values',
                // global store that may reference any encryption key
            });
            engine.RegisterEncryptedStore({
                storeName: 'WebhookSigningSecrets',
                encryptionKeyId: TEST_KEY_ID,
                rotate: async () => 4,
            });
            engine.RegisterEncryptedStore({
                storeName: 'OtherKeyStore',
                encryptionKeyId: otherKeyId,
            });

            const forTestKey = engine.GetRegisteredEncryptedStores(TEST_KEY_ID);
            expect(forTestKey.map(s => s.storeName)).toEqual([
                'MJ: Credentials.Values',
                'WebhookSigningSecrets',
            ]);

            expect(engine.UnregisterEncryptedStore('WebhookSigningSecrets')).toBe(true);
            expect(engine.GetRegisteredEncryptedStores(TEST_KEY_ID).map(s => s.storeName)).toEqual([
                'MJ: Credentials.Values',
            ]);
        });

        it('RotateEncryptionKeyAction rotates registered stores with rotate callbacks and reports skipped stores', async () => {
            const { RotateEncryptionKeyAction } = await import('../actions/RotateEncryptionKeyAction');
            let currentKeyVersion = '1';
            let currentLookupValue = 'MJ_ROTATION_TEST_KEY';

            vi.spyOn(engine, 'Loaded', 'get').mockReturnValue(true);
            vi.spyOn(engine, 'RefreshAllItems').mockResolvedValue(undefined);
            vi.spyOn(engine, 'GetKeyConfiguration').mockImplementation(() => ({
                key: {
                    ID: TEST_KEY_ID,
                    Name: 'Rotation Test Key',
                    KeyVersion: currentKeyVersion,
                    Marker: '$ENC$',
                    KeyLookupValue: currentLookupValue,
                    Status: 'Active',
                    IsActive: true,
                } as ReturnType<typeof engine.GetKeyConfiguration> extends { key: infer K } | undefined ? K : never,
                algorithm: {
                    ID: 'alg-1',
                    Name: 'AES-256-GCM',
                    NodeCryptoName: 'aes-256-gcm',
                    KeyLengthBits: 256,
                    IVLengthBytes: 12,
                    IsAEAD: true,
                    IsActive: true,
                } as ReturnType<typeof engine.GetKeyConfiguration> extends { algorithm: infer A } | undefined ? A : never,
                source: {
                    ID: 'src-1',
                    Name: 'Environment Variable',
                    DriverClass: 'EnvVarKeySource',
                    IsActive: true,
                } as ReturnType<typeof engine.GetKeyConfiguration> extends { source: infer S } | undefined ? S : never,
            }));

            const envSource = new EnvVarKeySource();
            await envSource.Initialize();
            (engine as unknown as { _keySourceCache: Map<string, EnvVarKeySource> })._keySourceCache.set(
                'EnvVarKeySource',
                envSource
            );

            // Seed an out-of-band secret under v1
            let outOfBandSecret = await engine.Encrypt('webhook-hmac-secret-v1', TEST_KEY_ID);
            const unrotatedVaultSecret = await engine.Encrypt('historical-vault-secret-v1', TEST_KEY_ID);

            engine.RegisterEncryptedStore({
                storeName: 'WebhookSigningSecrets',
                encryptionKeyId: TEST_KEY_ID,
                rotate: async (ctx) => {
                    outOfBandSecret = await ctx.reEncrypt(outOfBandSecret);
                    return 1;
                },
            });
            engine.RegisterEncryptedStore({
                storeName: 'HistoricalAuditVault',
                encryptionKeyId: TEST_KEY_ID,
                // no rotate callback -> reported in SkippedStores
            });

            const keyEntityStub = {
                ID: TEST_KEY_ID,
                KeyVersion: '1',
                KeyLookupValue: 'MJ_ROTATION_TEST_KEY',
                Status: 'Active',
                Save: vi.fn().mockImplementation(async () => {
                    currentKeyVersion = keyEntityStub.KeyVersion;
                    currentLookupValue = keyEntityStub.KeyLookupValue;
                    return true;
                }),
            };

            const mockProvider = {
                Entities: [],
                EntityByName: () => undefined,
                BeginTransaction: vi.fn().mockResolvedValue(undefined),
                CommitTransaction: vi.fn().mockResolvedValue(undefined),
                RollbackTransaction: vi.fn().mockResolvedValue(undefined),
                RunView: vi.fn().mockImplementation(async (params: { EntityName: string }) => {
                    if (params.EntityName === 'MJ: Encryption Keys') {
                        return { Success: true, Results: [keyEntityStub] };
                    }
                    if (params.EntityName === 'MJ: Entity Fields') {
                        return { Success: true, Results: [] };
                    }
                    return { Success: true, Results: [] };
                }),
            };

            const action = new RotateEncryptionKeyAction();
            const actionParams = [
                { Name: 'EncryptionKeyID', Value: TEST_KEY_ID, Type: 'Input' as const },
                { Name: 'NewKeyLookupValue', Value: 'MJ_ROTATION_TEST_KEY_V2', Type: 'Input' as const },
                { Name: 'RecordsProcessed', Value: 0, Type: 'Output' as const },
                { Name: 'FieldsProcessed', Value: [], Type: 'Output' as const },
                { Name: 'SkippedStores', Value: [], Type: 'Output' as const },
            ];

            const result = await action.Run({
                Params: actionParams,
                ContextUser: undefined,
                Provider: mockProvider as unknown as Parameters<typeof action.Run>[0]['Provider'],
            } as Parameters<typeof action.Run>[0]);

            expect(result.Success).toBe(true);
            expect(keyEntityStub.KeyVersion).toBe('2');
            expect(keyEntityStub.KeyLookupValue).toBe('MJ_ROTATION_TEST_KEY_V2');
            expect(actionParams.find(p => p.Name === 'RecordsProcessed')?.Value).toBe(1);
            expect(actionParams.find(p => p.Name === 'FieldsProcessed')?.Value).toEqual(['WebhookSigningSecrets']);
            expect(actionParams.find(p => p.Name === 'SkippedStores')?.Value).toEqual(['HistoricalAuditVault']);

            // Verify rotated store secret has :2 envelope and decrypts to original value
            expect(engine.ParseEncryptedValue(outOfBandSecret).keyVersion).toBe('2');
            expect(await engine.Decrypt(outOfBandSecret)).toBe('webhook-hmac-secret-v1');

            // Verify skipped store's historical :1 envelope STILL decrypts cleanly!
            expect(engine.ParseEncryptedValue(unrotatedVaultSecret).keyVersion).toBe('1');
            expect(await engine.Decrypt(unrotatedVaultSecret)).toBe('historical-vault-secret-v1');
        });
    });
});
