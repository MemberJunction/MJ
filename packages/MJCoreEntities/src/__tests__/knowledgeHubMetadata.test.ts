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
    // GetEntityDocumentById
    // ================================================================

    describe('GetEntityDocumentById', () => {
        it('should find a document by exact ID', () => {
            const result = engine.GetEntityDocumentById('ED-AAA');
            expect(result).toBeDefined();
            expect(result!.Entity).toBe('Contacts');
        });

        it('should find by ID with case-insensitive UUID comparison', () => {
            // UUIDsEqual mock compares lowercase
            const result = engine.GetEntityDocumentById('ed-aaa');
            expect(result).toBeDefined();
            expect(result!.Entity).toBe('Contacts');
        });

        it('should return undefined for non-existent ID', () => {
            const result = engine.GetEntityDocumentById('non-existent-id');
            expect(result).toBeUndefined();
        });

        it('should return undefined for empty string', () => {
            const result = engine.GetEntityDocumentById('');
            expect(result).toBeUndefined();
        });
    });

    // ================================================================
    // GetVectorIndexById
    // ================================================================

    describe('GetVectorIndexById', () => {
        it('should find a vector index by ID', () => {
            const result = engine.GetVectorIndexById('VI-AAA');
            expect(result).toBeDefined();
            expect(result!.Name).toBe('contacts-idx');
        });

        it('should be case-insensitive via UUIDsEqual', () => {
            const result = engine.GetVectorIndexById('vi-aaa');
            expect(result).toBeDefined();
        });

        it('should return undefined for non-existent ID', () => {
            const result = engine.GetVectorIndexById('no-such-id');
            expect(result).toBeUndefined();
        });

        it('should return undefined for empty string', () => {
            const result = engine.GetVectorIndexById('');
            expect(result).toBeUndefined();
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
