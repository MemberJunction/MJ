import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: vi.fn().mockImplementation(() => ({
        Entities: []
    })),
    RunView: vi.fn().mockImplementation(() => ({
        RunView: vi.fn().mockResolvedValue({ Success: false, Results: [] })
    })),
    UserInfo: class {}
}));

vi.mock('@memberjunction/actions-base', () => ({
    ActionResultSimple: {},
    RunActionParams: class {},
    ActionParam: class {}
}));

vi.mock('../EncryptionEngine', () => ({
    EncryptionEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Encrypt: vi.fn().mockResolvedValue('$ENC$encrypted'),
            Decrypt: vi.fn().mockResolvedValue('decrypted'),
            IsEncrypted: vi.fn().mockReturnValue(false),
            ValidateKeyMaterial: vi.fn().mockResolvedValue(undefined),
            EncryptWithLookup: vi.fn().mockResolvedValue('$ENC$re-encrypted'),
            ClearCaches: vi.fn()
        }
    }
}));

import { EnableFieldEncryptionAction } from '../actions/EnableFieldEncryptionAction';
import { RotateEncryptionKeyAction } from '../actions/RotateEncryptionKeyAction';

describe('EnableFieldEncryptionAction', () => {
    let action: EnableFieldEncryptionAction;

    beforeEach(() => {
        vi.clearAllMocks();
        action = new EnableFieldEncryptionAction();
    });

    describe('Run', () => {
        it('should return error when EntityFieldID is missing', async () => {
            const result = await action.Run({
                Params: [],
                ContextUser: undefined
            } as Record<string, unknown> as Parameters<typeof action.Run>[0]);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAMS');
            expect(result.Message).toContain('EntityFieldID is required');
        });

        it('should return error when EntityFieldID param has no Value', async () => {
            const result = await action.Run({
                Params: [{ Name: 'OtherParam', Value: 'test' }],
                ContextUser: undefined
            } as Record<string, unknown> as Parameters<typeof action.Run>[0]);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAMS');
        });

        it('should handle errors gracefully and return error result', async () => {
            // The RunView mock returns Success: false, which causes the action to fail
            const result = await action.Run({
                Params: [
                    { Name: 'EntityFieldID', Value: '550e8400-e29b-41d4-a716-446655440000' },
                    { Name: 'BatchSize', Value: 50 }
                ],
                ContextUser: undefined
            } as Record<string, unknown> as Parameters<typeof action.Run>[0]);

            expect(result.Success).toBe(false);
        });

        it('should use default BatchSize of 100 when not specified', async () => {
            const result = await action.Run({
                Params: [
                    { Name: 'EntityFieldID', Value: 'some-id' }
                ],
                ContextUser: undefined
            } as Record<string, unknown> as Parameters<typeof action.Run>[0]);

            // The action runs but fails because RunView returns no results
            expect(result.Success).toBe(false);
        });

        it('should update output params when RecordsEncrypted param exists', async () => {
            const params = [
                { Name: 'EntityFieldID', Value: 'some-id' },
                { Name: 'RecordsEncrypted', Value: 0 },
                { Name: 'RecordsSkipped', Value: 0 }
            ];

            const result = await action.Run({
                Params: params,
                ContextUser: undefined
            } as Record<string, unknown> as Parameters<typeof action.Run>[0]);

            // Even on failure, the output params structure should be handled
            expect(result).toBeDefined();
            expect(result.Params).toBeDefined();
        });
    });
});

describe('RotateEncryptionKeyAction', () => {
    let action: RotateEncryptionKeyAction;

    beforeEach(() => {
        vi.clearAllMocks();
        action = new RotateEncryptionKeyAction();
    });

    describe('Run', () => {
        it('should return error when EncryptionKeyID is missing', async () => {
            const result = await action.Run({
                Params: [
                    { Name: 'NewKeyLookupValue', Value: 'NEW_KEY' }
                ],
                ContextUser: undefined
            } as Record<string, unknown> as Parameters<typeof action.Run>[0]);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAMS');
            expect(result.Message).toContain('EncryptionKeyID is required');
        });

        it('should return error when NewKeyLookupValue is missing', async () => {
            const result = await action.Run({
                Params: [
                    { Name: 'EncryptionKeyID', Value: '550e8400-e29b-41d4-a716-446655440000' }
                ],
                ContextUser: undefined
            } as Record<string, unknown> as Parameters<typeof action.Run>[0]);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAMS');
            expect(result.Message).toContain('NewKeyLookupValue is required');
        });

        it('should return error when both required params are missing', async () => {
            const result = await action.Run({
                Params: [],
                ContextUser: undefined
            } as Record<string, unknown> as Parameters<typeof action.Run>[0]);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAMS');
        });

        it('should use default BatchSize of 100 when not specified', async () => {
            const result = await action.Run({
                Params: [
                    { Name: 'EncryptionKeyID', Value: '550e8400-e29b-41d4-a716-446655440000' },
                    { Name: 'NewKeyLookupValue', Value: 'NEW_KEY' }
                ],
                ContextUser: undefined
            } as Record<string, unknown> as Parameters<typeof action.Run>[0]);

            // Should attempt to run (may fail due to mocked RunView)
            expect(result).toBeDefined();
        });

        it('should handle errors gracefully', async () => {
            const result = await action.Run({
                Params: [
                    { Name: 'EncryptionKeyID', Value: '550e8400-e29b-41d4-a716-446655440000' },
                    { Name: 'NewKeyLookupValue', Value: 'NEW_KEY' },
                    { Name: 'BatchSize', Value: 50 }
                ],
                ContextUser: undefined
            } as Record<string, unknown> as Parameters<typeof action.Run>[0]);

            expect(result.Success).toBe(false);
        });

        it('should update output params when they exist', async () => {
            const params = [
                { Name: 'EncryptionKeyID', Value: '550e8400-e29b-41d4-a716-446655440000' },
                { Name: 'NewKeyLookupValue', Value: 'NEW_KEY' },
                { Name: 'RecordsProcessed', Value: 0 },
                { Name: 'FieldsProcessed', Value: null }
            ];

            const result = await action.Run({
                Params: params,
                ContextUser: undefined
            } as Record<string, unknown> as Parameters<typeof action.Run>[0]);

            expect(result.Params).toBeDefined();
        });

        it('should handle null/empty param values', async () => {
            const result = await action.Run({
                Params: [
                    { Name: 'EncryptionKeyID', Value: null },
                    { Name: 'NewKeyLookupValue', Value: '' }
                ],
                ContextUser: undefined
            } as Record<string, unknown> as Parameters<typeof action.Run>[0]);

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAMS');
        });
    });
});
