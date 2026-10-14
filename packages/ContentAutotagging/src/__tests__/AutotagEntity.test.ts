import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Hoisted mocks — referenced in vi.mock factories (which are hoisted above imports)
// ============================================================================

const {
    mockRunView, mockRunViews, mockEntitySave, mockEntityNewRecord, mockGetEntityObject,
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
        mockRunViews: vi.fn(),
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
        RunViews = mockRunViews;
        static FromMetadataProvider(): MockRunView { return new MockRunView(); }
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

vi.mock('@memberjunction/entity-documents', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/entity-documents')>();
    return {
        EntityDocumentTemplateParserBase: actual.EntityDocumentTemplateParserBase,
        EntityDocumentTemplateParser: {
            CreateInstance: vi.fn().mockImplementation(() => ({ Parse: mockParse }))
        }
    };
});

vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Templates: [
                {
                    ID: 'tmpl-1',
                    Content: [{ TemplateText: '{{Name}} - {{Description}}' }],
                    GetHighestPriorityContent() { return this.Content[0]; }
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
import { LogError, UserInfo, type RunViewParams } from '@memberjunction/core';
import { EntityDocumentTemplateParserBase } from '@memberjunction/entity-documents';

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
                // LoadEscapedDocumentIDs
                .mockResolvedValueOnce({ Success: true, Results: [] })
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

        it('stores a composite-keyed record\'s whole key as the ERD RecordID (never just the first column)', async () => {
            // Configured (non-MJ) entity keyed by (OrderID, LineNo) — there is no ID column at all.
            const compositeEntity = {
                ID: 'ent-1', Name: 'Order Lines',
                PrimaryKeys: [{ Name: 'OrderID' }, { Name: 'LineNo' }],
                Fields: [{ Name: 'OrderID', IsNameField: false }, { Name: 'LineNo', IsNameField: false }, { Name: 'Product', IsNameField: true, Sequence: 1 }],
                NameField: undefined,
            };
            Object.defineProperty(provider, 'ProviderToUse', {
                configurable: true,
                get: () => ({ EntityByID: () => compositeEntity, GetEntityObject: mockGetEntityObject }),
            });
            // Autotag() normally wires the engine before SetContentItemsToProcess runs; seed it directly here.
            (provider as unknown as { engine: typeof mockEngineInstance }).engine = mockEngineInstance;
            const row = { OrderID: '11055', LineNo: 3, Product: 'Widget' };
            // Earlier pipeline tests queue *Once values they never consume; start from a clean queue.
            mockRunView.mockReset();
            mockParse.mockReset();
            mockParse.mockResolvedValue('Rendered template text for the record.');
            mockRunView
                .mockResolvedValueOnce({ Success: true, Results: [mockEntityDoc] }) // LoadEntityDocument
                .mockResolvedValueOnce({ Success: true, Results: [row] })           // GetModifiedRecords
                .mockResolvedValueOnce({ Success: true, Results: [] })              // LoadEscapedDocumentIDs
                .mockResolvedValueOnce({ Success: true, Results: [] })              // LoadExistingERDs
                .mockResolvedValueOnce({ Success: true, Results: [] });             // LoadExistingContentItems

            const result = await provider.SetContentItemsToProcess([mockContentSource as never]);

            expect(result).toHaveLength(1);
            // First GetEntityObject call in the pipeline creates the EntityRecordDocument.
            const erd = await mockGetEntityObject.mock.results[0].value as { RecordID?: string; EntityID?: string };
            expect(erd.EntityID).toBe('ent-1');
            expect(erd.RecordID).toBe('OrderID|11055||LineNo|3');
            expect(result[0].Name).toBe('Widget');
        });
    });

    // ========================================================================
    // Entity Record Documents reads skip the server RunView cache
    // ========================================================================

    // On the server a cached RunView widens Fields to every column (DocumentText, VectorJSON) so its
    // slot can serve any field set. These reads are single-use or find-or-create, so they bypass it.
    describe('Entity Record Documents reads', () => {
        it('loads existing ERDs for the upsert straight from the database', async () => {
            mockRunView.mockResolvedValueOnce({ Success: true, Results: [{ RecordID: 'rec-1' }] });

            const map = await provider['loadExistingERDs']('doc-1', 'ent-1');

            expect(map.get('rec-1')).toEqual({ RecordID: 'rec-1' });
            const params = mockRunView.mock.calls[0][0];
            expect(params.EntityName).toBe('MJ: Entity Record Documents');
            expect(params.ExtraFilter).toBe("EntityDocumentID='doc-1' AND EntityID='ent-1'");
            expect(params.ResultType).toBe('entity_object');
            expect(params.BypassCache).toBe(true);
        });

        it('looks up the source record of a bridged tag by ERD ID with only the fields it reads', async () => {
            mockRunView
                .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'ci-1', ContentSourceID: 'src-1', EntityRecordDocumentID: 'erd-1' }] })
                .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'erd-1', EntityID: 'ent-1', RecordID: 'rec-1' }] });
            const contentItemTag = { ItemID: 'ci-1', Tag: 'Technology', Weight: 0.9, TagID: null, Save: vi.fn().mockResolvedValue(true) };

            await provider['bridgeContentItemTagToTaxonomy'](contentItemTag as never, null, { ID: 'user-1' } as never);

            const params = mockRunView.mock.calls[1][0];
            expect(params.EntityName).toBe('MJ: Entity Record Documents');
            expect(params.ExtraFilter).toBe("ID='erd-1'");
            expect(params.Fields).toEqual(['ID', 'EntityID', 'RecordID']);
            expect(params.BypassCache).toBe(true);
            expect(mockTagEngineInstance.CreateTaggedItem).toHaveBeenCalledWith('tag-resolved', 'ent-1', 'rec-1', expect.anything(), expect.anything());
        });
    });

    // ========================================================================
    // Documents stored by an escaping render are re-rendered raw
    // ========================================================================

    describe('re-rendering documents stored escaped', () => {
        const source = {
            ID: 'src-1', Name: 'People Source',
            EntityID: 'ent-1', EntityDocumentID: 'doc-1',
            ContentTypeID: 'ct-1', ContentFileTypeID: 'cft-1',
            ContentSourceTypeID: 'cst-1', URL: null,
            ConfigurationObject: { ShareTaxonomyWithLLM: false },
        };
        const people = {
            ID: 'ent-1', Name: 'People',
            PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' },
            Fields: [{ Name: 'ID', IsNameField: false }, { Name: 'Title', IsNameField: true, Sequence: 1 }],
            NameField: undefined,
        };

        /** What each view returns in one test: the rows a query for the given purpose reads. */
        interface ViewRows {
            Modified: Record<string, unknown>[];
            Escaped: { EntityRecordDocumentID: string }[];
            ERDs: Record<string, unknown>[];
            ContentItems: Record<string, unknown>[];
            /** Views whose read fails: 'Modified', 'ERDs', 'ContentItems', 'Untagged' or 'Item' (one content item by ID). */
            Failing?: string[];
        }

        /** A view's filter as text; these views are all filtered by plain strings. */
        function filterText(params: RunViewParams): string {
            return typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
        }

        /** Routes every view the provider runs to its rows; the untagged-items retry query finds none. */
        function routeViews(rows: ViewRows): void {
            const failing = new Set(rows.Failing || []);
            const failed = { Success: false, Results: [], ErrorMessage: 'Connection lost' };
            mockRunView.mockImplementation(async (params: RunViewParams) => {
                const filter = filterText(params);
                switch (params.EntityName) {
                    case 'MJ: Entity Documents':
                        return { Success: true, Results: [{ ID: 'doc-1', Name: 'People Document', TemplateID: 'tmpl-1', VectorIndexID: 'vi-1', EntityID: 'ent-1' }] };
                    case 'People':
                        return failing.has('Modified') ? failed : { Success: true, Results: rows.Modified };
                    case 'MJ: Entity Record Documents':
                        return failing.has('ERDs') ? failed : { Success: true, Results: rows.ERDs };
                    case 'MJ: Content Items':
                        if (filter.includes('LIKE')) return { Success: true, Results: rows.Escaped };
                        if (filter.includes('NOT EXISTS')) return failing.has('Untagged') ? failed : { Success: true, Results: [] };
                        if (filter.startsWith('ID=')) return failing.has('Item') ? failed : { Success: true, Results: [] };
                        return failing.has('ContentItems') ? failed : { Success: true, Results: rows.ContentItems };
                    default:
                        return { Success: false, Results: [], ErrorMessage: `unexpected view ${params.EntityName}` };
                }
            });
        }

        /** The query that finds content items whose text an escaping render wrote. */
        function escapedQuery(): RunViewParams | undefined {
            return mockRunView.mock.calls
                .map((call) => call[0])
                .find((params: RunViewParams) => params.EntityName === 'MJ: Content Items' && filterText(params).includes('LIKE'));
        }

        /** A content source as the provider loads it to record its render version: Load copies the source's configuration. */
        class SourceRecord {
            ConfigurationObject: Record<string, unknown> | null = null;
            LatestResult = null;
            Save = vi.fn(async () => true);
            async Load(id: string): Promise<boolean> {
                this.ConfigurationObject = id === source.ID ? { ...source.ConfigurationObject } : null;
                return id === source.ID;
            }
        }
        /** Every content source the provider loaded, in order. */
        let loadedSources: SourceRecord[] = [];

        /** The provider's entity factory: content sources are SourceRecords, every other entity the shared double. */
        async function getEntityObject(entityName: string): Promise<unknown> {
            if (entityName === 'MJ: Content Sources') {
                const record = new SourceRecord();
                loadedSources.push(record);
                return record;
            }
            return mockGetEntityObject();
        }

        beforeEach(() => {
            loadedSources = [];
            mockRunView.mockReset();
            mockRunViews.mockReset();
            mockParse.mockReset();
            mockEntitySave.mockReset();
            mockEntitySave.mockResolvedValue(true);
            mockParse.mockImplementation(async (_template: string, _entityID: string, record: Record<string, unknown>) => `Title: ${String(record.Title)}`);
            Object.defineProperty(provider, 'ProviderToUse', {
                configurable: true,
                get: () => ({ EntityByID: () => people, GetEntityObject: getEntityObject }),
            });
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([source]);
        });

        /** The source with its stored text already healed, so only the records modified since its last run are processed. */
        function healedSource() {
            return {
                ...source,
                ConfigurationObject: { SourceSpecificConfiguration: { [AutotagEntity.RENDER_VERSION_KEY]: AutotagEntity.DOCUMENT_RENDER_VERSION } },
            };
        }

        it('skips a record whose rendered text is empty: no document, no content item', async () => {
            mockEngineInstance.getAllContentSources.mockReset();
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([healedSource()]);
            routeViews({ Modified: [{ ID: 'rec-1', Title: '' }], Escaped: [], ERDs: [], ContentItems: [] });
            mockParse.mockResolvedValue('   ');
            mockGetEntityObject.mockClear();

            const count = await provider.Autotag(new UserInfo());

            expect(mockParse).toHaveBeenCalledTimes(1);
            expect(count).toBe(0);
            expect(mockGetEntityObject).not.toHaveBeenCalled();
            expect(mockEngineInstance.ExtractTextAndProcessWithLLM).not.toHaveBeenCalled();
        });

        it('skips a modified record whose text has the stored checksum: its content item is not saved or reprocessed', async () => {
            mockEngineInstance.getAllContentSources.mockReset();
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([healedSource()]);
            const contentItemSave = vi.fn(async () => true);
            const contentItem = { ID: 'ci-5', EntityRecordDocumentID: 'erd-5', Text: 'Title: Same', Checksum: 'checksum-abc', Save: contentItemSave };
            routeViews({
                Modified: [{ ID: 'rec-5', Title: 'Same' }],
                Escaped: [],
                ERDs: [{ ID: 'erd-5', RecordID: 'rec-5', DocumentText: 'Title: Same', Save: mockEntitySave }],
                ContentItems: [contentItem],
            });

            const count = await provider.Autotag(new UserInfo());

            expect(mockParse).toHaveBeenCalledTimes(1);
            expect(count).toBe(0);
            expect(contentItemSave).not.toHaveBeenCalled();
            expect(mockEngineInstance.ExtractTextAndProcessWithLLM).not.toHaveBeenCalled();
        });

        it('writes nothing and records no render version when the existing documents cannot be read', async () => {
            routeViews({ Modified: [{ ID: 'rec-1', Title: 'R&D' }], Escaped: [], ERDs: [], ContentItems: [], Failing: ['ERDs'] });

            const count = await provider.Autotag(new UserInfo());

            expect(count).toBe(0);
            expect(mockParse).not.toHaveBeenCalled();
            expect(mockGetEntityObject).not.toHaveBeenCalled();
            expect(loadedSources).toHaveLength(0);
        });

        it('writes nothing and records no render version when the existing content items cannot be read', async () => {
            routeViews({ Modified: [{ ID: 'rec-1', Title: 'R&D' }], Escaped: [], ERDs: [], ContentItems: [], Failing: ['ContentItems'] });

            const count = await provider.Autotag(new UserInfo());

            expect(count).toBe(0);
            expect(mockParse).not.toHaveBeenCalled();
            expect(mockGetEntityObject).not.toHaveBeenCalled();
            expect(loadedSources).toHaveLength(0);
        });

        it('processes nothing and records no render version when the modified records cannot be read', async () => {
            routeViews({ Modified: [], Escaped: [], ERDs: [], ContentItems: [], Failing: ['Modified'] });

            await provider.Autotag(new UserInfo());

            expect(mockParse).not.toHaveBeenCalled();
            expect(loadedSources).toHaveLength(0);
        });

        it('updates the document of a record whose stored id differs only in case, rather than adding one', async () => {
            mockEngineInstance.getAllContentSources.mockReset();
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([healedSource()]);
            const erdSave = vi.fn(async () => true);
            routeViews({
                Modified: [{ ID: 'a1b2c3d4-0000-4000-8000-000000000009', Title: 'Same' }],
                Escaped: [],
                ERDs: [{ ID: 'erd-9', RecordID: 'A1B2C3D4-0000-4000-8000-000000000009', DocumentText: 'Title: Old', Save: erdSave }],
                ContentItems: [],
            });
            mockGetEntityObject.mockClear();

            await provider.Autotag(new UserInfo());

            expect(erdSave).toHaveBeenCalledTimes(1);
            expect(mockGetEntityObject).toHaveBeenCalledTimes(1); // the new content item only, no second document
        });

        it('reports a failed read of the untagged items instead of taking it as "none to retry"', async () => {
            routeViews({ Modified: [], Escaped: [], ERDs: [], ContentItems: [], Failing: ['Untagged'] });

            await provider.Autotag(new UserInfo());

            expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining('untagged content items'));
        });

        it('reports a failed content-item read when linking a tag, and links nothing', async () => {
            routeViews({ Modified: [], Escaped: [], ERDs: [], ContentItems: [], Failing: ['Item'] });
            // a holder, not a local: the callback assigns it, which local-variable narrowing does not see
            const captured: { Bridge: typeof mockEngineInstance.OnContentItemTagSaved } = { Bridge: null };
            mockEngineInstance.ExtractTextAndProcessWithLLM.mockImplementationOnce(async () => {
                captured.Bridge = mockEngineInstance.OnContentItemTagSaved;
            });
            mockEngineInstance.getAllContentSources.mockReset();
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([healedSource()]);
            routeViews({ Modified: [{ ID: 'rec-1', Title: 'R&D' }], Escaped: [], ERDs: [], ContentItems: [], Failing: ['Item'] });

            await provider.Autotag(new UserInfo());
            expect(captured.Bridge).not.toBeNull();
            await captured.Bridge?.({ ItemID: 'item-1', Tag: 'AI', Weight: 0.9 }, null, new UserInfo());

            expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining('could not read content item item-1'));
            expect(mockTagEngineInstance.CreateTaggedItem).not.toHaveBeenCalled();
        });

        it('records no render version when a record that is both modified and stored escaped fails, and looks again next run', async () => {
            const views = {
                Modified: [{ ID: 'rec-2', Title: 'R&D' }],
                Escaped: [{ EntityRecordDocumentID: 'erd-2' }],
                ERDs: [{ ID: 'erd-2', RecordID: 'rec-2', DocumentText: 'Title: R&amp;D', Save: mockEntitySave }],
                ContentItems: [],
            };
            routeViews(views);
            mockParse.mockRejectedValueOnce(new Error('could not read the Activities of People rec-2'));

            await provider.Autotag(new UserInfo());

            expect(loadedSources).toHaveLength(0);

            mockRunView.mockClear();
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([source]);
            routeViews(views);
            await provider.Autotag(new UserInfo());

            expect(escapedQuery()).toBeDefined();
        });

        it('looks for escaped text once: a successful pass records the render version, and the next run does not look', async () => {
            const contentItem = { ID: 'ci-2', EntityRecordDocumentID: 'erd-2', Text: 'Title: R&amp;D', Checksum: 'checksum-old', Save: mockEntitySave };
            routeViews({
                Modified: [],
                Escaped: [{ EntityRecordDocumentID: 'erd-2' }],
                ERDs: [{ ID: 'erd-2', RecordID: 'rec-2', DocumentText: 'Title: R&amp;D', Save: mockEntitySave }],
                ContentItems: [contentItem],
            });
            mockRunViews.mockResolvedValue([{ Success: true, Results: [{ ID: 'rec-2', Title: 'R&D' }] }]);

            await provider.Autotag(new UserInfo());

            expect(escapedQuery()).toBeDefined();
            expect(loadedSources).toHaveLength(1);
            expect(loadedSources[0].Save).toHaveBeenCalledTimes(1);
            const healedConfiguration = loadedSources[0].ConfigurationObject;
            expect(healedConfiguration).toEqual({
                ShareTaxonomyWithLLM: false, // the source's other settings are kept
                SourceSpecificConfiguration: { [AutotagEntity.RENDER_VERSION_KEY]: AutotagEntity.DOCUMENT_RENDER_VERSION },
            });

            mockRunView.mockClear();
            mockEngineInstance.getAllContentSources.mockResolvedValueOnce([{ ...source, ConfigurationObject: healedConfiguration }]);
            await provider.Autotag(new UserInfo());

            expect(escapedQuery()).toBeUndefined();
            expect(loadedSources).toHaveLength(1);
        });

        it('records the render version of a source with nothing to heal', async () => {
            routeViews({ Modified: [], Escaped: [], ERDs: [], ContentItems: [] });

            await provider.Autotag(new UserInfo());

            expect(loadedSources).toHaveLength(1);
            expect(loadedSources[0].Save).toHaveBeenCalledTimes(1);
        });

        it('leaves the heal pending when a re-render fails, so the next run looks again', async () => {
            routeViews({
                Modified: [],
                Escaped: [{ EntityRecordDocumentID: 'erd-2' }],
                ERDs: [{ ID: 'erd-2', RecordID: 'rec-2', DocumentText: 'Title: R&amp;D', Save: mockEntitySave }],
                ContentItems: [],
            });
            mockRunViews.mockResolvedValue([{ Success: true, Results: [{ ID: 'rec-2', Title: 'R&D' }] }]);
            mockParse.mockRejectedValue(new Error('template failed'));

            await provider.Autotag(new UserInfo());

            expect(loadedSources).toHaveLength(0);
        });

        it('finds escaped content items by every entity an escaping render writes, in this source only', async () => {
            routeViews({ Modified: [], Escaped: [], ERDs: [], ContentItems: [] });

            await provider.Autotag(new UserInfo());

            const query = escapedQuery();
            const filter = query ? filterText(query) : '';
            expect(filter).toContain("ContentSourceID='src-1'");
            for (const entity of EntityDocumentTemplateParserBase.ESCAPED_ENTITIES) {
                expect(filter).toContain(`Text LIKE '%${entity}%'`);
            }
        });

        it('re-renders an unmodified record whose stored text was escaped, and reprocesses it', async () => {
            const contentItem = { ID: 'ci-2', EntityRecordDocumentID: 'erd-2', Text: 'Title: R&amp;D', Checksum: 'checksum-old', Save: mockEntitySave };
            routeViews({
                Modified: [],
                Escaped: [{ EntityRecordDocumentID: 'erd-2' }],
                ERDs: [{ ID: 'erd-2', RecordID: 'rec-2', DocumentText: 'Title: R&amp;D', Save: mockEntitySave }],
                ContentItems: [contentItem],
            });
            mockRunViews.mockResolvedValue([{ Success: true, Results: [{ ID: 'rec-2', Title: 'R&D' }] }]);

            const count = await provider.Autotag(new UserInfo());

            expect(count).toBe(1);
            expect(mockRunViews.mock.calls[0][0]).toEqual([expect.objectContaining({ EntityName: 'People', ExtraFilter: "(ID='rec-2')" })]);
            expect(contentItem.Text).toBe('Title: R&D');
            expect(mockEngineInstance.ExtractTextAndProcessWithLLM.mock.calls[0][0]).toEqual([contentItem]);
        });

        it("renders with a parser bound to the provider's own metadata provider", async () => {
            routeViews({ Modified: [{ ID: 'rec-1', Title: 'R&D' }], Escaped: [], ERDs: [], ContentItems: [] });

            await provider.Autotag(new UserInfo());

            expect(mockParse).toHaveBeenCalledTimes(1);
            expect(mockParse.mock.contexts[0]).toEqual(expect.objectContaining({ ProviderOverride: expect.objectContaining({ EntityByID: expect.any(Function) }) }));
        });

        it('writes nothing for a re-rendered record whose data holds the entity literally', async () => {
            const contentItem = { ID: 'ci-3', EntityRecordDocumentID: 'erd-3', Text: 'Title: Fish &amp; Chips', Checksum: 'checksum-abc', Save: mockEntitySave };
            routeViews({
                Modified: [],
                Escaped: [{ EntityRecordDocumentID: 'erd-3' }],
                ERDs: [{ ID: 'erd-3', RecordID: 'rec-3', DocumentText: 'Title: Fish &amp; Chips', Save: mockEntitySave }],
                ContentItems: [contentItem],
            });
            mockRunViews.mockResolvedValue([{ Success: true, Results: [{ ID: 'rec-3', Title: 'Fish &amp; Chips' }] }]);

            const count = await provider.Autotag(new UserInfo());

            expect(mockParse).toHaveBeenCalledTimes(1);
            expect(count).toBe(0);
            expect(mockEntitySave).not.toHaveBeenCalled();
            expect(mockEngineInstance.ExtractTextAndProcessWithLLM).not.toHaveBeenCalled();
        });

        it('does not load or render a modified record a second time', async () => {
            routeViews({
                Modified: [{ ID: 'rec-2', Title: 'R&D' }],
                Escaped: [{ EntityRecordDocumentID: 'erd-2' }],
                ERDs: [{ ID: 'erd-2', RecordID: 'rec-2', DocumentText: 'Title: R&amp;D', Save: mockEntitySave }],
                ContentItems: [],
            });

            await provider.Autotag(new UserInfo());

            expect(mockRunViews).not.toHaveBeenCalled();
            expect(mockParse).toHaveBeenCalledTimes(1);
        });

        it('still refreshes the document of a modified record whose text is unchanged', async () => {
            const contentItem = { ID: 'ci-4', EntityRecordDocumentID: 'erd-4', Text: 'Title: Same', Checksum: 'checksum-abc', Save: mockEntitySave };
            routeViews({
                Modified: [{ ID: 'rec-4', Title: 'Same' }],
                Escaped: [],
                ERDs: [{ ID: 'erd-4', RecordID: 'rec-4', DocumentText: 'Title: Same', Save: mockEntitySave }],
                ContentItems: [contentItem],
            });

            const count = await provider.Autotag(new UserInfo());

            expect(count).toBe(0);
            expect(mockEntitySave).toHaveBeenCalledTimes(1); // the document, not the unchanged content item
        });

        it('matches a modified record to its document whatever the case of its key', async () => {
            routeViews({
                Modified: [{ ID: 'a1b2c3d4-0000-4000-8000-000000000002', Title: 'R&D' }],
                Escaped: [{ EntityRecordDocumentID: 'erd-2' }],
                ERDs: [{ ID: 'erd-2', RecordID: 'A1B2C3D4-0000-4000-8000-000000000002', DocumentText: 'Title: R&amp;D', Save: mockEntitySave }],
                ContentItems: [],
            });

            await provider.Autotag(new UserInfo());

            expect(mockRunViews).not.toHaveBeenCalled();
            expect(mockParse).toHaveBeenCalledTimes(1);
        });

        it('loads the records to re-render in chunks of 500 keys', async () => {
            const ids = Array.from({ length: 501 }, (_, i) => i);
            routeViews({
                Modified: [],
                Escaped: ids.map((i) => ({ EntityRecordDocumentID: `erd-${i}` })),
                ERDs: ids.map((i) => ({ ID: `erd-${i}`, RecordID: `rec-${i}`, DocumentText: 'x &amp; y' })),
                ContentItems: [],
            });
            mockRunViews.mockResolvedValue([{ Success: true, Results: [] }, { Success: true, Results: [] }]);

            await provider.Autotag(new UserInfo());

            const views: RunViewParams[] = mockRunViews.mock.calls[0][0];
            expect(views).toHaveLength(2);
            expect(filterText(views[0]).split(' OR ')).toHaveLength(500);
            expect(views[1].ExtraFilter).toBe("(ID='rec-500')");
        });
    });
});
