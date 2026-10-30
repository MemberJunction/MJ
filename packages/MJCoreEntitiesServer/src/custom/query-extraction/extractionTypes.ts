import type { DatabasePlatform, EntityInfo, QueryDependencySpec, UserInfo } from "@memberjunction/core";
import type { CompositionCandidate } from "./compositionTargets";
import type { DescribeStatementResult } from "@memberjunction/generic-database-provider";

/**
 * What a query save does about extraction, set per save on the query entity
 * (`MJQueryEntityServer.ExtractionOverride`).
 *
 * - `Auto`: extract when the query is new or its SQL changed.
 * - `Skip`: do not extract on this save, even when the SQL changed. The save-time rules are not
 *   applied; the stored child rows, the Extraction columns and `UsesTemplate` stay as they are.
 * - `Force`: extract on this save even when the SQL did not change (a refresh).
 */
export type QueryExtractionOverride = 'Auto' | 'Skip' | 'Force';

/** The outcome of an extraction run, as stored in `MJ: Queries.ExtractionStatus`. */
export type QueryExtractionStatus = 'OK' | 'Warning' | 'Error' | 'Skipped';

/**
 * Which save-time rules apply: `Save` for a new or edited query (errors refuse the save),
 * `Refresh` for re-extracting a query whose SQL did not change (errors are recorded, never refused).
 */
export type QueryExtractionMode = 'Save' | 'Refresh';

/** A parameter type the `MJ: Query Parameters` table stores. */
export type QueryParameterType = 'string' | 'number' | 'date' | 'boolean' | 'array';

/**
 * A parameter row extraction knows about before it runs: a row the save declares, or a row
 * already stored. Its type, sample and server-set flag drive the renders that are described.
 */
export interface KnownQueryParameter {
    readonly Name: string;
    readonly Type: QueryParameterType;
    readonly IsRequired: boolean;
    readonly IsServerSet: boolean;
    readonly SampleValue: string | null;
    readonly DefaultValue: string | null;
    readonly ValidationFilters: string | null;
    /** Whether a person wrote the row (`DetectionMethod` `Manual`). */
    readonly IsAuthored: boolean;
}

/** Everything one extraction run reads. Independent of the entity object, so it can be tested alone. */
export interface QueryExtractionInput {
    /** The query's ID; `null` for a query not saved yet. */
    readonly QueryID: string | null;
    readonly QueryName: string;
    /** The query's full path (category path and name), for composition cycle detection. */
    readonly QueryPath: string;
    /** The SQL to extract from: the query's SQL for the platform described on. */
    readonly SQL: string;
    /** The platform the SQL is rendered for and described on. */
    readonly Platform: DatabasePlatform;
    readonly Mode: QueryExtractionMode;
    /** Whether the query reads an external data source, which the database server cannot describe. */
    readonly IsExternal: boolean;
    readonly KnownParameters: readonly KnownQueryParameter[];
    /** Tested sample values a caller supplied (`ParameterHints`), by parameter name. */
    readonly ParameterHints?: ReadonlyMap<string, string>;
    /** The user the renders are made for (composed queries must be runnable by them). */
    readonly ContextUser: UserInfo;
    /** The entity catalog sources and table references are mapped through. */
    readonly Entities: readonly EntityInfo[];
    /** The saved queries compositions resolve against. */
    readonly Queries: readonly CompositionCandidate[];
    /**
     * Render specs for composed queries the shared query cache does not hold yet (saved earlier in
     * the same transaction), searched before the cache when the describe renders compose them.
     */
    readonly CompositionDependencies?: readonly QueryDependencySpec[];
    /** Describes a rendered statement on the database server; `null` when the provider cannot. */
    readonly Describe: ((sql: string) => Promise<DescribeStatementResult>) | null;
}

/** The facts of one output column: what the server reports, mapped through MJ metadata. */
export interface QueryFieldFact {
    readonly Name: string;
    readonly Sequence: number;
    readonly SQLBaseType: string;
    readonly SQLFullType: string;
    readonly IsNullable: boolean | null;
    readonly IsComputed: boolean;
    readonly SourceEntityID: string | null;
    readonly SourceEntityFieldID: string | null;
    readonly SourceFieldName: string | null;
    readonly SourceObjectName: string | null;
    /** A doc-comment description: an authored annotation. */
    readonly DocDescription: string | null;
    /** The source entity field's description, used for a new row with no other description. */
    readonly SourceDescription: string | null;
}

/** The facts of one parameter the template reads. */
export interface QueryParameterFact {
    readonly Name: string;
    /** The type the template's filters imply; `null` when they imply none. */
    readonly Type: QueryParameterType | null;
    readonly IsRequired: boolean;
    readonly DefaultValue: string | null;
    /** A sample for a new row: the caller's hint, or the value a composed query's parameter has. */
    readonly SampleValue: string | null;
    /** A doc-comment description: an authored annotation. */
    readonly DocDescription: string | null;
    /** A description inherited from the composed query's parameter this one is passed to. */
    readonly InheritedDescription: string | null;
}

/** An entity the query reads, through its base view, base table or an alternate base view. */
export interface QueryEntityFact {
    readonly EntityID: string;
    readonly AlternateBaseViewID: string | null;
}

/** A query this query composes. */
export interface QueryDependencyFact {
    readonly DependsOnQueryID: string;
    /** The full path as the composition writes it. */
    readonly ReferencePath: string;
    readonly Alias: string | null;
    /** The arguments, as JSON (`{"Region":"@Region","Year":"2024"}`), or `null` when there are none. */
    readonly ParameterMapping: string | null;
}

/**
 * The result of one extraction run. A `null` collection means its facts could not be established
 * (a describe failure, an external source, SQL that could not be read): its stored rows are kept.
 */
export interface QueryExtractionResult {
    /** Whether the SQL holds any template tag outside SQL comments: a lexer fact. */
    readonly UsesTemplate: boolean;
    /** Set when the save must be refused (save-time rule errors, duplicate output names); the reason. */
    readonly Refusal: string | null;
    readonly Status: QueryExtractionStatus;
    /** Diagnostics for `ExtractionMessage`, one per line. */
    readonly Messages: readonly string[];
    /** SHA-256 of the platform SQL and the dialect key. */
    readonly Hash: string;
    readonly Fields: readonly QueryFieldFact[] | null;
    readonly Parameters: readonly QueryParameterFact[];
    readonly Entities: readonly QueryEntityFact[] | null;
    readonly Dependencies: readonly QueryDependencyFact[] | null;
}
