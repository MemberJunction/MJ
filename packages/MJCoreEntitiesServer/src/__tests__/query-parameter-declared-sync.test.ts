/**
 * Regression tests for declared (DetectionMethod = 'Manual') query children.
 *
 * A query's parameters can be authored declaratively — a person defining them in the UI, or
 * `mj sync push` declaring MJ: Query Parameters rows under a MJ: Queries record. Extraction
 * then runs over the same query and must reconcile with those rows rather than assert its own
 * values over them: 'Manual' is the DetectionMethod column's own default and means the row was
 * authored deliberately.
 *
 * Drives the REAL SyncParameters/SyncEntities from `custom/query-extraction/sync` against an
 * in-memory table that enforces UQ_QueryParameter_QueryID_Name, so the delete/update deltas are
 * exercised exactly as the pipeline computes them.
 *
 * See MemberJunction/MJ#4545.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, IRunViewProvider, UserInfo } from '@memberjunction/core';
import type { MJQueryParameterEntity } from '@memberjunction/core-entities';
import { SyncParameters } from '../custom/query-extraction/sync';
import type { ExtractedParameter } from '../custom/query-extraction/types';

const QUERY_ID = '11111111-1111-1111-1111-111111111111';
const DECLARED_PARAM_ID = '22222222-2222-2222-2222-222222222222';

// ═══════════════════════════════════════════════════
// Test helpers — an in-memory __mj.QueryParameter that
// enforces the real unique constraint, plus a stub
// entity carrying only the fields the sync stage reads
// and writes. `Pick<>` keeps the stub honest against
// the generated entity class.
// ═══════════════════════════════════════════════════

type QueryParameterShape = Pick<
    MJQueryParameterEntity,
    'ID' | 'QueryID' | 'Name' | 'Type' | 'IsRequired' | 'DefaultValue' | 'Description' | 'SampleValue' | 'DetectionMethod'
>;

class FakeQueryParameterTable {
    public rows: QueryParameterShape[] = [];
    private sequence = 0;

    public NewID(): string {
        this.sequence++;
        return `aaaaaaaa-0000-0000-0000-${String(this.sequence).padStart(12, '0')}`;
    }

    /** Insert-or-update, rejecting a second row with the same (QueryID, Name). */
    public Upsert(row: QueryParameterShape): void {
        const clash = this.rows.find(
            r => r.QueryID === row.QueryID && r.Name.toLowerCase() === row.Name.toLowerCase() && r.ID !== row.ID
        );
        if (clash) {
            throw new Error(
                `Violation of UNIQUE KEY constraint 'UQ_QueryParameter_QueryID_Name'. ` +
                `The duplicate key value is (${row.QueryID}, ${row.Name}).`
            );
        }
        const index = this.rows.findIndex(r => r.ID === row.ID);
        if (index >= 0) this.rows[index] = { ...row };
        else this.rows.push({ ...row });
    }

    public Remove(id: string): void {
        this.rows = this.rows.filter(r => r.ID !== id);
    }

    public Find(name: string): QueryParameterShape | undefined {
        return this.rows.find(r => r.Name.toLowerCase() === name.toLowerCase());
    }
}

class StubQueryParameterEntity implements QueryParameterShape {
    public ID = '';
    public QueryID = '';
    public Name = '';
    public Type: MJQueryParameterEntity['Type'] = 'string';
    public IsRequired = false;
    public DefaultValue: string | null = null;
    public Description: string | null = null;
    public SampleValue: string | null = null;
    public DetectionMethod: MJQueryParameterEntity['DetectionMethod'] = 'AI';

    constructor(private table: FakeQueryParameterTable, private persisted: boolean) {}

    public async Save(): Promise<boolean> {
        if (!this.persisted) {
            if (!this.ID) this.ID = this.table.NewID();
            this.persisted = true;
        }
        this.table.Upsert({
            ID: this.ID,
            QueryID: this.QueryID,
            Name: this.Name,
            Type: this.Type,
            IsRequired: this.IsRequired,
            DefaultValue: this.DefaultValue,
            Description: this.Description,
            SampleValue: this.SampleValue,
            DetectionMethod: this.DetectionMethod,
        });
        return true;
    }

    public async Delete(): Promise<boolean> {
        this.table.Remove(this.ID);
        return true;
    }
}

function buildProviders(table: FakeQueryParameterTable): {
    metadataProvider: IMetadataProvider;
    runViewProvider: IRunViewProvider;
} {
    const metadataProvider = {
        Entities: [],
        GetEntityObject: async () => new StubQueryParameterEntity(table, false),
    } as unknown as IMetadataProvider;

    const runViewProvider = {
        RunView: async (params: { EntityName: string }) => {
            if (params.EntityName !== 'MJ: Query Parameters') return { Success: true, Results: [] };
            const results = table.rows
                .filter(r => r.QueryID === QUERY_ID)
                .map(r => Object.assign(new StubQueryParameterEntity(table, true), r));
            return { Success: true, Results: results };
        },
    } as unknown as IRunViewProvider;

    return { metadataProvider, runViewProvider };
}

const CONTEXT_USER = { ID: 'user-1' } as UserInfo;

function extracted(overrides?: Partial<ExtractedParameter>): ExtractedParameter {
    return {
        name: 'CompanyIDs',
        type: 'array',
        isRequired: true,
        description: 'AI-generated description',
        usage: [],
        defaultValue: null,
        sampleValue: "['abc']",
        ...overrides,
    };
}

function declaredRow(): QueryParameterShape {
    return {
        ID: DECLARED_PARAM_ID,
        QueryID: QUERY_ID,
        Name: 'CompanyIDs',
        Type: 'array',
        IsRequired: true,
        DefaultValue: null,
        Description: 'Company IDs to filter on',
        SampleValue: "['11111111-1111-1111-1111-111111111111']",
        DetectionMethod: 'Manual',
    };
}

describe('SyncParameters — declared parameters are authoritative', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('leaves every authored attribute of a Manual row alone', async () => {
        const table = new FakeQueryParameterTable();
        table.rows.push(declaredRow());
        const { metadataProvider, runViewProvider } = buildProviders(table);

        await SyncParameters(QUERY_ID, [extracted()], CONTEXT_USER, metadataProvider, runViewProvider, true);

        expect(table.rows).toHaveLength(1);
        const row = table.rows[0];
        expect(row.ID).toBe(DECLARED_PARAM_ID);
        expect(row.DetectionMethod).toBe('Manual');
        expect(row.Description).toBe('Company IDs to filter on');
        expect(row.SampleValue).toBe("['11111111-1111-1111-1111-111111111111']");
    });

    it('does not insert a second row for a parameter a Manual row already declares', async () => {
        const table = new FakeQueryParameterTable();
        table.rows.push(declaredRow());
        const { metadataProvider, runViewProvider } = buildProviders(table);

        // A duplicate INSERT would throw UQ_QueryParameter_QueryID_Name from the fake table.
        await expect(
            SyncParameters(QUERY_ID, [extracted()], CONTEXT_USER, metadataProvider, runViewProvider, true)
        ).resolves.toBeUndefined();
        expect(table.rows).toHaveLength(1);
    });

    it('keeps a Manual row the SQL no longer references, and says so', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const table = new FakeQueryParameterTable();
        table.rows.push(declaredRow());
        const { metadataProvider, runViewProvider } = buildProviders(table);

        await SyncParameters(
            QUERY_ID, [extracted({ name: 'SomethingElse' })], CONTEXT_USER, metadataProvider, runViewProvider, true
        );

        expect(table.Find('CompanyIDs')).toBeDefined();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('CompanyIDs'));
    });

    it('still removes an AI row the SQL no longer references', async () => {
        const table = new FakeQueryParameterTable();
        table.rows.push({ ...declaredRow(), DetectionMethod: 'AI' });
        const { metadataProvider, runViewProvider } = buildProviders(table);

        await SyncParameters(
            QUERY_ID, [extracted({ name: 'SomethingElse' })], CONTEXT_USER, metadataProvider, runViewProvider, true
        );

        expect(table.Find('CompanyIDs')).toBeUndefined();
        expect(table.Find('SomethingElse')).toBeDefined();
    });

    it('still updates an AI row from freshly extracted values', async () => {
        const table = new FakeQueryParameterTable();
        table.rows.push({ ...declaredRow(), DetectionMethod: 'AI', Description: 'stale' });
        const { metadataProvider, runViewProvider } = buildProviders(table);

        await SyncParameters(QUERY_ID, [extracted()], CONTEXT_USER, metadataProvider, runViewProvider, true);

        expect(table.Find('CompanyIDs')?.Description).toBe('AI-generated description');
    });

    it('creates an extraction-owned row when nothing declares the parameter', async () => {
        const table = new FakeQueryParameterTable();
        const { metadataProvider, runViewProvider } = buildProviders(table);

        await SyncParameters(QUERY_ID, [extracted()], CONTEXT_USER, metadataProvider, runViewProvider, true);

        expect(table.rows).toHaveLength(1);
        expect(table.rows[0].DetectionMethod).toBe('AI');
    });
});
