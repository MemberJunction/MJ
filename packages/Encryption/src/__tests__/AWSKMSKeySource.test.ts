import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock MJ global
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn()
}));

// Mock the AWS SDK dynamic import
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-kms', () => {
    return {
        KMSClient: vi.fn().mockImplementation(() => ({
            send: mockSend,
            destroy: vi.fn()
        })),
        DecryptCommand: vi.fn().mockImplementation((params: Record<string, unknown>) => params)
    };
});

import { AWSKMSKeySource } from '../providers/AWSKMSKeySource';

describe('AWSKMSKeySource', () => {
    let source: AWSKMSKeySource;
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        vi.clearAllMocks();
        source = new AWSKMSKeySource();
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('SourceName', () => {
        it('should return "AWS KMS"', () => {
            expect(source.SourceName).toBe('AWS KMS');
        });
    });

    describe('ValidateConfiguration', () => {
        it('should return false before initialization', () => {
            expect(source.ValidateConfiguration()).toBe(false);
        });

        it('should return false after init without region', async () => {
            delete process.env.AWS_REGION;
            delete process.env.AWS_DEFAULT_REGION;
            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(false);
        });

        it('should return true after init with AWS_REGION', async () => {
            process.env.AWS_REGION = 'us-east-1';
            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(true);
        });

        it('should return true after init with AWS_DEFAULT_REGION', async () => {
            delete process.env.AWS_REGION;
            process.env.AWS_DEFAULT_REGION = 'eu-west-1';
            await source.Initialize();
            expect(source.ValidateConfiguration()).toBe(true);
        });
    });

    describe('Initialize', () => {
        it('should only initialize once', async () => {
            process.env.AWS_REGION = 'us-east-1';
            await source.Initialize();
            await source.Initialize(); // Second call should be no-op
            expect(source.ValidateConfiguration()).toBe(true);
        });
    });

    describe('KeyExists', () => {
        it('should return true for valid ARN format', async () => {
            expect(await source.KeyExists(
                'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012'
            )).toBe(true);
        });

        it('should return true for alias ARN format', async () => {
            expect(await source.KeyExists(
                'arn:aws:kms:us-east-1:123456789012:alias/my-key'
            )).toBe(true);
        });

        it('should return true for alias format', async () => {
            expect(await source.KeyExists('alias/my-key')).toBe(true);
        });

        it('should return false for empty string', async () => {
            expect(await source.KeyExists('')).toBe(false);
        });

        it('should return false for null', async () => {
            expect(await source.KeyExists(null as unknown as string)).toBe(false);
        });

        it('should return false for plain string', async () => {
            expect(await source.KeyExists('random-string')).toBe(false);
        });

        it('should return false for malformed ARN', async () => {
            expect(await source.KeyExists('arn:aws:kms:invalid')).toBe(false);
        });
    });

    describe('GetKey', () => {
        it('should throw when lookup value is empty', async () => {
            process.env.AWS_REGION = 'us-east-1';
            await source.Initialize();
            await expect(source.GetKey('')).rejects.toThrow(
                'requires a lookup value'
            );
        });

        it('should throw when lookup value is null', async () => {
            process.env.AWS_REGION = 'us-east-1';
            await source.Initialize();
            await expect(source.GetKey(null as unknown as string)).rejects.toThrow(
                'requires a lookup value'
            );
        });

        it('should call KMS decrypt and return key material', async () => {
            process.env.AWS_REGION = 'us-east-1';
            await source.Initialize();

            const expectedKeyBytes = Buffer.alloc(32, 0xAB);
            mockSend.mockResolvedValue({
                Plaintext: Uint8Array.from(expectedKeyBytes)
            });

            const result = await source.GetKey('base64-encoded-ciphertext-blob');
            expect(result).toBeInstanceOf(Buffer);
            expect(result).toEqual(expectedKeyBytes);
        });

        it('should throw when KMS returns empty plaintext', async () => {
            process.env.AWS_REGION = 'us-east-1';
            await source.Initialize();

            mockSend.mockResolvedValue({ Plaintext: null });

            await expect(source.GetKey('some-ciphertext')).rejects.toThrow(
                'KMS returned empty plaintext'
            );
        });

        it('should provide helpful message for InvalidCiphertextException', async () => {
            process.env.AWS_REGION = 'us-east-1';
            await source.Initialize();

            mockSend.mockRejectedValue(new Error('InvalidCiphertextException'));

            await expect(source.GetKey('bad-ciphertext')).rejects.toThrow(
                'Invalid ciphertext'
            );
        });

        it('should provide helpful message for AccessDeniedException', async () => {
            process.env.AWS_REGION = 'us-east-1';
            await source.Initialize();

            mockSend.mockRejectedValue(new Error('AccessDeniedException'));

            await expect(source.GetKey('some-ciphertext')).rejects.toThrow(
                'access denied'
            );
        });

        it('should provide helpful message for NotFoundException', async () => {
            process.env.AWS_REGION = 'us-east-1';
            await source.Initialize();

            mockSend.mockRejectedValue(new Error('NotFoundException'));

            await expect(source.GetKey('some-ciphertext')).rejects.toThrow(
                'key not found'
            );
        });

        it('should wrap generic errors', async () => {
            process.env.AWS_REGION = 'us-east-1';
            await source.Initialize();

            mockSend.mockRejectedValue(new Error('NetworkError'));

            await expect(source.GetKey('some-ciphertext')).rejects.toThrow(
                'AWS KMS key retrieval failed'
            );
        });
    });

    describe('Dispose', () => {
        it('should clean up the client', async () => {
            process.env.AWS_REGION = 'us-east-1';
            await source.Initialize();
            await source.Dispose();
            expect(source.ValidateConfiguration()).toBe(false);
        });

        it('should handle dispose when not initialized', async () => {
            await expect(source.Dispose()).resolves.toBeUndefined();
        });
    });
});
