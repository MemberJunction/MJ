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

    describe('idempotency (cache-bypass read + create recovery)', () => {
        it('Load reads true DB state (BypassCache) so a just-written watermark is never missed', async () => {
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            await service.Load('em-1', mockContextUser);

            // Stale-cached null here is what made the load-or-create blind-INSERT a duplicate
            // (UNIQUE(EntityMapID,Direction)) and abort the PG transaction. Reads must bypass cache.
            expect(mockRunViewFn).toHaveBeenCalledWith(
                expect.objectContaining({ BypassCache: true }),
                mockContextUser
            );
        });

        it('recovers by updating the existing row when create collides on UNIQUE(EntityMapID,Direction)', async () => {
            // Update's first Load sees no row -> takes the create path; the create then "collides"
            // (Save=false) because a concurrent/retried run already inserted it. createWatermark must
            // re-read and update in place rather than throw (which on PG leaves the txn aborted).
            const existing = createMockWatermark('em-dup', 'old');
            mockRunViewFn
                .mockResolvedValueOnce({ Success: true, Results: [] })          // Update.Load -> none
                .mockResolvedValueOnce({ Success: true, Results: [existing] }); // recovery Load -> exists

            const failingNew = createMockWatermark('em-dup', null);
            (failingNew.Save as ReturnType<typeof vi.fn>).mockResolvedValue(false);
            mockGetEntityObjectFn.mockResolvedValue(failingNew);

            await expect(service.Update('em-dup', 'new-value', mockContextUser)).resolves.toBeUndefined();

            // did NOT throw — instead the pre-existing row was updated in place
            expect(existing.WatermarkValue).toBe('new-value');
            expect(existing.Save).toHaveBeenCalled();
        });

        it('still throws when create fails AND no row materialized (a genuine save failure)', async () => {
            mockRunViewFn
                .mockResolvedValueOnce({ Success: true, Results: [] })  // Update.Load -> none
                .mockResolvedValueOnce({ Success: true, Results: [] }); // recovery Load -> still none

            const failingNew = createMockWatermark('em-genuine', null);
            (failingNew.Save as ReturnType<typeof vi.fn>).mockResolvedValue(false);
            mockGetEntityObjectFn.mockResolvedValue(failingNew);

            await expect(service.Update('em-genuine', 'v', mockContextUser))
                .rejects.toThrow('Failed to create watermark');
        });
    });

    describe('SaveKeysetPosition (§8a keyset resume)', () => {
        it('should mark an existing watermark as a Cursor resume position and persist the after-key', async () => {
            const mockWatermark = createMockWatermark('em-1', '2024-01-01T00:00:00Z');
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [mockWatermark] });

            await service.SaveKeysetPosition('em-1', '1500', mockContextUser);

            expect(mockWatermark.WatermarkType).toBe('Cursor');
            expect(mockWatermark.WatermarkValue).toBe('1500');
            expect(mockWatermark.Save).toHaveBeenCalled();
        });

        it('should create a new Cursor watermark when none exists', async () => {
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
            const mockNew = createMockWatermark('em-new', null);
            mockGetEntityObjectFn.mockResolvedValue(mockNew);

            await service.SaveKeysetPosition('em-new', 'abc-key', mockContextUser);

            expect(mockNew.NewRecord).toHaveBeenCalled();
            expect(mockNew.WatermarkType).toBe('Cursor');
            expect(mockNew.WatermarkValue).toBe('abc-key');
            expect(mockNew.Save).toHaveBeenCalled();
        });

        it('should throw when the save fails', async () => {
            const mockWatermark = createMockWatermark('em-fail', null);
            (mockWatermark.Save as ReturnType<typeof vi.fn>).mockResolvedValue(false);
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [mockWatermark] });

            await expect(service.SaveKeysetPosition('em-fail', 'k', mockContextUser))
                .rejects.toThrow('Failed to save keyset position');
        });
    });

    describe('ClearKeysetPosition (§8a clean-scan reset)', () => {
        it('should null the value but keep the Cursor type so the next run seeks from the start', async () => {
            const mockWatermark = createMockWatermark('em-1', '1500');
            (mockWatermark as { WatermarkType: string }).WatermarkType = 'Cursor';
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [mockWatermark] });

            await service.ClearKeysetPosition('em-1', mockContextUser);

            expect(mockWatermark.WatermarkValue).toBeNull();
            expect(mockWatermark.WatermarkType).toBe('Cursor');
            expect(mockWatermark.Save).toHaveBeenCalled();
        });

        it('should be a no-op when no watermark record exists', async () => {
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            await expect(service.ClearKeysetPosition('em-none', mockContextUser)).resolves.toBeUndefined();
            expect(mockGetEntityObjectFn).not.toHaveBeenCalled();
        });

        it('should throw when the save fails', async () => {
            const mockWatermark = createMockWatermark('em-fail', '1500');
            (mockWatermark.Save as ReturnType<typeof vi.fn>).mockResolvedValue(false);
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [mockWatermark] });

            await expect(service.ClearKeysetPosition('em-fail', mockContextUser))
                .rejects.toThrow('Failed to clear keyset position');
        });
    });

    describe('Partition rollups (§7 Merkle reconcile)', () => {
        it('SavePartitionRollups stores the map as a ChangeToken JSON value', async () => {
            const mockWatermark = createMockWatermark('em-1', null);
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [mockWatermark] });

            await service.SavePartitionRollups('em-1', new Map([['0', 'hashA'], ['7', 'hashB']]), mockContextUser);

            expect(mockWatermark.WatermarkType).toBe('ChangeToken');
            expect(JSON.parse(mockWatermark.WatermarkValue)).toEqual({ '0': 'hashA', '7': 'hashB' });
            expect(mockWatermark.Save).toHaveBeenCalled();
        });

        it('SavePartitionRollups creates a new ChangeToken watermark when none exists', async () => {
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
            const mockNew = createMockWatermark('em-new', null);
            mockGetEntityObjectFn.mockResolvedValue(mockNew);

            await service.SavePartitionRollups('em-new', new Map([['3', 'h']]), mockContextUser);

            expect(mockNew.NewRecord).toHaveBeenCalled();
            expect(mockNew.WatermarkType).toBe('ChangeToken');
            expect(mockNew.Save).toHaveBeenCalled();
        });

        it('LoadPartitionRollups round-trips the stored map', async () => {
            const wm = createMockWatermark('em-1', JSON.stringify({ '0': 'hashA', '7': 'hashB' }));
            (wm as { WatermarkType: string }).WatermarkType = 'ChangeToken';
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [wm] });

            const map = await service.LoadPartitionRollups('em-1', mockContextUser);
            expect(map.get('0')).toBe('hashA');
            expect(map.get('7')).toBe('hashB');
            expect(map.size).toBe(2);
        });

        it('LoadPartitionRollups returns an EMPTY map for a non-ChangeToken watermark (forces full reconcile)', async () => {
            const wm = createMockWatermark('em-1', '2024-01-01T00:00:00Z'); // Timestamp type, not rollups
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [wm] });
            const map = await service.LoadPartitionRollups('em-1', mockContextUser);
            expect(map.size).toBe(0);
        });

        it('LoadPartitionRollups returns an EMPTY map on corrupt JSON (never a partial/wrong skip)', async () => {
            const wm = createMockWatermark('em-1', '{not valid json');
            (wm as { WatermarkType: string }).WatermarkType = 'ChangeToken';
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [wm] });
            const map = await service.LoadPartitionRollups('em-1', mockContextUser);
            expect(map.size).toBe(0);
        });

        it('LoadPartitionRollups returns an EMPTY map when no watermark exists (first sync)', async () => {
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
            const map = await service.LoadPartitionRollups('em-none', mockContextUser);
            expect(map.size).toBe(0);
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
