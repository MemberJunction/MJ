/**
 * Tests for the four rules the Vectors tab applies when it turns a model suggestion into
 * real metadata.
 *
 * The headline one: the dialog offers use cases — duplicate detection and search — and the
 * save path used to hardcode the `Record Duplicate` document type.
 * So choosing "search" silently produced a duplicate-detection document. A vector pool is
 * typed (Provider.SearchEntity reads Search-typed documents), so that is not a cosmetic
 * mislabel: the document is invisible to the feature that asked for it.
 *
 * The component-level block below is not a source-text grep. It builds the component with a
 * small in-memory metadata store and runs the real save path, so the assertions are about the
 * rows that actually get written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Angular and MJ mocks, so the component file can be imported without the runtime ──
// Follows the node-preset pattern already used by database-preview-pane.test.ts and
// ai-analytics-dashboard.test.ts in this package.

vi.mock('@angular/core', () => ({
    Component: () => (target: unknown) => target,
    Directive: () => (target: unknown) => target,
    Injectable: () => (target: unknown) => target,
    Input: () => () => {},
    Output: () => () => {},
    ViewChild: () => () => {},
    ElementRef: class {},
    ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
    ChangeDetectionStrategy: { OnPush: 1 },
    inject: () => ({ detectChanges() {}, markForCheck() {}, OpenNavItemByName: vi.fn() }),
}));

vi.mock('rxjs', () => ({
    Subject: class { next() {} complete() {} pipe() { return { subscribe: () => {} }; } },
}));
vi.mock('rxjs/operators', () => ({ takeUntil: () => (source: unknown) => source }));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) =>
        !!a && !!b && a.toLowerCase() === b.toLowerCase(),
    NormalizeUUID: (v: string) => v.toLowerCase(),
    EscapeSQLString: (v: string | null | undefined) => (v ?? '').replace(/\0/g, '').replace(/'/g, "''"),
}));

vi.mock('@memberjunction/ng-shared', () => ({
    BaseResourceComponent: class {
        public Provider: unknown = null;
        public get ProviderToUse(): unknown { return this.Provider; }
        ngOnInit() {}
        ngOnDestroy() {}
        NotifyLoadComplete() {}
    },
    NavigationService: class {},
    ActivityService: class {},
}));

vi.mock('@memberjunction/ng-notifications', () => ({
    MJNotificationService: {
        Instance: { CreateSimpleNotification: vi.fn() },
    },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: { Instance: { EnsureLoaded: async () => {}, Prompts: [] } },
}));
vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: class {},
    GraphQLAIClient: class { async RunAIPrompt() { return { success: false, error: 'not used' }; } },
}));
vi.mock('@memberjunction/core-entities', () => ({
    KnowledgeHubMetadataEngine: { Instance: { Config: async () => {} } },
}));

// ── The in-memory metadata store the component reads and writes ──

/** A saved row, as the fake provider recorded it. */
interface SavedRow {
    entityName: string;
    wasNew: boolean;
    id: string;
}

/**
 * A row standing in for a BaseEntity: arbitrary field assignment, NewRecord() and Save().
 * A Proxy rather than a class so the component can set any field it likes and the test can
 * read back exactly what was set.
 *
 * The store holds these proxies, not plain records, because RunView with
 * `ResultType: 'entity_object'` hands the component savable objects — a find-or-create that
 * reuses a found row then calls Save() on it, so a plain record would not exercise the path.
 */
type FakeRow = Record<string, unknown>;

interface Store {
    /** entity name → rows */
    tables: Map<string, FakeRow[]>;
    saves: SavedRow[];
    newRecordCalls: string[];
    seq: number;
    /** entity names whose next Save() should return false, simulating a mid-flow failure. */
    failSavesFor: Set<string>;
}

function newStore(): Store {
    return {
        tables: new Map<string, FakeRow[]>(),
        saves: [],
        newRecordCalls: [],
        seq: 0,
        failSavesFor: new Set<string>(),
    };
}

/** Rows of one table, created on demand. */
function table(store: Store, entityName: string): FakeRow[] {
    const existing = store.tables.get(entityName);
    if (existing) return existing;
    const fresh: FakeRow[] = [];
    store.tables.set(entityName, fresh);
    return fresh;
}

function makeRow(store: Store, entityName: string, seed?: Record<string, unknown>): FakeRow {
    const fields: Record<string, unknown> = { ...(seed ?? {}) };
    let isNew = false;
    const api: Record<string, unknown> = {};
    const proxy = new Proxy({} as FakeRow, {
        get: (_t, prop) => {
            if (typeof prop !== 'string') return undefined;
            return prop in api ? api[prop] : fields[prop];
        },
        set: (_t, prop, value) => {
            if (typeof prop === 'string') fields[prop] = value;
            return true;
        },
        has: () => true,
    });
    api['NewRecord'] = (): void => {
        isNew = true;
        store.newRecordCalls.push(entityName);
    };
    api['Save'] = async (): Promise<boolean> => {
        if (store.failSavesFor.has(entityName)) return false;
        if (!fields['ID']) {
            fields['ID'] = `${entityName.replace(/[^A-Za-z]/g, '')}-${++store.seq}`;
        }
        const rows = table(store, entityName);
        if (!rows.includes(proxy)) rows.push(proxy);
        store.saves.push({ entityName, wasNew: isNew, id: String(fields['ID']) });
        return true;
    };
    api['LatestResult'] = { CompleteMessage: 'simulated failure' };
    api['Load'] = async (id: string): Promise<boolean> => String(fields['ID'] ?? '') === id;
    return proxy;
}

/** Seeds a row that already exists in the store. */
function seedRow(store: Store, entityName: string, seed: Record<string, unknown>): FakeRow {
    const row = makeRow(store, entityName, seed);
    table(store, entityName).push(row);
    return row;
}

/**
 * Evaluates the tiny subset of ExtraFilter this flow emits: `Field='value'` clauses joined
 * by AND. Anything richer is not used by the code under test; an unparseable clause fails
 * loudly rather than matching everything, so a filter change cannot silently pass a test.
 */
function matchesFilter(row: FakeRow, filter: string | undefined): boolean {
    if (!filter) return true;
    for (const clause of filter.split(' AND ')) {
        const m = /^\s*(\w+)\s*=\s*'(.*)'\s*$/.exec(clause);
        if (!m) throw new Error(`test harness cannot parse ExtraFilter clause: ${clause}`);
        const [, field, value] = m;
        if (String(row[field] ?? '') !== value.replace(/''/g, "'")) return false;
    }
    return true;
}

interface ViewParams {
    EntityName: string;
    ExtraFilter?: string;
    MaxRows?: number;
}

let activeStore: Store = newStore();

vi.mock('@memberjunction/core', () => ({
    EntityInfo: class {},
    Metadata: class {},
    RunView: class RunViewMock {
        static FromMetadataProvider(): RunViewMock {
            return new RunViewMock();
        }
        async RunView(params: ViewParams): Promise<{ Success: boolean; Results: unknown[]; TotalRowCount: number }> {
            const rows = table(activeStore, params.EntityName).filter((r) => matchesFilter(r, params.ExtraFilter));
            const limited = params.MaxRows ? rows.slice(0, params.MaxRows) : rows;
            return { Success: true, Results: limited, TotalRowCount: rows.length };
        }
        async RunViews(list: ViewParams[]): Promise<unknown[]> {
            return Promise.all(list.map((p) => this.RunView(p)));
        }
    },
}));

import {
    ENTITY_DOCUMENT_TYPE_BY_USE_CASE,
    MAX_TEMPLATE_FIELDS,
    VECTOR_BLOCKED_SCHEMAS,
    CapSelectedFields,
    EntityDocumentTypeForUseCase,
    IsVectorizableEntity,
    SuggestionUseCaseForDocumentType,
    TemplateFieldCapRefusal,
    TemplateFieldNames,
} from '../AI/components/vectors/vector-document-rules';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { VectorManagementResourceComponent } from '../AI/components/vectors/vector-management-resource.component';

const RECORD_DUPLICATE_ID = 'type-record-duplicate';

/** The EntityInfo members buildPromptData reads. */
interface FakePromptEntity {
    ID: string;
    Name: string;
    SchemaName: string;
    Fields: { Name: string; Type: string; IsPrimaryKey: boolean }[];
    RelatedEntities: { Type: string; RelatedEntity: string; RelatedEntityJoinField: string }[];
}
const SEARCH_TYPE_ID = 'type-search';

// ─────────────────────────────────────────────────────────────────────────────
// 1. The use case decides the document type
// ─────────────────────────────────────────────────────────────────────────────

describe('EntityDocumentTypeForUseCase', () => {
    it('gives each offered use case its own type', () => {
        expect(EntityDocumentTypeForUseCase('duplicate detection')).toBe('Record Duplicate');
        expect(EntityDocumentTypeForUseCase('search')).toBe('Search');
    });

    it('does not offer classification, because MJ seeds no Classification type', () => {
        // Every stock install refused it, so the dialog dropped it until the type exists.
        expect(Object.keys(ENTITY_DOCUMENT_TYPE_BY_USE_CASE)).not.toContain('classification');
        expect(EntityDocumentTypeForUseCase('classification')).toBeNull();
    });

    it('never resolves anything but duplicate detection to Record Duplicate', () => {
        // The whole defect in one assertion: two of three choices used to land here.
        for (const useCase of Object.keys(ENTITY_DOCUMENT_TYPE_BY_USE_CASE)) {
            if (useCase === 'duplicate detection') continue;
            expect(EntityDocumentTypeForUseCase(useCase), useCase).not.toBe('Record Duplicate');
        }
    });

    it('uses the type names MJ itself seeds, not invented ones', () => {
        // 'Record Duplicate' and 'Search' are both seeded EntityDocumentTypes, and are the two
        // values the Vectorize Entity action's EntityDocumentType parameter documents.
        expect(Object.values(ENTITY_DOCUMENT_TYPE_BY_USE_CASE)).toContain('Record Duplicate');
        expect(Object.values(ENTITY_DOCUMENT_TYPE_BY_USE_CASE)).toContain('Search');
    });

    it('tolerates casing and padding the way the server-side name lookup does', () => {
        expect(EntityDocumentTypeForUseCase('  SEARCH  ')).toBe('Search');
    });

    it('returns null for an unknown use case rather than defaulting', () => {
        expect(EntityDocumentTypeForUseCase('sentiment')).toBeNull();
        expect(EntityDocumentTypeForUseCase('')).toBeNull();
        expect(EntityDocumentTypeForUseCase(null)).toBeNull();
        expect(EntityDocumentTypeForUseCase(undefined)).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The field list is bounded
// ─────────────────────────────────────────────────────────────────────────────

describe('CapSelectedFields', () => {
    const field = (n: number) => `Field${n}`;

    it('passes a list within the cap through untouched', () => {
        const fields = Array.from({ length: MAX_TEMPLATE_FIELDS }, (_, i) => field(i));
        const result = CapSelectedFields(fields);
        expect(result.fields).toEqual(fields);
        expect(result.dropped).toBe(0);
    });

    it('truncates beyond the cap and reports how many it dropped', () => {
        const fields = Array.from({ length: MAX_TEMPLATE_FIELDS + 11 }, (_, i) => field(i));
        const result = CapSelectedFields(fields);
        expect(result.fields).toHaveLength(MAX_TEMPLATE_FIELDS);
        expect(result.dropped).toBe(11);
    });

    it('de-duplicates before counting, so repeats do not consume the budget', () => {
        const result = CapSelectedFields(['Name', 'Name', 'Email']);
        expect(result.fields).toEqual(['Name', 'Email']);
        expect(result.dropped).toBe(0);
    });

    it('is null-safe', () => {
        expect(CapSelectedFields(null)).toEqual({ fields: [], dropped: 0 });
        expect(CapSelectedFields(undefined)).toEqual({ fields: [], dropped: 0 });
        expect(CapSelectedFields([])).toEqual({ fields: [], dropped: 0 });
    });
});

describe('TemplateFieldCapRefusal', () => {
    const template = (n: number) => Array.from({ length: n }, (_, i) => `{{Field${i}}}`).join(' and ');

    it('accepts a template at the cap', () => {
        expect(TemplateFieldCapRefusal(template(MAX_TEMPLATE_FIELDS))).toBeNull();
    });

    it('refuses one field past the cap', () => {
        expect(TemplateFieldCapRefusal(template(MAX_TEMPLATE_FIELDS + 1))).not.toBeNull();
    });

    it('puts both counts in the message, because "too many" is not actionable', () => {
        const msg = TemplateFieldCapRefusal(template(MAX_TEMPLATE_FIELDS + 7));
        expect(msg).toContain(String(MAX_TEMPLATE_FIELDS + 7));
        expect(msg).toContain(String(MAX_TEMPLATE_FIELDS));
        expect(msg).toContain('7');
    });

    it('counts distinct fields, not placeholder occurrences', () => {
        const repeated = Array.from({ length: MAX_TEMPLATE_FIELDS + 20 }, () => '{{Name}}').join(' ');
        expect(TemplateFieldCapRefusal(repeated)).toBeNull();
    });

    it('counts a relationship-qualified placeholder as one field', () => {
        expect(TemplateFieldNames('{{ Organization.Name }} {{Organization.City}}')).toEqual([
            'Organization.Name',
            'Organization.City',
        ]);
    });

    it('does not count prose, only placeholders', () => {
        expect(TemplateFieldNames('Describe the record fully and at length.')).toEqual([]);
    });

    it('is null-safe', () => {
        expect(TemplateFieldCapRefusal(null)).toBeNull();
        expect(TemplateFieldCapRefusal('')).toBeNull();
    });

    // The cap's exact value is a calibration knob, so it is bracketed rather than asserted
    // equal — an equality test would just restate the constant. These two bounds are what
    // actually has to hold, and together they catch both ways of neutering the cap.

    it('cannot fire on anything the suggestion prompt itself demonstrates', () => {
        // The prompt requires 1-4 natural language sentences and its richest worked example
        // interpolates 8 distinct placeholders. Below that the cap would refuse output the
        // prompt explicitly teaches.
        expect(MAX_TEMPLATE_FIELDS).toBeGreaterThan(8);
    });

    it('stays below the width of a wide table, or it would bound nothing', () => {
        // The case the cap exists for is a model that ignored the sentence contract and
        // reached for the whole table. MJ's own wide tables run to ~67 columns, so a cap above
        // 40 could never fire on one — raising the constant is exactly how this guard would be
        // silently removed, and the other tests here are relative to the constant so they
        // cannot see it.
        expect(MAX_TEMPLATE_FIELDS).toBeLessThanOrEqual(40);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. The picker does not offer MJ's own internals
// ─────────────────────────────────────────────────────────────────────────────

describe('IsVectorizableEntity', () => {
    it('refuses entities in the __mj schema', () => {
        expect(IsVectorizableEntity({ Name: 'MJ: AI Prompt Runs', SchemaName: '__mj' })).toBe(false);
        expect(IsVectorizableEntity({ Name: 'Audit Logs', SchemaName: '__mj' })).toBe(false);
    });

    it('refuses MJ:-prefixed entities wherever they are registered', () => {
        expect(IsVectorizableEntity({ Name: 'MJ: Entity Documents', SchemaName: 'somewhere_else' })).toBe(false);
    });

    it('allows ordinary business entities', () => {
        expect(IsVectorizableEntity({ Name: 'Members', SchemaName: 'dbo' })).toBe(true);
        expect(IsVectorizableEntity({ Name: 'Orders', SchemaName: 'crm' })).toBe(true);
    });

    it('allows an entity with no schema rather than dropping it', () => {
        expect(IsVectorizableEntity({ Name: 'Members' })).toBe(true);
        expect(IsVectorizableEntity({ Name: 'Members', SchemaName: null })).toBe(true);
    });

    it('does not refuse a business entity whose name merely contains MJ', () => {
        expect(IsVectorizableEntity({ Name: 'MJM Widgets', SchemaName: 'dbo' })).toBe(true);
        expect(IsVectorizableEntity({ Name: 'Company MJ: Notes', SchemaName: 'dbo' })).toBe(true);
    });

    it('blocks __mj and only __mj by schema', () => {
        expect(VECTOR_BLOCKED_SCHEMAS.has('__mj')).toBe(true);
        expect(VECTOR_BLOCKED_SCHEMAS.size).toBe(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The component: the rules are wired into the real save path
// ─────────────────────────────────────────────────────────────────────────────

describe('the save path writes what the user chose', () => {
    let component: VectorManagementResourceComponent;

    /** Seeds both document types unless told otherwise, then builds a wired component. */
    function build(opts: { types?: { ID: string; Name: string }[] } = {}): VectorManagementResourceComponent {
        activeStore = newStore();
        const types = opts.types ?? [
            { ID: RECORD_DUPLICATE_ID, Name: 'Record Duplicate' },
            { ID: SEARCH_TYPE_ID, Name: 'Search' },
        ];
        for (const t of types) seedRow(activeStore, 'MJ: Entity Document Types', { ...t });
        seedRow(activeStore, 'MJ: Template Content Types', { ID: 'content-type-text', Name: 'Text' });

        const store = activeStore;
        const provider = {
            CurrentUser: { ID: 'user-1' },
            Entities: [
                { ID: 'e1', Name: 'Members', SchemaName: 'dbo', Fields: [], RelatedEntities: [] },
                { ID: 'e2', Name: 'MJ: AI Prompts', SchemaName: '__mj', Fields: [], RelatedEntities: [] },
                { ID: 'e3', Name: 'Orders', SchemaName: 'crm', Fields: [], RelatedEntities: [] },
            ],
            GetEntityObject: async (entityName: string): Promise<FakeRow> => makeRow(store, entityName),
        };

        const c = new VectorManagementResourceComponent();
        c.Provider = provider as unknown as typeof c.Provider;
        c['vectorDatabases'] = [{ ID: 'vdb-1' }] as unknown as typeof c['vectorDatabases'];
        c.HasVectorDB = true;
        c.HasEmbeddingModel = true;
        c.SelectedVectorDBID = 'vdb-1';
        c.SelectedEmbeddingModelID = 'model-1';
        c.SelectedVectorIndexID = '';
        c.SaveDocumentName = 'Members - search';
        c.EditableTemplate = '{{FirstName}} {{LastName}} works at {{Company}}.';
        // SaveAsEntityDocument early-returns without a suggestion, as the real dialog does.
        c.SuggestionResult = {
            template: c.EditableTemplate,
            selectedFields: ['FirstName', 'LastName', 'Company'],
            potentialMatchThreshold: 0.7,
            absoluteMatchThreshold: 0.95,
            reasoning: 'test',
        };
        c['LoadData'] = async (): Promise<void> => {};
        return c;
    }

    beforeEach(() => {
        component = build();
    });

    it('picking "search" writes a Search document, and never a Record Duplicate one', async () => {
        component.SuggestUseCase = 'search';
        const doc = makeRow(activeStore, 'MJ: Entity Documents');
        await component['populateEntityDocumentFKs'](doc as never);
        expect(doc['TypeID']).toBe(SEARCH_TYPE_ID);
        expect(doc['TypeID']).not.toBe(RECORD_DUPLICATE_ID);
    });

    it('picking "duplicate detection" still writes a Record Duplicate document', async () => {
        component.SuggestUseCase = 'duplicate detection';
        const doc = makeRow(activeStore, 'MJ: Entity Documents');
        await component['populateEntityDocumentFKs'](doc as never);
        expect(doc['TypeID']).toBe(RECORD_DUPLICATE_ID);
    });

    /** An install that lacks the Search type, so picking "search" has no type to write. */
    function buildWithoutSearchType(): VectorManagementResourceComponent {
        const c = build({
            types: [
                { ID: RECORD_DUPLICATE_ID, Name: 'Record Duplicate' },
                { ID: 'type-context', Name: 'Context' },
            ],
        });
        c.SuggestUseCase = 'search';
        return c;
    }

    it('an absent type fails with a message naming the type that was wanted', async () => {
        // The refusal has to name the missing type: substituting a type that does exist is the
        // original defect.
        component = buildWithoutSearchType();
        const doc = makeRow(activeStore, 'MJ: Entity Documents');
        await expect(component['populateEntityDocumentFKs'](doc as never)).rejects.toThrow(/"Search"/);
        expect(doc['TypeID']).toBeUndefined();
    });

    it('the absent-type message lists the types that do exist, so it is diagnosable', async () => {
        component = buildWithoutSearchType();
        const doc = makeRow(activeStore, 'MJ: Entity Documents');
        await expect(component['populateEntityDocumentFKs'](doc as never)).rejects.toThrow(/Record Duplicate.*Context|Context.*Record Duplicate/s);
    });

    it('writes nothing at all when the wanted type is missing', async () => {
        component = buildWithoutSearchType();
        const doc = makeRow(activeStore, 'MJ: Entity Documents');
        await expect(component['populateEntityDocumentFKs'](doc as never)).rejects.toThrow();
        expect(activeStore.saves).toHaveLength(0);
    });

    it('refuses a template over the field cap, with the count visible', async () => {
        component.SuggestUseCase = 'search';
        const wide = Array.from({ length: MAX_TEMPLATE_FIELDS + 3 }, (_, i) => `{{Field${i}}}`).join(' ');
        component.EditableTemplate = wide;
        const doc = makeRow(activeStore, 'MJ: Entity Documents');
        await expect(component['populateEntityDocumentFKs'](doc as never)).rejects.toThrow(
            new RegExp(`${MAX_TEMPLATE_FIELDS + 3}`),
        );
        // and refuses before writing the template rows
        expect(activeStore.saves.filter((s) => s.entityName === 'MJ: Templates')).toHaveLength(0);
    });

    it('a retry after a mid-flow failure leaves one set of rows, not two', async () => {
        component.SuggestUseCase = 'search';

        // Attempt 1: the Entity Document save fails after Template + Template Content are in.
        activeStore.failSavesFor.add('MJ: Entity Documents');
        await component.SaveAsEntityDocument();
        const firstPass = activeStore.saves.map((s) => s.entityName);
        expect(firstPass).toContain('MJ: Templates');
        expect(firstPass).toContain('MJ: Template Contents');

        // Attempt 2: same dialog, same name — the failure clears and the user retries.
        activeStore.failSavesFor.clear();
        await component.SaveAsEntityDocument();

        expect(table(activeStore, 'MJ: Templates')).toHaveLength(1);
        expect(table(activeStore, 'MJ: Template Contents')).toHaveLength(1);
        expect(table(activeStore, 'MJ: Entity Documents')).toHaveLength(1);
    });

    it('the retry reuses the earlier rows instead of calling NewRecord again', async () => {
        component.SuggestUseCase = 'search';
        activeStore.failSavesFor.add('MJ: Entity Documents');
        await component.SaveAsEntityDocument();
        const newTemplatesAfterFirst = activeStore.newRecordCalls.filter((n) => n === 'MJ: Templates').length;
        expect(newTemplatesAfterFirst).toBe(1);

        activeStore.failSavesFor.clear();
        await component.SaveAsEntityDocument();
        const newTemplatesTotal = activeStore.newRecordCalls.filter((n) => n === 'MJ: Templates').length;
        expect(newTemplatesTotal).toBe(1);
    });

    it('refuses to adopt a same-named document this dialog did not create', async () => {
        component.SuggestUseCase = 'search';
        // A document someone else configured, whose template is not ours.
        seedRow(activeStore, 'MJ: Entity Documents', {
            ID: 'someone-elses', Name: 'Members - search', TemplateID: 'their-template',
        });
        seedRow(activeStore, 'MJ: Templates', { ID: 'their-template', Name: 'Hand-built template' });

        await expect(component['findOrCreateEntityDocument']()).rejects.toThrow(/already exists/);
    });

    it('refuses to adopt a same-named document that belongs to another entity', async () => {
        // The adoption guard checked only the template name, so a document this dialog made for
        // Orders was adopted when the user typed its name while vectorizing Members, and the
        // save then moved it to Members. Before adoption existed, the name collision failed.
        component.SuggestUseCase = 'search';
        component.SuggestEntityName = 'Members';
        seedRow(activeStore, 'MJ: Templates', {
            ID: 'tpl-orders', Name: 'Template for Members - search', UserID: 'user-1',
        });
        const ordersDoc = seedRow(activeStore, 'MJ: Entity Documents', {
            ID: 'doc-orders', Name: 'Members - search', TemplateID: 'tpl-orders', EntityID: 'e3', Entity: 'Orders',
        });

        await expect(component['findOrCreateEntityDocument']()).rejects.toThrow(/Orders/);
        await component.SaveAsEntityDocument();
        expect(ordersDoc['EntityID']).toBe('e3');
        expect(activeStore.saves.filter((s) => s.entityName === 'MJ: Entity Documents')).toHaveLength(0);
    });

    it('an adopted document keeps the template it already points at, even when another user made it', async () => {
        // Adoption checks the template by name only, so a document another user created through
        // this dialog is adopted. Its template must be reused by ID: looking it up by Name +
        // UserID misses it, writes a second template, re-points the document and orphans the
        // original Template and Template Content.
        component.SuggestUseCase = 'search';
        seedRow(activeStore, 'MJ: Templates', {
            ID: 'tpl-user-2', Name: 'Template for Members - search', UserID: 'user-2',
        });
        seedRow(activeStore, 'MJ: Template Contents', {
            ID: 'content-user-2', TemplateID: 'tpl-user-2', TemplateText: '{{FirstName}}', Priority: 1,
        });
        const priorDoc = seedRow(activeStore, 'MJ: Entity Documents', {
            ID: 'doc-user-2', Name: 'Members - search', TemplateID: 'tpl-user-2',
        });

        await component.SaveAsEntityDocument();

        expect(table(activeStore, 'MJ: Templates')).toHaveLength(1);
        expect(table(activeStore, 'MJ: Template Contents')).toHaveLength(1);
        expect(table(activeStore, 'MJ: Entity Documents')).toHaveLength(1);
        expect(priorDoc['TemplateID']).toBe('tpl-user-2');
        // The template still belongs to the user who created it.
        expect(table(activeStore, 'MJ: Templates')[0]['UserID']).toBe('user-2');
        expect(activeStore.newRecordCalls).not.toContain('MJ: Templates');
    });

    it('the suggestion prompt never receives sensitive fields of a related entity', () => {
        // Layer 1 filtered only the entity's own fields; a related entity's columns went to the
        // model unfiltered inside RelationshipsJSON.
        const provider = component.Provider as unknown as { Entities: FakePromptEntity[] };
        const users: FakePromptEntity = {
            ID: 'e-users', Name: 'Users', SchemaName: 'dbo', RelatedEntities: [],
            Fields: [
                { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
                { Name: 'Email', Type: 'nvarchar', IsPrimaryKey: false },
                { Name: 'PasswordHash', Type: 'nvarchar', IsPrimaryKey: false },
                { Name: 'SSN', Type: 'nvarchar', IsPrimaryKey: false },
            ],
        };
        const members: FakePromptEntity = {
            ID: 'e-members', Name: 'Members', SchemaName: 'dbo',
            Fields: [{ Name: 'FirstName', Type: 'nvarchar', IsPrimaryKey: false }],
            RelatedEntities: [{ Type: 'Many to One', RelatedEntity: 'Users', RelatedEntityJoinField: 'UserID' }],
        };
        provider.Entities.push(users);

        const data = component['buildPromptData'](members as never, 'search');
        const relationships = JSON.parse(String(data['RelationshipsJSON'])) as { Fields: string[] }[];

        expect(relationships).toHaveLength(1);
        expect(relationships[0].Fields).toContain('Email');
        expect(relationships[0].Fields).not.toContain('PasswordHash');
        expect(relationships[0].Fields).not.toContain('SSN');
    });

    it('each documents-table row carries the document type', () => {
        component['entityDocuments'] = [
            { ID: 'd1', Name: 'Members - search', Entity: 'Members', Type: 'Search', Status: 'Active' },
            { ID: 'd2', Name: 'Members - duplicate detection', Entity: 'Members', Type: 'Record Duplicate', Status: 'Active' },
        ] as unknown as typeof component['entityDocuments'];
        component['buildSyncRows']();
        expect(component.SyncRows.map((r) => r.DocumentType)).toEqual(['Search', 'Record Duplicate']);
    });

    it('the picker offers business entities and not MJ internals', () => {
        component['loadEntityGroups']();
        const offered = component.EntityGroups.flatMap((g) => g.Entities).map((e) => e.Name);
        expect(offered).toContain('Members');
        expect(offered).toContain('Orders');
        expect(offered).not.toContain('MJ: AI Prompts');
        expect(component.EntityGroups.map((g) => g.SchemaName)).not.toContain('__mj');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The edit panel: the document's own type drives what it shows and regenerates
// ─────────────────────────────────────────────────────────────────────────────

describe('the edit panel works from the document type', () => {
    /** A component holding one document of the given type, with the suggestion prompt stubbed. */
    function buildWithDocument(docType: string): {
        component: VectorManagementResourceComponent;
        prompt: ReturnType<typeof vi.fn>;
    } {
        activeStore = newStore();
        const component = new VectorManagementResourceComponent();
        component['entityDocuments'] = [{
            ID: 'doc-1', Name: `Courses - ${docType}`, Entity: 'Courses', Type: docType,
            // No template, so OpenEditPanel makes no template lookup.
            TemplateID: '', VectorDatabaseID: null, AIModelID: null, VectorIndexID: null, Status: 'Active',
        }] as unknown as typeof component['entityDocuments'];
        const prompt = vi.fn(async () => ({ template: 'REGENERATED' }));
        component['callSuggestionPrompt'] = prompt as unknown as typeof component['callSuggestionPrompt'];
        return { component, prompt };
    }

    beforeEach(() => {
        vi.mocked(MJNotificationService.Instance.CreateSimpleNotification).mockClear();
    });

    it('shows the type of the document being edited', async () => {
        const { component } = buildWithDocument('Search');
        await component.OpenEditPanel('doc-1');
        expect(component.EditDocType).toBe('Search');
    });

    it('regenerates a Search document with the "search" use case', async () => {
        const { component, prompt } = buildWithDocument('Search');
        await component.OpenEditPanel('doc-1');
        await component.RegenerateTemplate();
        expect(prompt).toHaveBeenCalledTimes(1);
        expect(prompt).toHaveBeenCalledWith('Courses', 'search');
        expect(component.EditDocTemplate).toBe('REGENERATED');
    });

    it('regenerates a Record Duplicate document with the "duplicate detection" use case', async () => {
        const { component, prompt } = buildWithDocument('Record Duplicate');
        await component.OpenEditPanel('doc-1');
        await component.RegenerateTemplate();
        expect(prompt).toHaveBeenCalledWith('Courses', 'duplicate detection');
    });

    it('refuses, naming the type, for a type with no use case, and leaves the template alone', async () => {
        const { component, prompt } = buildWithDocument('Context');
        await component.OpenEditPanel('doc-1');
        component.EditDocTemplate = 'ORIGINAL';
        await component.RegenerateTemplate();

        expect(prompt).not.toHaveBeenCalled();
        expect(component.EditDocTemplate).toBe('ORIGINAL');
        expect(component.IsEditRegenerating).toBe(false);
        const notify = vi.mocked(MJNotificationService.Instance.CreateSimpleNotification);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][0]).toContain('"Context"');
        expect(notify.mock.calls[0][1]).toBe('error');
    });
});

describe('SuggestionUseCaseForDocumentType', () => {
    it('is the reverse of the use-case map, so the two directions cannot drift', () => {
        for (const [useCase, typeName] of Object.entries(ENTITY_DOCUMENT_TYPE_BY_USE_CASE)) {
            expect(SuggestionUseCaseForDocumentType(typeName), typeName).toBe(useCase);
        }
    });

    it('ignores case and surrounding whitespace', () => {
        expect(SuggestionUseCaseForDocumentType('  search ')).toBe('search');
        expect(SuggestionUseCaseForDocumentType('RECORD DUPLICATE')).toBe('duplicate detection');
    });

    it('returns null for a type with no use case, never falling back to duplicate detection', () => {
        expect(SuggestionUseCaseForDocumentType('Context')).toBeNull();
        expect(SuggestionUseCaseForDocumentType('')).toBeNull();
        expect(SuggestionUseCaseForDocumentType(null)).toBeNull();
        expect(SuggestionUseCaseForDocumentType(undefined)).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wiring the behavioural tests cannot see
// ─────────────────────────────────────────────────────────────────────────────

describe('the component keeps the rules wired', () => {
    const SRC = readFileSync(
        join(__dirname, '..', 'AI', 'components', 'vectors', 'vector-management-resource.component.ts'),
        'utf-8',
    );
    /** Code only — prose about a rule must not be able to satisfy an assertion. */
    const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

    it('the hardcoded Record Duplicate lookup is gone', () => {
        expect(CODE).not.toMatch(/Name = 'Record Duplicate'/);
    });

    it('the field cap is checked on the template, before the first write', () => {
        const check = CODE.indexOf('TemplateFieldCapRefusal(templateText)');
        const firstSave = CODE.indexOf('template.Save()');
        expect(check).toBeGreaterThan(0);
        expect(firstSave).toBeGreaterThan(check);
    });

    it('all three writes go through a find-or-create', () => {
        // Deliberately positive-only. A "NewRecord is gone" assertion is not expressible here:
        // the find-or-create helpers legitimately call NewRecord on the miss path, with the same
        // text the old code used. The pin for this defect is the behavioural retry test above,
        // which counts the rows that end up in the store.
        expect(CODE).toMatch(/const entityDoc = await this\.findOrCreateEntityDocument\(\)/);
        expect(CODE).toMatch(/const template = await this\.findOrCreateTemplate\(templateName, entityDoc\.TemplateID\)/);
        expect(CODE).toMatch(/const content = await this\.findOrCreateTemplateContent\(template\.ID\)/);
    });

    it('the entity picker filters through the rule', () => {
        expect(CODE).toMatch(/IsVectorizableEntity\(entity\)/);
    });
});

describe('the template offers what the rules support', () => {
    const HTML = readFileSync(
        join(__dirname, '..', 'AI', 'components', 'vectors', 'vector-management-resource.component.html'),
        'utf-8',
    );

    it('the Use Case buttons are exactly the use cases that have a document type', () => {
        const offered = [...HTML.matchAll(/\(click\)="SuggestUseCase = '([^']+)'"/g)].map((m) => m[1]);
        expect(new Set(offered)).toEqual(new Set(Object.keys(ENTITY_DOCUMENT_TYPE_BY_USE_CASE)));
        expect(HTML).not.toMatch(/Classification/);
    });

    it('the documents table has a Type column bound to the row', () => {
        expect(HTML).toMatch(/<th>Type<\/th>/);
        expect(HTML).toMatch(/\{\{\s*row\.DocumentType\s*\}\}/);
    });

    it('the edit panel shows the type read-only, not as an input', () => {
        expect(HTML).toMatch(/<span class="edit-readonly-value">\{\{\s*EditDocType\s*\}\}<\/span>/);
        expect(HTML).not.toMatch(/\[\(ngModel\)\]="EditDocType"/);
    });
});

describe("the edit panel's save checks the template it writes (#5633)", () => {
    const CLEAN = '{{FirstName}} {{LastName}} works at {{Company}}.';

    /** One document with one template content row, opened in the edit panel. */
    async function openDocument(opts: { templateText?: string; withContentRow?: boolean } = {}): Promise<{
        component: VectorManagementResourceComponent;
        doc: FakeRow;
        content: FakeRow | null;
    }> {
        activeStore = newStore();
        const store = activeStore;
        const doc = seedRow(store, 'MJ: Entity Documents', {
            ID: 'doc-1', Name: 'Members - search', Entity: 'Members', Type: 'Search',
            TemplateID: 'tpl-1', VectorDatabaseID: null, AIModelID: null, VectorIndexID: null, Status: 'Active',
        });
        const content = opts.withContentRow === false
            ? null
            : seedRow(store, 'MJ: Template Contents', {
                ID: 'tc-1', TemplateID: 'tpl-1', Priority: 1, TemplateText: opts.templateText ?? CLEAN,
            });

        const component = new VectorManagementResourceComponent();
        component.Provider = {
            CurrentUser: { ID: 'user-1' },
            Entities: [],
            GetEntityObject: async (entityName: string): Promise<FakeRow> =>
                entityName === 'MJ: Entity Documents' ? doc : makeRow(store, entityName),
        } as unknown as typeof component.Provider;
        component['entityDocuments'] = [doc] as unknown as typeof component['entityDocuments'];
        component['LoadData'] = async (): Promise<void> => {};
        await component.OpenEditPanel('doc-1');
        vi.mocked(MJNotificationService.Instance.CreateSimpleNotification).mockClear();
        return { component, doc, content };
    }

    function notifications(): { message: string; style: string }[] {
        return vi.mocked(MJNotificationService.Instance.CreateSimpleNotification).mock.calls
            .map((call) => ({ message: String(call[0]), style: String(call[1]) }));
    }

    it('refuses a sensitive field typed into the template, and writes nothing', async () => {
        const { component, content } = await openDocument();
        component.EditDocName = 'Renamed';
        component.EditDocTemplate = CLEAN + ' {{PasswordHash}}';
        await component.SaveEditedDocument();

        expect(activeStore.saves).toEqual([]);
        expect(content?.['TemplateText']).toBe(CLEAN);
        expect(component.ShowEditPanel).toBe(true);
        const [only] = notifications();
        expect(notifications()).toHaveLength(1);
        expect(only.style).toBe('error');
        expect(only.message).toContain('PasswordHash');
    });

    it('refuses a template over the field cap, and writes nothing', async () => {
        const { component } = await openDocument();
        component.EditDocTemplate = Array.from({ length: MAX_TEMPLATE_FIELDS + 1 }, (_, i) => `{{Field${i}}}`).join(' ');
        await component.SaveEditedDocument();

        expect(activeStore.saves).toEqual([]);
        const [only] = notifications();
        expect(only.style).toBe('error');
        expect(only.message).toContain(`at most ${MAX_TEMPLATE_FIELDS}`);
    });

    it('still saves a document whose stored template already breaks a rule, when the template is not touched', async () => {
        // Checking only changed text keeps documents made before the check editable.
        const legacy = '{{FirstName}} {{PasswordHash}}';
        const { component, doc, content } = await openDocument({ templateText: legacy });
        component.EditDocName = 'Renamed';
        await component.SaveEditedDocument();

        expect(doc['Name']).toBe('Renamed');
        expect(activeStore.saves.map((s) => s.entityName)).toEqual(['MJ: Entity Documents']);
        expect(content?.['TemplateText']).toBe(legacy);
        expect(notifications().map((n) => n.style)).toEqual(['success']);
    });

    it('saves a clean edited template and reports success', async () => {
        const { component, content } = await openDocument();
        component.EditDocTemplate = '{{FirstName}} {{LastName}}.';
        await component.SaveEditedDocument();

        expect(content?.['TemplateText']).toBe('{{FirstName}} {{LastName}}.');
        expect(activeStore.saves.map((s) => s.entityName)).toEqual(['MJ: Entity Documents', 'MJ: Template Contents']);
        expect(notifications().map((n) => n.style)).toEqual(['success']);
        expect(component.ShowEditPanel).toBe(false);
    });

    it('refuses to save an emptied template, and writes nothing', async () => {
        const { component, content } = await openDocument();
        component.EditDocTemplate = '   ';
        await component.SaveEditedDocument();

        expect(activeStore.saves).toEqual([]);
        expect(content?.['TemplateText']).toBe(CLEAN);
        const [only] = notifications();
        expect(only.style).toBe('error');
        expect(only.message).toContain('empty');
    });

    it('reports an error, not success, when the template has no content row to write to', async () => {
        const { component } = await openDocument({ withContentRow: false });
        component.EditDocTemplate = CLEAN;
        await component.SaveEditedDocument();

        const styles = notifications().map((n) => n.style);
        expect(styles).not.toContain('success');
        expect(styles).toContain('error');
        expect(component.ShowEditPanel).toBe(true);
        expect(component.EditDocTemplate).toBe(CLEAN);
    });

    it('reports an error, not success, when the template content save fails', async () => {
        const { component } = await openDocument();
        activeStore.failSavesFor.add('MJ: Template Contents');
        component.EditDocTemplate = '{{FirstName}} {{LastName}}.';
        await component.SaveEditedDocument();

        expect(activeStore.saves.map((s) => s.entityName)).toEqual(['MJ: Entity Documents']);
        const errors = notifications().filter((n) => n.style === 'error');
        expect(notifications().map((n) => n.style)).not.toContain('success');
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('simulated failure');
        expect(component.ShowEditPanel).toBe(true);
    });
});
