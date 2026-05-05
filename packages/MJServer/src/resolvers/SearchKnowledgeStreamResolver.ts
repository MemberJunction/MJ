/**
 * Streaming variant of the SearchKnowledge mutation. Uses GraphQL
 * subscriptions over the existing Apollo subscription transport (see
 * `plans/search-scopes-rag-plus/streaming-mechanism-decision.md` for the
 * decision rationale).
 *
 * Two-step protocol:
 *
 *   1. Caller invokes the `StreamScopedSearch` mutation with the same
 *      arguments as `SearchKnowledge`. The mutation returns a streamID
 *      (uuid) immediately and starts the search in the background.
 *   2. Caller subscribes to `SearchStreamEvents(streamID: $id)`. The
 *      server publishes events from `SearchEngine.streamSearch()` to the
 *      pubsub topic; the subscription's filter narrows to the requested
 *      streamID. The final event has `Phase = 'final'` (or 'error');
 *      consumers should unsubscribe after receiving it.
 *
 * Permission enforcement is identical to SearchKnowledge: each requested
 * scopeID is run through SearchScopePermissionResolver before the engine
 * is invoked. A denial publishes a single 'error' event and ends.
 */
import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Float, ID, Subscription, Root, PubSub, PubSubEngine } from 'type-graphql';
import { v4 as uuidv4 } from 'uuid';
import { GraphQLJSON } from 'graphql-type-json';
import { AppContext } from '../types.js';
import { LogError, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import {
    SearchEngine,
    SearchContext,
    SearchScopePermissionResolver,
    SearchStreamEvent,
} from '@memberjunction/search-engine';
import { MJAIAgentEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { SearchKnowledgeResultItem, SearchScoreBreakdown, SearchSourceCounts } from './SearchKnowledgeResolver.js';

const SEARCH_STREAM_TOPIC = 'SEARCH_STREAM';

/**
 * Wire format for search stream events. We do not use a discriminated
 * union at the GraphQL level (type-graphql doesn't have first-class
 * support for union outputs in a clean way) — instead we use a Phase
 * discriminator and make the data fields nullable per phase.
 */
@ObjectType()
export class SearchStreamNotification {
    @Field(() => ID)
    StreamID: string;

    @Field()
    Phase: string; // 'provider' | 'fused' | 'reranked' | 'final' | 'error'

    /** Set on `provider` events. */
    @Field({ nullable: true })
    ProviderName?: string;

    /** Set on `provider` events. */
    @Field(() => Float, { nullable: true })
    DurationMs?: number;

    /** Set on `provider`, `fused`, `reranked`, `final` events. */
    @Field(() => [SearchKnowledgeResultItem], { nullable: true })
    Results?: SearchKnowledgeResultItem[];

    /** Set on `final` events. */
    @Field(() => SearchSourceCounts, { nullable: true })
    SourceCounts?: SearchSourceCounts;

    /** Set on `final` events. */
    @Field(() => Float, { nullable: true })
    ElapsedMs?: number;

    /** Set on `error` events. */
    @Field({ nullable: true })
    ErrorMessage?: string;
}

@ObjectType()
export class SearchStreamStartResult {
    @Field()
    Success: boolean;

    @Field(() => ID)
    StreamID: string;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

@Resolver()
export class SearchKnowledgeStreamResolver extends ResolverBase {
    /**
     * Subscribe to events from a running streamScopedSearch. Filter by
     * streamID so multiple in-flight streams don't interleave on the same
     * client.
     */
    @Subscription(() => SearchStreamNotification, {
        topics: SEARCH_STREAM_TOPIC,
        filter: ({ payload, args }: { payload: SearchStreamNotification; args: { streamID: string } }) =>
            UUIDsEqual(payload.StreamID, args.streamID),
    })
    SearchStreamEvents(
        @Root() notification: SearchStreamNotification,
        @Arg('streamID', () => ID) _streamID: string,
    ): SearchStreamNotification {
        return notification;
    }

    /**
     * Start a streaming search. Returns a streamID that the caller passes
     * to the SearchStreamEvents subscription. Permission checks are
     * performed before the stream begins; on rejection a single 'error'
     * event is published and the stream ends.
     */
    @Mutation(() => SearchStreamStartResult)
    async StreamScopedSearch(
        @Arg('query') query: string,
        @Arg('maxResults', () => Float, { nullable: true }) maxResults: number | undefined,
        @Arg('minScore', () => Float, { nullable: true }) minScore: number | undefined,
        @Arg('scopeIDs', () => [ID], { nullable: true }) scopeIDs: string[] | undefined,
        @Arg('searchContext', () => GraphQLJSON, { nullable: true }) searchContext: unknown,
        @Arg('agentID', () => ID, { nullable: true }) agentID: string | undefined,
        @PubSub() pubSub: PubSubEngine,
        @Ctx() { userPayload }: AppContext = {} as AppContext,
    ): Promise<SearchStreamStartResult> {
        const streamID = uuidv4();
        const startTime = Date.now();
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return { Success: false, StreamID: streamID, ErrorMessage: 'Unable to determine current user' };
            }

            // Phase 2A enforcement: validate every requested scope before
            // we kick the stream off. Same predicate / message as the
            // synchronous resolver — single source of truth.
            if (scopeIDs && scopeIDs.length) {
                const denial = await this.rejectForbiddenScopes(scopeIDs, currentUser, agentID);
                if (denial) {
                    // Mirror the synchronous resolver: surface denied attempts in
                    // the analytics dashboard so an admin tuning permissions can
                    // see them. Best-effort — failures are swallowed by the helper.
                    await SearchEngine.Instance.LogForbiddenSearch({
                        Query: query,
                        ScopeIDs: scopeIDs,
                        FailureReason: denial,
                        StartTime: startTime,
                        ContextUser: currentUser,
                        AIAgentID: agentID ?? null,
                    });
                    return { Success: false, StreamID: streamID, ErrorMessage: denial };
                }
            }

            // Kick off the stream in the background and return immediately.
            // The mutation resolves before any events are published — the
            // client must subscribe first to avoid missing the early ones.
            // (TODO Phase 2C v2: optionally buffer until first subscriber
            // arrives; today's contract is "subscribe before mutation
            // returns" which the SDK can enforce.)
            void this.runStream(streamID, {
                query,
                maxResults,
                minScore,
                scopeIDs,
                searchContext,
                agentID,
            }, currentUser, pubSub).catch(err => {
                const msg = err instanceof Error ? err.message : String(err);
                LogError(`StreamScopedSearch background failure: ${msg}`);
                void pubSub.publish(SEARCH_STREAM_TOPIC, {
                    StreamID: streamID,
                    Phase: 'error',
                    ErrorMessage: msg,
                } as SearchStreamNotification);
            });

            return { Success: true, StreamID: streamID };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`StreamScopedSearch start failed: ${msg}`);
            return { Success: false, StreamID: streamID, ErrorMessage: msg };
        }
    }

    /**
     * Runs the stream and publishes events. Always publishes a terminal
     * 'final' or 'error' so clients can confidently unsubscribe.
     */
    private async runStream(
        streamID: string,
        params: {
            query: string;
            maxResults?: number;
            minScore?: number;
            scopeIDs?: string[];
            searchContext: unknown;
            agentID?: string;
        },
        currentUser: UserInfo,
        pubSub: PubSubEngine,
    ): Promise<void> {
        const mappedContext: SearchContext | undefined = params.searchContext
            ? params.searchContext as SearchContext
            : undefined;
        try {
            for await (const ev of SearchEngine.Instance.streamSearch({
                Query: params.query,
                MaxResults: params.maxResults,
                MinScore: params.minScore,
                ScopeIDs: params.scopeIDs && params.scopeIDs.length ? params.scopeIDs : undefined,
                SearchContext: mappedContext,
                AIAgentID: params.agentID ?? null,
            }, currentUser)) {
                const notification = this.toNotification(streamID, ev);
                await pubSub.publish(SEARCH_STREAM_TOPIC, notification);
            }
            LogStatus(`StreamScopedSearch ${streamID} completed`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`StreamScopedSearch ${streamID} failed mid-stream: ${msg}`);
            await pubSub.publish(SEARCH_STREAM_TOPIC, {
                StreamID: streamID,
                Phase: 'error',
                ErrorMessage: msg,
            } as SearchStreamNotification);
        }
    }

    private toNotification(streamID: string, ev: SearchStreamEvent): SearchStreamNotification {
        // Reuse the same item shape as the synchronous resolver.
        const mapItem = (r: { ID: string; EntityName: string; RecordID: string; SourceType: string; ResultType: string; Title: string; Snippet: string; Score: number; ScoreBreakdown: SearchScoreBreakdown; Tags: string[]; EntityIcon?: string; RecordName?: string; MatchedAt: Date; RawMetadata?: string; ProviderId?: string; ProviderLabel?: string; ProviderIcon?: string }): SearchKnowledgeResultItem => ({
            ID: r.ID,
            EntityName: r.EntityName,
            RecordID: r.RecordID,
            SourceType: r.SourceType,
            ResultType: r.ResultType,
            Title: r.Title,
            Snippet: r.Snippet,
            Score: r.Score,
            ScoreBreakdown: r.ScoreBreakdown,
            Tags: r.Tags ?? [],
            EntityIcon: r.EntityIcon,
            RecordName: r.RecordName,
            MatchedAt: r.MatchedAt,
            RawMetadata: r.RawMetadata,
            ProviderId: r.ProviderId,
            ProviderLabel: r.ProviderLabel,
            ProviderIcon: r.ProviderIcon,
        });

        switch (ev.phase) {
            case 'provider':
                return {
                    StreamID: streamID,
                    Phase: 'provider',
                    ProviderName: ev.providerName,
                    DurationMs: ev.durationMs,
                    Results: ev.results.map(mapItem),
                };
            case 'fused':
                return {
                    StreamID: streamID,
                    Phase: 'fused',
                    Results: ev.results.map(mapItem),
                };
            case 'reranked':
                return {
                    StreamID: streamID,
                    Phase: 'reranked',
                    ProviderName: ev.rerankerName,
                    Results: ev.results.map(mapItem),
                };
            case 'final':
                return {
                    StreamID: streamID,
                    Phase: 'final',
                    Results: ev.results.map(mapItem),
                    SourceCounts: ev.sourceCounts,
                    ElapsedMs: ev.elapsedMs,
                };
            case 'error':
                return {
                    StreamID: streamID,
                    Phase: 'error',
                    ProviderName: ev.providerName,
                    ErrorMessage: ev.error,
                };
        }
    }

    /** Mirrors the helper in SearchKnowledgeResolver — kept private to
     * avoid an inter-resolver coupling. If a third resolver ever needs
     * this, lift it into a shared util in `packages/SearchEngine`. */
    private async rejectForbiddenScopes(
        scopeIDs: string[],
        user: UserInfo,
        agentID: string | undefined,
    ): Promise<string | undefined> {
        const agent = await this.loadAgent(agentID, user);
        const resolver = new SearchScopePermissionResolver();
        for (const scopeID of scopeIDs) {
            const verdict = await resolver.ResolveEffectivePermission({
                User: user,
                SearchScopeID: scopeID,
                Agent: agent,
                ContextUser: user,
            });
            if (!verdict.Allowed) {
                LogStatus(`StreamScopedSearch denied: ${verdict.Reason} (scope=${scopeID}, source=${verdict.Source})`);
                return `Forbidden: ${verdict.Reason}`;
            }
            // Read level grants metadata visibility but not the right to run a
            // search. Mirror the SearchKnowledge resolver's gate so the streaming
            // path enforces the same Read=metadata-only rule.
            if (verdict.Level === 'Read') {
                const reason = `User '${user.Name}' has Read-level access on this scope, which permits metadata visibility but not search execution. Search or Manage is required to run a query.`;
                LogStatus(`StreamScopedSearch denied: ${reason} (scope=${scopeID}, source=${verdict.Source})`);
                return `Forbidden: ${reason}`;
            }
        }
        return undefined;
    }

    private async loadAgent(agentID: string | undefined, contextUser: UserInfo): Promise<MJAIAgentEntity | null> {
        if (!agentID) return null;
        try {
            const md = new Metadata(); // global-provider-ok: ResolverBase has no bound IMetadataProvider; contextUser is the per-request scope
            const agent = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', contextUser);
            const loaded = await agent.Load(agentID);
            return loaded ? agent : null;
        } catch (err) {
            LogError(`StreamScopedSearch: failed to load agent ${agentID}: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }
}
