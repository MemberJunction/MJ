import type { DatabasePlatform, QueryDependencySpec, UserInfo } from '@memberjunction/core';
import type { QueryParameterDefinition } from '@memberjunction/query-processor';

/**
 * Minimal contract for queries flowing through composition. `MJQueryEntityExtended` satisfies it
 * structurally; an inline dependency of a transient query satisfies it through a plain object.
 */
export interface IComposableQuery {
    ID: string;
    Name: string;
    SQL: string | null;
    UsesTemplate: boolean | null;
    Reusable: boolean | null;
    Status: string | null;
    IsApproved: boolean;
    UserCanRun(user: UserInfo, _visited?: Set<string>): { canRun: boolean; deniedEntities: string[] };
    GetPlatformSQL(platform: DatabasePlatform): string;
}

/** A composition reference's target, as `{{query:"…"}}` names it. */
export interface CompositionPath {
    /** The category path and query name joined by `/`, as written. */
    readonly FullPath: string;
    /** The category path as written, `''` when the reference names no category. */
    readonly CategoryPath: string;
    /** The query name. */
    readonly Name: string;
}

/** A composition reference resolved to the query it names. */
export interface ResolvedComposition {
    readonly Query: IComposableQuery;
    /** Whether the query is an inline dependency of a transient query (no governance checks: the caller supplied it). */
    readonly IsInline: boolean;
    /** The query's own parameter definitions. */
    readonly ParameterDefinitions: ReadonlyArray<QueryParameterDefinition>;
    /** The inline dependencies visible inside the query. */
    readonly InlineDependencies: QueryDependencySpec[] | undefined;
}
