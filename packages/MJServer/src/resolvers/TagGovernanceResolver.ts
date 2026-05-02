import { Resolver, Mutation, Ctx, Arg, ObjectType, Field, Int } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { TagGovernanceEngine, TagHealthJob, DEFAULT_TAG_HEALTH_THRESHOLDS, TagEngine } from '@memberjunction/tag-engine';

@ObjectType()
export class PromoteSuggestionResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ResolvedTagID?: string;

    @Field({ nullable: true })
    ResolvedTagName?: string;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

@ObjectType()
export class RejectSuggestionResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

@ObjectType()
export class RebuildTagEmbeddingsResult {
    @Field()
    Success: boolean;

    @Field(() => Int)
    Refreshed: number;

    @Field(() => Int)
    Total: number;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

@ObjectType()
export class RunTagHealthResult {
    @Field()
    Success: boolean;

    @Field(() => Int)
    MergeCount: number;

    @Field(() => Int)
    LowUsageCount: number;

    @Field(() => Int)
    WideNodeCount: number;

    @Field(() => Int)
    DurationMs: number;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

/**
 * GraphQL surface for the tag governance lifecycle that the Suggestion Inbox
 * UI invokes. Wraps `TagGovernanceEngine` (PromoteSuggestion / RejectSuggestion),
 * `TagEngine.RebuildTagEmbeddings`, and `TagHealthJob.Run` so the client gets a
 * single transactional call per disposition instead of multiple BaseEntity saves.
 *
 * Multi-provider safety: each mutation reads the per-request user from the
 * context and lets the engines use their default provider; if a non-default
 * provider is in play it should be passed via `TagGovernanceEngine.Provider`.
 */
@Resolver()
export class TagGovernanceResolver extends ResolverBase {
    @Mutation(() => PromoteSuggestionResult)
    async PromoteTagSuggestion(
        @Arg('suggestionID') suggestionID: string,
        @Arg('strategy') strategy: 'create-new' | 'merge-into-existing',
        @Arg('targetTagID', { nullable: true }) targetTagID: string | undefined,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<PromoteSuggestionResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return { Success: false, ErrorMessage: 'Unable to determine current user' };
            }

            if (strategy !== 'create-new' && strategy !== 'merge-into-existing') {
                return { Success: false, ErrorMessage: `Unknown strategy "${strategy}"` };
            }
            if (strategy === 'merge-into-existing' && !targetTagID) {
                return { Success: false, ErrorMessage: 'targetTagID is required when strategy is "merge-into-existing".' };
            }

            const resolved = strategy === 'create-new'
                ? await TagGovernanceEngine.Instance.PromoteSuggestion(suggestionID, { kind: 'create-new' }, currentUser)
                : await TagGovernanceEngine.Instance.PromoteSuggestion(suggestionID, { kind: 'merge-into-existing', targetTagID: targetTagID! }, currentUser);

            return {
                Success: true,
                ResolvedTagID: resolved.ID,
                ResolvedTagName: resolved.Name,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`PromoteTagSuggestion failed for ${suggestionID}: ${msg}`);
            return { Success: false, ErrorMessage: msg };
        }
    }

    @Mutation(() => RejectSuggestionResult)
    async RejectTagSuggestion(
        @Arg('suggestionID') suggestionID: string,
        @Arg('reviewerNotes', { nullable: true }) reviewerNotes: string | undefined,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<RejectSuggestionResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return { Success: false, ErrorMessage: 'Unable to determine current user' };
            }
            await TagGovernanceEngine.Instance.RejectSuggestion(suggestionID, reviewerNotes ?? null, currentUser);
            return { Success: true };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`RejectTagSuggestion failed for ${suggestionID}: ${msg}`);
            return { Success: false, ErrorMessage: msg };
        }
    }

    @Mutation(() => RebuildTagEmbeddingsResult)
    async RebuildTagEmbeddings(
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<RebuildTagEmbeddingsResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return { Success: false, Refreshed: 0, Total: 0, ErrorMessage: 'Unable to determine current user' };
            }
            const result = await TagEngine.Instance.RebuildTagEmbeddings(currentUser);
            LogStatus(`RebuildTagEmbeddings: refreshed ${result.refreshed}/${result.total} tags.`);
            return { Success: true, Refreshed: result.refreshed, Total: result.total };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`RebuildTagEmbeddings failed: ${msg}`);
            return { Success: false, Refreshed: 0, Total: 0, ErrorMessage: msg };
        }
    }

    @Mutation(() => RunTagHealthResult)
    async RunTagHealth(
        @Arg('minCoOccurrence', () => Int, { nullable: true }) minCoOccurrence: number | undefined,
        @Arg('minNameSimilarity', { nullable: true }) minNameSimilarity: number | undefined,
        @Arg('minEmbeddingSimilarity', { nullable: true }) minEmbeddingSimilarity: number | undefined,
        @Arg('maxUsage', () => Int, { nullable: true }) maxUsage: number | undefined,
        @Arg('maxImplicitChildren', () => Int, { nullable: true }) maxImplicitChildren: number | undefined,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<RunTagHealthResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return { Success: false, MergeCount: 0, LowUsageCount: 0, WideNodeCount: 0, DurationMs: 0, ErrorMessage: 'Unable to determine current user' };
            }
            const summary = await TagHealthJob.Instance.Run({
                ...DEFAULT_TAG_HEALTH_THRESHOLDS,
                ...(minCoOccurrence != null ? { minCoOccurrence } : {}),
                ...(minNameSimilarity != null ? { minNameSimilarity } : {}),
                ...(minEmbeddingSimilarity != null ? { minEmbeddingSimilarity } : {}),
                ...(maxUsage != null ? { maxUsage } : {}),
                ...(maxImplicitChildren != null ? { maxImplicitChildren } : {}),
            }, currentUser);
            return {
                Success: true,
                MergeCount: summary.mergeCount,
                LowUsageCount: summary.lowUsageCount,
                WideNodeCount: summary.wideNodeCount,
                DurationMs: summary.durationMs,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`RunTagHealth failed: ${msg}`);
            return { Success: false, MergeCount: 0, LowUsageCount: 0, WideNodeCount: 0, DurationMs: 0, ErrorMessage: msg };
        }
    }
}
