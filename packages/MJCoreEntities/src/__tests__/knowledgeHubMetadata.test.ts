import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: { Instance: { GetGlobalObjectStore: () => ({}) } },
        UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
    };
});

vi.mock('@memberjunction/core', () => {
    return {
        BaseEngine: class MockBaseEngine {
            // Minimal stand-in for BaseEngine.DataChange$ so the engine constructor's
            // invalidation subscription is satisfied. Tests reset the index cache directly
            // in beforeEach (they poke private arrays, bypassing the event path).
            get DataChange$() {
                return { subscribe: () => ({ unsubscribe: () => { /* no-op */ } }) };
            }
            static getInstance<T>(): T {
                const ctor = this as unknown as { _testInstance?: T; new (): T };
                if (!ctor._testInstance) {
                    ctor._testInstance = new ctor();
                }
                return ctor._testInstance;
            }
            async Load(
                _configs: unknown[],
                _provider?: unknown,
                _forceRefresh?: boolean,
                _contextUser?: unknown
            ): Promise<void> {
                // no-op in tests
            }
        },
        UserInfo: class MockUserInfo {
            ID = 'user-1';
        },
    };
});

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------

import { KnowledgeHubMetadataEngine } from '../engines/knowledgeHubMetadata';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

interface MockEntityDocument {
    ID: string;
    Entity: string;
    EntityID: string;
    Name: string;
    Status: string;
}

interface MockVectorIndex {
    ID: string;
    Name: string;
}


function createMockEntityDocument(overrides: Partial<MockEntityDocument> = {}): MockEntityDocument {
    return {
        ID: 'ED-0001-0000-0000-000000000001',
        Entity: 'Contacts',
        EntityID: 'E-0001',
        Name: 'Contacts Default',
        Status: 'Active',
        ...overrides,
    };
}

function createMockVectorIndex(overrides: Partial<MockVectorIndex> = {}): MockVectorIndex {
    return {
        ID: 'VI-0001-0000-0000-000000000001',
        Name: 'contacts-index',
        ...overrides,
    };
}

interface MockContentSource { ID: string; Name: string; }
interface MockContentType { ID: string; Name: string; }
interface MockContentSourceType { ID: string; Name: string; }

function createMockContentSource(overrides: Partial<MockContentSource> = {}): MockContentSource {
    return { ID: 'CS-0001-0000-0000-000000000001', Name: 'default-source', ...overrides };
}
function createMockContentType(overrides: Partial<MockContentType> = {}): MockContentType {
    return { ID: 'CT-0001-0000-0000-000000000001', Name: 'default-type', ...overrides };
}
function createMockContentSourceType(overrides: Partial<MockContentSourceType> = {}): MockContentSourceType {
    return { ID: 'CST-0001-0000-0000-000000000001', Name: 'default-source-type', ...overrides };
}


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgeHubMetadataEngine', () => {
    let engine: KnowledgeHubMetadataEngine;

    beforeEach(() => {
        // Get a fresh instance via the singleton, then reset its private arrays
        engine = KnowledgeHubMetadataEngine.Instance;

        // Inject test data directly into the private arrays
        (engine as unknown as Record<string, unknown[]>)['_entityDocuments'] = [
            createMockEntityDocument({ ID: 'ED-AAA', Entity: 'Contacts', Status: 'Active' }),
            createMockEntityDocument({ ID: 'ED-BBB', Entity: 'Contacts', Name: 'Contacts Alt', Status: 'Inactive' }),
            createMockEntityDocument({ ID: 'ED-CCC', Entity: 'Accounts', Status: 'Active' }),
            createMockEntityDocument({ ID: 'ED-DDD', Entity: 'Leads', Status: 'Active' }),
        ];
        (engine as unknown as Record<string, unknown[]>)['_vectorIndexes'] = [
            createMockVectorIndex({ ID: 'VI-AAA', Name: 'contacts-idx' }),
            createMockVectorIndex({ ID: 'VI-BBB', Name: 'accounts-idx' }),
        ];
        (engine as unknown as Record<string, MockContentSource[]>)['_contentSources'] = [
            createMockContentSource({ ID: 'CS-AAA', Name: 'RSS Feed' }),
            createMockContentSource({ ID: 'CS-BBB', Name: 'Website' }),
        ];
        (engine as unknown as Record<string, MockContentType[]>)['_contentTypes'] = [
            createMockContentType({ ID: 'CT-AAA', Name: 'Article' }),
        ];
        (engine as unknown as Record<string, MockContentSourceType[]>)['_contentSourceTypes'] = [
            createMockContentSourceType({ ID: 'CST-AAA', Name: 'RSS' }),
        ];
        // Tests inject data directly into the private arrays, bypassing the engine's event-driven
        // invalidation, so reset the by-id index cache too (mirrors clearing the arrays above).
        (engine as unknown as { _idIndexes: Map<unknown, unknown> })._idIndexes.clear();
    });

    // ================================================================
    // Singleton pattern
    // ================================================================

    describe('Singleton pattern', () => {
        it('should return the same instance on repeated calls', () => {
            const instance1 = KnowledgeHubMetadataEngine.Instance;
            const instance2 = KnowledgeHubMetadataEngine.Instance;
            expect(instance1).toBe(instance2);
        });
    });

    // ================================================================
    // GetEntitiesWithDocuments
    // ================================================================

    describe('GetEntitiesWithDocuments', () => {
        it('should return distinct entity names from active documents', () => {
            const result = engine.GetEntitiesWithDocuments();
            // 'Contacts' has 2 docs (1 active, 1 inactive) -> counted once
            // 'Accounts' active -> counted
            // 'Leads' active -> counted
            expect(result).toEqual(['Accounts', 'Contacts', 'Leads']);
        });

        it('should return sorted results', () => {
            const result = engine.GetEntitiesWithDocuments();
            const sorted = [...result].sort();
            expect(result).toEqual(sorted);
        });

        it('should exclude entities with only inactive documents', () => {
            // Set all Contacts docs to Inactive
            (engine as unknown as Record<string, MockEntityDocument[]>)['_entityDocuments'] = [
                createMockEntityDocument({ ID: 'ED-1', Entity: 'Contacts', Status: 'Inactive' }),
                createMockEntityDocument({ ID: 'ED-2', Entity: 'Accounts', Status: 'Active' }),
            ];

            const result = engine.GetEntitiesWithDocuments();
            expect(result).toEqual(['Accounts']);
            expect(result).not.toContain('Contacts');
        });

        it('should return empty array when no active documents exist', () => {
            (engine as unknown as Record<string, unknown[]>)['_entityDocuments'] = [];
            const result = engine.GetEntitiesWithDocuments();
            expect(result).toEqual([]);
        });

        it('should skip documents with null/empty Entity field', () => {
            (engine as unknown as Record<string, MockEntityDocument[]>)['_entityDocuments'] = [
                createMockEntityDocument({ ID: 'ED-1', Entity: '', Status: 'Active' }),
                createMockEntityDocument({ ID: 'ED-2', Entity: 'Valid', Status: 'Active' }),
            ];

            const result = engine.GetEntitiesWithDocuments();
            expect(result).toEqual(['Valid']);
        });
    });

    // ================================================================
    // GetEntityDocumentsForEntity
    // ================================================================

    describe('GetEntityDocumentsForEntity', () => {
        it('should return all documents matching the entity name', () => {
            const result = engine.GetEntityDocumentsForEntity('Contacts');
            expect(result).toHaveLength(2); // Both active and inactive
        });

        it('should be case-insensitive', () => {
            const result = engine.GetEntityDocumentsForEntity('contacts');
            expect(result).toHaveLength(2);
        });

        it('should handle mixed case input', () => {
            const result = engine.GetEntityDocumentsForEntity('CONTACTS');
            expect(result).toHaveLength(2);
        });

        it('should return empty array for non-existent entity', () => {
            const result = engine.GetEntityDocumentsForEntity('NonExistent');
            expect(result).toHaveLength(0);
        });

        it('should return empty array for empty string input', () => {
            const result = engine.GetEntityDocumentsForEntity('');
            expect(result).toHaveLength(0);
        });

        it('should trim whitespace from input', () => {
            const result = engine.GetEntityDocumentsForEntity('  Contacts  ');
            expect(result).toHaveLength(2);
        });
    });

    // ================================================================
    // GetEntityDocumentByID
    // ================================================================

    describe('GetEntityDocumentByID', () => {
        it('should find a document by exact ID', () => {
            const result = engine.GetEntityDocumentByID('ED-AAA');
            expect(result).toBeDefined();
            expect(result!.Entity).toBe('Contacts');
        });

        it('should find by ID with case-insensitive UUID comparison', () => {
            // UUIDsEqual mock compares lowercase
            const result = engine.GetEntityDocumentByID('ed-aaa');
            expect(result).toBeDefined();
            expect(result!.Entity).toBe('Contacts');
        });

        it('should return undefined for non-existent ID', () => {
            const result = engine.GetEntityDocumentByID('non-existent-id');
            expect(result).toBeUndefined();
        });

        it('should return undefined for empty string', () => {
            const result = engine.GetEntityDocumentByID('');
            expect(result).toBeUndefined();
        });
    });

    // ================================================================
    // GetVectorIndexByID
    // ================================================================

    describe('GetVectorIndexByID', () => {
        it('should find a vector index by ID', () => {
            const result = engine.GetVectorIndexByID('VI-AAA');
            expect(result).toBeDefined();
            expect(result!.Name).toBe('contacts-idx');
        });

        it('should be case-insensitive via UUIDsEqual', () => {
            const result = engine.GetVectorIndexByID('vi-aaa');
            expect(result).toBeDefined();
        });

        it('should return undefined for non-existent ID', () => {
            const result = engine.GetVectorIndexByID('no-such-id');
            expect(result).toBeUndefined();
        });

        it('should return undefined for empty string', () => {
            const result = engine.GetVectorIndexByID('');
            expect(result).toBeUndefined();
        });
    });

    // ================================================================
    // O(1) by-id finders (content sources / types / source types)
    // ================================================================

    describe('GetContentSourceByID', () => {
        it('should find a content source by ID', () => {
            expect(engine.GetContentSourceByID('CS-AAA')?.Name).toBe('RSS Feed');
        });
        it('should be case-insensitive', () => {
            expect(engine.GetContentSourceByID('cs-bbb')?.Name).toBe('Website');
        });
        it('should return undefined for non-existent ID', () => {
            expect(engine.GetContentSourceByID('CS-ZZZ')).toBeUndefined();
        });
        it('should return undefined for empty string', () => {
            expect(engine.GetContentSourceByID('')).toBeUndefined();
        });
        it('should reflect a swapped-out array (index rebuilds on next call after cache reset)', () => {
            expect(engine.GetContentSourceByID('CS-AAA')?.Name).toBe('RSS Feed'); // builds index
            (engine as unknown as Record<string, MockContentSource[]>)['_contentSources'] = [
                createMockContentSource({ ID: 'CS-NEW', Name: 'Fresh Source' }),
            ];
            (engine as unknown as { _idIndexes: Map<unknown, unknown> })._idIndexes.clear();
            expect(engine.GetContentSourceByID('CS-AAA')).toBeUndefined();
            expect(engine.GetContentSourceByID('CS-NEW')?.Name).toBe('Fresh Source');
        });
    });

    describe('GetContentTypeByID', () => {
        it('should find a content type by ID (case-insensitive)', () => {
            expect(engine.GetContentTypeByID('ct-aaa')?.Name).toBe('Article');
        });
        it('should return undefined for non-existent ID', () => {
            expect(engine.GetContentTypeByID('CT-ZZZ')).toBeUndefined();
        });
    });

    describe('GetContentSourceTypeByID', () => {
        it('should find a content source type by ID (case-insensitive)', () => {
            expect(engine.GetContentSourceTypeByID('cst-aaa')?.Name).toBe('RSS');
        });
        it('should return undefined for non-existent ID', () => {
            expect(engine.GetContentSourceTypeByID('CST-ZZZ')).toBeUndefined();
        });
    });

    // ================================================================
    // GetActiveEntityDocuments
    // ================================================================

    describe('GetActiveEntityDocuments', () => {
        it('should return only documents with Status = Active', () => {
            const result = engine.GetActiveEntityDocuments();
            expect(result).toHaveLength(3); // ED-AAA, ED-CCC, ED-DDD
            expect(result.every(d => d.Status === 'Active')).toBe(true);
        });

        it('should exclude inactive documents', () => {
            const result = engine.GetActiveEntityDocuments();
            const ids = result.map(d => (d as MockEntityDocument).ID);
            expect(ids).not.toContain('ED-BBB');
        });

        it('should return empty array when no active documents', () => {
            (engine as unknown as Record<string, MockEntityDocument[]>)['_entityDocuments'] = [
                createMockEntityDocument({ Status: 'Inactive' }),
                createMockEntityDocument({ ID: 'ED-2', Status: 'Disabled' }),
            ];

            const result = engine.GetActiveEntityDocuments();
            expect(result).toHaveLength(0);
        });

        it('should return empty array when no documents at all', () => {
            (engine as unknown as Record<string, unknown[]>)['_entityDocuments'] = [];
            const result = engine.GetActiveEntityDocuments();
            expect(result).toHaveLength(0);
        });
    });

    // ================================================================
    // Cached data getters
    // ================================================================

    describe('Cached data getters', () => {
        it('EntityDocuments should return all entity documents', () => {
            expect(engine.EntityDocuments).toHaveLength(4);
        });

        it('VectorIndexes should return all vector indexes', () => {
            expect(engine.VectorIndexes).toHaveLength(2);
        });
    });
});
