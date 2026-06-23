import { LogError } from "@memberjunction/core";
import { SafeJSONParse } from "@memberjunction/global";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";

/**
 * A single primary-key field/value pair identifying a record to compare. Mirrors the
 * server-side `RecordComparisonKeyValuePairInput`.
 */
export interface RecordComparisonKeyValuePair {
    /** Primary-key field name (e.g. "ID"). */
    FieldName: string;
    /** Primary-key value, as a string. */
    Value: string;
}

/**
 * One record to compare, expressed as its composite key (one pair for single-PK
 * entities, multiple for composite-PK entities).
 */
export interface RecordComparisonKey {
    /** The primary-key field/value pairs uniquely identifying this record. */
    KeyValuePairs: RecordComparisonKeyValuePair[];
}

/**
 * Input for the `GetRecordComparison` query. Mirrors the server-side
 * `GetRecordComparisonInput`.
 */
export interface GetRecordComparisonInput {
    /** Registered entity name (e.g. "Accounts"). */
    EntityName: string;
    /**
     * The records to compare, in column order. By convention the first key is the
     * survivor candidate (the reference column); the rest are potential matches.
     */
    Keys: RecordComparisonKey[];
    /**
     * Optional include-list of field names to restrict the comparison to. When omitted,
     * all non-PK, non-system fields are compared (matched case-insensitively).
     */
    IncludeFields?: string[];
}

/** A scalar field value as loaded from the database. */
export type RecordComparisonFieldValue = string | number | boolean | null;

/**
 * One loaded record in the comparison. Defined locally here (not imported from
 * `@memberjunction/core-entities-server`) so this transport package stays decoupled
 * from the server engine. Mirrors the engine's `RecordComparisonRecord`.
 */
export interface RecordComparisonRecord {
    /** Zero-based index aligned with the input `Keys` array (the comparison column). */
    ColumnIndex: number;
    /** The composite key identifying this record (as supplied in the input). */
    Key: unknown;
    /** A human-readable label for the record. */
    Label: string;
    /** Plain field-name → value map for this record (only the compared fields). */
    Values: Record<string, RecordComparisonFieldValue>;
}

/** Per-record value of a single field. Mirrors the engine's `RecordComparisonFieldCell`. */
export interface RecordComparisonFieldCell {
    /** Column index aligned with {@link RecordComparisonRecord.ColumnIndex}. */
    ColumnIndex: number;
    /** The field's value for this record. */
    Value: RecordComparisonFieldValue;
    /**
     * True when this cell's value equals (case-insensitive, trimmed) the reference
     * cell (column 0). Column 0 is always true.
     */
    EqualsReference: boolean;
}

/**
 * The delta for a single field across all compared records. Mirrors the engine's
 * `RecordComparisonFieldDelta`.
 */
export interface RecordComparisonFieldDelta {
    /** Field name (matches the entity field metadata Name). */
    FieldName: string;
    /** Display name for the field. */
    DisplayName: string;
    /** Optional grouping category from the field metadata. */
    Category: string | null;
    /** Per-record values for this field, in column order. */
    Cells: RecordComparisonFieldCell[];
    /** True when at least one record's value differs from the reference (column 0). */
    Differs: boolean;
}

/**
 * Fully-parsed result of a `GetRecordComparison` query.
 *
 * The transport helper parses the JSON-string fields (`RecordsJSON` / `FieldsJSON`)
 * returned by the server back into the typed `Records` / `Fields` properties, so
 * consumers never deal with raw JSON strings. Mirrors the engine's
 * `RecordComparisonResult`.
 */
export interface GetRecordComparisonResult {
    /** Whether the comparison succeeded. */
    Success: boolean;
    /** Populated when {@link Success} is false. */
    ErrorMessage?: string;
    /** The registered entity name that was compared. */
    EntityName: string;
    /** The loaded records, in input column order. */
    Records: RecordComparisonRecord[];
    /** The per-field delta matrix. Only fields with at least one non-empty value. */
    Fields: RecordComparisonFieldDelta[];
}

/** Raw shape of the GraphQL query payload (before JSON-string parsing). */
interface RawGetRecordComparisonResult {
    Success: boolean;
    ErrorMessage?: string;
    EntityName: string;
    RecordsJSON: string;
    FieldsJSON: string;
}

/**
 * Client for computing a field-level record comparison on the server through GraphQL.
 *
 * The comparison (load + field-delta matrix) runs server-side via
 * `@memberjunction/core-entities-server`'s `RecordComparisonEngine`; this client is a
 * thin, strongly-typed transport that sends the `GetRecordComparison` query and parses
 * the JSON-string fields (`RecordsJSON` / `FieldsJSON`) back into typed objects.
 *
 * Follows the same naming + construction convention as the other GraphQL clients in
 * this package (`GraphQLClusterClient`, `GraphQLSearchClient`, etc.).
 *
 * @example
 * ```typescript
 * const client = new GraphQLRecordComparisonClient(graphQLProvider);
 * const result = await client.GetRecordComparison({
 *   EntityName: 'Accounts',
 *   Keys: [
 *     { KeyValuePairs: [{ FieldName: 'ID', Value: survivorId }] },
 *     { KeyValuePairs: [{ FieldName: 'ID', Value: dupeId }] },
 *   ],
 * });
 * if (result.Success) {
 *   for (const field of result.Fields.filter(f => f.Differs)) {
 *     console.log(field.FieldName, field.Cells.map(c => c.Value));
 *   }
 * } else {
 *   console.error(result.ErrorMessage);
 * }
 * ```
 */
export class GraphQLRecordComparisonClient {
    /** The GraphQLDataProvider instance used to execute GraphQL requests. */
    private _dataProvider: GraphQLDataProvider;

    /**
     * Creates a new GraphQLRecordComparisonClient instance.
     * @param dataProvider The GraphQL data provider to use for the query.
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Compute a field-level comparison of a set of records on the server.
     *
     * Sends the `GetRecordComparison` query, then parses the JSON-string fields
     * (`RecordsJSON` / `FieldsJSON`) into typed objects. Never throws — on any failure
     * it logs and returns a `{ Success: false, ErrorMessage }` result.
     *
     * @param input The entity, keys, and optional field include-list to compare.
     * @returns A Promise resolving to a fully-parsed {@link GetRecordComparisonResult}.
     */
    public async GetRecordComparison(input: GetRecordComparisonInput): Promise<GetRecordComparisonResult> {
        try {
            const query = gql`
                query GetRecordComparison($input: GetRecordComparisonInput!) {
                    GetRecordComparison(input: $input) {
                        Success
                        ErrorMessage
                        EntityName
                        RecordsJSON
                        FieldsJSON
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(query, { input });
            const raw: RawGetRecordComparisonResult | undefined = result?.GetRecordComparison;
            if (!raw) {
                throw new Error('Invalid response from server');
            }

            return this.parseResult(raw);
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLRecordComparisonClient.GetRecordComparison failed', undefined, e);
            return this.errorResult(input?.EntityName ?? '', e.message || 'Unknown error occurred');
        }
    }

    /** Parse the raw query payload, deserializing the JSON-string fields into typed objects. */
    private parseResult(raw: RawGetRecordComparisonResult): GetRecordComparisonResult {
        const records = SafeJSONParse<RecordComparisonRecord[]>(raw.RecordsJSON) ?? [];
        const fields = SafeJSONParse<RecordComparisonFieldDelta[]>(raw.FieldsJSON) ?? [];
        return {
            Success: raw.Success,
            ErrorMessage: raw.ErrorMessage,
            EntityName: raw.EntityName,
            Records: records,
            Fields: fields,
        };
    }

    /** Build a failed {@link GetRecordComparisonResult} carrying an error message. */
    private errorResult(entityName: string, message: string): GetRecordComparisonResult {
        return {
            Success: false,
            ErrorMessage: message,
            EntityName: entityName,
            Records: [],
            Fields: [],
        };
    }
}
