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
        /** Whether the context user holds `Queries: Approve`. */
        canApproveQueries: true,
        /** The (user, provider) each `UserCanApproveQueries` call was given. */
        approveChecks: [] as unknown[][],
        /** Whether the context user has Update on MJ: Queries (the UI role does not). */
        canUpdateQueries: true,
        /** Rows a read of MJ: Query Dependencies returns (queries that compose this one). */
        dependents: [] as Array<Record<string, unknown>>,
        /** Rows a read of MJ: Lists returns (lists sourced from this query). */
        sourcedLists: [] as Array<Record<string, unknown>>,
        /** The IDs of the records deleted. */
        deletes: [] as string[],
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
        public DefinitionFingerprint: string | null = null;
        /** The two fingerprints as last written, so Dirty can tell whether a stamp changed either. */
        private written: { Approved: string | null; Definition: string | null } | null = null;
        public get Dirty(): boolean {
            return !this.written || this.written.Approved !== this.ApprovedFingerprint || this.written.Definition !== this.DefinitionFingerprint;
        }
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
                    const rowsFor = (entityName: string) => {
                        switch (entityName) {
                            case 'MJ: Query SQLs': return db.querySQLs;
                            case 'MJ: Query Dependencies': return db.dependents;
                            case 'MJ: Lists': return db.sourcedLists;
                            default: return db.queryParameters;
                        }
                    };
                    return params.map(p => ({ Success: true, Results: rowsFor(p.EntityName ?? ''), ErrorMessage: '' }));
                },
            };
        }
        public GetFieldByName(): { Dirty: boolean } { return { Dirty: false }; }
        public FieldIsDirty(): boolean { return false; }
        public async GenerateEmbeddingsByFieldName(): Promise<boolean> { return true; }
        public async Delete(): Promise<boolean> { db.deletes.push(this.ID); return true; }
        public async Save(options?: EntitySaveOptions): Promise<boolean> {
            writes.push({
                ApprovedByUserID: this.ApprovedByUserID,
                ApprovedAt: this.ApprovedAt,
                ApprovedFingerprint: this.ApprovedFingerprint,
                DefinitionFingerprint: this.DefinitionFingerprint,
            });
            this.written = { Approved: this.ApprovedFingerprint, Definition: this.DefinitionFingerprint };
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
        /** The query's declared child collections, empty: this save declares no children. */
        public DeclaredParameters = { Items: [] };
        public DeclaredFields = { Items: [] };
        public DeclaredEntities = { Items: [] };
        public EntityInfo = { Name: 'MJ: Queries', GetUserPermisions: () => ({ CanUpdate: db.canUpdateQueries }) };
        public Status = 'Approved';
        public SQL = 'SELECT 1';
        public UsesTemplate = false;
        public ExternalDataSourceID: string | null = null;
        public Description = 'kept';
        public CacheValidationSQL: string | null = null;
        public OwnerUserID: string | null = 'approver-1';
    }

    return {
        ...actual,
        UserCanApproveQueries: (...args: unknown[]) => {
            db.approveChecks.push(args);
            return db.canApproveQueries;
        },
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
    QUERY_DELETE_IN_USE_REFUSAL,
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
    db.canApproveQueries = true;
    db.approveChecks = [];
    db.canUpdateQueries = true;
    db.dependents = [];
    db.sourcedLists = [];
    db.deletes = [];
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
        expect(writes).toEqual([{ ApprovedByUserID: 'original', ApprovedAt: new Date('2026-09-01T10:00:00.000Z'), ApprovedFingerprint: 'fp-d1', DefinitionFingerprint: null }]);
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
        const fingerprint = await ComputeUserViewFingerprintAsync(view);
        expect(writes[1]).toMatchObject({ ApprovedFingerprint: fingerprint, DefinitionFingerprint: fingerprint });
    });

    it('a save that does not approve still stamps DefinitionFingerprint, and keeps the stored approval', async () => {
        db.stored = { ApprovalStatus: 'Approved', ApprovedByUserID: 'original', ApprovedAt: null, ApprovedFingerprint: 'fp-v1' };
        const view = create(MJUserViewEntityServer);
        expect(await view.Save()).toBe(true);
        expect(writes).toHaveLength(2);
        expect(writes[1]).toMatchObject({ ApprovedFingerprint: 'fp-v1', DefinitionFingerprint: await ComputeUserViewFingerprintAsync(view) });
    });

    it('writes once when the stored DefinitionFingerprint is already current', async () => {
        db.stored = { ApprovalStatus: 'Approved', ApprovedByUserID: 'original', ApprovedAt: null, ApprovedFingerprint: 'fp-v1' };
        const view = create(MJUserViewEntityServer);
        expect(await view.Save()).toBe(true);
        writes.length = 0;
        expect(await view.Save()).toBe(true);
        expect(writes).toHaveLength(1);
    });

    it('a ReplayOnly save stamps nothing', async () => {
        const view = create(MJUserViewEntityServer);
        expect(await view.Save({ ReplayOnly: true } as EntitySaveOptions)).toBe(true);
        expect(writes).toHaveLength(1);
        expect(writes[0].DefinitionFingerprint).toBeNull();
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
        const fingerprint = await ComputeQueryFingerprintAsync(query, rows);
        expect(writes[1]).toMatchObject({ ApprovedFingerprint: fingerprint, DefinitionFingerprint: fingerprint });
        const definitionReads = db.views.filter(v => v.EntityName !== 'MJ: Queries');
        expect(definitionReads.map(v => [v.EntityName, v.ExtraFilter, v.BypassCache])).toEqual([
            ['MJ: Query SQLs', "QueryID='rec-1'", true],
            ['MJ: Query Parameters', "QueryID='rec-1'", true],
        ]);
    });

    it('a save that does not approve keeps the stored approval and stamps DefinitionFingerprint from the stored rows', async () => {
        db.stored = { Status: 'Approved', ApprovedByUserID: 'original', ApprovedAt: null, ApprovedFingerprint: 'fp-d1' };
        db.querySQLs = [{ SQLDialectID: 'D-1', SQL: 'SELECT 1 /* pg */' }];
        const query = create(MJQueryEntityServer);
        expect(await query.Save()).toBe(true);
        const rows = { SQLs: db.querySQLs as never[], Parameters: db.queryParameters as never[] };
        expect(writes).toEqual([
            { ApprovedByUserID: 'original', ApprovedAt: null, ApprovedFingerprint: 'fp-d1', DefinitionFingerprint: null },
            { ApprovedByUserID: 'original', ApprovedAt: null, ApprovedFingerprint: 'fp-d1', DefinitionFingerprint: await ComputeQueryFingerprintAsync(query, rows) },
        ]);
        expect(db.views.map(v => v.EntityName)).toEqual(['MJ: Queries', 'MJ: Query SQLs', 'MJ: Query Parameters']);
    });

    it('refuses an approving save, writing nothing, when the user does not hold Queries: Approve (#6746)', async () => {
        db.stored = { Status: 'Pending', ...PENDING };
        db.canApproveQueries = false;
        const query = create(MJQueryEntityServer);
        // The authorizations come from the query's own provider, not the process-global one.
        const provider = { RunView: vi.fn(), GetEntityObject: vi.fn(), Authorizations: [] };
        Object.defineProperty(query, 'ProviderToUse', { value: provider });
        expect(await query.Save()).toBe(false);
        expect(writes).toHaveLength(0);
        expect(db.approveChecks).toEqual([[{ ID: 'approver-1' }, provider]]);
        expect(query.RegisterResultHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({
            Success: false,
            Message: expect.stringContaining("needs the 'Queries: Approve' authorization"),
        }));
    });

    it('skips the fingerprint stamp, quietly, for a user who may create queries but not update them', async () => {
        db.stored = { Status: 'Pending', ...PENDING };
        db.canApproveQueries = false;
        db.canUpdateQueries = false;
        const query = create(MJQueryEntityServer);
        query.Status = 'Pending';
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            expect(await query.Save()).toBe(true);
            expect(writes).toHaveLength(1);
            expect(errors).not.toHaveBeenCalled();
        } finally {
            errors.mockRestore();
        }
    });

    it('an approving save by a holder without Update still stamps the approved fingerprint', async () => {
        db.stored = { Status: 'Pending', ...PENDING };
        db.canUpdateQueries = false;
        const query = create(MJQueryEntityServer);
        expect(await query.Save()).toBe(true);
        expect(writes).toHaveLength(2);
        expect(writes[1].ApprovedFingerprint).not.toBeNull();
    });

    describe('CacheValidationSQL, which a cache check runs as written', () => {
        /** A saved query whose CacheValidationSQL this save sets (or, with `dirty` false, leaves as stored). */
        function withValidationSQL(text: string | null, dirty = true): MJQueryEntityServer {
            const query = create(MJQueryEntityServer);
            query.Status = 'Pending';
            query.CacheValidationSQL = text;
            Object.defineProperty(query, 'FieldIsDirty', { value: (name: string) => dirty && name === 'CacheValidationSQL' });
            return query;
        }

        it('refuses it, writing nothing, from a user who does not hold Queries: Approve', async () => {
            db.stored = { Status: 'Pending', ...PENDING };
            db.canApproveQueries = false;
            const query = withValidationSQL('SELECT MAX(__mj_UpdatedAt) AS MaxUpdatedAt, COUNT(*) AS TotalRows FROM __mj.User');
            expect(await query.Save()).toBe(false);
            expect(writes).toHaveLength(0);
            expect(query.RegisterResultHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({
                Success: false,
                Message: expect.stringContaining("cache validation SQL needs the 'Queries: Approve' authorization"),
            }));
        });

        it('refuses it on a new query, whose fields are all written, from a user who does not hold Queries: Approve', async () => {
            db.canApproveQueries = false;
            const query = withValidationSQL('SELECT 1 AS TotalRows', false);
            query.IsSaved = false;
            expect(await query.Save()).toBe(false);
            expect(writes).toHaveLength(0);
        });

        it('leaves an unchanged one alone when a user who does not hold Queries: Approve edits something else', async () => {
            db.stored = { Status: 'Pending', ...PENDING };
            db.canApproveQueries = false;
            expect(await withValidationSQL('SELECT 1 AS TotalRows', false).Save()).toBe(true);
        });

        it('accepts it from a holder', async () => {
            db.stored = { Status: 'Pending', ...PENDING };
            expect(await withValidationSQL('SELECT 1 AS TotalRows').Save()).toBe(true);
        });

        it('lets anyone clear it', async () => {
            db.stored = { Status: 'Pending', ...PENDING };
            db.canApproveQueries = false;
            expect(await withValidationSQL(null).Save()).toBe(true);
        });
    });

    /**
     * A query whose listed fields this save changes, with `storedStatus` as the Status it was loaded
     * with (what `EntityField.OldValue` reports).
     */
    function editedQuery(dirtyFields: string[], storedStatus = 'Approved'): MJQueryEntityServer {
        const query = create(MJQueryEntityServer);
        // Extraction (a new query, or a changed SQL) is covered elsewhere; this harness does not model it.
        query.ExtractionOverride = 'Skip';
        Object.defineProperty(query, 'FieldIsDirty', { value: (name: string) => dirtyFields.includes(name) });
        Object.defineProperty(query, 'GetFieldByName', {
            value: (name: string) => ({ Dirty: dirtyFields.includes(name), OldValue: name === 'Status' ? storedStatus : undefined }),
        });
        return query;
    }

    describe('OwnerUserID', () => {
        it('a new query from a user who does not hold Queries: Approve is theirs, whatever owner it names', async () => {
            db.canApproveQueries = false;
            const query = create(MJQueryEntityServer);
            query.ExtractionOverride = 'Skip';
            query.IsSaved = false;
            query.Status = 'Pending';
            query.OwnerUserID = 'someone-else';
            expect(await query.Save()).toBe(true);
            expect(query.OwnerUserID).toBe('approver-1');
        });

        it('a new query with no owner is owned by the user saving it', async () => {
            const query = create(MJQueryEntityServer);
            query.ExtractionOverride = 'Skip';
            query.IsSaved = false;
            query.OwnerUserID = null;
            expect(await query.Save()).toBe(true);
            expect(query.OwnerUserID).toBe('approver-1');
        });

        it('a holder may name another owner for a new query', async () => {
            const query = create(MJQueryEntityServer);
            query.ExtractionOverride = 'Skip';
            query.IsSaved = false;
            query.OwnerUserID = 'someone-else';
            expect(await query.Save()).toBe(true);
            expect(query.OwnerUserID).toBe('someone-else');
        });

        it('refuses, writing nothing, a change of owner from a user who does not hold Queries: Approve', async () => {
            db.stored = { Status: 'Pending', ...PENDING };
            db.canApproveQueries = false;
            const query = editedQuery(['OwnerUserID'], 'Pending');
            query.Status = 'Pending';
            query.OwnerUserID = 'someone-else';
            expect(await query.Save()).toBe(false);
            expect(writes).toHaveLength(0);
            expect(query.RegisterResultHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({
                Success: false,
                Message: expect.stringContaining("Changing who owns a query needs the 'Queries: Approve' authorization"),
            }));
        });

        it('lets a holder reassign a query', async () => {
            db.stored = { Status: 'Pending', ...PENDING };
            const query = editedQuery(['OwnerUserID'], 'Pending');
            query.Status = 'Pending';
            query.OwnerUserID = 'someone-else';
            expect(await query.Save()).toBe(true);
            expect(query.OwnerUserID).toBe('someone-else');
        });
    });

    describe('a change to an Approved query\'s definition', () => {
        it.each(['SQL', 'UsesTemplate', 'ExternalDataSourceID'])('from a user who does not hold Queries: Approve saves it as Pending (%s)', async (field) => {
            db.stored = { Status: 'Approved', ApprovedByUserID: 'original', ApprovedAt: null, ApprovedFingerprint: 'fp-d1' };
            db.canApproveQueries = false;
            const query = editedQuery([field]);
            expect(await query.Save()).toBe(true);
            expect(query.Status).toBe('Pending');
            // The stored approval columns are kept; the status no longer claims them.
            expect(writes[0]).toMatchObject({ ApprovedByUserID: 'original', ApprovedFingerprint: 'fp-d1' });
        });

        it.each(['Name', 'CategoryID', 'Reusable'])('from a user who does not hold Queries: Approve saves it as Pending when it changes how others compose it (%s)', async (field) => {
            db.stored = { Status: 'Approved', ApprovedByUserID: 'original', ApprovedAt: null, ApprovedFingerprint: 'fp-d1' };
            db.canApproveQueries = false;
            const query = editedQuery([field]);
            expect(await query.Save()).toBe(true);
            expect(query.Status).toBe('Pending');
        });

        it('from a holder stays Approved', async () => {
            db.stored = { Status: 'Approved', ApprovedByUserID: 'original', ApprovedAt: null, ApprovedFingerprint: 'fp-d1' };
            const query = editedQuery(['SQL']);
            expect(await query.Save()).toBe(true);
            expect(query.Status).toBe('Approved');
        });

        it('leaves an edit that does not touch the definition Approved', async () => {
            db.stored = { Status: 'Approved', ApprovedByUserID: 'original', ApprovedAt: null, ApprovedFingerprint: 'fp-d1' };
            db.canApproveQueries = false;
            const query = editedQuery(['Description']);
            expect(await query.Save()).toBe(true);
            expect(query.Status).toBe('Approved');
        });

        it('still refuses approving a changed draft, rather than quietly saving it as Pending', async () => {
            db.stored = { Status: 'Pending', ...PENDING };
            db.canApproveQueries = false;
            const query = editedQuery(['SQL'], 'Pending');
            expect(await query.Save()).toBe(false);
            expect(writes).toHaveLength(0);
        });
    });

    describe('Delete, which removes the dependency rows of composing queries and unlinks sourced lists', () => {
        const deleteRefusal = (query: MJQueryEntityServer) =>
            (query.RegisterResultHistoryEntry as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => (c[0] as { Message: string; Type: string }));

        it('refuses a user who does not hold Queries: Approve when another query composes it', async () => {
            db.canApproveQueries = false;
            db.dependents = [{ ID: 'dep-1' }];
            const query = create(MJQueryEntityServer);
            expect(await query.Delete()).toBe(false);
            expect(db.deletes).toEqual([]);
            expect(deleteRefusal(query)).toEqual([expect.objectContaining({ Type: 'delete', Message: QUERY_DELETE_IN_USE_REFUSAL })]);
        });

        it('refuses that user when another user\'s list is sourced from it', async () => {
            db.canApproveQueries = false;
            db.sourcedLists = [{ ID: 'list-1' }];
            const query = create(MJQueryEntityServer);
            expect(await query.Delete()).toBe(false);
            expect(db.deletes).toEqual([]);
        });

        it('deletes for that user when nothing else uses it, counting only other users\' lists', async () => {
            db.canApproveQueries = false;
            const query = create(MJQueryEntityServer);
            expect(await query.Delete()).toBe(true);
            expect(db.deletes).toEqual(['rec-1']);
            const lists = db.views.find(v => v.EntityName === 'MJ: Lists');
            expect(lists?.ExtraFilter).toBe("SourceQueryID='rec-1' AND UserID<>'approver-1'");
            const dependents = db.views.find(v => v.EntityName === 'MJ: Query Dependencies');
            expect(dependents?.ExtraFilter).toBe("DependsOnQueryID='rec-1' AND QueryID<>'rec-1'");
        });

        it('deletes for a holder without checking what uses it', async () => {
            db.dependents = [{ ID: 'dep-1' }];
            db.sourcedLists = [{ ID: 'list-1' }];
            const query = create(MJQueryEntityServer);
            expect(await query.Delete()).toBe(true);
            expect(db.deletes).toEqual(['rec-1']);
            expect(db.views).toEqual([]);
        });
    });

    it('still saves a draft for a user who does not hold Queries: Approve', async () => {
        db.stored = { Status: 'Pending', ...PENDING };
        db.canApproveQueries = false;
        const query = create(MJQueryEntityServer);
        query.Status = 'Pending';
        expect(await query.Save()).toBe(true);
        expect(writes[0]).toMatchObject({ ApprovedByUserID: null, ApprovedFingerprint: null });
    });
});
