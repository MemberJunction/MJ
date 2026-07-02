import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Int } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { TagEngine, SeedTaxonomyResult } from '@memberjunction/tag-engine';

/* ───── GraphQL output ───── */

@ObjectType()
export class GenerateSeedTaxonomyResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;

    /** How the taxonomy was produced: 'clustering' or 'prompt-fallback'. */
    @Field({ nullable: true })
    Method?: string;

    /** Number of content items sampled / considered. */
    @Field(() => Int)
    SampleSize: number;

    /**
     * JSON-serialized array of SeedTaxonomyNode (the proposed, NON-persisted tree).
     * Kept as a JSON string to keep the GraphQL schema simple, mirroring
     * RunClusterAnalysis's *JSON fields.
     */
    @Field()
    NodesJSON: string;
}

/* ───── Resolver ───── */

@Resolver()
export class GenerateSeedTaxonomyResolver extends ResolverBase {
    /**
     * Propose a hierarchical tag taxonomy for a content source WITHOUT persisting
     * anything. Thin wrapper over {@link TagEngine.generateSeedTaxonomy}.
     *
     * @param sourceID   The ContentSource ID whose items seed the taxonomy.
     * @param sampleSize Max number of content items to consider (defaults to 200 when <= 0).
     */
    @Mutation(() => GenerateSeedTaxonomyResult)
    async GenerateSeedTaxonomy(
        @Arg('sourceID', () => String) sourceID: string,
        @Arg('sampleSize', () => Int, { nullable: true }) sampleSize: number,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<GenerateSeedTaxonomyResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return this.errorResult('Unable to determine current user');
            }
            if (!sourceID || sourceID.trim().length === 0) {
                return this.errorResult('sourceID is required');
            }

            LogStatus(`GenerateSeedTaxonomy: sourceID=${sourceID} sampleSize=${sampleSize ?? 'default'}`);

            const result: SeedTaxonomyResult = await TagEngine.Instance.generateSeedTaxonomy(
                sourceID,
                sampleSize ?? 0,
                currentUser
            );

            return {
                Success: true,
                Method: result.Method,
                SampleSize: result.SampleSize,
                NodesJSON: JSON.stringify(result.Nodes),
                ErrorMessage: result.Message,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`GenerateSeedTaxonomy mutation failed: ${msg}`);
            return this.errorResult(msg);
        }
    }

    private errorResult(message: string): GenerateSeedTaxonomyResult {
        return {
            Success: false,
            ErrorMessage: message,
            SampleSize: 0,
            NodesJSON: '[]',
        };
    }
}
