import { Resolver, Query, Arg, Ctx, ObjectType, InputType, Field } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, CompositeKey, KeyValuePair } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadOnlyProvider } from '../util.js';
import {
    RecordComparisonEngine,
    RecordComparisonInput,
    RecordComparisonResult,
} from '@memberjunction/record-comparison';

/* ───── GraphQL input ───── */

/**
 * A single primary-key field/value pair used to identify a record to compare.
 * Mirrors the runtime `KeyValuePair` shape but in a GraphQL-serializable form.
 */
@InputType()
export class RecordComparisonKeyValuePairInput {
    /** Primary-key field name (e.g. "ID"). */
    @Field()
    FieldName: string;

    /** Primary-key value, as a string (UUIDs, ints, etc. are all sent as strings). */
    @Field()
    Value: string;
}

/**
 * One record to compare, expressed as its composite key (one or more key/value pairs
 * for composite-PK entities, typically a single `ID` pair for single-PK entities).
 */
@InputType()
export class RecordComparisonKeyInput {
    /** The primary-key field/value pairs that uniquely identify this record. */
    @Field(() => [RecordComparisonKeyValuePairInput])
    KeyValuePairs: RecordComparisonKeyValuePairInput[];
}

/**
 * Input for the `GetRecordComparison` query. Mirrors the engine's
 * `RecordComparisonInput`, with composite keys flattened into a GraphQL-serializable
 * key/value-pair form.
 */
@InputType()
export class GetRecordComparisonInput {
    /** Registered entity name (e.g. "Accounts"), NOT the physical table name. */
    @Field()
    EntityName: string;

    /**
     * The records to compare, in column order. By convention the first key is the
     * survivor candidate (reference column); the rest are potential matches.
     */
    @Field(() => [RecordComparisonKeyInput])
    Keys: RecordComparisonKeyInput[];

    /**
     * Optional include-list of field names to restrict the comparison to. When omitted,
     * all non-PK, non-system fields are compared. Matched case-insensitively.
     */
    @Field(() => [String], { nullable: true })
    IncludeFields?: string[];
}

/* ───── GraphQL output ───── */

/**
 * Result of a `GetRecordComparison` query. The loaded records and the per-field delta
 * matrix are returned as JSON-string fields (`RecordsJSON` / `FieldsJSON`) because their
 * shapes are nested and dynamic; the client parses them back into typed objects.
 */
@ObjectType()
export class GetRecordComparisonResult {
    /** Whether the comparison succeeded. */
    @Field()
    Success: boolean;

    /** Populated when `Success` is false. */
    @Field({ nullable: true })
    ErrorMessage?: string;

    /** The registered entity name that was compared. */
    @Field()
    EntityName: string;

    /** JSON-serialized array of `RecordComparisonRecord`. */
    @Field()
    RecordsJSON: string;

    /** JSON-serialized array of `RecordComparisonFieldDelta` (the delta matrix). */
    @Field()
    FieldsJSON: string;
}

/* ───── Resolver ───── */

@Resolver()
export class GetRecordComparisonResolver extends ResolverBase {
    @Query(() => GetRecordComparisonResult)
    async GetRecordComparison(
        @Arg('input', () => GetRecordComparisonInput) input: GetRecordComparisonInput,
        @Ctx() context: AppContext = {} as AppContext
    ): Promise<GetRecordComparisonResult> {
        try {
            const currentUser = this.GetUserFromPayload(context.userPayload);
            if (!currentUser) {
                return this.errorResult(input.EntityName, 'Unable to determine current user');
            }

            // Pure read — use this user's read-only connection + security context.
            // DatabaseProviderBase implements IMetadataProvider, so no cast is needed.
            const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });

            const engineInput = this.buildEngineInput(input);
            const engine = new RecordComparisonEngine();
            const result = await engine.CompareRecords(engineInput, currentUser, provider);

            return this.toGraphQLResult(result);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`GetRecordComparison query failed: ${msg}`);
            return this.errorResult(input.EntityName, msg);
        }
    }

    /** Converts the GraphQL input into the engine's {@link RecordComparisonInput}. */
    private buildEngineInput(input: GetRecordComparisonInput): RecordComparisonInput {
        return {
            EntityName: input.EntityName,
            Keys: (input.Keys ?? []).map((k) => this.toCompositeKey(k)),
            IncludeFields: input.IncludeFields,
        };
    }

    /** Builds a {@link CompositeKey} from a GraphQL key input. */
    private toCompositeKey(key: RecordComparisonKeyInput): CompositeKey {
        const pairs = (key.KeyValuePairs ?? []).map((kvp) => {
            const pair = new KeyValuePair();
            pair.FieldName = kvp.FieldName;
            pair.Value = kvp.Value;
            return pair;
        });
        return CompositeKey.FromKeyValuePairs(pairs);
    }

    /** Maps the engine result to the JSON-string GraphQL result shape. */
    private toGraphQLResult(result: RecordComparisonResult): GetRecordComparisonResult {
        return {
            Success: result.Success,
            ErrorMessage: result.ErrorMessage,
            EntityName: result.EntityName,
            RecordsJSON: JSON.stringify(result.Records ?? []),
            FieldsJSON: JSON.stringify(result.Fields ?? []),
        };
    }

    /** Builds a failed-shape result with valid empty-JSON literals. */
    private errorResult(entityName: string, message: string): GetRecordComparisonResult {
        return {
            Success: false,
            ErrorMessage: message,
            EntityName: entityName ?? '',
            RecordsJSON: '[]',
            FieldsJSON: '[]',
        };
    }
}
