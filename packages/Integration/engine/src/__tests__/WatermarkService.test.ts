import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { ICompanyIntegrationSyncWatermark } from '../entity-types.js';
import { WatermarkService } from '../WatermarkService.js';

// Track mock implementations per test
let mockRunViewFn: ReturnType<typeof vi.fn>;
let mockGetEntityObjectFn: ReturnType<typeof vi.fn>;

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            RunView(...args: unknown[]) {
                return mockRunViewFn(...args);
            }
        },
        Metadata: class MockMetadata {
            GetEntityObject(...args: unknown[]) {
                return mockGetEntityObjectFn(...args);
            }
        },
    };
});

const mockContextUser = { ID: 'user-1' } as UserInfo;

function createMockWatermark(entityMapID: string, watermarkValue: string | null): ICompanyIntegrationSyncWatermark {
    return {
        EntityMapID: entityMapID,
        WatermarkValue: watermarkValue,
        LastSyncAt: null,
        Direction: 'Pull' as const,
        WatermarkType: 'Timestamp' as const,
        RecordsSynced: 0,
        Save: vi.fn().mockResolvedValue(true),
        NewRecord: vi.fn(),
        Get: vi.fn((field: string) => {
            if (field === 'EntityMapID') return entityMapID;
            if (field === 'WatermarkValue') return watermarkValue;
            return null;
        }),
    } as unknown as ICompanyIntegrationSyncWatermark;
}

describe('WatermarkService', () => {
    const service = new WatermarkService();

    beforeEach(() => {
        mockRunViewFn = vi.fn().mockResolvedValue({ Success: true, Results: [] });
        mockGetEntityObjectFn = vi.fn();
    });

    describe('Load', () => {
        it('should return watermark entity when found', async () => {
            const mockWatermark = createMockWatermark('em-1', '2024-01-01T00:00:00Z');
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [mockWatermark],
            });

            const result = await service.Load('em-1', mockContextUser);

            expect(result).toBeDefined();
            expect(result?.WatermarkValue).toBe('2024-01-01T00:00:00Z');
        });

        it('should return null when no watermark exists', async () => {
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [],
            });

            const result = await service.Load('em-nonexistent', mockContextUser);

            expect(result).toBeNull();
        });
    });

    describe('Update', () => {
        it('should update existing watermark when one exists', async () => {
            const mockWatermark = createMockWatermark('em-1', '2024-01-01T00:00:00Z');
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [mockWatermark],
            });

            await service.Update('em-1', '2024-06-15T00:00:00Z', mockContextUser);

            expect(mockWatermark.Save).toHaveBeenCalled();
            expect(mockWatermark.WatermarkValue).toBe('2024-06-15T00:00:00Z');
        });

        it('should create new watermark when none exists', async () => {
            // Load returns empty (no existing watermark)
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [],
            });

            const mockNewWatermark = createMockWatermark('em-new', null);
            mockGetEntityObjectFn.mockResolvedValue(mockNewWatermark);

            await service.Update('em-new', '2024-06-15T00:00:00Z', mockContextUser);

            expect(mockNewWatermark.NewRecord).toHaveBeenCalled();
            expect(mockNewWatermark.Save).toHaveBeenCalled();
        });

        it('should throw when save fails', async () => {
            const mockWatermark = createMockWatermark('em-fail', '2024-01-01T00:00:00Z');
            (mockWatermark.Save as ReturnType<typeof vi.fn>).mockResolvedValue(false);

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [mockWatermark],
            });

            await expect(service.Update('em-fail', 'new-value', mockContextUser))
                .rejects.toThrow('Failed to update watermark');
        });
    });

    describe('ValidateWatermark', () => {
        describe('Timestamp type', () => {
            it('should return true for a valid ISO timestamp', () => {
                expect(service.ValidateWatermark('2024-06-15T12:00:00.000Z', 'Timestamp')).toBe(true);
            });

            it('should return true for a date-only string', () => {
                expect(service.ValidateWatermark('2024-01-01', 'Timestamp')).toBe(true);
            });

            it('should return false for an invalid timestamp', () => {
                expect(service.ValidateWatermark('not-a-date', 'Timestamp')).toBe(false);
            });

            it('should return false for a nonsensical string that Date.parse rejects', () => {
                expect(service.ValidateWatermark('xyz123', 'Timestamp')).toBe(false);
            });
        });

        describe('Version type', () => {
            it('should return true for digits-only string', () => {
                expect(service.ValidateWatermark('123', 'Version')).toBe(true);
            });

            it('should return true for a single digit', () => {
                expect(service.ValidateWatermark('0', 'Version')).toBe(true);
            });

            it('should return true for a large version number', () => {
                expect(service.ValidateWatermark('99999999', 'Version')).toBe(true);
            });

            it('should return false for a string with letters', () => {
                expect(service.ValidateWatermark('v1.2.3', 'Version')).toBe(false);
            });

            it('should return false for a decimal number', () => {
                expect(service.ValidateWatermark('1.5', 'Version')).toBe(false);
            });

            it('should return false for a negative number', () => {
                expect(service.ValidateWatermark('-1', 'Version')).toBe(false);
            });
        });

        describe('Cursor type', () => {
            it('should return true for a non-empty cursor value', () => {
                expect(service.ValidateWatermark('cursor_abc123', 'Cursor')).toBe(true);
            });

            it('should return true for a numeric cursor', () => {
                expect(service.ValidateWatermark('42', 'Cursor')).toBe(true);
            });

            it('should return true for a UUID cursor', () => {
                expect(service.ValidateWatermark('550e8400-e29b-41d4-a716-446655440000', 'Cursor')).toBe(true);
            });
        });

        describe('ChangeToken type', () => {
            it('should return true for a non-empty change token', () => {
                expect(service.ValidateWatermark('token_xyz789', 'ChangeToken')).toBe(true);
            });
        });

        describe('empty and whitespace values', () => {
            it('should return false for an empty string', () => {
                expect(service.ValidateWatermark('', 'Timestamp')).toBe(false);
            });

            it('should return false for whitespace-only string', () => {
                expect(service.ValidateWatermark('   ', 'Timestamp')).toBe(false);
            });

            it('should return false for empty string with Version type', () => {
                expect(service.ValidateWatermark('', 'Version')).toBe(false);
            });

            it('should return false for empty string with Cursor type', () => {
                expect(service.ValidateWatermark('', 'Cursor')).toBe(false);
            });

            it('should return false for whitespace with Cursor type', () => {
                expect(service.ValidateWatermark('   ', 'Cursor')).toBe(false);
            });
        });
    });
});
