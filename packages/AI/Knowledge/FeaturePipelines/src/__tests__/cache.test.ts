import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureValueCacheService } from '../cache/FeatureValueCacheService';
import { UserInfo, RunView } from '@memberjunction/core';

// Mock RunView so we don't hit a real database in unit tests
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockRunView {
        public static mockResults: unknown[] = [];
        public async RunView() {
            return {
                Success: true,
                Results: MockRunView.mockResults,
            };
        }
    }
    return {
        ...actual,
        RunView: MockRunView,
    };
});

describe('FeatureValueCacheService (P1-7c)', () => {
    const mockUser = { ID: 'user-1', Email: 'test@example.com' } as unknown as UserInfo;

    beforeEach(() => {
        (RunView as unknown as { mockResults: unknown[] }).mockResults = [];
    });

    describe('computeCacheKey', () => {
        it('computes deterministic key hash and legible display with KeyFields', async () => {
            const keyResult1 = await FeatureValueCacheService.Instance.computeCacheKey({
                keyFields: ['Title', 'Department'],
                recordData: { Title: 'Director of Marketing', Department: 'Marketing', ExtraField: 'ignored' },
            });

            // Reordered fields in recordData should produce identical hash (canonical JSON)
            const keyResult2 = await FeatureValueCacheService.Instance.computeCacheKey({
                keyFields: ['Title', 'Department'],
                recordData: { Department: 'Marketing', Title: 'Director of Marketing', OtherField: 123 },
            });

            expect(keyResult1.keyHash).toBe(keyResult2.keyHash);
            expect(keyResult1.keyDisplay).toBe('Director of Marketing | Marketing');
            expect(keyResult1.keyJSON).toBe(JSON.stringify({ Department: 'Marketing', Title: 'Director of Marketing' }));
        });

        it('falls back to whole rendered context when KeyFields is omitted', async () => {
            const contextText = 'Customer reported high satisfaction with support agent Alice.';
            const keyResult = await FeatureValueCacheService.Instance.computeCacheKey({
                renderedContext: contextText,
                recordData: { ID: 'rec-123' },
            });

            expect(keyResult.keyHash).toBeDefined();
            expect(keyResult.keyDisplay).toBe(contextText);
            expect(keyResult.keyJSON).toContain('Customer reported high satisfaction');
        });
    });

    describe('Lookup and BatchLookup', () => {
        it('returns cached entry and increments HitCount on valid cache hit', async () => {
            const mockSave = vi.fn().mockResolvedValue(true);
            const mockEntry = {
                ID: 'cache-1',
                KeyHash: 'key-abc',
                OutputsJSON: JSON.stringify({ seniority: 'Director', function: 'Marketing' }),
                Reasoning: 'Role title contains Director and Marketing',
                HitCount: 3,
                ExpiresAt: null,
                Save: mockSave,
            };

            (RunView as unknown as { mockResults: unknown[] }).mockResults = [mockEntry];

            const result = await FeatureValueCacheService.Instance.Lookup({
                promptID: 'prompt-1',
                promptVersionHash: 'p-hash-1',
                constraintHash: 'c-hash-1',
                keyHash: 'key-abc',
                contextUser: mockUser,
            });

            expect(result).toBeDefined();
            expect(result?.ID).toBe('cache-1');
            expect(mockEntry.HitCount).toBe(4);
            expect(mockSave).toHaveBeenCalled();
        });

        it('discards and ignores expired cache entries', async () => {
            const expiredEntry = {
                ID: 'cache-expired',
                KeyHash: 'key-expired',
                OutputsJSON: JSON.stringify({ role: 'Junior' }),
                ExpiresAt: new Date(Date.now() - 60000), // 1 minute ago
                HitCount: 5,
                Save: vi.fn(),
            };

            (RunView as unknown as { mockResults: unknown[] }).mockResults = [expiredEntry];

            const result = await FeatureValueCacheService.Instance.Lookup({
                promptID: 'prompt-1',
                promptVersionHash: 'p-hash-1',
                constraintHash: 'c-hash-1',
                keyHash: 'key-expired',
                contextUser: mockUser,
            });

            expect(result).toBeNull();
        });

        it('returns null on cache miss', async () => {
            (RunView as unknown as { mockResults: unknown[] }).mockResults = [];

            const result = await FeatureValueCacheService.Instance.Lookup({
                promptID: 'prompt-1',
                promptVersionHash: 'p-hash-1',
                constraintHash: 'c-hash-1',
                keyHash: 'key-nonexistent',
                contextUser: mockUser,
            });

            expect(result).toBeNull();
        });
    });

    describe('RecordFeatureValues', () => {
        it('saves typed historical audit rows for each output', async () => {
            const savedRecords: Array<Record<string, unknown>> = [];
            const mockProvider = {
                GetEntityObject: vi.fn().mockImplementation(async () => {
                    const row: Record<string, unknown> = {
                        NewRecord: vi.fn(),
                        Save: vi.fn().mockImplementation(async () => {
                            savedRecords.push({ ...row });
                            return true;
                        }),
                    };
                    return row;
                }),
            };

            await FeatureValueCacheService.Instance.RecordFeatureValues({
                recordProcessID: 'rp-1',
                entityID: 'ent-1',
                recordID: 'rec-100',
                outputs: [
                    { featureName: 'Seniority', value: 'Senior' },
                    { featureName: 'RiskScore', value: 0.85, confidence: 0.95 },
                    { featureName: 'IsEscalated', value: true },
                ],
                promptID: 'prompt-1',
                promptVersionHash: 'p-hash-1',
                featureValueCacheID: 'cache-entry-1',
                contextUser: mockUser,
                provider: mockProvider as unknown as any,
            });

            expect(savedRecords.length).toBe(3);
            expect(savedRecords[0].FeatureName).toBe('Seniority');
            expect(savedRecords[0].ValueText).toBe('Senior');
            expect(savedRecords[0].FeatureValueCacheID).toBe('cache-entry-1');

            expect(savedRecords[1].FeatureName).toBe('RiskScore');
            expect(savedRecords[1].ValueNumeric).toBe(0.85);
            expect(savedRecords[1].Confidence).toBe(0.95);

            expect(savedRecords[2].FeatureName).toBe('IsEscalated');
            expect(savedRecords[2].ValueBoolean).toBe(true);
        });
    });
});
