/**
 * Tests for the four rules the Vectors tab applies when it turns a model suggestion into
 * real metadata.
 *
 * The headline one: the dialog offers three use cases — duplicate detection, search,
 * classification — and the save path used to hardcode the `Record Duplicate` document type.
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
    capSelectedFields,
    entityDocumentTypeForUseCase,
    isVectorizableEntity,
    templateFieldCapRefusal,
    templateFieldNames,
} from '../AI/components/vectors/vector-document-rules';
import { VectorManagementResourceComponent } from '../AI/components/vectors/vector-management-resource.component';

const RECORD_DUPLICATE_ID = 'type-record-duplicate';
const SEARCH_TYPE_ID = 'type-search';

// ─────────────────────────────────────────────────────────────────────────────
// 1. The use case decides the document type
// ─────────────────────────────────────────────────────────────────────────────

describe('entityDocumentTypeForUseCase', () => {
    it('gives each of the three offered use cases its own type', () => {
        expect(entityDocumentTypeForUseCase('duplicate detection')).toBe('Record Duplicate');
        expect(entityDocumentTypeForUseCase('search')).toBe('Search');
        expect(entityDocumentTypeForUseCase('classification')).toBe('Classification');
    });

    it('never resolves anything but duplicate detection to Record Duplicate', () => {
        // The whole defect in one assertion: two of three choices used to land here.
        for (const useCase of Object.keys(ENTITY_DOCUMENT_TYPE_BY_USE_CASE)) {
            if (useCase === 'duplicate detection') continue;
            expect(entityDocumentTypeForUseCase(useCase), useCase).not.toBe('Record Duplicate');
        }
    });

    it('uses the type names MJ itself seeds, not invented ones', () => {
        // 'Record Duplicate' and 'Search' are both seeded EntityDocumentTypes, and are the two
        // values the Vectorize Entity action's EntityDocumentType parameter documents.
        expect(Object.values(ENTITY_DOCUMENT_TYPE_BY_USE_CASE)).toContain('Record Duplicate');
        expect(Object.values(ENTITY_DOCUMENT_TYPE_BY_USE_CASE)).toContain('Search');
    });

    it('tolerates casing and padding the way the server-side name lookup does', () => {
        expect(entityDocumentTypeForUseCase('  SEARCH  ')).toBe('Search');
    });

    it('returns null for an unknown use case rather than defaulting', () => {
        expect(entityDocumentTypeForUseCase('sentiment')).toBeNull();
        expect(entityDocumentTypeForUseCase('')).toBeNull();
        expect(entityDocumentTypeForUseCase(null)).toBeNull();
        expect(entityDocumentTypeForUseCase(undefined)).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The field list is bounded
// ─────────────────────────────────────────────────────────────────────────────

describe('capSelectedFields', () => {
    const field = (n: number) => `Field${n}`;

    it('passes a list within the cap through untouched', () => {
        const fields = Array.from({ length: MAX_TEMPLATE_FIELDS }, (_, i) => field(i));
        const result = capSelectedFields(fields);
        expect(result.fields).toEqual(fields);
        expect(result.dropped).toBe(0);
    });

    it('truncates beyond the cap and reports how many it dropped', () => {
        const fields = Array.from({ length: MAX_TEMPLATE_FIELDS + 11 }, (_, i) => field(i));
        const result = capSelectedFields(fields);
        expect(result.fields).toHaveLength(MAX_TEMPLATE_FIELDS);
        expect(result.dropped).toBe(11);
    });

    it('de-duplicates before counting, so repeats do not consume the budget', () => {
        const result = capSelectedFields(['Name', 'Name', 'Email']);
        expect(result.fields).toEqual(['Name', 'Email']);
        expect(result.dropped).toBe(0);
    });

    it('is null-safe', () => {
        expect(capSelectedFields(null)).toEqual({ fields: [], dropped: 0 });
        expect(capSelectedFields(undefined)).toEqual({ fields: [], dropped: 0 });
        expect(capSelectedFields([])).toEqual({ fields: [], dropped: 0 });
    });
});

describe('templateFieldCapRefusal', () => {
    const template = (n: number) => Array.from({ length: n }, (_, i) => `{{Field${i}}}`).join(' and ');

    it('accepts a template at the cap', () => {
        expect(templateFieldCapRefusal(template(MAX_TEMPLATE_FIELDS))).toBeNull();
    });

    it('refuses one field past the cap', () => {
        expect(templateFieldCapRefusal(template(MAX_TEMPLATE_FIELDS + 1))).not.toBeNull();
    });

    it('puts both counts in the message, because "too many" is not actionable', () => {
        const msg = templateFieldCapRefusal(template(MAX_TEMPLATE_FIELDS + 7));
        expect(msg).toContain(String(MAX_TEMPLATE_FIELDS + 7));
        expect(msg).toContain(String(MAX_TEMPLATE_FIELDS));
        expect(msg).toContain('7');
    });

    it('counts distinct fields, not placeholder occurrences', () => {
        const repeated = Array.from({ length: MAX_TEMPLATE_FIELDS + 20 }, () => '{{Name}}').join(' ');
        expect(templateFieldCapRefusal(repeated)).toBeNull();
    });

    it('counts a relationship-qualified placeholder as one field', () => {
        expect(templateFieldNames('{{ Organization.Name }} {{Organization.City}}')).toEqual([
            'Organization.Name',
            'Organization.City',
        ]);
    });

    it('does not count prose, only placeholders', () => {
        expect(templateFieldNames('Describe the record fully and at length.')).toEqual([]);
    });

    it('is null-safe', () => {
        expect(templateFieldCapRefusal(null)).toBeNull();
        expect(templateFieldCapRefusal('')).toBeNull();
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

describe('isVectorizableEntity', () => {
    it('refuses entities in the __mj schema', () => {
        expect(isVectorizableEntity({ Name: 'MJ: AI Prompt Runs', SchemaName: '__mj' })).toBe(false);
        expect(isVectorizableEntity({ Name: 'Audit Logs', SchemaName: '__mj' })).toBe(false);
    });

    it('refuses MJ:-prefixed entities wherever they are registered', () => {
        expect(isVectorizableEntity({ Name: 'MJ: Entity Documents', SchemaName: 'somewhere_else' })).toBe(false);
    });

    it('allows ordinary business entities', () => {
        expect(isVectorizableEntity({ Name: 'Members', SchemaName: 'dbo' })).toBe(true);
        expect(isVectorizableEntity({ Name: 'Orders', SchemaName: 'crm' })).toBe(true);
    });

    it('allows an entity with no schema rather than dropping it', () => {
        expect(isVectorizableEntity({ Name: 'Members' })).toBe(true);
        expect(isVectorizableEntity({ Name: 'Members', SchemaName: null })).toBe(true);
    });

    it('does not refuse a business entity whose name merely contains MJ', () => {
        expect(isVectorizableEntity({ Name: 'MJM Widgets', SchemaName: 'dbo' })).toBe(true);
        expect(isVectorizableEntity({ Name: 'Company MJ: Notes', SchemaName: 'dbo' })).toBe(true);
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

    it('an absent type fails with a message naming the type that was wanted', async () => {
        // 'Classification' is offered by the dialog but MJ does not seed that type. The
        // refusal has to name it — substituting a type that does exist is the original defect.
        component.SuggestUseCase = 'classification';
        const doc = makeRow(activeStore, 'MJ: Entity Documents');
        await expect(component['populateEntityDocumentFKs'](doc as never)).rejects.toThrow(/Classification/);
        expect(doc['TypeID']).toBeUndefined();
    });

    it('the absent-type message lists the types that do exist, so it is diagnosable', async () => {
        component.SuggestUseCase = 'classification';
        const doc = makeRow(activeStore, 'MJ: Entity Documents');
        await expect(component['populateEntityDocumentFKs'](doc as never)).rejects.toThrow(/Record Duplicate.*Search|Search.*Record Duplicate/s);
    });

    it('writes nothing at all when the wanted type is missing', async () => {
        component.SuggestUseCase = 'classification';
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
        const check = CODE.indexOf('templateFieldCapRefusal(templateText)');
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
        expect(CODE).toMatch(/const template = await this\.findOrCreateTemplate\(templateName\)/);
        expect(CODE).toMatch(/const content = await this\.findOrCreateTemplateContent\(template\.ID\)/);
    });

    it('the entity picker filters through the rule', () => {
        expect(CODE).toMatch(/isVectorizableEntity\(entity\)/);
    });
});
