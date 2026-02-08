import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock MJ global
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target
}));

// Track mock calls for Azure SDK
const mockGetSecret = vi.fn();

vi.mock('@azure/keyvault-secrets', () => ({
    SecretClient: vi.fn().mockImplementation(() => ({
        getSecret: mockGetSecret
    }))
}));

vi.mock('@azure/identity', () => ({
    DefaultAzureCredential: vi.fn().mockImplementation(() => ({}))
}));

import { AzureKeyVaultKeySource } from '../providers/AzureKeyVaultKeySource';

describe('AzureKeyVaultKeySource', () => {
    let source: AzureKeyVaultKeySource;
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        vi.clearAllMocks();
        source = new AzureKeyVaultKeySource();
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('SourceName', () => {
        it('should return "Azure Key Vault"', () => {
            expect(source.SourceName).toBe('Azure Key Vault');
        });
    });

    describe('ValidateConfiguration', () => {
        it('should return false before initialization', () => {
            expect(source.ValidateConfiguration()).toBe(false);
        });

        it('should return true after initialization', async () => {
            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(true);
        });
    });

    describe('Initialize', () => {
        it('should only initialize once', async () => {
            await source.Initialize();
            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(true);
        });

        it('should pick up AZURE_KEYVAULT_URL from env', async () => {
            process.env.AZURE_KEYVAULT_URL = 'https://my-vault.vault.azure.net';
            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(true);
        });
    });

    describe('KeyExists', () => {
        beforeEach(async () => {
            await source.Initialize();
        });

        it('should return true for valid full vault URL', async () => {
            expect(await source.KeyExists(
                'https://my-vault.vault.azure.net/secrets/my-secret'
            )).toBe(true);
        });

        it('should return true for secret name with default vault URL', async () => {
            process.env.AZURE_KEYVAULT_URL = 'https://my-vault.vault.azure.net';
            const s = new AzureKeyVaultKeySource();
            await s.Initialize();
            expect(await s.KeyExists('my-secret-name')).toBe(true);
        });

        it('should return false for secret name without default vault URL', async () => {
            delete process.env.AZURE_KEYVAULT_URL;
            const s = new AzureKeyVaultKeySource();
            await s.Initialize();
            expect(await s.KeyExists('my-secret-name')).toBe(false);
        });

        it('should return false for empty string', async () => {
            expect(await source.KeyExists('')).toBe(false);
        });

        it('should return false for null', async () => {
            expect(await source.KeyExists(null as unknown as string)).toBe(false);
        });

        it('should return false for invalid URL format', async () => {
            expect(await source.KeyExists('http://not-a-vault/secrets/test')).toBe(false);
        });
    });

    describe('GetKey', () => {
        it('should throw when lookup value is empty', async () => {
            await source.Initialize();
            await expect(source.GetKey('')).rejects.toThrow(
                'requires a lookup value'
            );
        });

        it('should throw when lookup value is null', async () => {
            await source.Initialize();
            await expect(source.GetKey(null as unknown as string)).rejects.toThrow(
                'requires a lookup value'
            );
        });

        it('should retrieve key from full vault URL', async () => {
            await source.Initialize();

            const keyBytes = Buffer.alloc(32, 0xEF);
            mockGetSecret.mockResolvedValue({
                value: keyBytes.toString('base64')
            });

            const result = await source.GetKey(
                'https://my-vault.vault.azure.net/secrets/my-key'
            );
            expect(result).toBeInstanceOf(Buffer);
            expect(result).toEqual(keyBytes);
        });

        it('should retrieve key using default vault URL with secret name', async () => {
            process.env.AZURE_KEYVAULT_URL = 'https://my-vault.vault.azure.net';
            const s = new AzureKeyVaultKeySource();
            await s.Initialize();

            const keyBytes = Buffer.alloc(32, 0xAA);
            mockGetSecret.mockResolvedValue({
                value: keyBytes.toString('base64')
            });

            const result = await s.GetKey('my-secret');
            expect(result).toEqual(keyBytes);
        });

        it('should throw for invalid lookup value without vault URL', async () => {
            delete process.env.AZURE_KEYVAULT_URL;
            const s = new AzureKeyVaultKeySource();
            await s.Initialize();

            await expect(s.GetKey('just-a-name')).rejects.toThrow(
                'Invalid Key Vault lookup value'
            );
        });

        it('should throw when secret has no value', async () => {
            await source.Initialize();
            mockGetSecret.mockResolvedValue({ value: null });

            await expect(source.GetKey(
                'https://my-vault.vault.azure.net/secrets/empty-secret'
            )).rejects.toThrow('has no value');
        });

        it('should provide helpful message for SecretNotFound', async () => {
            await source.Initialize();
            mockGetSecret.mockRejectedValue(new Error('SecretNotFound'));

            await expect(source.GetKey(
                'https://my-vault.vault.azure.net/secrets/missing'
            )).rejects.toThrow('secret not found');
        });

        it('should provide helpful message for Forbidden', async () => {
            await source.Initialize();
            mockGetSecret.mockRejectedValue(new Error('Forbidden'));

            await expect(source.GetKey(
                'https://my-vault.vault.azure.net/secrets/restricted'
            )).rejects.toThrow('access denied');
        });

        it('should provide helpful message for AuthenticationError', async () => {
            await source.Initialize();
            mockGetSecret.mockRejectedValue(new Error('AuthenticationError'));

            await expect(source.GetKey(
                'https://my-vault.vault.azure.net/secrets/test'
            )).rejects.toThrow('authentication failed');
        });

        it('should pass version to getSecret when provided', async () => {
            await source.Initialize();
            const keyBytes = Buffer.alloc(32, 0xBB);
            mockGetSecret.mockResolvedValue({
                value: keyBytes.toString('base64')
            });

            await source.GetKey(
                'https://my-vault.vault.azure.net/secrets/my-key',
                'abc123'
            );

            expect(mockGetSecret).toHaveBeenCalledWith('my-key', { version: 'abc123' });
        });

        it('should not pass version when not provided', async () => {
            await source.Initialize();
            const keyBytes = Buffer.alloc(32, 0xCC);
            mockGetSecret.mockResolvedValue({
                value: keyBytes.toString('base64')
            });

            await source.GetKey(
                'https://my-vault.vault.azure.net/secrets/my-key'
            );

            expect(mockGetSecret).toHaveBeenCalledWith('my-key', {});
        });

        it('should wrap generic errors', async () => {
            await source.Initialize();
            mockGetSecret.mockRejectedValue(new Error('Unknown error'));

            await expect(source.GetKey(
                'https://my-vault.vault.azure.net/secrets/test'
            )).rejects.toThrow('Azure Key Vault key retrieval failed');
        });
    });

    describe('Dispose', () => {
        it('should clear clients and reset initialization', async () => {
            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(true);

            await source.Dispose();
            expect(source.ValidateConfiguration()).toBe(false);
        });

        it('should handle dispose when not initialized', async () => {
            await expect(source.Dispose()).resolves.toBeUndefined();
        });
    });
});
