import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Float, Int } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { EntityFieldInfo, EntityInfo, IMetadataProvider, LogError, Metadata } from '@memberjunction/core';
import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';
import type { DuplicateEntryCheckResult, DuplicateEntryCheckStatus } from '@memberjunction/ai-vector-dupe';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadOnlyProvider } from '../util.js';

/**
 * The most characters `valuesJSON` may hold. A larger request is refused before it is parsed. The
 * form sends each field's text cut to 500 characters, so a real entry stays well under it; the
 * detector then cuts what reaches the template and the decision model on its own.
 */
export const DUPLICATE_ENTRY_CHECK_MAX_VALUES_JSON_LENGTH = 16 * 1024;

/**
 * How a `CheckDuplicateEntry` call ended: a detector status, or `NotAuthorized` when the caller may
 * not run the check (an API key without the scopes, or a user who cannot read the entity). Nothing
 * ran, and a form stops asking about the entity for the session, as it does on `NotConfigured`.
 */
export type DuplicateEntryCheckOutputStatus = DuplicateEntryCheckStatus | 'NotAuthorized';

/** One entered value, as `valuesJSON` may carry it. */
type EntryValue = string | number | boolean | null;

/** One existing record the entry-time check flags as a possible duplicate. */
@ObjectType()
export class DuplicateEntryCandidateOutput {
    /** The candidate's primary key as a compact URL segment; `CompositeKey.FromURLSegment` reads it back. */
    @Field()
    RecordID: string;

    /** The candidate's name, or its key when the caller may not read a name. */
    @Field()
    DisplayName: string;

    /** The vector similarity score that surfaced the candidate. */
    @Field(() => Float)
    VectorScore: number;

    /** The decision's probability that the candidate is the same entity; null when it gave no answer. */
    @Field(() => Float, { nullable: true })
    Probability: number | null;
}

/**
 * The result of the `CheckDuplicateEntry` mutation. The mutation never throws to the client: an
 * authorization denial is `Status: 'NotAuthorized'` and any other failure is `Status: 'Failed'`,
 * each with an `ErrorMessage`.
 */
@ObjectType()
export class DuplicateEntryCheckOutput {
    /** `Checked`, `NotConfigured`, `NotAuthorized` or `Failed`. */
    @Field(() => String)
    Status: DuplicateEntryCheckOutputStatus;

    @Field({ nullable: true })
    ErrorMessage?: string;

    /** The flagged candidates, most probable first. Empty unless `Status` is `Checked`. */
    @Field(() => [DuplicateEntryCandidateOutput])
    Candidates: DuplicateEntryCandidateOutput[];

    /** How long the check took on the server, in milliseconds. */
    @Field(() => Int)
    ElapsedMs: number;
}

/** What the resolver needs from the detector. `DuplicateRecordDetector` provides it. */
export type DuplicateEntryChecker = Pick<DuplicateRecordDetector, 'CheckRecordValues'>;

/**
 * Checks the values a person is entering for a new record against the entity's existing records,
 * through `DuplicateRecordDetector.CheckRecordValues`, and returns the plausible duplicates to flag.
 * It only flags: it saves, merges and blocks nothing.
 */
@Resolver()
export class DuplicateEntryCheckResolver extends ResolverBase {
    /**
     * Flags existing records that may duplicate a new record being entered.
     *
     * Authorization comes before any other work. An API key needs two scopes: `view:run` on the
     * entity, the scope `RunDynamicView` checks, since the check reads the entity's records; and
     * `prompt:execute`, the scope `ExecuteSimplePrompt` checks, since each check pays for an embedding
     * and a decision-model call. A session without an API key skips both. Then the user needs read
     * permission on the entity. A denial is `NotAuthorized`, and is not logged. The detector then
     * narrows the candidates to the rows the user can read.
     *
     * The detector bounds the check's time on the server (`DUPLICATE_ENTRY_CHECK_SERVER_BUDGET_MS` in
     * `@memberjunction/ai-vector-dupe`), a little above the form's own budget.
     *
     * @param entityName The entity the new record belongs to.
     * @param valuesJSON The entered values as the JSON of an object, by field name, at most
     *   {@link DUPLICATE_ENTRY_CHECK_MAX_VALUES_JSON_LENGTH} characters. Each value is a string,
     *   number, boolean or null. Fields the entity does not have, primary keys, read-only fields and
     *   MJ system fields are ignored.
     */
    @Mutation(() => DuplicateEntryCheckOutput)
    async CheckDuplicateEntry(
        @Arg('entityName') entityName: string,
        @Arg('valuesJSON') valuesJSON: string,
        @Ctx() { userPayload, providers }: AppContext
    ): Promise<DuplicateEntryCheckOutput> {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return this.RunEntryCheck(entityName, valuesJSON, userPayload, provider);
    }

    /**
     * The check without the GraphQL plumbing: authorizes, reads the values, and runs the detector.
     * Never throws.
     *
     * @param provider the request's metadata provider; the global one when null
     */
    public async RunEntryCheck(
        entityName: string,
        valuesJSON: string,
        userPayload: UserPayload,
        provider: IMetadataProvider | null
    ): Promise<DuplicateEntryCheckOutput> {
        const startTime = Date.now();
        const entity = (provider ?? new Metadata()).EntityByName(entityName);
        if (!entity) {
            return this.failure('Failed', 'Entity not found in metadata', startTime);
        }
        const denial = await this.authorizeEntryCheck(entity, userPayload, provider);
        if (denial) {
            return this.failure('NotAuthorized', denial, startTime);
        }
        try {
            const user = this.GetUserFromPayload(userPayload);
            if (!user) {
                return this.failure('Failed', 'Unable to determine current user', startTime);
            }
            const values = this.parseValues(valuesJSON, entity);
            if ('Error' in values) {
                return this.failure('Failed', values.Error, startTime);
            }
            const result = await this.CreateEntryChecker(provider).CheckRecordValues(entity.Name, values.Values, user);
            return this.mapResult(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`CheckDuplicateEntry failed for ${entityName}: ${message}`);
            return this.failure('Failed', message || 'Unknown error occurred', startTime);
        }
    }

    /** The detector a check runs on, bound to the request's provider. */
    protected CreateEntryChecker(provider: IMetadataProvider | null): DuplicateEntryChecker {
        return new DuplicateRecordDetector(provider);
    }

    /**
     * Why the caller may not run the check, or null when they may: the API-key scopes, then the
     * user's read permission on the entity. A denial is an answer, not a fault, so nothing is logged.
     */
    private async authorizeEntryCheck(
        entity: EntityInfo,
        userPayload: UserPayload,
        provider: IMetadataProvider | null
    ): Promise<string | null> {
        try {
            await this.CheckAPIKeyScopeAuthorization('view:run', entity.Name, userPayload);
            await this.CheckAPIKeyScopeAuthorization('prompt:execute', '*', userPayload);
            this.CheckUserReadPermissions(entity.Name, userPayload, provider ?? undefined);
            return null;
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }

    /**
     * Reads the entered values: the JSON of an object of scalar values, at most
     * {@link DUPLICATE_ENTRY_CHECK_MAX_VALUES_JSON_LENGTH} characters, kept to the fields a person
     * can enter (matched by name, case-insensitively, and keyed by the field's real name).
     */
    private parseValues(valuesJSON: string, entity: EntityInfo): { Values: Record<string, EntryValue> } | { Error: string } {
        if (valuesJSON.length > DUPLICATE_ENTRY_CHECK_MAX_VALUES_JSON_LENGTH) {
            return { Error: `valuesJSON is ${valuesJSON.length} characters; the limit is ${DUPLICATE_ENTRY_CHECK_MAX_VALUES_JSON_LENGTH}` };
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(valuesJSON);
        } catch (e) {
            return { Error: `valuesJSON is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
        }
        if (!this.isPlainObject(parsed)) {
            return { Error: 'valuesJSON must be the JSON of an object of field values' };
        }
        const values: Record<string, EntryValue> = {};
        for (const [name, value] of Object.entries(parsed)) {
            if (!this.isEntryValue(value)) {
                return { Error: `valuesJSON field '${name}' must be a string, number, boolean or null` };
            }
            const field = entity.FieldByName(name);
            if (field && this.isEnterable(field)) {
                values[field.Name] = value;
            }
        }
        return { Values: values };
    }

    /** Whether a person can enter the field: not a primary key, not read-only, not an MJ system field. */
    private isEnterable(field: EntityFieldInfo): boolean {
        return !field.IsPrimaryKey && !field.ReadOnly && !field.Name.startsWith('__mj_');
    }

    private isEntryValue(value: unknown): value is EntryValue {
        return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    }

    private isPlainObject(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private mapResult(result: DuplicateEntryCheckResult): DuplicateEntryCheckOutput {
        return {
            Status: result.Status,
            ErrorMessage: result.ErrorMessage,
            Candidates: result.Candidates.map(c => ({
                RecordID: c.RecordID,
                DisplayName: c.DisplayName,
                VectorScore: c.VectorScore,
                Probability: c.Probability,
            })),
            ElapsedMs: result.ElapsedMs,
        };
    }

    private failure(status: DuplicateEntryCheckOutputStatus, errorMessage: string, startTime: number): DuplicateEntryCheckOutput {
        return { Status: status, ErrorMessage: errorMessage, Candidates: [], ElapsedMs: Date.now() - startTime };
    }
}
