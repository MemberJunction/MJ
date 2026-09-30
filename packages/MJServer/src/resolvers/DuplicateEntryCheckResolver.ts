import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Float, Int } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { EntityInfo, IMetadataProvider, LogError, Metadata } from '@memberjunction/core';
import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';
import type { DuplicateEntryCheckResult, DuplicateEntryCheckStatus } from '@memberjunction/ai-vector-dupe';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadOnlyProvider } from '../util.js';

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
 * The result of the `CheckDuplicateEntry` mutation. Every failure, an authorization denial included,
 * comes back as `Status: 'Failed'` with an `ErrorMessage`: the mutation never throws to the client.
 */
@ObjectType()
export class DuplicateEntryCheckOutput {
    /** `Checked`, `NotConfigured` or `Failed`. */
    @Field(() => String)
    Status: DuplicateEntryCheckStatus;

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
     * Authorization is a read of the entity: the API-key `view:run` scope check that `RunDynamicView`
     * makes (a session without an API key skips it), then the user's entity read permission, both
     * before any other work. The detector then narrows the candidates to the rows the user can read.
     *
     * @param entityName The entity the new record belongs to.
     * @param valuesJSON The entered values as the JSON of an object, by field name. Fields the entity
     *   does not have are ignored.
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
        try {
            await this.CheckAPIKeyScopeAuthorization('view:run', entityName, userPayload);
            this.CheckUserReadPermissions(entityName, userPayload, provider ?? undefined);
            const user = this.GetUserFromPayload(userPayload);
            if (!user) {
                return this.failure('Unable to determine current user', startTime);
            }
            const entity = (provider ?? new Metadata()).EntityByName(entityName);
            const values = this.parseValues(valuesJSON, entity);
            if ('Error' in values) {
                return this.failure(values.Error, startTime);
            }
            const result = await this.CreateEntryChecker(provider).CheckRecordValues(entity.Name, values.Values, user);
            return this.mapResult(result);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`CheckDuplicateEntry failed for ${entityName}: ${message}`);
            return this.failure(message || 'Unknown error occurred', startTime);
        }
    }

    /** The detector a check runs on, bound to the request's provider. */
    protected CreateEntryChecker(provider: IMetadataProvider | null): DuplicateEntryChecker {
        return new DuplicateRecordDetector(provider);
    }

    /**
     * Reads the entered values: the JSON of an object, kept to the entity's own fields (matched by
     * name, case-insensitively, and keyed by the field's real name).
     */
    private parseValues(valuesJSON: string, entity: EntityInfo): { Values: Record<string, unknown> } | { Error: string } {
        let parsed: unknown;
        try {
            parsed = JSON.parse(valuesJSON);
        } catch (e) {
            return { Error: `valuesJSON is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
        }
        if (!this.isPlainObject(parsed)) {
            return { Error: 'valuesJSON must be the JSON of an object of field values' };
        }
        const values: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(parsed)) {
            const field = entity.FieldByName(name);
            if (field) {
                values[field.Name] = value;
            }
        }
        return { Values: values };
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

    private failure(errorMessage: string, startTime: number): DuplicateEntryCheckOutput {
        return { Status: 'Failed', ErrorMessage: errorMessage, Candidates: [], ElapsedMs: Date.now() - startTime };
    }
}
