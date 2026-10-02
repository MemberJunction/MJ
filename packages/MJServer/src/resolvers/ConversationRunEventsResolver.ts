import { Arg, Ctx, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJAIAgentRunEntity, MJAIAgentRunStepEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import type { AppContext } from '../types.js';
import { GetReadOnlyProvider } from '../util.js';

/** The run columns the tail reads. */
type TailRunRow = Pick<MJAIAgentRunEntity, 'ID' | 'Status' | 'Result'>;

/** The step columns an event carries. The large data columns are never read. */
type TailStepRow = Pick<
    MJAIAgentRunStepEntity,
    'StepNumber' | 'StepType' | 'StepName' | 'Status' | 'Success' | 'ErrorMessage' | 'StartedAt' | 'CompletedAt'
>;

const RUN_FIELDS: (keyof TailRunRow)[] = ['ID', 'Status', 'Result'];
const STEP_FIELDS: (keyof TailStepRow)[] = [
    'StepNumber', 'StepType', 'StepName', 'Status', 'Success', 'ErrorMessage', 'StartedAt', 'CompletedAt',
];

/**
 * One step of an agent run, projected for the client's progress view.
 *
 * Carries metadata only. `InputData`, `OutputData` and the payload snapshots are
 * deliberately excluded: they are the largest columns on the row and a run can hold
 * hundreds of steps, so including them would let a single tail call return tens of
 * megabytes. The final result is delivered once, via `FinalPayload`, when the run
 * reaches a terminal state.
 */
@ObjectType()
export class ConversationRunEvent {
    /** Monotonic position within the run. The cursor a client pages from. */
    @Field(() => Int)
    Seq: number;

    @Field(() => String)
    StepType: string;

    @Field(() => String)
    StepName: string;

    @Field(() => String)
    Status: string;

    @Field(() => Boolean, { nullable: true })
    Success?: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => Date)
    StartedAt: Date;

    @Field(() => Date, { nullable: true })
    CompletedAt?: Date;
}

/** Result of a tail call. */
@ObjectType()
export class ConversationRunEventsOutput {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String)
    Message: string;

    @Field(() => [ConversationRunEvent])
    Events: ConversationRunEvent[];

    /**
     * Highest `Seq` the caller has now seen. Pass it back as `sinceSeq` on the next call.
     * Echoes the request's `sinceSeq` when nothing new has landed, so a client that polls
     * a quiet run never rewinds.
     */
    @Field(() => Int)
    LatestSeq: number;

    /**
     * True while the run is still executing, including a run `Paused` on a workflow that is still
     * running. False means terminal — stop tailing, and `FinalPayload` / `RunStatus` hold the
     * outcome. A failed call (`Success` false) reports true, because it knows nothing about the run.
     */
    @Field(() => Boolean)
    IsInFlight: boolean;

    @Field(() => String, { nullable: true })
    RunID?: string;

    @Field(() => String, { nullable: true })
    RunStatus?: string;

    /**
     * The run's answer, returned only once the run is terminal.
     *
     * Sourced from `AIAgentRun.Result`, falling back to the conversation detail's message because
     * `Result` is agent-dependent and null on many successful runs. Still nullable: a caller must
     * decide a message is finished from {@link IsInFlight} / {@link DetailStatus}, never from the
     * presence of this field, or it will wait forever on an agent that writes neither.
     */
    @Field(() => String, { nullable: true })
    FinalPayload?: string;

    /** `ConversationDetail.Status` — the value the chat UI renders from. */
    @Field(() => String, { nullable: true })
    DetailStatus?: string;
}

/**
 * Every read here sets `BypassCache`. This is the last-resort recovery path, and the rows it
 * judges are written by callers that fire no cache invalidation — `spSweepStaleAIAgentRuns`
 * force-fails a run with a direct set-based UPDATE. `TrustServerCacheCompletely` defaults on, so
 * a cached read would keep reporting a swept run as `Running` and recovery would never fire.
 */

/** Ceiling on events returned per call. A client with a gap larger than this pages. */
const MAX_EVENTS_PER_TAIL = 200;

/**
 * Run statuses that mean execution is still in progress. `Paused` is a run parked on a workflow
 * that is still executing; the orphan reconciler and the process panel treat it the same way.
 */
const IN_FLIGHT_STATUSES: MJAIAgentRunEntity['Status'][] = ['Running', 'Paused'];

/**
 * Durable, resumable read of an agent run's progress (MJ #4222).
 *
 * The `statusUpdates` subscription is the only live path a conversation has, and it has no
 * replay: the server topic is an in-memory PubSub and the client subject is explicitly
 * unbuffered. Anything published while a socket is half-open is gone, and the client cannot
 * tell the difference between "nothing happened" and "I missed everything".
 *
 * This query is the durable counterpart, mirroring `IntegrationTailRunEvents` — the same
 * shape the integration subsystem already uses, where the subscription is a latency
 * optimization over a log rather than the only delivery path. A client keeps the `LatestSeq`
 * it has seen and re-reads from there after any interruption.
 *
 * It is a READ MODEL over tables that already exist. `AIAgentRunStep` rows are inserted when
 * a step starts and updated when it finishes, so progress is visible mid-run, and
 * `StepNumber` is already monotonic per run. No new table and no migration.
 *
 * Authorization is delegated to `RunView` executed as the calling user, so MJ's existing
 * row-level security decides what is visible. A caller who cannot read the conversation
 * detail gets the same answer as one asking about a detail that does not exist.
 */
@Resolver()
export class ConversationRunEventsResolver {
    @Query(() => ConversationRunEventsOutput)
    async TailConversationEvents(
        @Arg('conversationDetailID', () => String) conversationDetailID: string,
        @Ctx() ctx: AppContext,
        @Arg('sinceSeq', () => Int, { defaultValue: 0 }) sinceSeq?: number
    ): Promise<ConversationRunEventsOutput> {
        const from = Math.max(0, sinceSeq ?? 0);
        const empty = (message: string): ConversationRunEventsOutput => ({
            Success: false,
            Message: message,
            Events: [],
            LatestSeq: from,
            IsInFlight: true,
        });

        try {
            const user = ctx.userPayload?.userRecord;
            if (!user) {
                return empty('User is not authenticated');
            }

            const provider = GetReadOnlyProvider(ctx.providers, { allowFallbackToReadWrite: true });
            const detail = await this.loadDetail(provider, conversationDetailID, user);
            if (!detail) {
                // Not found and not authorized are deliberately indistinguishable — answering
                // "exists but denied" would confirm the id to someone probing for one.
                return empty(`Conversation detail '${conversationDetailID}' not found`);
            }

            const run = await this.loadLatestRun(provider, conversationDetailID, user);
            if (!run) {
                // The mutation is acknowledged before the run row exists, so this is an
                // ordinary early-poll result, not an error. Reported as success with nothing
                // to show so a client does not treat a race as a failure.
                return {
                    Success: true,
                    Message: 'No agent run yet for this conversation detail',
                    Events: [],
                    LatestSeq: from,
                    IsInFlight: false,
                    DetailStatus: detail.Status ?? undefined,
                };
            }

            const isInFlight = IN_FLIGHT_STATUSES.includes(run.Status);
            const steps = await this.loadSteps(provider, run.ID, from, user);
            const events = steps.map((s) => this.toEvent(s));

            return {
                Success: true,
                Message: `${events.length} event(s)`,
                Events: events,
                // Never rewind: a quiet run returns the cursor the caller already held.
                LatestSeq: events.length > 0 ? events[events.length - 1].Seq : from,
                IsInFlight: isInFlight,
                RunID: run.ID,
                RunStatus: run.Status,
                // Only meaningful once terminal; sending it mid-run would hand the client a
                // partial payload it could mistake for the final answer.
                //
                // `AIAgentRun.Result` is agent-dependent — it is null on a large share of
                // genuinely successful runs — so the conversation detail's own message is the
                // fallback. That is the text the chat renders, so it is the answer a caller
                // waiting on this field actually wants.
                FinalPayload: isInFlight ? undefined : (run.Result ?? detail.Message ?? undefined),
                DetailStatus: detail.Status ?? undefined,
            };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return empty(`TailConversationEvents failed: ${message}`);
        }
    }

    /** Loads the conversation detail as the calling user; null when absent or not permitted. */
    private async loadDetail(
        provider: IMetadataProvider,
        conversationDetailID: string,
        user: UserInfo
    ): Promise<MJConversationDetailEntity | undefined> {
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<MJConversationDetailEntity>(
            {
                EntityName: 'MJ: Conversation Details',
                ExtraFilter: `ID='${this.escape(conversationDetailID)}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
                BypassCache: true,
            },
            user
        );
        return result.Success ? result.Results?.[0] : undefined;
    }

    /**
     * Newest run for the detail. A conversation detail can be retried, and the latest run is
     * the one the UI is showing.
     */
    private async loadLatestRun(
        provider: IMetadataProvider,
        conversationDetailID: string,
        user: UserInfo
    ): Promise<TailRunRow | undefined> {
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<TailRunRow>(
            {
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ConversationDetailID='${this.escape(conversationDetailID)}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 1,
                Fields: RUN_FIELDS,
                ResultType: 'simple',
                BypassCache: true,
            },
            user
        );
        return result.Success ? result.Results?.[0] : undefined;
    }

    /** Steps after `sinceSeq`, oldest first, bounded by {@link MAX_EVENTS_PER_TAIL}. */
    private async loadSteps(
        provider: IMetadataProvider,
        agentRunID: string,
        sinceSeq: number,
        user: UserInfo
    ): Promise<TailStepRow[]> {
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<TailStepRow>(
            {
                EntityName: 'MJ: AI Agent Run Steps',
                ExtraFilter: `AgentRunID='${this.escape(agentRunID)}' AND StepNumber > ${Math.floor(sinceSeq)}`,
                OrderBy: 'StepNumber ASC',
                MaxRows: MAX_EVENTS_PER_TAIL,
                Fields: STEP_FIELDS,
                ResultType: 'simple',
                BypassCache: true,
            },
            user
        );
        return result.Success ? (result.Results ?? []) : [];
    }

    /** Projects a plain step row to an event. Plain rows may carry dates as strings. */
    private toEvent(step: TailStepRow): ConversationRunEvent {
        return {
            Seq: step.StepNumber,
            StepType: step.StepType,
            StepName: step.StepName,
            Status: step.Status,
            Success: step.Success ?? undefined,
            ErrorMessage: step.ErrorMessage ?? undefined,
            StartedAt: new Date(step.StartedAt),
            CompletedAt: step.CompletedAt != null ? new Date(step.CompletedAt) : undefined,
        };
    }

    /** Escapes a value for the `ExtraFilter` string. Ids are UUIDs, but never trust the shape. */
    private escape(value: string): string {
        return EscapeSQLString(value);
    }
}
