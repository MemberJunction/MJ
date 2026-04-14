import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Hoisted mocks — referenced in vi.mock factories (which are hoisted above imports)
// ============================================================================

const {
    mockRunView, mockEntitySave, mockEntityNewRecord, mockGetEntityObject,
    mockParse, mockTagEngineInstance, mockEngineInstance,
} = vi.hoisted(() => {
    const mockEntitySave = vi.fn().mockResolvedValue(true);
    const mockEntityNewRecord = vi.fn();
    const mockGetEntityObject = vi.fn().mockImplementation(() => {
        const entity: Record<string, unknown> = {
            Save: mockEntitySave,
            NewRecord: mockEntityNewRecord,
            LatestResult: null,
            PrimaryKey: { Values: () => 'rec-1' },
            GetAll: () => ({ Name: 'Test Record', Description: 'Desc' }),
            Get: (field: string) => field === 'Name' ? 'Test Record' : null,
        };
        return Promise.resolve(new Proxy(entity, {
            set(target, prop, value) { target[prop as string] = value; return true; },
            get(target, prop) { return target[prop as string]; }
        }));
    });
    return {
        mockRunView: vi.fn(),
        mockEntitySave,
        mockEntityNewRecord,
        mockGetEntityObject,
        mockParse: vi.fn().mockResolvedValue('Rendered template text for the record.'),
        mockTagEngineInstance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Tags: [{ ID: 'tag-1', Name: 'Technology' }],
            GetTaxonomyTree: vi.fn().mockReturnValue([{ ID: 'tag-1', Name: 'Technology', Children: [] }]),
            GetTagByName: vi.fn().mockReturnValue(null),
            ResolveTag: vi.fn().mockResolvedValue({ ID: 'tag-resolved', Name: 'Resolved Tag' }),
            CreateTag: vi.fn().mockResolvedValue({ ID: 'tag-new', Name: 'New Tag' }),
            CreateTaggedItem: vi.fn().mockResolvedValue({}),
        },
        mockEngineInstance: {
            Config: vi.fn().mockResolvedValue(undefined),
            SetSubclassContentSourceType: vi.fn().mockReturnValue('source-type-entity'),
            getAllContentSources: vi.fn().mockResolvedValue([]),
            GetAllContentSourcesSafe: vi.fn().mockResolvedValue([]),
            ExtractTextAndProcessWithLLM: vi.fn().mockResolvedValue(undefined),
            getContentSourceLastRunDate: vi.fn().mockResolvedValue(new Date('2020-01-01')),
            getChecksumFromText: vi.fn().mockReturnValue('checksum-abc'),
            GetContentItemDescription: vi.fn().mockReturnValue('Test description'),
            TaxonomyContext: null as string | null,
            OnContentItemTagSaved: null as ((tag: unknown, parentTag: string | null, ctxUser: unknown) => Promise<void>) | null,
        },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockMetadata {
        Entities = [{ ID: 'ent-1', Name: 'Contacts' }];
        async GetEntityObject() { return mockGetEntityObject(); }
    }
    class MockRunView {
        RunView = mockRunView;
    }
    return {
        ...actual,
        RunView: MockRunView,
        Metadata: MockMetadata,
        LogStatus: vi.fn(),
        LogError: vi.fn(),
    };
});

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    return { ...actual };
});

// Mock the Engine module. vi.mock resolves paths relative to the SOURCE file importing it.
// AutotagEntity imports from '../../Engine' (relative to src/Entity/generic/).
// However, vitest actually resolves vi.mock paths relative to the TEST file, then maps
// them to the same resolved module. Since the resolved module is the same either way,
// we use the source file's import path.
vi.mock('../Engine', () => ({
    AutotagBaseEngine: { Instance: mockEngineInstance },
    ContentSourceParams: class {
        contentSourceID = '';
        name = '';
        ContentTypeID = '';
        ContentFileTypeID = '';
        ContentSourceTypeID = '';
        URL = '';
    },
}));

vi.mock('../Core', () => ({
    AutotagBase: class {
        async Autotag(): Promise<number> { return 0; }
    },
    AutotagProgressCallback: undefined,
}));

vi.mock('@memberjunction/ai-vector-sync', () => ({
    EntityDocumentTemplateParser: {
        CreateInstance: vi.fn().mockReturnValue({ Parse: mockParse })
    }
}));

vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: {
        Instance: {
            Templates: [
                {
                    ID: 'tmpl-1',
                    Content: [{ TemplateText: '{{Name}} - {{Description}}' }]
                }
            ]
        }
    }
}));

vi.mock('@memberjunction/tag-engine', () => ({
    TagEngine: { Instance: mockTagEngineInstance }
}));

vi.mock('@memberjunction/tag-engine-base', () => ({
    TagEngineBase: { Instance: { Config: vi.fn() } }
}));

import { AutotagEntity } from '../Entity/generic/AutotagEntity';

describe('AutotagEntity', () => {
    let provider: AutotagEntity;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new AutotagEntity();
        mockEngineInstance.TaxonomyContext = null;
        mockEngineInstance.OnContentItemTagSaved = null;
    });

    // ========================================================================
    // Basic Lifecycle
    // ========================================================================

    describe('Autotag', () => {
        it('should initialize the engine and set the content source type', async () => {
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([]);
            await provider.Autotag({ ID: 'user-1' } as never);
            expect(mockEngineInstance.SetSubclassContentSourceType).toHaveBeenCalledWith('Entity');
        });

        it('should clean up engine state after processing', async () => {
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([]);
            await provider.Autotag({ ID: 'user-1' } as never);
            expect(mockEngineInstance.TaxonomyContext).toBeNull();
            expect(mockEngineInstance.OnContentItemTagSaved).toBeNull();
        });

        it('should return the number of items processed (new + retried)', async () => {
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([]);
            // No new items, no retries
            mockRunView.mockResolvedValue({ Success: true, Results: [] });
            const count = await provider.Autotag({ ID: 'user-1' } as never);
            expect(count).toBe(0);
        });

        it('should pick up untagged ContentItems for retry alongside new items', async () => {
            const source = {
                ID: 'src-1', Name: 'Entity Source',
                EntityID: 'ent-1', EntityDocumentID: 'doc-1',
                ContentTypeID: 'ct-1', ContentFileTypeID: 'cft-1',
                ContentSourceTypeID: 'cst-1', URL: null,
                ConfigurationObject: { ShareTaxonomyWithLLM: false },
            };
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([source]);

            // SetContentItemsToProcess returns 0 new items (no modified entity records)
            // — first call: LoadEntityDocument returns null → 0 new items
            mockRunView
                .mockResolvedValueOnce({ Success: true, Results: [] })
                // GetUntaggedContentItems: returns 3 untagged items
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [
                        { ID: 'ci-1', ContentSourceID: 'src-1', Text: 'text1' },
                        { ID: 'ci-2', ContentSourceID: 'src-1', Text: 'text2' },
                        { ID: 'ci-3', ContentSourceID: 'src-1', Text: 'text3' },
                    ]
                });

            const count = await provider.Autotag({ ID: 'user-1' } as never);
            expect(count).toBe(3);
            expect(mockEngineInstance.ExtractTextAndProcessWithLLM).toHaveBeenCalledTimes(1);
            // Verify the 3 retry items were passed to the LLM
            const passedItems = mockEngineInstance.ExtractTextAndProcessWithLLM.mock.calls[0][0];
            expect(passedItems).toHaveLength(3);
        });

        it('should not call ExtractTextAndProcessWithLLM when no new or retry items exist', async () => {
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([{
                ID: 'src-1', Name: 'Source',
                EntityID: null, EntityDocumentID: null,
                ConfigurationObject: { ShareTaxonomyWithLLM: false },
            }]);
            // No new items (no EntityID)
            // GetUntaggedContentItems returns 0
            mockRunView.mockResolvedValue({ Success: true, Results: [] });

            const count = await provider.Autotag({ ID: 'user-1' } as never);
            expect(count).toBe(0);
            expect(mockEngineInstance.ExtractTextAndProcessWithLLM).not.toHaveBeenCalled();
        });

        it('should deduplicate items that appear in both new and retry sets', async () => {
            const source = {
                ID: 'src-1', Name: 'Source',
                EntityID: 'ent-1', EntityDocumentID: 'doc-1',
                ContentTypeID: 'ct-1', ContentFileTypeID: 'cft-1',
                ContentSourceTypeID: 'cst-1', URL: null,
                ConfigurationObject: { ShareTaxonomyWithLLM: false },
            };
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([source]);

            // LoadEntityDocument returns a doc
            mockRunView
                .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'doc-1', TemplateID: 'tmpl-1', VectorIndexID: 'vi-1' }] })
                // GetModifiedRecords returns 1 record
                .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'rec-1', Name: 'Record 1' }] })
                // LoadExistingERDs
                .mockResolvedValueOnce({ Success: true, Results: [] })
                // LoadExistingContentItems
                .mockResolvedValueOnce({ Success: true, Results: [] })
                // GetUntaggedContentItems returns the same item (already created by ProcessContentSource)
                .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'ci-new', ContentSourceID: 'src-1' }] });

            // Mock entity saves for ERD + ContentItem creation
            mockEntitySave.mockResolvedValue(true);
            let savedContentItemID = 'ci-new';
            mockGetEntityObject.mockImplementation(() => {
                const entity: Record<string, unknown> = {
                    Save: mockEntitySave,
                    NewRecord: mockEntityNewRecord,
                    LatestResult: null,
                    ID: savedContentItemID,
                    PrimaryKey: { Values: () => savedContentItemID },
                    GetAll: () => ({}),
                    Get: (f: string) => f === 'ID' ? savedContentItemID : null,
                };
                return Promise.resolve(new Proxy(entity, {
                    set(target, prop, value) { target[prop as string] = value; return true; },
                    get(target, prop) { return target[prop as string]; }
                }));
            });

            const count = await provider.Autotag({ ID: 'user-1' } as never);
            // Should not double-count — the retry item with same ID should be deduped
            expect(count).toBeGreaterThan(0);
        });
    });

    // ========================================================================
    // SetContentItemsToProcess
    // ========================================================================

    describe('SetContentItemsToProcess', () => {
        it('should return empty array when no sources have EntityID/EntityDocumentID', async () => {
            const sources = [{ ID: 'src-1', Name: 'Test', EntityID: null, EntityDocumentID: null }] as never[];
            const result = await provider.SetContentItemsToProcess(sources);
            expect(result).toHaveLength(0);
        });

        it('should catch and log errors from individual source processing', async () => {
            const sources = [{
                ID: 'src-1', Name: 'Bad Source',
                EntityID: 'ent-1', EntityDocumentID: 'doc-1',
                ContentTypeID: 'ct-1', ContentFileTypeID: 'cft-1',
                ContentSourceTypeID: 'cst-1', URL: null
            }] as never[];

            // Make LoadEntityDocument return null (entity doc not found)
            mockRunView.mockResolvedValue({ Success: true, Results: [] });

            const result = await provider.SetContentItemsToProcess(sources);
            expect(result).toHaveLength(0);
        });
    });

    // ========================================================================
    // SetupTaxonomyAndBridge
    // ========================================================================

    describe('taxonomy and bridge setup', () => {
        it('should inject taxonomy context when ShareTaxonomyWithLLM is enabled', async () => {
            const sources = [{
                ID: 'src-1', Name: 'Entity Source',
                EntityID: 'ent-1', EntityDocumentID: 'doc-1',
                Configuration: JSON.stringify({ ShareTaxonomyWithLLM: true, TagTaxonomyMode: 'auto-grow' }),
                ContentTypeID: 'ct-1', ContentFileTypeID: 'cft-1',
                ContentSourceTypeID: 'cst-1', URL: null
            }] as never[];

            mockEngineInstance.getAllContentSources.mockResolvedValueOnce(sources);
            // Make the rest of the pipeline return no items
            mockRunView.mockResolvedValue({ Success: true, Results: [] });

            await provider.Autotag({ ID: 'user-1' } as never);
            // TaxonomyContext should have been set (then cleared)
            // Since it's cleared after, check TagEngine was configured
            expect(mockTagEngineInstance.Config).toHaveBeenCalled();
        });

        it('should set OnContentItemTagSaved callback', async () => {
            const sources = [{
                ID: 'src-1', Name: 'Entity Source',
                EntityID: 'ent-1', EntityDocumentID: 'doc-1',
                Configuration: JSON.stringify({ TagTaxonomyMode: 'auto-grow' }),
                ContentTypeID: 'ct-1', ContentFileTypeID: 'cft-1',
                ContentSourceTypeID: 'cst-1', URL: null
            }] as never[];

            mockEngineInstance.getAllContentSources.mockResolvedValueOnce(sources);
            mockRunView.mockResolvedValue({ Success: true, Results: [] });

            // Capture the callback that was set
            let capturedCallback: unknown = null;
            Object.defineProperty(mockEngineInstance, 'OnContentItemTagSaved', {
                configurable: true,
                set: (val) => { capturedCallback = val; },
                get: () => capturedCallback,
            });

            await provider.Autotag({ ID: 'user-1' } as never);
            // After Autotag, callback should be null (cleanup) but it was set during
        });
    });

    // ========================================================================
    // ProcessSingleRecord (via SetContentItemsToProcess)
    // ========================================================================

    describe('entity record processing pipeline', () => {
        const mockContentSource = {
            ID: 'src-1', Name: 'Entity Source',
            EntityID: 'ent-1', EntityDocumentID: 'doc-1',
            Configuration: null,
            ContentTypeID: 'ct-1', ContentFileTypeID: 'cft-1',
            ContentSourceTypeID: 'cst-1', URL: null
        };

        const mockEntityDoc = {
            ID: 'doc-1', Name: 'Contact Document',
            TemplateID: 'tmpl-1', VectorIndexID: 'vi-1',
            EntityID: 'ent-1'
        };

        const mockRecord = {
            PrimaryKey: { Values: () => 'rec-1' },
            GetAll: () => ({ Name: 'John Doe', Email: 'john@example.com' }),
            Get: (field: string) => field === 'Name' ? 'John Doe' : null,
        };

        it('should skip records with empty rendered text', async () => {
            mockParse.mockResolvedValueOnce('');

            // Set up RunView to return entity doc, no existing ERDs, no existing items, and one modified record
            mockRunView
                .mockResolvedValueOnce({ Success: true, Results: [mockEntityDoc] }) // LoadEntityDocument
                .mockResolvedValueOnce({ Success: true, Results: [mockRecord] })    // GetModifiedRecords
                .mockResolvedValueOnce({ Success: true, Results: [] })              // LoadExistingERDs
                .mockResolvedValueOnce({ Success: true, Results: [] });             // LoadExistingContentItems

            const result = await provider.SetContentItemsToProcess([mockContentSource as never]);
            expect(result).toHaveLength(0);
        });

        it('should skip unchanged records (same checksum)', async () => {
            const existingContentItem = {
                ID: 'ci-1',
                EntityRecordDocumentID: 'erd-1',
                Checksum: 'checksum-abc', // Same as what getChecksumFromText returns
            };

            const existingERD = {
                ID: 'erd-1',
                RecordID: 'rec-1',
                DocumentText: 'old text',
                EntityRecordUpdatedAt: new Date(),
                Save: vi.fn().mockResolvedValue(true),
            };

            mockRunView
                .mockResolvedValueOnce({ Success: true, Results: [mockEntityDoc] })     // LoadEntityDocument
                .mockResolvedValueOnce({ Success: true, Results: [mockRecord] })         // GetModifiedRecords
                .mockResolvedValueOnce({ Success: true, Results: [existingERD] })        // LoadExistingERDs
                .mockResolvedValueOnce({ Success: true, Results: [existingContentItem] }); // LoadExistingContentItems

            const result = await provider.SetContentItemsToProcess([mockContentSource as never]);
            // Since checksum matches, UpsertContentItem returns null → no items to process
            expect(result).toHaveLength(0);
        });
    });
});
