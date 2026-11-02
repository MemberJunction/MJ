import { describe, it, expect, vi } from 'vitest';
import type { BaseEntity, UserInfo } from '@memberjunction/core';
import type { MJEntityDocumentEntity } from '@memberjunction/core-entities';

/**
 * Field-level security in duplicate detection. Candidate `VectorMetadata` comes from an index the
 * sync wrote under another identity, and the source-record metadata map is built from records shown
 * to the caller: neither may carry a field the caller may not read.
 */

const { mockRunViewFn } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
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
    AIEmbeddingRunner: class {
        async RunEmbedding(params: { Texts: string[] }) {
            return { Success: true, Vectors: params.Texts.map(() => [0.1, 0.2]) };
        }
    },
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
    },
}));

vi.mock('@memberjunction/ai-vector-sync', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-vector-sync')>();
    return {
        GetEntityDocumentRecordFilter: actual.GetEntityDocumentRecordFilter,
        CombineExtraFilters: actual.CombineExtraFilters,
        EntityDocumentTemplateParser: { CreateInstance: vi.fn() },
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
    TemplateEngineServer: { Instance: { Config: vi.fn(), SetupNunjucks: vi.fn(), Templates: [], RenderTemplate: vi.fn() } },
}));

import { BaseResponse } from '@memberjunction/ai-vectordb';
import { CompositeKey, EntityInfo, DuplicateDetectionOptions, UserInfo as RealUserInfo } from '@memberjunction/core';
import { DuplicateRecordDetector } from '../duplicateRecordDetector';

const STAFF = 'A0000000-0000-0000-0000-000000000002';
const HR = 'A0000000-0000-0000-0000-000000000001';
const rule = (roleID: string, read: string) => ({ ID: `p-${roleID}-${read}`, RoleID: roleID, ReadAccess: read, UpdateAccess: 'No Access', CreateAccess: 'No Access' });
const field = (name: string, staffRead: string, extra: Record<string, unknown> = {}) => ({
    ID: `F-${name}`, EntityID: 'E-1', Name: name, Entity: 'Employees', Type: 'nvarchar', DefaultInView: true,
    EntityFieldPermissions: [rule(HR, 'Allow'), rule(STAFF, staffRead)], ...extra,
});
const EMPLOYEES = new EntityInfo({
    ID: 'E-1', Name: 'Employees', EnableFieldLevelSecurity: true, Permissions: [],
    Fields: [field('ID', 'Allow', { IsPrimaryKey: true }), field('Name', 'Allow', { IsNameField: true, Sequence: 1 }), field('Salary', 'Deny', { Sequence: 2 })],
});
const staffUser = new RealUserInfo(null, { ID: 'U-1', Name: 'Staff', Email: 's@x.org', IsActive: true, UserRoles: [{ UserID: 'U-1', RoleID: STAFF }] });

class ProbeDetector extends DuplicateRecordDetector {
    public Response: BaseResponse = { success: true, message: '', data: { matches: [] } };
    protected override async executeVectorQuery(): Promise<BaseResponse> { return this.Response; }
    public Query(records: BaseEntity[]) {
        return this.QueryDuplicatesForRecords(records, [[0.1]], ['text'], { EntityID: 'E-1', PotentialMatchThreshold: 0 } as MJEntityDocumentEntity, 5, {} as DuplicateDetectionOptions, 1);
    }
    public SourceMetadata(records: BaseEntity[]) { return this.buildSourceMetadataMap(records, EMPLOYEES); }
}

function sourceRecord(values: Record<string, unknown>): BaseEntity {
    return {
        EntityInfo: EMPLOYEES,
        PrimaryKey: CompositeKey.FromKeyValuePair('ID', values.ID),
        Get: (name: string) => values[name],
    } as unknown as BaseEntity;
}

describe('DuplicateRecordDetector field-level security', () => {
    it('removes fields the caller may not read from candidates\' vector metadata', async () => {
        const detector = new ProbeDetector();
        detector.CurrentUser = staffUser as UserInfo;
        detector.Response = {
            success: true, message: '',
            data: { matches: [{ id: 'm2', score: 0.9, metadata: { RecordID: 'ID|e2', Entity: 'Employees', Name: 'Grace', Salary: '250000' } }] },
        };

        const [result] = await detector.Query([sourceRecord({ ID: 'e1' })]);

        expect(result.Duplicates.Duplicates).toHaveLength(1);
        expect(result.Duplicates.Duplicates[0].VectorMetadata).toEqual({ RecordID: 'ID|e2', Entity: 'Employees', Name: 'Grace' });
    });

    it('leaves out fields the caller may not read from the source-record metadata map', () => {
        const detector = new ProbeDetector();
        detector.CurrentUser = staffUser as UserInfo;
        const map = detector.SourceMetadata([sourceRecord({ ID: 'e1', Name: 'Ada', Salary: '250000' })]);

        expect(JSON.parse(map.get('e1') ?? '{}')).toEqual({ Entity: 'Employees', Name: 'Ada' });
    });
});
