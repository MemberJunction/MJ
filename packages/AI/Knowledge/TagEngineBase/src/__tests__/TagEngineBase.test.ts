import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@memberjunction/core', () => {
    class MockMetadata {
        async GetEntityObject() {
            const record: Record<string, unknown> = {
                _saved: false,
                NewRecord: vi.fn(),
                Save: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
                    this._saved = true;
                    return Promise.resolve(true);
                }),
                LatestResult: null,
            };
            return new Proxy(record, {
                set(target, prop, value) { target[prop as string] = value; return true; },
                get(target, prop) { return target[prop as string]; }
            });
        }
    }
    const sharedMockProvider = new MockMetadata();
    const sharedMockRunViewProvider = {
        RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] })
    };
    return {
        BaseEngine: class BaseEngine<T> {
            public static getInstance<T>(): T { return new (this as unknown as new () => T)(); }
            protected async Load(): Promise<void> {}
            public get ProviderToUse() { return sharedMockProvider; }
            public get RunViewProviderToUse() { return sharedMockRunViewProvider; }
        },
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        UserInfo: class {},
        Metadata: MockMetadata,
        RunView: class {
            RunView = vi.fn().mockResolvedValue({ Success: true, Results: [] });
        },
        LogError: vi.fn(),
    };
});

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => {
        if (a == null || b == null) return a === b;
        return a.toLowerCase() === b.toLowerCase();
    },
    NormalizeUUID: (id: string) => id.toLowerCase(),
    BaseSingleton: class<T> {
        public constructor() {}
        public static getInstance<T>(this: new () => T): T {
            const ctor = this as unknown as { _inst?: T };
            if (!ctor._inst) ctor._inst = new (this as unknown as new () => T)();
            return ctor._inst as T;
        }
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJTagEntity: class {},
    MJTaggedItemEntity: class {},
    MJTagScopeEntity: class {},
    MJTagSynonymEntity: class {},
}));

import { TagEngineBase, TagTreeNode } from '../TagEngineBase';

// ============================================================================
// Helpers — build fake tag and tagged-item entities
// ============================================================================

interface FakeTag {
    ID: string;
    Name: string;
    DisplayName: string;
    Description: string | null;
    ParentID: string | null;
    Status: 'Active' | 'Deleted' | 'Deprecated' | 'Merged';
}

function makeFakeTag(id: string, name: string, parentID: string | null = null, description: string | null = null, status: 'Active' | 'Deleted' | 'Deprecated' | 'Merged' = 'Active'): FakeTag {
    return { ID: id, Name: name, DisplayName: name, Description: description, ParentID: parentID, Status: status };
}

function injectTags(engine: TagEngineBase, tags: FakeTag[]): void {
    (engine as unknown as { _Tags: FakeTag[] })._Tags = tags;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('TagEngineBase', () => {
    let engine: TagEngineBase;

    // Sample hierarchy:
    //   Technology (root)
    //     ├── AI
    //     │   ├── Machine Learning
    //     │   └── NLP
    //     └── Cloud Computing
    //   Healthcare (root)

    const tags: FakeTag[] = [
        makeFakeTag('aaa', 'Technology', null, 'Top-level tech category'),
        makeFakeTag('bbb', 'AI', 'aaa', 'Artificial intelligence'),
        makeFakeTag('ccc', 'Machine Learning', 'bbb'),
        makeFakeTag('ddd', 'NLP', 'bbb'),
        makeFakeTag('eee', 'Cloud Computing', 'aaa'),
        makeFakeTag('fff', 'Healthcare', null),
    ];

    beforeEach(() => {
        engine = TagEngineBase.Instance;
        injectTags(engine, [...tags]);
    });

    // ========================================================================
    // Lookup Helpers
    // ========================================================================

    describe('GetTagByID', () => {
        it('should find a tag by exact ID', () => {
            expect(engine.GetTagByID('aaa')?.Name).toBe('Technology');
        });

        it('should be case-insensitive for UUIDs', () => {
            expect(engine.GetTagByID('AAA')?.Name).toBe('Technology');
        });

        it('should return undefined for unknown ID', () => {
            expect(engine.GetTagByID('zzz')).toBeUndefined();
        });
    });

    describe('GetTagByName', () => {
        it('should find a tag by exact name', () => {
            expect(engine.GetTagByName('AI')?.ID).toBe('bbb');
        });

        it('should be case-insensitive', () => {
            expect(engine.GetTagByName('machine learning')?.ID).toBe('ccc');
        });

        it('should trim whitespace', () => {
            expect(engine.GetTagByName('  NLP  ')?.ID).toBe('ddd');
        });

        it('should return undefined for unknown name', () => {
            expect(engine.GetTagByName('Quantum Computing')).toBeUndefined();
        });

        it('should exclude non-Active tags', () => {
            const tagsWithInactive = [
                ...tags,
                makeFakeTag('ggg', 'Deprecated Tag', null, null, 'Deprecated'),
                makeFakeTag('hhh', 'Merged Tag', null, null, 'Merged'),
                makeFakeTag('iii', 'Deleted Tag', null, null, 'Deleted'),
            ];
            injectTags(engine, tagsWithInactive);
            expect(engine.GetTagByName('Deprecated Tag')).toBeUndefined();
            expect(engine.GetTagByName('Merged Tag')).toBeUndefined();
            expect(engine.GetTagByName('Deleted Tag')).toBeUndefined();
            // Active tags still found
            expect(engine.GetTagByName('AI')?.ID).toBe('bbb');
        });
    });

    describe('GetChildTags', () => {
        it('should return direct children of a tag', () => {
            const children = engine.GetChildTags('aaa');
            expect(children.map(c => c.Name).sort()).toEqual(['AI', 'Cloud Computing']);
        });

        it('should return empty array for a leaf tag', () => {
            expect(engine.GetChildTags('ccc')).toHaveLength(0);
        });
    });

    describe('GetSubtree', () => {
        it('should return all descendants of a tag', () => {
            const subtree = engine.GetSubtree('aaa');
            const names = subtree.map(t => t.Name).sort();
            expect(names).toEqual(['AI', 'Cloud Computing', 'Machine Learning', 'NLP']);
        });

        it('should NOT include the root itself', () => {
            const subtree = engine.GetSubtree('aaa');
            expect(subtree.find(t => t.Name === 'Technology')).toBeUndefined();
        });

        it('should return empty array for leaf tag', () => {
            expect(engine.GetSubtree('fff')).toHaveLength(0);
        });

        it('should handle nested subtrees correctly', () => {
            const subtree = engine.GetSubtree('bbb');
            const names = subtree.map(t => t.Name).sort();
            expect(names).toEqual(['Machine Learning', 'NLP']);
        });
    });


    // ========================================================================
    // Taxonomy Serialization
    // ========================================================================

    describe('GetTaxonomyTree', () => {
        it('should build a full forest from all root tags', () => {
            const tree = engine.GetTaxonomyTree();
            expect(tree).toHaveLength(2); // Technology, Healthcare
            const techNode = tree.find(n => n.Name === 'Technology')!;
            expect(techNode.Children).toHaveLength(2); // AI, Cloud Computing
        });

        it('should build nested children correctly', () => {
            const tree = engine.GetTaxonomyTree();
            const techNode = tree.find(n => n.Name === 'Technology')!;
            const aiNode = techNode.Children.find(n => n.Name === 'AI')!;
            expect(aiNode.Children).toHaveLength(2); // ML, NLP
        });

        it('should include Description in tree nodes', () => {
            const tree = engine.GetTaxonomyTree();
            const techNode = tree.find(n => n.Name === 'Technology')!;
            expect(techNode.Description).toBe('Top-level tech category');
        });

        it('should return subtree when rootID is provided', () => {
            const tree = engine.GetTaxonomyTree('bbb');
            expect(tree).toHaveLength(1);
            expect(tree[0].Name).toBe('AI');
            expect(tree[0].Children).toHaveLength(2);
        });

        it('should return empty array when rootID not found', () => {
            expect(engine.GetTaxonomyTree('zzz')).toHaveLength(0);
        });

        it('should handle leaf node as root', () => {
            const tree = engine.GetTaxonomyTree('fff');
            expect(tree).toHaveLength(1);
            expect(tree[0].Name).toBe('Healthcare');
            expect(tree[0].Children).toHaveLength(0);
        });
    });

    // ========================================================================
    // CRUD Helpers
    // ========================================================================

    describe('CreateTag', () => {
        it('should create a new tag and add it to the cache', async () => {
            const beforeCount = engine.Tags.length;
            const newTag = await engine.CreateTag('Robotics', 'Robotics', 'aaa', 'Science of robots', {} as never);
            expect(newTag).toBeDefined();
            expect(engine.Tags.length).toBe(beforeCount + 1);
        });
    });

    describe('CreateTaggedItem', () => {
        it('should create a new tagged item when none exists', async () => {
            injectTags(engine, [...tags]);
            const item = await engine.CreateTaggedItem('aaa', 'ent-1', 'rec-1', 0.85, {} as never);
            expect(item).toBeDefined();
        });
    });
});
