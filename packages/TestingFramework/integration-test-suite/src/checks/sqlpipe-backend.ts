/**
 * sqlpipe-backend.ts — how the SQL pipeline scenario matrix reaches the database: in-process on the
 * server provider, or over GraphQL through a running MJAPI.
 *
 * - Server: queries are saved as `MJQueryEntityServer` with extraction on; the oracle runs as plain
 *   SQL on the provider, and is described by the server's own catalog (see {@link OracleRunner}).
 * - Client: every write and read goes over the wire. The client cannot run SQL directly, so the
 *   oracle is saved as a plain query (no template, no composition) in the fixture category and run
 *   with no paging; its column description is the field rows the server extracted for it.
 */
import { RunQuery, RunView } from '@memberjunction/core';
import type { DatabasePlatform, UserInfo } from '@memberjunction/core';
import { QueryEngine } from '@memberjunction/core-entities';
import type {
    MJQueryDependencyEntity, MJQueryEntity, MJQueryEntityEntity, MJQueryFieldEntity, MJQueryParameterEntity,
} from '@memberjunction/core-entities';
import { createHash } from 'node:crypto';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { NewFixtureQuery, ReadQueryRows, RequireQueryDb } from './query-extraction-fixture';
import type { StoredQueryRows } from './query-extraction-fixture';
import { FixtureQuerySaveOptions } from './query-fixture-save-options';
import { OracleRunner } from './sqlpipe-oracle';
import type { DescribedColumn } from './sqlpipe-oracle';

/** What the matrix needs of a stored query. */
export interface SavedRecord {
    readonly ID: string;
    readonly ExtractionStatus: string | null;
    readonly ExtractionMessage: string | null;
}

/** A query the matrix saves. */
export interface SaveSpec {
    readonly Name: string;
    readonly SQL: string;
    readonly Reusable?: boolean;
    readonly Cached?: boolean;
}

export interface MatrixBackend {
    readonly Platform: DatabasePlatform;
    readonly Label: string;
    /** Saves a query (extraction on); `Record` null when the save was refused, with its message. */
    SaveQuery(categoryID: string, spec: SaveSpec): Promise<{ Record: SavedRecord | null; Message: string }>;
    /** Makes saved queries visible to composition and run-by-name lookups. */
    RefreshQueries(): Promise<void>;
    Rows(sql: string): Promise<Record<string, unknown>[]>;
    Describe(sql: string): Promise<DescribedColumn[]>;
    ReadRows(queryID: string): Promise<StoredQueryRows>;
    /** How many queries named `name` the category holds. */
    CountQueries(categoryID: string, name: string): Promise<number>;
}

/** In-process, on the server provider. */
export class ServerBackend implements MatrixBackend {
    readonly Label = 'server';
    private readonly oracle: OracleRunner;

    constructor(private readonly ctx: IntegrationCheckContext, readonly Platform: DatabasePlatform, private readonly bundle: string) {
        this.oracle = new OracleRunner(RequireQueryDb(ctx.Provider, bundle), ctx.User, Platform);
    }

    async SaveQuery(categoryID: string, spec: SaveSpec): Promise<{ Record: SavedRecord | null; Message: string }> {
        const record = await NewFixtureQuery(this.ctx, categoryID, { Name: spec.Name, SQL: spec.SQL, Reusable: spec.Reusable ?? false });
        if (spec.Cached) {
            record.CacheEnabled = true;
            record.CacheTTLMinutes = 5;
        }
        const saved = await record.Save(FixtureQuerySaveOptions());
        return { Record: saved ? record : null, Message: record.LatestResult?.CompleteMessage ?? '' };
    }

    async RefreshQueries(): Promise<void> {
        await QueryEngine.Instance.Config(true, this.ctx.User, this.ctx.Provider);
    }

    Rows(sql: string): Promise<Record<string, unknown>[]> {
        return this.oracle.Rows(sql);
    }

    Describe(sql: string): Promise<DescribedColumn[]> {
        return this.oracle.Describe(sql);
    }

    ReadRows(queryID: string): Promise<StoredQueryRows> {
        return ReadQueryRows(this.ctx, this.bundle, queryID);
    }

    async CountQueries(categoryID: string, name: string): Promise<number> {
        return countQueries(this.ctx.User, categoryID, name);
    }
}

async function countQueries(user: UserInfo, categoryID: string, name: string): Promise<number> {
    const result = await new RunView().RunView({
        EntityName: 'MJ: Queries', ExtraFilter: `CategoryID='${categoryID}' AND Name='${name.replace(/'/g, "''")}'`, ResultType: 'count_only', BypassCache: true,
    }, user);
    return result.TotalRowCount;
}

/** Over GraphQL. */
export class ClientBackend implements MatrixBackend {
    readonly Label = 'client';
    private readonly oracleQueries = new Map<string, string>();
    private readonly oracleRows = new Map<string, Record<string, unknown>[]>();
    /** The category the oracle queries are saved in (the fixture's). */
    OracleCategoryID = '';

    constructor(private readonly ctx: IntegrationCheckContext, readonly Platform: DatabasePlatform, private readonly prefix: string) {}

    async SaveQuery(categoryID: string, spec: SaveSpec): Promise<{ Record: SavedRecord | null; Message: string }> {
        const record = await this.ctx.Provider.GetEntityObject<MJQueryEntity>('MJ: Queries', this.ctx.User);
        record.NewRecord();
        record.Name = spec.Name;
        record.CategoryID = categoryID;
        record.SQL = spec.SQL;
        record.Status = 'Approved';
        record.Reusable = spec.Reusable ?? false;
        if (spec.Cached) {
            record.CacheEnabled = true;
            record.CacheTTLMinutes = 5;
        }
        const saved = await record.Save(FixtureQuerySaveOptions());
        return { Record: saved ? record : null, Message: record.LatestResult?.CompleteMessage ?? '' };
    }

    async RefreshQueries(): Promise<void> {
        await QueryEngine.Instance.Config(true, this.ctx.User, this.ctx.Provider);
    }

    /** The oracle saved as a plain query, once per text. */
    private async oracleQuery(sql: string): Promise<string> {
        const known = this.oracleQueries.get(sql);
        if (known) return known;
        const name = `${this.prefix} oracle ${createHash('sha256').update(sql).digest('hex').slice(0, 12)}`;
        const saved = await this.SaveQuery(this.OracleCategoryID, { Name: name, SQL: sql });
        if (!saved.Record) throw new Error(`the oracle query could not be saved: ${saved.Message.slice(0, 300)}`);
        this.oracleQueries.set(sql, saved.Record.ID);
        return saved.Record.ID;
    }

    async Rows(sql: string): Promise<Record<string, unknown>[]> {
        const cached = this.oracleRows.get(sql);
        if (cached) return cached;
        const result = await new RunQuery().RunQuery({ QueryID: await this.oracleQuery(sql) }, this.ctx.User);
        if (!result.Success) throw new Error(`the oracle query failed: ${result.ErrorMessage}`);
        this.oracleRows.set(sql, result.Results);
        return result.Results;
    }

    async Describe(sql: string): Promise<DescribedColumn[]> {
        const rows = await this.ReadRows(await this.oracleQuery(sql));
        return rows.Fields.map(f => ({ Name: f.Name, Type: f.SQLFullType ?? '', Nullable: f.IsNullable }));
    }

    async ReadRows(queryID: string): Promise<StoredQueryRows> {
        const filter = `QueryID='${queryID}'`;
        const [fields, parameters, entities, dependencies] = await new RunView().RunViews([
            { EntityName: 'MJ: Query Fields', ExtraFilter: filter, OrderBy: 'Sequence', ResultType: 'entity_object', BypassCache: true },
            { EntityName: 'MJ: Query Parameters', ExtraFilter: filter, OrderBy: 'Name', ResultType: 'entity_object', BypassCache: true },
            { EntityName: 'MJ: Query Entities', ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true },
            { EntityName: 'MJ: Query Dependencies', ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true },
        ], this.ctx.User);
        for (const r of [fields, parameters, entities, dependencies]) if (!r.Success) throw new Error(`reading the child rows of ${queryID} failed: ${r.ErrorMessage}`);
        return {
            Fields: fields.Results as MJQueryFieldEntity[], Parameters: parameters.Results as MJQueryParameterEntity[],
            Entities: entities.Results as MJQueryEntityEntity[], Dependencies: dependencies.Results as MJQueryDependencyEntity[],
        };
    }

    async CountQueries(categoryID: string, name: string): Promise<number> {
        return countQueries(this.ctx.User, categoryID, name);
    }
}
