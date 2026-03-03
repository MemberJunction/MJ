import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationSyncWatermarkEntity } from '@memberjunction/core-entities';
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

function createMockWatermark(entityMapID: string, watermarkValue: string | null): MJCompanyIntegrationSyncWatermarkEntity {
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
    } as unknown as MJCompanyIntegrationSyncWatermarkEntity;
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
});
