import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Hoisted mocks
// ============================================================================

const {
    mockSave, mockLoad, mockNewRecord, mockRunView,
    mockGetEntityObject,
} = vi.hoisted(() => ({
    mockSave: vi.fn().mockResolvedValue(true),
    mockLoad: vi.fn().mockResolvedValue(true),
    mockNewRecord: vi.fn(),
    mockRunView: vi.fn(),
    mockGetEntityObject: vi.fn(),
}));

vi.mock('@memberjunction/global', () => ({
    BaseSingleton: class BaseSingleton<T> {
        public static getInstance<T>(): T { return new (this as unknown as new () => T)(); }
    },
    UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => {
        if (a == null || b == null) return a === b;
        return a.toLowerCase() === b.toLowerCase();
    },
    NormalizeUUID: (id: string) => id.toLowerCase(),
    RegisterClass: vi.fn(),
}));

vi.mock('@memberjunction/core', () => {
    class MockMetadata {
        GetEntityObject = mockGetEntityObject;
    }
    class MockRunView {
        RunView = mockRunView;
    }
    return {
        Metadata: MockMetadata,
        RunView: MockRunView,
        UserInfo: class {},
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        BaseEngine: class {
            static getInstance() { return new this(); }
            async Load() {}
            async Config() {}
        },
        RegisterForStartup: vi.fn(),
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJTagEntity: class {},
    MJTagAuditLogEntity: class {},
    MJContentItemTagEntity: class {},
    MJTaggedItemEntity: class {},
    MJAICredentialBindingEntity: class {},
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    AIModelRunner: class {},
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn(), Prompts: [], Models: [] } },
}));

import { TagGovernanceEngine } from '../TagGovernanceEngine';

/**
 * Helper to create a mock entity object with standard get/set, Save, Load, and NewRecord.
 */
function createMockEntity(fields: Record<string, unknown> = {}): Record<string, unknown> {
    const data: Record<string, unknown> = { ...fields };
    return new Proxy(data, {
        get(target, prop: string) {
            if (prop === 'Save') return mockSave;
            if (prop === 'Load') return mockLoad;
            if (prop === 'NewRecord') return mockNewRecord;
            if (prop === 'LatestResult') return { Message: 'mock error' };
            return target[prop];
        },
        set(target, prop: string, value: unknown) {
            target[prop] = value;
            return true;
        },
    });
}

describe('TagGovernanceEngine', () => {
    let engine: TagGovernanceEngine;
    const mockUser = { ID: 'user-1' } as never;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = TagGovernanceEngine.Instance;

        // Default: mockGetEntityObject returns a new mock entity each time
        mockGetEntityObject.mockImplementation(() => Promise.resolve(createMockEntity()));
        // Default: mockSave succeeds
        mockSave.mockResolvedValue(true);
        // Default: mockLoad succeeds
        mockLoad.mockResolvedValue(true);
    });

    // ========================================================================
    // MergeTags
    // ========================================================================

    describe('MergeTags', () => {
        it('should re-point content item tags and tagged items to surviving tag', async () => {
            const mockContentItems = [
                createMockEntity({ ID: 'ci-1', TagID: 'source-1' }),
                createMockEntity({ ID: 'ci-2', TagID: 'source-1' }),
            ];
            const mockTaggedItems = [
                createMockEntity({ ID: 'ti-1', TagID: 'source-1' }),
            ];

            // First call: content item tags; second call: tagged items
            let runViewCallCount = 0;
            mockRunView.mockImplementation(() => {
                runViewCallCount++;
                if (runViewCallCount === 1) {
                    return Promise.resolve({ Success: true, Results: mockContentItems });
                }
                return Promise.resolve({ Success: true, Results: mockTaggedItems });
            });

            // The tag Load entity for marking as merged
            const sourceTag = createMockEntity({ ID: 'source-1', Status: 'Active', MergedIntoTagID: null });
            // getEntityObject: first for the tag load, second for audit log
            let getEntityCallCount = 0;
            mockGetEntityObject.mockImplementation(() => {
                getEntityCallCount++;
                if (getEntityCallCount === 1) return Promise.resolve(sourceTag);
                return Promise.resolve(createMockEntity());
            });

            const result = await engine.MergeTags(['source-1'], 'surviving-1', mockUser);

            expect(result.ItemsMoved).toBe(2);
            expect(result.TaggedItemsMoved).toBe(1);
            // Verify source tag was marked as merged
            expect(sourceTag.Status).toBe('Merged');
            expect(sourceTag.MergedIntoTagID).toBe('surviving-1');
        });

        it('should create audit log entries for each source tag', async () => {
            mockRunView.mockResolvedValue({ Success: true, Results: [] });

            const tags = [
                createMockEntity({ ID: 'source-1', Status: 'Active' }),
                createMockEntity({ ID: 'source-2', Status: 'Active' }),
            ];
            let tagIdx = 0;
            const auditEntries: Record<string, unknown>[] = [];

            mockGetEntityObject.mockImplementation(() => {
                // Alternate between tag loads and audit log creates
                // For each source: 1 tag load + 1 audit log
                const callNum = tagIdx++;
                if (callNum % 2 === 0) {
                    return Promise.resolve(tags[Math.floor(callNum / 2)]);
                }
                const auditEntry = createMockEntity();
                auditEntries.push(auditEntry);
                return Promise.resolve(auditEntry);
            });

            await engine.MergeTags(['source-1', 'source-2'], 'surviving-1', mockUser);

            // Should have created 2 audit entries (one per source tag)
            expect(auditEntries.length).toBe(2);
        });

        it('should handle RunView failure gracefully', async () => {
            mockRunView.mockResolvedValue({ Success: false, ErrorMessage: 'DB error', Results: [] });

            const sourceTag = createMockEntity({ ID: 'source-1', Status: 'Active' });
            mockGetEntityObject.mockResolvedValue(sourceTag);

            const result = await engine.MergeTags(['source-1'], 'surviving-1', mockUser);

            expect(result.ItemsMoved).toBe(0);
            expect(result.TaggedItemsMoved).toBe(0);
        });
    });

    // ========================================================================
    // SplitTag
    // ========================================================================

    describe('SplitTag', () => {
        it('should create new child tags under the original tag parent', async () => {
            const originalTag = createMockEntity({ ID: 'tag-1', ParentID: 'parent-1', Name: 'Original' });
            const createdTags: Record<string, unknown>[] = [];

            let callCount = 0;
            mockGetEntityObject.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    // Loading the original tag
                    return Promise.resolve(originalTag);
                }
                // Creating new tags or audit log
                const entity = createMockEntity();
                if (callCount <= 3) {
                    // Two new tags (callCount 2 and 3)
                    createdTags.push(entity);
                }
                return Promise.resolve(entity);
            });

            const result = await engine.SplitTag('tag-1', ['Child A', 'Child B'], mockUser);

            expect(result.length).toBe(2);
            // Verify tags were created with the parent's parent as their parent
            expect(createdTags[0].ParentID).toBe('parent-1');
            expect(createdTags[1].ParentID).toBe('parent-1');
            expect(createdTags[0].Name).toBe('Child A');
            expect(createdTags[1].Name).toBe('Child B');
        });

        it('should create audit log entry with action Split', async () => {
            const originalTag = createMockEntity({ ID: 'tag-1', ParentID: null, Name: 'Original' });
            const auditEntry = createMockEntity();

            let callCount = 0;
            mockGetEntityObject.mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve(originalTag);
                if (callCount === 3) return Promise.resolve(auditEntry); // audit log (after 1 child)
                return Promise.resolve(createMockEntity());
            });

            await engine.SplitTag('tag-1', ['Child A'], mockUser);

            // Verify audit entry was created
            expect(auditEntry.Action).toBe('Split');
            expect(auditEntry.TagID).toBe('tag-1');
        });
    });

    // ========================================================================
    // MoveTag
    // ========================================================================

    describe('MoveTag', () => {
        it('should update the tag ParentID and create audit log', async () => {
            const tag = createMockEntity({ ID: 'tag-1', ParentID: 'old-parent', Name: 'Test' });
            const auditEntry = createMockEntity();

            let callCount = 0;
            mockGetEntityObject.mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve(tag);
                return Promise.resolve(auditEntry);
            });

            await engine.MoveTag('tag-1', 'new-parent', mockUser);

            expect(tag.ParentID).toBe('new-parent');
            expect(auditEntry.Action).toBe('Moved');
        });

        it('should support moving to root (null parent)', async () => {
            const tag = createMockEntity({ ID: 'tag-1', ParentID: 'old-parent', Name: 'Test' });

            let callCount = 0;
            mockGetEntityObject.mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve(tag);
                return Promise.resolve(createMockEntity());
            });

            await engine.MoveTag('tag-1', null, mockUser);

            expect(tag.ParentID).toBeNull();
        });

        it('should throw when save fails', async () => {
            const tag = createMockEntity({ ID: 'tag-1', ParentID: 'old-parent', Name: 'Test' });
            mockGetEntityObject.mockResolvedValue(tag);
            mockSave.mockResolvedValueOnce(false);

            await expect(engine.MoveTag('tag-1', 'new-parent', mockUser))
                .rejects.toThrow('Failed to move tag');
        });
    });

    // ========================================================================
    // RenameTag
    // ========================================================================

    describe('RenameTag', () => {
        it('should update Name and DisplayName', async () => {
            const tag = createMockEntity({ ID: 'tag-1', Name: 'Old Name', DisplayName: 'Old Name' });
            const auditEntry = createMockEntity();

            let callCount = 0;
            mockGetEntityObject.mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve(tag);
                return Promise.resolve(auditEntry);
            });

            await engine.RenameTag('tag-1', 'New Name', mockUser);

            expect(tag.Name).toBe('New Name');
            expect(tag.DisplayName).toBe('New Name');
        });

        it('should create audit log with old and new names', async () => {
            const tag = createMockEntity({ ID: 'tag-1', Name: 'Old Name', DisplayName: 'Old Name' });
            const auditEntry = createMockEntity();

            let callCount = 0;
            mockGetEntityObject.mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve(tag);
                return Promise.resolve(auditEntry);
            });

            await engine.RenameTag('tag-1', 'New Name', mockUser);

            expect(auditEntry.Action).toBe('Renamed');
            const details = JSON.parse(auditEntry.Details as string);
            expect(details.OldName).toBe('Old Name');
            expect(details.NewName).toBe('New Name');
        });
    });

    // ========================================================================
    // DeprecateTag
    // ========================================================================

    describe('DeprecateTag', () => {
        it('should set status to Deprecated and create audit log', async () => {
            const tag = createMockEntity({ ID: 'tag-1', Status: 'Active', Name: 'Test' });
            const auditEntry = createMockEntity();

            let callCount = 0;
            mockGetEntityObject.mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve(tag);
                return Promise.resolve(auditEntry);
            });

            await engine.DeprecateTag('tag-1', mockUser);

            expect(tag.Status).toBe('Deprecated');
            expect(auditEntry.Action).toBe('Deprecated');
        });
    });

    // ========================================================================
    // ReactivateTag
    // ========================================================================

    describe('ReactivateTag', () => {
        it('should set status to Active and create audit log', async () => {
            const tag = createMockEntity({ ID: 'tag-1', Status: 'Deprecated', Name: 'Test' });
            const auditEntry = createMockEntity();

            let callCount = 0;
            mockGetEntityObject.mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve(tag);
                return Promise.resolve(auditEntry);
            });

            await engine.ReactivateTag('tag-1', mockUser);

            expect(tag.Status).toBe('Active');
            expect(auditEntry.Action).toBe('Reactivated');
        });
    });

    // ========================================================================
    // DeleteTag
    // ========================================================================

    describe('DeleteTag', () => {
        it('should set status to Deleted and create audit log', async () => {
            const tag = createMockEntity({ ID: 'tag-1', Status: 'Active', Name: 'Test' });
            const auditEntry = createMockEntity();

            let callCount = 0;
            mockGetEntityObject.mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve(tag);
                return Promise.resolve(auditEntry);
            });

            await engine.DeleteTag('tag-1', mockUser);

            expect(tag.Status).toBe('Deleted');
            expect(auditEntry.Action).toBe('Deleted');
        });
    });

    // ========================================================================
    // Error handling
    // ========================================================================

    describe('error handling', () => {
        it('should throw when tag Load fails', async () => {
            mockLoad.mockResolvedValueOnce(false);

            await expect(engine.RenameTag('nonexistent', 'New', mockUser))
                .rejects.toThrow('Failed to load tag');
        });

        it('should throw when tag Save fails during rename', async () => {
            const tag = createMockEntity({ ID: 'tag-1', Name: 'Old', DisplayName: 'Old' });
            mockGetEntityObject.mockResolvedValue(tag);
            mockSave.mockResolvedValueOnce(false);

            await expect(engine.RenameTag('tag-1', 'New', mockUser))
                .rejects.toThrow('Failed to rename tag');
        });
    });
});
