import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BaseEntity, EntityInfo } from '@memberjunction/core';
import type { MJEntityDocumentEntity } from '@memberjunction/core-entities';

/**
 * The text duplicate detection embeds must be the text vector sync embedded. NO live DB, NO vector DB.
 *
 * Sync renders each record's template from the row RunView returns (`ResultType: 'simple'`) plus
 * the rows of every `Entity` template param (a person's Phones, Emails, Addresses...). Detection
 * used to render from `BaseEntity.GetAll()` alone, so those params rendered empty and dates came
 * through as `Date` objects: its query vector described a different document than the one stored,
 * and genuine duplicates that share contact data fell below the threshold.
 *
 * `@memberjunction/ai-vector-sync` supplies the real EntityDocumentTemplateDataBuilder, the one
 * sync itself renders with; only the syncer class is stubbed.
 */

// ─────────────────────────────────────────────
// Hoisted mocks
// ─────────────────────────────────────────────

const { mockRunViewFn, mockRenderTemplate, templateEngineState } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
    mockRenderTemplate: vi.fn(),
    templateEngineState: { Templates: [] as unknown[] },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        RegisterClass: () => () => { /* no-op */ },
        MJGlobal: { Instance: { ClassFactory: { CreateInstance: vi.fn() } } },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@memberjunction/ai-prompts', () => ({
    AIEmbeddingRunner: class {},
}));

vi.mock('@memberjunction/ai', () => ({
    BaseEmbeddings: vi.fn(),
    GetAIAPIKey: vi.fn().mockReturnValue('mock-api-key'),
}));

vi.mock('@memberjunction/ai-vectordb', () => ({
    VectorDBBase: vi.fn(),
    BaseResponse: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJDuplicateRunDetailEntity: vi.fn(),
    MJDuplicateRunDetailMatchEntity: vi.fn(),
    MJDuplicateRunEntity: vi.fn(),
    MJEntityDocumentEntity: vi.fn(),
    MJListDetailEntity: vi.fn(),
    MJListEntity: vi.fn(),
    RecordComparisonCompareOperation: class {},
    KnowledgeHubMetadataEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined) } },
}));

vi.mock('@memberjunction/ai-vectors', () => ({
    VectorBase: class VectorBase {
        _runView = { RunView: mockRunViewFn, RunViews: vi.fn() };
        _currentUser: Record<string, unknown> = { ID: 'user-1' };

        get RunView() { return this._runView; }
        get CurrentUser() { return this._currentUser; }
        set CurrentUser(user: unknown) { this._currentUser = user as Record<string, unknown>; }
        /** Mirrors the real VectorBase.BuildExtraFilter. */
        BuildExtraFilter(compositeKeys: { KeyValuePairs: { FieldName: string; Value: unknown }[] }[]): string {
            return compositeKeys.map((key) =>
                key.KeyValuePairs.map((kv) => `${kv.FieldName} = '${String(kv.Value).replace(/'/g, "''")}'`).join(' AND ')
            ).join('\n OR ');
        }
    },
}));

vi.mock('@memberjunction/ai-vector-sync', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-vector-sync')>();
    return {
        EntityDocumentTemplateDataBuilder: actual.EntityDocumentTemplateDataBuilder,
        EntityVectorSyncer: class {},
        VectorizeEntityParams: class {},
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Models: [], VectorDatabases: [] } },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIModelEntityExtended: vi.fn(),
}));

vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: {
        Instance: {
            Config: vi.fn(),
            SetupNunjucks: vi.fn(),
            get Templates() { return templateEngineState.Templates; },
            RenderTemplate: mockRenderTemplate,
        },
    },
}));

// ─────────────────────────────────────────────
// Import after mocks
// ─────────────────────────────────────────────

import { CompositeKey, UserInfo } from '@memberjunction/core';
import { EntityDocumentTemplateParser } from '@memberjunction/entity-documents';
import { DuplicateRecordDetector } from '../duplicateRecordDetector';

const INDIVIDUALS = {
    ID: 'individuals-id',
    Name: 'Individuals',
    PrimaryKeys: [{ Name: 'individual_id', NeedsQuotes: false }],
    FirstPrimaryKey: { Name: 'individual_id', NeedsQuotes: false },
    Fields: [],
} as unknown as EntityInfo;

/** The PLUS shape: the person's own fields, plus their phones as a related-entity param. */
const TEMPLATE = {
    ID: 'tpl-1',
    Name: 'Individual Duplicate',
    Content: [{ ID: 'content-1', TemplateText: '{{FirstName}} {{DOB}} {% for p in Phones %}{{p.Number}}{% endfor %}' }],
    Params: [
        { Name: 'Entity', Type: 'Record' },
        { Name: 'Phones', Type: 'Entity', Entity: 'Phones', LinkedParameterField: 'individual_id', ExtraFilter: null },
    ],
};

const ENTITY_DOCUMENT = { Name: 'Individuals Duplicate', TemplateID: 'tpl-1', EntityID: 'individuals-id' } as unknown as MJEntityDocumentEntity;

/** The row RunView returns for the record, as vector sync reads it: the date is the view's raw value. */
const SIMPLE_ROW = { individual_id: 42, FirstName: 'Nikita', DOB: '1990-01-02' };

/** A loaded (or unsaved) entity object; GetAll() is what detection used to render from. */
function fakeRecord(values: Record<string, unknown>, isSaved: boolean): BaseEntity {
    return {
        IsSaved: isSaved,
        EntityInfo: INDIVIDUALS,
        PrimaryKey: CompositeKey.FromKeyValuePair('individual_id', values.individual_id),
        GetAll: () => ({ ...values }),
    } as unknown as BaseEntity;
}

/** Exposes the protected seam under test. */
class TestableDetector extends DuplicateRecordDetector {
    public render(records: BaseEntity[]): Promise<string[]> {
        return this.GenerateTemplateTexts(
            EntityDocumentTemplateParser.CreateInstance(), ENTITY_DOCUMENT, records, { ID: 'user-1' } as unknown as UserInfo
        );
    }
}

/** The data object the template was rendered with, for the nth render call. */
function renderedData(call = 0): Record<string, unknown> {
    return mockRenderTemplate.mock.calls[call][2] as Record<string, unknown>;
}

function runViewCallsFor(entityName: string): Record<string, unknown>[] {
    return mockRunViewFn.mock.calls
        .map((c) => c[0] as Record<string, unknown>)
        .filter((p) => p.EntityName === entityName);
}

describe('DuplicateRecordDetector.GenerateTemplateTexts renders what vector sync rendered', () => {
    let detector: TestableDetector;

    beforeEach(() => {
        vi.clearAllMocks();
        templateEngineState.Templates = [TEMPLATE];
        mockRenderTemplate.mockResolvedValue({ Success: true, Output: 'rendered' });
        mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'Individuals') {
                return { Success: true, Results: [SIMPLE_ROW] };
            }
            if (params.EntityName === 'Phones') {
                return { Success: true, Results: [{ individual_id: 42, Number: '555-0100' }, { individual_id: 43, Number: '555-0199' }] };
            }
            return { Success: false, Results: [], ErrorMessage: `unexpected entity ${params.EntityName}` };
        });
        detector = new TestableDetector();
    });

    it('renders a related-entity param with the record\'s own related rows', async () => {
        await detector.render([fakeRecord({ ...SIMPLE_ROW, DOB: new Date('1990-01-02T00:00:00Z') }, true)]);

        expect(renderedData().Phones).toEqual([{ individual_id: 42, Number: '555-0100' }]);
        const phoneLoads = runViewCallsFor('Phones');
        expect(phoneLoads).toHaveLength(1);
        expect(phoneLoads[0].ExtraFilter).toBe('individual_id in (42)');
    });

    it('renders the record from the same simple row sync reads, not from BaseEntity.GetAll()', async () => {
        await detector.render([fakeRecord({ ...SIMPLE_ROW, DOB: new Date('1990-01-02T00:00:00Z') }, true)]);

        expect(renderedData().DOB).toBe('1990-01-02');
        const rowLoads = runViewCallsFor('Individuals');
        expect(rowLoads).toHaveLength(1);
        expect(rowLoads[0]).toMatchObject({ ExtraFilter: "individual_id = '42'", ResultType: 'simple', IgnoreMaxRows: true });
        expect(rowLoads[0].Fields).toBeUndefined();
    });

    it('renders an unsaved record from its own values, with empty related rows and no queries', async () => {
        // A new record can already hold a client-generated key; it still has no rows to load.
        await detector.render([fakeRecord({ individual_id: 7001, FirstName: 'New Person' }, false)]);

        expect(mockRunViewFn).not.toHaveBeenCalled();
        expect(renderedData().FirstName).toBe('New Person');
        expect(renderedData().Phones).toEqual([]);
    });

    it('fails rather than embed a query that cannot match the stored text when a related param will not load', async () => {
        mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => params.EntityName === 'Individuals'
            ? { Success: true, Results: [SIMPLE_ROW] }
            : { Success: false, Results: [], ErrorMessage: 'Phones is unavailable' });

        await expect(detector.render([fakeRecord(SIMPLE_ROW, true)])).rejects.toThrow(/Phones/);
        expect(mockRenderTemplate).not.toHaveBeenCalled();
    });

    it('renders with validation skipped and warnings suppressed, as sync does', async () => {
        await detector.render([fakeRecord(SIMPLE_ROW, true)]);

        expect(mockRenderTemplate.mock.calls[0][3]).toBe(true);
        expect(mockRenderTemplate.mock.calls[0][4]).toBe(true);
    });
});
