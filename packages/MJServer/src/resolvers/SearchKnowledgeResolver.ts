import { Resolver, Mutation, Query, Arg, Ctx, ObjectType, Field, Float, InputType, ID } from 'type-graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { AppContext } from '../types.js';
import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { SearchEngine, SearchResult as SearchEngineResult, SearchResultItem as SearchEngineResultItem, SearchProviderInfo, SearchContext, SearchScopePermissionResolver } from '@memberjunction/search-engine';
import { SearchEngineBase, MJAIAgentEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/* ───── GraphQL types ───── */

@ObjectType()
export class SearchScoreBreakdown {
    @Field(() => Float, { nullable: true })
    Vector?: number;

    @Field(() => Float, { nullable: true })
    FullText?: number;

    @Field(() => Float, { nullable: true })
    Entity?: number;

    @Field(() => Float, { nullable: true })
    Storage?: number;
}

@ObjectType()
export class SearchKnowledgeResultItem {
    @Field()
    ID: string;

    @Field()
    EntityName: string;

    @Field()
    RecordID: string;

    @Field()
    SourceType: string;

    @Field()
    Title: string;

    @Field()
    Snippet: string;

    @Field(() => Float)
    Score: number;

    @Field(() => SearchScoreBreakdown)
    ScoreBreakdown: SearchScoreBreakdown;

    @Field(() => [String])
    Tags: string[];

    @Field({ nullable: true })
    EntityIcon?: string;

    @Field({ nullable: true })
    RecordName?: string;

    @Field()
    MatchedAt: Date;

    /** Raw vector metadata as JSON string — contains all entity fields stored in the vector DB */
    @Field({ nullable: true })
    RawMetadata?: string;

    /** Discriminator for UI rendering: 'entity-record', 'storage-file', or 'content-item' */
    @Field()
    ResultType: string;

    /** ID of the SearchProvider metadata record that produced this result */
    @Field({ nullable: true })
    ProviderId?: string;

    /** Display label from the SearchProvider metadata (e.g., "Database", "Semantic Search") */
    @Field({ nullable: true })
    ProviderLabel?: string;

    /** Font Awesome icon class from the SearchProvider metadata */
    @Field({ nullable: true })
    ProviderIcon?: string;
}

@ObjectType()
export class SearchSourceCounts {
    @Field()
    Vector: number;

    @Field()
    FullText: number;

    @Field()
    Entity: number;

    @Field()
    Storage: number;
}

@ObjectType()
export class SearchProviderInfoType {
    @Field()
    ID: string;

    @Field()
    Name: string;

    @Field()
    DisplayName: string;

    @Field()
    Icon: string;

    @Field()
    SourceType: string;

    @Field()
    Priority: number;
}

@ObjectType()
export class SearchKnowledgeResult {
    @Field()
    Success: boolean;

    @Field(() => [SearchKnowledgeResultItem])
    Results: SearchKnowledgeResultItem[];

    @Field()
    TotalCount: number;

    @Field()
    ElapsedMs: number;

    @Field(() => SearchSourceCounts)
    SourceCounts: SearchSourceCounts;

    @Field(() => [SearchProviderInfoType])
    Providers: SearchProviderInfoType[];

    @Field({ nullable: true })
    ErrorMessage?: string;
}

@InputType()
export class SearchFiltersInput {
    @Field(() => [String], { nullable: true })
    EntityNames?: string[];

    @Field(() => [String], { nullable: true })
    SourceTypes?: string[];

    @Field(() => [String], { nullable: true })
    Tags?: string[];
}

/** Runtime multi-tenant context passed through to `SearchEngine.Search()`. */
@InputType()
export class SearchContextInput {
    @Field({ nullable: true })
    PrimaryScopeEntityID?: string;

    @Field({ nullable: true })
    PrimaryScopeRecordID?: string;

    /** JSON-encoded `Record<string, SecondaryScopeValue>`. */
    @Field(() => GraphQLJSON, { nullable: true })
    SecondaryScopes?: unknown;
}

/** Lightweight metadata shape for the scope selector UI. */
@ObjectType()
export class SearchScopeInfo {
    @Field(() => ID)
    ID: string;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    Icon?: string;

    @Field()
    IsGlobal: boolean;

    @Field()
    IsDefault: boolean;

    /** True when the scope has an OwnerUserID — rendered as a personal scope in the UI. */
    @Field()
    IsPersonal: boolean;
}

/* ───── Resolver (thin wrapper around SearchEngine) ───── */

@Resolver()
export class SearchKnowledgeResolver extends ResolverBase {

    @Mutation(() => SearchKnowledgeResult)
    async SearchKnowledge(
        @Arg('query') query: string,
        @Arg('maxResults', () => Float, { nullable: true }) maxResults: number | undefined,
        @Arg('filters', () => SearchFiltersInput, { nullable: true }) filters: SearchFiltersInput | undefined,
        @Arg('minScore', () => Float, { nullable: true }) minScore: number | undefined,
        @Arg('scopeIDs', () => [ID], { nullable: true }) scopeIDs: string[] | undefined,
        @Arg('searchContext', () => SearchContextInput, { nullable: true }) searchContext: SearchContextInput | undefined,
        @Arg('agentID', () => ID, { nullable: true }) agentID: string | undefined,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<SearchKnowledgeResult> {
        const startTime = Date.now();
        try {
            await this.CheckAPIKeyScopeAuthorization('search:execute', '*', userPayload);
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return this.errorResult('Unable to determine current user', startTime);
            }

            // Phase 2A enforcement: every scope the caller wants to use must
            // resolve to an Allowed permission for this user (and optionally
            // this agent). Reject the whole call on the first denial — we
            // don't silently drop forbidden scopes because that masks bugs
            // in scope authoring and surprises agents.
            if (scopeIDs && scopeIDs.length) {
                const denied = await this.rejectForbiddenScopes(scopeIDs, currentUser, agentID);
                if (denied) {
                    // Emit a Status='Forbidden' SearchExecutionLog row so the
                    // analytics dashboard surfaces denied attempts. Best-effort
                    // — failures are swallowed by the helper.
                    await SearchEngine.Instance.LogForbiddenSearch({
                        Query: query,
                        ScopeIDs: scopeIDs,
                        FailureReason: denied,
                        StartTime: startTime,
                        ContextUser: currentUser,
                        AIAgentID: agentID ?? null,
                    });
                    return this.errorResult(denied, startTime);
                }
            }

            const mappedContext: SearchContext | undefined = searchContext
                ? {
                    PrimaryScopeEntityID: searchContext.PrimaryScopeEntityID,
                    PrimaryScopeRecordID: searchContext.PrimaryScopeRecordID,
                    SecondaryScopes: searchContext.SecondaryScopes as SearchContext['SecondaryScopes']
                }
                : undefined;

            const result = await SearchEngine.Instance.Search({
                Query: query,
                MaxResults: maxResults,
                MinScore: minScore,
                ScopeIDs: scopeIDs && scopeIDs.length ? scopeIDs : undefined,
                SearchContext: mappedContext,
                Filters: filters ? {
                    EntityNames: filters.EntityNames,
                    SourceTypes: filters.SourceTypes,
                    Tags: filters.Tags
                } : undefined,
                AIAgentID: agentID ?? null,
            }, currentUser);

            return this.mapSearchResult(result);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchKnowledge mutation failed: ${msg}`);
            return this.errorResult(msg, startTime);
        }
    }

    /**
     * Returns a rejection message if any of the requested scopes are not
     * accessible to (user, agent), or undefined if all are permitted.
     * Resolution goes through SearchScopePermissionResolver — see its docs
     * for the rule order.
     */
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
                LogStatus(`SearchKnowledge denied: ${verdict.Reason} (scope=${scopeID}, source=${verdict.Source})`);
                return `Forbidden: ${verdict.Reason}`;
            }
            // Read level grants metadata visibility but not the right to run a
            // search. The SearchScopes query (scope-listing) accepts Read; the
            // SearchKnowledge mutation (actual search) does not.
            if (verdict.Level === 'Read') {
                const reason = `User '${user.Name}' has Read-level access on this scope, which permits metadata visibility but not search execution. Search or Manage is required to run a query.`;
                LogStatus(`SearchKnowledge denied: ${reason} (scope=${scopeID}, source=${verdict.Source})`);
                return `Forbidden: ${reason}`;
            }
        }
        return undefined;
    }

    /**
     * Loads the AIAgent record by ID for the agent-fallback path. Returns
     * null if no agentID was supplied, or if the lookup fails (which we
     * treat as "no agent context" rather than as an error so a malformed
     * input can't escalate privilege).
     */
    private async loadAgent(agentID: string | undefined, contextUser: UserInfo): Promise<MJAIAgentEntity | null> {
        if (!agentID) return null;
        try {
            const md = new Metadata(); // global-provider-ok: ResolverBase has no bound IMetadataProvider; contextUser is the per-request scope
            const agent = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', contextUser);
            const loaded = await agent.Load(agentID);
            return loaded ? agent : null;
        } catch (err) {
            LogError(`SearchKnowledge: failed to load agent ${agentID}: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * Returns the list of search scopes the current user can see and use.
     *
     * Phase 2A: filters the active scope list through
     * SearchScopePermissionResolver — only scopes that resolve to Allowed
     * (Read or higher) for the caller appear in the response. Personal
     * scopes owned by the caller bypass the resolver because ownership is
     * itself an implicit Manage grant.
     */
    @Query(() => [SearchScopeInfo])
    async SearchScopes(
        @Arg('agentID', () => ID, { nullable: true }) agentID: string | undefined,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<SearchScopeInfo[]> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) return [];

            await SearchEngineBase.Instance.Config(false, currentUser);
            const scopes = SearchEngineBase.Instance.ActiveScopes;
            const userID = currentUser.ID;

            const ownedOrUnowned = scopes.filter(s => !s.OwnerUserID || UUIDsEqual(s.OwnerUserID, userID));
            const agent = await this.loadAgent(agentID, currentUser);
            const resolver = new SearchScopePermissionResolver();

            const visible: SearchScopeInfo[] = [];
            for (const s of ownedOrUnowned) {
                // Personal scopes owned by the caller are implicitly visible.
                if (s.OwnerUserID && UUIDsEqual(s.OwnerUserID, userID)) {
                    visible.push(this.toScopeInfo(s));
                    continue;
                }
                // Otherwise, defer to the permission resolver. A scope with
                // no permission rows AND no agent fallback is invisible to
                // non-owners — this is the intended Phase 2A default.
                const verdict = await resolver.ResolveEffectivePermission({
                    User: currentUser,
                    SearchScopeID: s.ID,
                    Agent: agent,
                    ContextUser: currentUser,
                });
                if (verdict.Allowed) {
                    visible.push(this.toScopeInfo(s));
                }
            }
            return visible;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchScopes query failed: ${msg}`);
            return [];
        }
    }

    private toScopeInfo(s: { ID: string; Name: string; Description?: string | null; Icon?: string | null; IsGlobal?: boolean; IsDefault?: boolean; OwnerUserID?: string | null }): SearchScopeInfo {
        return {
            ID: s.ID,
            Name: s.Name,
            Description: s.Description ?? undefined,
            Icon: s.Icon ?? undefined,
            IsGlobal: !!s.IsGlobal,
            IsDefault: !!s.IsDefault,
            IsPersonal: !!s.OwnerUserID,
        };
    }

    @Mutation(() => SearchKnowledgeResult)
    async PreviewSearch(
        @Arg('query') query: string,
        @Arg('maxResults', () => Float, { nullable: true, defaultValue: 8 }) maxResults: number,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<SearchKnowledgeResult> {
        const startTime = Date.now();
        try {
            await this.CheckAPIKeyScopeAuthorization('search:execute', '*', userPayload);
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return this.errorResult('Unable to determine current user', startTime);
            }

            const result = await SearchEngine.Instance.PreviewSearch(query, maxResults, currentUser);

            return this.mapSearchResult(result);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`PreviewSearch mutation failed: ${msg}`);
            return this.errorResult(msg, startTime);
        }
    }

    private mapSearchResult(result: SearchEngineResult): SearchKnowledgeResult {
        return {
            Success: result.Success,
            Results: result.Results.map((r: SearchEngineResultItem) => ({
                ID: r.ID,
                EntityName: r.EntityName,
                RecordID: r.RecordID,
                SourceType: r.SourceType,
                ResultType: r.ResultType,
                Title: r.Title,
                Snippet: r.Snippet,
                Score: r.Score,
                ScoreBreakdown: r.ScoreBreakdown as SearchScoreBreakdown,
                Tags: r.Tags || [],
                EntityIcon: r.EntityIcon,
                RecordName: r.RecordName,
                MatchedAt: r.MatchedAt,
                RawMetadata: r.RawMetadata,
                ProviderId: r.ProviderId,
                ProviderLabel: r.ProviderLabel,
                ProviderIcon: r.ProviderIcon,
            })),
            TotalCount: result.TotalCount,
            ElapsedMs: result.ElapsedMs,
            SourceCounts: {
                Vector: result.SourceCounts.Vector,
                FullText: result.SourceCounts.FullText,
                Entity: result.SourceCounts.Entity,
                Storage: result.SourceCounts.Storage,
            },
            Providers: (result.Providers || []).map((p: SearchProviderInfo) => ({
                ID: p.ID,
                Name: p.Name,
                DisplayName: p.DisplayName,
                Icon: p.Icon,
                SourceType: p.SourceType,
                Priority: p.Priority,
            })),
            ErrorMessage: result.ErrorMessage,
        };
    }

    private errorResult(message: string, startTime: number): SearchKnowledgeResult {
        return {
            Success: false,
            Results: [],
            TotalCount: 0,
            ElapsedMs: Date.now() - startTime,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
            Providers: [],
            ErrorMessage: message
        };
    }
}
