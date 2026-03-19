import { QueryParameterInfo, QueryInfo } from './queryInfo';
import { DatabasePlatform } from './platformSQL';

/**
 * Fully describes a query for execution without requiring database persistence.
 * Used as the common execution interface for both saved queries (via RunQuery)
 * and transient test queries (via TestQuerySQL).
 *
 * This is the "lower layer" data structure in the two-layer execution architecture:
 * - Upper layer (RunQuery): loads QueryInfo from DB, builds a spec, calls lower layer
 * - Upper layer (TestQuerySQL): caller provides spec directly, calls lower layer
 * - Lower layer: accepts this spec and runs composition → Nunjucks → execute
 */
export class QueryExecutionSpec {
    /** The raw SQL — may contain {{query:"..."}} and {{ param }} tokens */
    SQL: string;

    /** Parameter values for Nunjucks template substitution */
    Parameters?: Record<string, string>;

    /** Whether this query uses Nunjucks template syntax */
    UsesTemplate?: boolean;

    /**
     * Parameter definitions for validation.
     * For saved queries, populated from QueryInfo.Parameters.
     * For transient queries, optional — if omitted, parameters are passed through without validation.
     */
    ParameterDefinitions?: QueryParameterInfo[];

    /**
     * Inline dependency queries for composition resolution.
     * Recursive — each dependency can itself declare further dependencies.
     * When resolving {{query:"CategoryPath/QueryName"}}, the engine checks
     * this map first, then falls back to Metadata.Provider.Queries.
     */
    Dependencies?: QueryDependencySpec[];

    /** Max rows to return. Default: unlimited for saved queries, 100 for test queries. */
    MaxRows?: number;

    constructor(init?: Partial<QueryExecutionSpec>) {
        this.SQL = init?.SQL ?? '';
        if (init?.Parameters !== undefined) this.Parameters = init.Parameters;
        if (init?.UsesTemplate !== undefined) this.UsesTemplate = init.UsesTemplate;
        if (init?.ParameterDefinitions !== undefined) this.ParameterDefinitions = init.ParameterDefinitions;
        if (init?.Dependencies !== undefined) this.Dependencies = init.Dependencies;
        if (init?.MaxRows !== undefined) this.MaxRows = init.MaxRows;
    }

    /**
     * Creates a QueryExecutionSpec from a persisted QueryInfo object.
     * This is the bridge between the upper layer (saved queries) and the lower layer (spec execution).
     *
     * @param query - The saved query metadata
     * @param platform - Target database platform for SQL resolution
     * @param parameters - Optional parameter values for Nunjucks template substitution
     * @returns A fully populated QueryExecutionSpec ready for the lower-layer pipeline
     */
    public static FromQueryInfo(
        query: QueryInfo,
        platform: DatabasePlatform,
        parameters?: Record<string, string>
    ): QueryExecutionSpec {
        return new QueryExecutionSpec({
            SQL: query.GetPlatformSQL(platform),
            Parameters: parameters,
            UsesTemplate: query.UsesTemplate,
            ParameterDefinitions: query.Parameters,
            // Saved queries resolve deps from Metadata.Provider.Queries, not inline
            Dependencies: undefined,
        });
    }
}

/**
 * Describes an inline dependency query that can be referenced via
 * {{query:"CategoryPath/QueryName"}} composition tokens.
 * Recursive — each dependency can itself declare further dependencies.
 */
export interface QueryDependencySpec {
    /** Query name as referenced in the composition token */
    Name: string;

    /** Category path as referenced in the composition token (e.g., "/Analytics/Sales/") */
    CategoryPath: string;

    /** The raw SQL for this dependency */
    SQL: string;

    /** Whether this dependency uses Nunjucks template syntax */
    UsesTemplate?: boolean;

    /** Parameters for this dependency's Nunjucks templates */
    Parameters?: Record<string, string>;

    /** Parameter definitions for validation */
    ParameterDefinitions?: QueryParameterInfo[];

    /** Nested dependencies (recursive) */
    Dependencies?: QueryDependencySpec[];
}
