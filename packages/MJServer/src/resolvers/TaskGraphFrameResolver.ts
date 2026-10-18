/**
 * @fileoverview Live signal for durable task graphs — the dispatcher's lifecycle frames, published
 * to anyone watching a given graph.
 *
 * **Why frames rather than cache invalidation.** The alternative considered was emitting
 * invalidation events after each CAS claim so clients re-read Task rows. That works, but it makes
 * every consumer reconstruct meaning by diffing rows, and couples the UI to claim mechanics. A
 * frame says what happened — "this step failed, here is why" — so a viewer renders progress
 * directly. This is §3.4's originally-promised mechanism.
 *
 * **Addressed by `ParentTaskID`, deliberately not by session.** A durable graph outlives the tab
 * that submitted it, and may be started by a schedule with no session at all. Keying on the graph
 * means "watch this workflow run" works for whoever is permitted to see it, whenever they arrive —
 * including after a page refresh, which a session-keyed push cannot survive.
 *
 * @module @memberjunction/server
 */
import { Arg, Field, ID, ObjectType, PubSubEngine, Resolver, ResolverFilterData, Root, Subscription } from 'type-graphql';
import { LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { TaskGraphFrame, TaskGraphObserver } from '@memberjunction/task-graph';

export const TASK_GRAPH_FRAMES_TOPIC = 'TASK_GRAPH_FRAMES';

/** One lifecycle event, as it reaches a subscriber. */
@ObjectType()
export class TaskGraphFrameNotification {
  @Field(() => String)
  kind!: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => ID)
  parentTaskId!: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => ID, { nullable: true })
  taskId?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, { nullable: true })
  taskName?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, { nullable: true })
  status?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, { nullable: true })
  errorMessage?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => ID, { nullable: true })
  assignedUserId?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => Number, { nullable: true })
  completedCount?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => Number, { nullable: true })
  totalCount?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  // ── GateDecision ──────────────────────────────────────────────────────────
  @Field(() => ID, { nullable: true })
  edgeId?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => ID, { nullable: true })
  dependsOnTaskId?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  /** 'satisfied' | 'notTaken' | 'held' */
  @Field(() => String, { nullable: true })
  verdict?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, { nullable: true })
  conditionText?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, { nullable: true })
  reason?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  // ── ClaimChanged ──────────────────────────────────────────────────────────
  /** 'claimed' | 'heartbeat-lost' | 'reclaimed' */
  @Field(() => String, { nullable: true })
  claimEvent?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, { nullable: true })
  claimedBy?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, { nullable: true })
  claimExpiresAt?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  // ── PassCompleted ─────────────────────────────────────────────────────────
  @Field(() => Number, { nullable: true })
  passNumber?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => Number, { nullable: true })
  eligibleCount?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => Number, { nullable: true })
  heldCount?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => Number, { nullable: true })
  claimedCount?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  /** The dispatcher instance's own load across every graph — not this graph's in-flight count. */
  @Field(() => Number, { nullable: true })
  instanceInFlightCount?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  // ── NodeProgress ──────────────────────────────────────────────────────────
  @Field(() => String, { nullable: true })
  progressMessage?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => Number, { nullable: true })
  progressPercent?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => Date)
  date!: Date;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

/**
 * Wire payload. Identical to {@link TaskGraphFrame} plus the graph's owner, which exists ONLY as the
 * server-side filter key and is never returned to a subscriber — the same discipline
 * `PushStatusNotificationPayload` uses for `ownerUserId`.
 */
export interface TaskGraphFramePayload extends TaskGraphFrame {
  /** User the graph belongs to. Filter key; never sent to the client. */
  ownerUserId: string;
}

interface TaskGraphFrameArgs {
  parentTaskId: string;
}

/** Minimal shape of the subscription's connection context needed by the filter. */
export interface TaskGraphFrameFilterContext {
  userPayload?: { userRecord?: { ID?: string } };
}

/**
 * Delivery predicate. A frame reaches a subscriber only when BOTH hold:
 *   1. it belongs to the graph the subscriber asked to watch, AND
 *   2. the graph's owner matches the subscriber CONNECTION's authenticated identity.
 *
 * Condition 2 is load-bearing, and for the same reason `statusUpdatesFilter` needs it: a
 * `parentTaskId` is discoverable, so without an identity check anyone holding one could watch
 * another user's workflow — including its per-step error messages. **Fails closed** — a missing
 * identity on either side never matches.
 */
export function TaskGraphFrameFilter(data: {
  payload: TaskGraphFramePayload;
  args: TaskGraphFrameArgs;
  context: TaskGraphFrameFilterContext | undefined;
}): boolean {
  const { payload, args, context } = data;
  if (!payload.ParentTaskID || !args.parentTaskId) {
    return false;
  }
  if (!UUIDsEqual(payload.ParentTaskID, args.parentTaskId)) {
    return false;
  }
  const connectionUserId = context?.userPayload?.userRecord?.ID;
  if (!connectionUserId || !payload.ownerUserId) {
    return false; // fail closed
  }
  return UUIDsEqual(payload.ownerUserId, connectionUserId);
}

/** @deprecated Use {@link TaskGraphFrameFilter}. */
export function taskGraphFrameFilter(data: {
  payload: TaskGraphFramePayload;
  args: TaskGraphFrameArgs;
  context: TaskGraphFrameFilterContext | undefined;
}): boolean {
  return TaskGraphFrameFilter(data);
}

/**
 * MJServer's `TaskGraphObserver` — turns dispatcher frames into a PubSub publish.
 *
 * `OnFrame` is synchronous and swallows everything by contract: a frame is commentary on work, never
 * a step of it, so nothing here may stall or fail a graph. The publish itself is fire-and-forget for
 * the same reason.
 */
export class TaskGraphFrameBroadcaster implements TaskGraphObserver {
  constructor(private readonly pubSub: PubSubEngine) {}

  public OnFrame(frame: TaskGraphFrame): void {
    try {
      if (!frame.OwnerUserID) {
        // A graph with no recorded owner cannot be authorized to anyone, so publishing would only
        // produce frames the filter refuses. Dropping is the same outcome, without the traffic.
        // Reachable for graphs submitted before ownership was recorded on the parent.
        return;
      }
      void this.pubSub.publish(
        TASK_GRAPH_FRAMES_TOPIC,
        { ...frame, ownerUserId: frame.OwnerUserID } satisfies TaskGraphFramePayload,
      );
    } catch (e) {
      LogError(`[TaskGraphFrameBroadcaster] Could not publish ${frame.Kind} (ignored): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

@Resolver()
export class TaskGraphFrameResolver {
  @Subscription(() => TaskGraphFrameNotification, {
    topics: TASK_GRAPH_FRAMES_TOPIC,
    filter: (data: ResolverFilterData<TaskGraphFramePayload, TaskGraphFrameArgs, TaskGraphFrameFilterContext>) =>
      TaskGraphFrameFilter(data),
  })
  taskGraphFrames(  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
    @Root() payload: TaskGraphFramePayload,
    @Arg('parentTaskId', () => ID) parentTaskId: string
  ): TaskGraphFrameNotification {
    // ownerUserId is intentionally NOT returned — it is a server-side filter key only.
    return {
      kind: payload.Kind,
      parentTaskId,
      taskId: payload.TaskID,
      taskName: payload.TaskName,
      status: payload.Status,
      errorMessage: payload.ErrorMessage,
      assignedUserId: payload.AssignedUserID,
      completedCount: payload.CompletedCount,
      totalCount: payload.TotalCount,
      edgeId: payload.EdgeID,
      dependsOnTaskId: payload.DependsOnTaskID,
      verdict: payload.Verdict,
      conditionText: payload.ConditionText,
      reason: payload.Reason,
      claimEvent: payload.ClaimEvent,
      claimedBy: payload.ClaimedBy,
      claimExpiresAt: payload.ClaimExpiresAt,
      passNumber: payload.PassNumber,
      eligibleCount: payload.EligibleCount,
      heldCount: payload.HeldCount,
      claimedCount: payload.ClaimedCount,
      instanceInFlightCount: payload.InstanceInFlightCount,
      progressMessage: payload.ProgressMessage,
      progressPercent: payload.ProgressPercent,
      date: new Date(),
    };
  }
}
