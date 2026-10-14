/**
 * Whole `VectorizeEntity` runs on the real pipeline (paging, template data, raw render, embed, vector upsert, Entity
 * Record Document write), with the database, the embedding model and the document write replaced by doubles.
 *
 * - A record whose template data is incomplete (a related-rows read failed) must not be rendered, embedded or stored:
 *   its stored document and vector stay as they were, and the run reports the record as failed.
 * - Errors belong to the run that hit them. The Vectorize Entity action runs every entity document at once on one
 *   syncer, so one document's failures must not be reported by another.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: vi.fn() }; // the failures these tests cause are reported; the report is not the subject
});
import { EntityInfo, UserInfo, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import {
    MJEntityDocumentEntity,
    MJTemplateContentEntity,
    MJTemplateEntityExtended,
    MJTemplateParamEntity,
    MJVectorIndexEntity,
} from '@memberjunction/core-entities';
import { VectorDBBase, type BaseResponse, type IndexList, type ListVectorIDsResult } from '@memberjunction/ai-vectordb';
import { AIEmbeddingRunner, type EmbeddingRunResult } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import { TemplateEngineServer } from '@memberjunction/templates';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { EntityVectorSyncer } from '../models/entityVectorSync';
import type { EmbeddingData, VectorEmeddingData } from '../generic/vectorSync.types';

/** Entity metadata keyed by ID, with the given extra fields. */
function entityInfo(id: string, name: string, fieldNames: string[]): EntityInfo {
    return new EntityInfo({
        ID: id, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: `vw${name}`,
        Fields: ['ID', ...fieldNames].map((field, index) => ({
            ID: `${id}-${field}`, EntityID: id, Entity: name, Sequence: index + 1, Name: field,
            Type: field === 'ID' || field.endsWith('ID') ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: field === 'ID',
        })),
    });
}

const PEOPLE_ID = '6A1B2C3D-0000-4000-8000-000000000001';
const PEOPLE = entityInfo(PEOPLE_ID, 'People', ['Name']);
const VECTOR_INDEX_ID = '6A1B2C3D-0000-4000-8000-0000000000F1';
const DOC_A = '6A1B2C3D-0000-4000-8000-0000000000A1';
const DOC_B = '6A1B2C3D-0000-4000-8000-0000000000B1';
const ROWS = [
    { ID: '6A1B2C3D-0000-4000-8000-000000000101', Name: 'Dana' },
    { ID: '6A1B2C3D-0000-4000-8000-000000000102', Name: 'Lee' },
];

/** The documents' template: the person's name, then their phones (a related-entity param). */
function documentTemplate(): MJTemplateEntityExtended {
    const template = new MJTemplateEntityExtended(entityInfo('tpl-entity', 'MJ: Templates', ['Name']));
    template.Hydrate({ ID: 'template-1', Name: 'People Search' });
    const content = new MJTemplateContentEntity(entityInfo('tc-entity', 'MJ: Template Contents', ['TemplateID', 'TemplateText', 'Type', 'Priority']));
    content.Hydrate({ ID: 'content-1', TemplateID: 'template-1', TemplateText: '{{ Name }}{% for p in Phones %} {{ p.Number }}{% endfor %}', Type: 'Text', Priority: 1 });
    const paramEntity = entityInfo('tp-entity', 'MJ: Template Params', ['TemplateID', 'Name', 'Type', 'Entity', 'LinkedParameterField', 'ExtraFilter', 'TemplateContentID']);
    const record = new MJTemplateParamEntity(paramEntity);
    record.Hydrate({ ID: 'param-1', TemplateID: 'template-1', Name: 'Entity', Type: 'Record', TemplateContentID: null });
    const phones = new MJTemplateParamEntity(paramEntity);
    phones.Hydrate({ ID: 'param-2', TemplateID: 'template-1', Name: 'Phones', Type: 'Entity', Entity: 'Phones', LinkedParameterField: 'PersonID', ExtraFilter: null, TemplateContentID: null });
    template.Content = [content];
    template.Params = [record, phones];
    return template;
}

/** An entity document over People, rendered with the template. */
function entityDocument(id: string): MJEntityDocumentEntity {
    const document = new MJEntityDocumentEntity(entityInfo('ed-entity', 'MJ: Entity Documents', ['Name', 'EntityID', 'TemplateID', 'VectorIndexID', 'Configuration']));
    document.Hydrate({ ID: id, Name: `Doc ${id.slice(-2)}`, EntityID: PEOPLE_ID, TemplateID: 'template-1', VectorIndexID: VECTOR_INDEX_ID, Configuration: null });
    return document;
}

/** A vector database that stores nothing itself (vectors live on the Entity Record Documents), like the in-process one. */
class ReadOnlyVectorDB extends VectorDBBase {
    constructor() { super('read-only'); }
    public override get IsReadOnly(): boolean { return true; }
    private ok(): BaseResponse { return { success: true, message: '', data: null }; }
    ListIndexes(): IndexList { return { indexes: [] }; }
    GetIndex(): BaseResponse { return this.ok(); }
    CreateIndex(): BaseResponse { return this.ok(); }
    DeleteIndex(): BaseResponse { return this.ok(); }
    EditIndex(): BaseResponse { return this.ok(); }
    QueryIndex(): BaseResponse { return this.ok(); }
    CreateRecord(): BaseResponse { return this.ok(); }
    CreateRecords(): BaseResponse { return this.ok(); }
    GetRecord(): BaseResponse { return this.ok(); }
    GetRecords(): BaseResponse { return this.ok(); }
    UpdateRecord(): BaseResponse { return this.ok(); }
    UpdateRecords(): BaseResponse { return this.ok(); }
    DeleteRecord(): BaseResponse { return this.ok(); }
    DeleteRecords(): BaseResponse { return this.ok(); }
    DeleteAllRecords(): BaseResponse { return this.ok(); }
    async ListVectorIDs(): Promise<ListVectorIDsResult> { return { IDs: [] }; }
}

/** One stored Entity Record Document write. */
interface StoredDocument { Document: string; RecordID: string; Text: string | undefined }

/** The syncer over the doubles: documents by id, an embedding model that can be made to fail, recorded document writes. */
class HarnessSyncer extends EntityVectorSyncer {
    public readonly Stored: StoredDocument[] = [];
    public readonly Embedded: string[] = [];
    /** The entity documents whose embedding calls fail. */
    public readonly FailingEmbeddings = new Set<string>();

    public override async GetEntityDocument(id: string): Promise<MJEntityDocumentEntity | null> {
        return entityDocument(id);
    }
    protected override async GetVectorDatabaseAndEmbeddingClassByEntityDocumentID(id: string): Promise<VectorEmeddingData> {
        return {
            embeddingRunner: new AIEmbeddingRunner(), aiModelID: id, vectorDB: new ReadOnlyVectorDB(),
            vectorDBClassKey: 'read-only', vectorDBAPIKey: '', embeddingDriverClass: 'test', embeddingAPIKey: '', embeddingModelAPIName: 'test-model',
        };
    }
    protected override async EmbedRenderedTexts(texts: string[], _runner: AIEmbeddingRunner, aiModelID: string): Promise<EmbeddingRunResult> {
        this.Embedded.push(...texts);
        const failed = this.FailingEmbeddings.has(aiModelID);
        return {
            Success: !failed, Vectors: failed ? [] : texts.map(() => [0.1, 0.2]), PromptRunID: null,
            TokensUsed: 0, Cost: 0, ExecutionTimeMs: 0, ErrorMessage: failed ? 'model unavailable' : null,
        };
    }
    protected override async UpsertEntityRecordDocumentBatch(batch: EmbeddingData[]): Promise<void> {
        for (const item of batch) {
            this.Stored.push({ Document: String(item.EntityDocument?.ID), RecordID: String(item.__mj_recordID), Text: item.TemplateContent });
        }
    }
}

/** The rows a view returns: People pages, and Phones rows unless their read fails. */
function viewResult(params: RunViewParams, phonesFail: boolean): RunViewResult<Record<string, unknown>> {
    const base = { RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, UserViewRunID: undefined };
    if (params.EntityName === 'People') {
        return { ...base, Success: true, Results: ROWS, ErrorMessage: '' };
    }
    if (params.EntityName === 'Phones' && !phonesFail) {
        return { ...base, Success: true, Results: [{ ID: 'ph-1', PersonID: ROWS[0].ID, Number: '555-0100' }], ErrorMessage: '' };
    }
    return { ...base, Success: false, Results: [], ErrorMessage: 'Connection lost' };
}

describe('EntityVectorSyncer.VectorizeEntity', () => {
    let provider: EntitiesOnlyProvider;
    let phonesFail: boolean;

    beforeEach(() => {
        phonesFail = false;
        provider = new EntitiesOnlyProvider([PEOPLE]);
        vi.spyOn(provider, 'RunView').mockImplementation(async (params: RunViewParams) => viewResult(params, phonesFail));
        vi.spyOn(TemplateEngineServer.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(TemplateEngineServer.Instance, 'Templates', 'get').mockReturnValue([documentTemplate()]);
        const index = new MJVectorIndexEntity(entityInfo('vi-entity', 'MJ: Vector Indexes', ['Name', 'Dimensions']));
        index.Hydrate({ ID: VECTOR_INDEX_ID, Name: 'people-index', Dimensions: null });
        vi.spyOn(AIEngine.Instance, 'GetVectorIndexByID').mockReturnValue(index);
        vi.spyOn(AIEngine.Instance, 'GetProviderIndexName').mockReturnValue('people-index');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('stores the documents of a complete run', async () => {
        const syncer = new HarnessSyncer(provider);

        const result = await syncer.VectorizeEntity({ entityID: PEOPLE_ID, entityDocumentID: DOC_A }, new UserInfo());

        expect(result.success).toBe(true);
        expect(syncer.Stored.map((s) => s.Text)).toEqual(['Dana 555-0100', 'Lee']);
    });

    it('stores and embeds nothing for records whose related rows could not be read, and reports them', async () => {
        phonesFail = true;
        const syncer = new HarnessSyncer(provider);

        const result = await syncer.VectorizeEntity({ entityID: PEOPLE_ID, entityDocumentID: DOC_A }, new UserInfo());

        expect(syncer.Stored).toEqual([]);
        expect(syncer.Embedded).toEqual([]);
        expect(result.success).toBe(false);
        expect(result.errorCount).toBe(2);
    });

    it("reports each document's errors on that document's run only, when documents run at once on one syncer", async () => {
        const syncer = new HarnessSyncer(provider);
        syncer.FailingEmbeddings.add(DOC_A);

        const [failing, clean] = await Promise.all([
            syncer.VectorizeEntity({ entityID: PEOPLE_ID, entityDocumentID: DOC_A }, new UserInfo()),
            syncer.VectorizeEntity({ entityID: PEOPLE_ID, entityDocumentID: DOC_B }, new UserInfo()),
        ]);

        expect(failing.success).toBe(false);
        expect(failing.errorCount).toBe(2);
        expect(clean.success).toBe(true);
        expect(clean.errorCount).toBe(0);
        expect(syncer.Stored.filter((s) => s.Document === DOC_B)).toHaveLength(2);
    });
});
