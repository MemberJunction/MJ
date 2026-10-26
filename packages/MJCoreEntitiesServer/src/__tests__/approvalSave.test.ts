/**
 * The approval wiring in each server entity's Save (#4789 A17): an approving save stores the
 * approver, the time and the fingerprint of the definition AS STORED; a client's values for those
 * columns never reach the database; a save whose stored approval cannot be read writes nothing.
 *
 * The generated base classes are replaced with a stub whose `Save` records what each write would
 * store, and the database is a stand-in that answers the stored-approval and definition reads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntitySaveOptions, RunViewParams } from '@memberjunction/core';

const { db, writes, saveOptions } = vi.hoisted(() => ({
    db: {
        stored: null as Record<string, unknown> | null,
        readFails: false,
        querySQLs: [] as Array<Record<string, unknown>>,
        queryParameters: [] as Array<Record<string, unknown>>,
        views: [] as RunViewParams[],
    },
    writes: [] as Array<Record<string, unknown>>,
    saveOptions: [] as Array<EntitySaveOptions | undefined>,
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    /** Stands in for each generated base: plain fields, a stored row, and a Save that records the write. */
    class StubEntity {
        public ID = 'rec-1';
        public Name = 'Fixture';
        public IsSaved = true;
        public ContextCurrentUser = { ID: 'approver-1' };
        public ApprovedByUserID: string | null = 'forged-user';
        public ApprovedAt: Date | null = new Date('2030-01-01T00:00:00.000Z');
        public ApprovedFingerprint: string | null = 'forged-fingerprint';
        public LatestResult = { CompleteMessage: '' };
        public RegisterResultHistoryEntry = vi.fn();
        public get PrimaryKey() { return { ToWhereClause: () => `ID='${this.ID}'`, ToString: () => `ID=${this.ID}` }; }
        public get RunViewProviderToUse() {
            return {
                RunView: async (params: RunViewParams) => {
                    db.views.push(params);
                    if (db.readFails) return { Success: false, Results: [], ErrorMessage: 'connection lost' };
                    return { Success: true, Results: db.stored ? [db.stored] : [], ErrorMessage: '' };
                },
                RunViews: async (params: RunViewParams[]) => {
                    db.views.push(...params);
                    return params.map(p => ({ Success: true, Results: p.EntityName === 'MJ: Query SQLs' ? db.querySQLs : db.queryParameters, ErrorMessage: '' }));
                },
            };
        }
        public GetFieldByName(): { Dirty: boolean } { return { Dirty: false }; }
        public async GenerateEmbeddingsByFieldName(): Promise<boolean> { return true; }
        public async Save(options?: EntitySaveOptions): Promise<boolean> {
            writes.push({
                ApprovedByUserID: this.ApprovedByUserID,
                ApprovedAt: this.ApprovedAt,
                ApprovedFingerprint: this.ApprovedFingerprint,
            });
            saveOptions.push(options);
            return true;
        }
    }

    class StubDashboard extends StubEntity {
        public EntityInfo = { Name: 'MJ: Dashboards' };
        public ApprovalStatus = 'Approved';
        public Type = 'Config';
        public UIConfigDetails = '{"panels":[]}';
        public Code: string | null = null;
        public DriverClass: string | null = null;
    }

    class StubComponent extends StubEntity {
        public EntityInfo = { Name: 'MJ: Components' };
        public ApprovalStatus = 'Approved';
        public Specification = '{"name":"Chart"}';
        public Version = '1.0.0';
    }

    class StubUserView extends StubEntity {
        public EntityInfo = { Name: 'MJ: User Views' };
        public ApprovalStatus = 'Approved';
        public EntityID = 'E4238F34-2837-EF11-86D4-6045BDEE16E6';
        public WhereClause = 'stale clause';
        public CustomWhereClause = false;
        public SmartFilterWhereClause: string | null = null;
        public Properties: string | null = null;
        /** The real base regenerates the WhereClause from the filter state before it writes. */
        public override async Save(options?: EntitySaveOptions): Promise<boolean> {
            this.WhereClause = "Status='Active'";
            return super.Save(options);
        }
    }

    class StubQuery extends StubEntity {
        public EntityInfo = { Name: 'MJ: Queries' };
        public Status = 'Approved';
        public SQL = 'SELECT 1';
        public UsesTemplate = false;
        public ExternalDataSourceID: string | null = null;
        public Description = 'kept';
    }

    return {
        ...actual,
        MJDashboardEntityExtended: StubDashboard,
        MJComponentEntityExtended: StubComponent,
        MJUserViewEntityExtended: StubUserView,
        MJQueryEntityExtended: StubQuery,
    };
});

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: {} } }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));
vi.mock('../custom/util', () => ({ EmbedTextLocalHelper: vi.fn() }));
vi.mock('../custom/FormComponentGuard', () => ({ ComponentGuardRefusal: vi.fn(async () => null) }));

import {
    ComputeComponentFingerprintAsync,
    ComputeDashboardFingerprintAsync,
    ComputeQueryFingerprintAsync,
    ComputeUserViewFingerprintAsync,
} from '@memberjunction/core-entities';
import { MJDashboardEntityServer } from '../custom/MJDashboardEntityServer.server';
import { MJComponentEntityServer } from '../custom/MJComponentEntityServer.server';
import { MJUserViewEntityServer } from '../custom/MJUserViewEntityServer.server';
import { MJQueryEntityServer } from '../custom/MJQueryEntityServer.server';

const PENDING = { ApprovedByUserID: null, ApprovedAt: null, ApprovedFingerprint: null };

function create<T extends object>(cls: { prototype: T }): T {
    return Reflect.construct(cls as unknown as new () => T, []);
}

beforeEach(() => {
    db.stored = null;
    db.readFails = false;
    db.querySQLs = [];
    db.queryParameters = [];
    db.views = [];
    writes.length = 0;
    saveOptions.length = 0;
});

describe('MJDashboardEntityServer', () => {
    it('an approving save writes the approver, the time and the fingerprint of the definition, once', async () => {
        db.stored = { ApprovalStatus: 'Pending', ...PENDING };
        const dashboard = create(MJDashboardEntityServer);
        expect(await dashboard.Save()).toBe(true);
        expect(writes).toHaveLength(1);
        expect(writes[0].ApprovedByUserID).toBe('approver-1');
        expect(writes[0].ApprovedFingerprint).toBe(await ComputeDashboardFingerprintAsync(dashboard));
        expect(writes[0].ApprovedAt).not.toEqual(new Date('2030-01-01T00:00:00.000Z'));
    });

    it('any other save writes the stored approval back over the client values', async () => {
        db.stored = { ApprovalStatus: 'Approved', ApprovedByUserID: 'original', ApprovedAt: '2026-09-01T10:00:00.000Z', ApprovedFingerprint: 'fp-d1' };
        expect(await create(MJDashboardEntityServer).Save()).toBe(true);
        expect(writes).toEqual([{ ApprovedByUserID: 'original', ApprovedAt: new Date('2026-09-01T10:00:00.000Z'), ApprovedFingerprint: 'fp-d1' }]);
    });

    it('writes nothing when the stored approval cannot be read', async () => {
        db.readFails = true;
        const dashboard = create(MJDashboardEntityServer);
        expect(await dashboard.Save()).toBe(false);
        expect(writes).toHaveLength(0);
        expect(dashboard.RegisterResultHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({ Success: false }));
    });

    it('a ReplayOnly save reads nothing and stamps nothing', async () => {
        await create(MJDashboardEntityServer).Save({ ReplayOnly: true });
        expect(db.views).toHaveLength(0);
        expect(writes[0].ApprovedFingerprint).toBe('forged-fingerprint'); // replay writes nothing to the database
    });
});

describe('MJComponentEntityServer', () => {
    it('an approving save writes the fingerprint of the specification and version with the row', async () => {
        db.stored = { ApprovalStatus: 'Pending', ...PENDING };
        const component = create(MJComponentEntityServer);
        expect(await component.Save()).toBe(true);
        expect(writes).toHaveLength(1);
        expect(writes[0]).toMatchObject({ ApprovedByUserID: 'approver-1', ApprovedFingerprint: await ComputeComponentFingerprintAsync(component) });
    });
});

describe('MJUserViewEntityServer', () => {
    it('stamps the fingerprint after the write, so it covers the WhereClause as stored, and forwards EntitySaveOptions', async () => {
        db.stored = { ApprovalStatus: 'Pending', ...PENDING };
        const view = create(MJUserViewEntityServer);
        const opts: EntitySaveOptions = { SkipEntityActions: true, SkipRecordChanges: true } as EntitySaveOptions;
        expect(await view.Save(opts)).toBe(true);
        expect(writes).toHaveLength(2);
        expect(saveOptions).toEqual([opts, opts]);
        expect(writes[0]).toMatchObject({ ApprovedByUserID: 'approver-1', ApprovedFingerprint: null });
        expect(view.WhereClause).toBe("Status='Active'");
        expect(writes[1].ApprovedFingerprint).toBe(await ComputeUserViewFingerprintAsync(view));
    });

    it('catches and logs an exception during post-save fingerprint stamping without throwing from Save()', async () => {
        db.stored = { ApprovalStatus: 'Pending', ...PENDING };
        const view = create(MJUserViewEntityServer);
        Object.defineProperty(view, 'WhereClause', {
            get() { throw new Error('unexpected getter throw'); },
            set() { /* ignore */ },
        });
        expect(await view.Save()).toBe(true);
        expect(writes).toHaveLength(1);
        expect(writes[0]).toMatchObject({ ApprovedByUserID: 'approver-1', ApprovedFingerprint: null });
    });
});

describe('MJQueryEntityServer', () => {
    it('stamps the fingerprint last, from the dialect and parameter rows read back from the database, and forwards EntitySaveOptions', async () => {
        db.stored = { Status: 'Pending', ...PENDING };
        db.querySQLs = [{ SQLDialectID: 'D-1', SQL: 'SELECT 1 /* pg */' }];
        db.queryParameters = [{ Name: 'ChapterID', Type: 'number', IsRequired: true, ValidationFilters: null, IsServerSet: true }];
        const query = create(MJQueryEntityServer);
        const opts: EntitySaveOptions = { SkipEntityActions: true, SkipEntityAIActions: true } as EntitySaveOptions;
        expect(await query.Save(opts)).toBe(true);

        expect(writes).toHaveLength(2);
        expect(saveOptions).toEqual([opts, opts]);
        expect(writes[0]).toMatchObject({ ApprovedByUserID: 'approver-1', ApprovedFingerprint: null });
        const rows = { SQLs: db.querySQLs as never[], Parameters: db.queryParameters as never[] };
        expect(writes[1].ApprovedFingerprint).toBe(await ComputeQueryFingerprintAsync(query, rows));
        const definitionReads = db.views.filter(v => v.EntityName !== 'MJ: Queries');
        expect(definitionReads.map(v => [v.EntityName, v.ExtraFilter, v.BypassCache])).toEqual([
            ['MJ: Query SQLs', "QueryID='rec-1'", true],
            ['MJ: Query Parameters', "QueryID='rec-1'", true],
        ]);
    });

    it('a save that does not approve keeps the stored approval and reads no definition rows', async () => {
        db.stored = { Status: 'Approved', ApprovedByUserID: 'original', ApprovedAt: null, ApprovedFingerprint: 'fp-d1' };
        expect(await create(MJQueryEntityServer).Save()).toBe(true);
        expect(writes).toEqual([{ ApprovedByUserID: 'original', ApprovedAt: null, ApprovedFingerprint: 'fp-d1' }]);
        expect(db.views.map(v => v.EntityName)).toEqual(['MJ: Queries']);
    });
});
