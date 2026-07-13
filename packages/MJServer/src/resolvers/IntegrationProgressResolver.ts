/**
 * IntegrationProgressResolver — GraphQL subscription surface for long-running
 * integration events (plan.md §11).
 *
 * Exposes a SINGLE @Subscription topic carrying structured progress notifications
 * for every kind of integration run — metadata refresh, connector creation, sync,
 * and RSU — so a UI can stream live updates instead of polling
 * IntegrationTailRunEvents. Filtering by `runID`, `companyIntegrationID`, and `kind`
 * happens in the subscription filter, exactly like PipelineProgressResolver.
 *
 * Wiring through the MJ event system: server-side producers (the
 * IntegrationProgressEmitter, the connector-creation pipeline, the sync engine,
 * the RSU pipeline) call the exported {@link PublishIntegrationProgress} helper,
 * which forwards onto the same `PubSubManager` PubSub infrastructure that backs
 * PipelineProgress and cache-invalidation events — NOT a parallel mechanism.
 */
import { Resolver, Subscription, Root, ObjectType, Field, Int, Arg } from 'type-graphql';
import { LogError } from '@memberjunction/core';
import type {
    IntegrationRunKind,
    IntegrationProgressEventType,
    IntegrationProgressLevel,
} from '@memberjunction/integration-progress-artifacts';
import { PubSubManager } from '../generic/PubSubManager.js';

/**
 * The single PubSub topic all integration progress notifications ride. Mirrors
 * PIPELINE_PROGRESS_TOPIC — one topic, filtered per-subscriber by run/connector/kind.
 */
export const INTEGRATION_PROGRESS_TOPIC = 'INTEGRATION_PROGRESS';

/**
 * Logical channels (the "topic enum" of plan.md §11) a subscriber can scope to.
 * These map 1:1 onto a subset of {@link IntegrationRunKind} so a UI can subscribe
 * to, e.g., only sync progress without parsing every notification. Expressed as a
 * string union (per the union-types-over-enums convention) and surfaced over
 * GraphQL as a plain String argument/field.
 */
export type IntegrationProgressTopic =
    | 'MetadataRefresh'
    | 'ConnectorCreation'
    | 'Sync'
    | 'RSU';

/**
 * Maps an {@link IntegrationRunKind} (the vocabulary the emitter writes) onto the
 * coarser {@link IntegrationProgressTopic} channel a subscriber filters by. Kinds
 * without a dedicated channel resolve to `undefined` and only match unscoped
 * subscriptions.
 */
const RUN_KIND_TO_TOPIC: Readonly<Record<IntegrationRunKind, IntegrationProgressTopic | undefined>> = {
    Discovery: 'MetadataRefresh',
    Enrichment: 'MetadataRefresh',
    ConnectorCreation: 'ConnectorCreation',
    SyncRun: 'Sync',
    RSU: 'RSU',
    TableCreation: 'RSU',
    Other: undefined,
};

/** Resolve the logical channel for a run kind (helper kept tiny + testable). */
export function IntegrationProgressTopicForKind(kind: IntegrationRunKind): IntegrationProgressTopic | undefined {
    return RUN_KIND_TO_TOPIC[kind];
}

/**
 * A single integration progress notification pushed to the subscription topic.
 * Carries the structured shape plan.md §11 asks for — the subsystem-specific
 * `data` payload is serialized into `DataJSON` so the GraphQL field stays a scalar.
 */
@ObjectType()
export class IntegrationProgressNotification {
    /** The run this event belongs to (matches manifest.runID). */
    @Field(() => String)
    RunID: string;

    /** The connector (CompanyIntegration) the run is for, when known. */
    @Field(() => String, { nullable: true })
    CompanyIntegrationID?: string;

    /** What kind of run produced this event (IntegrationRunKind, as a string). */
    @Field(() => String)
    Kind: string;

    /** The logical channel this notification belongs to (IntegrationProgressTopic). */
    @Field(() => String, { nullable: true })
    Topic?: string;

    /** The progress event type (IntegrationProgressEventType, as a string). */
    @Field(() => String)
    EventType: string;

    /** Monotonic sequence number within the run. */
    @Field(() => Int)
    Seq: number;

    /** Free-form human message (optional). */
    @Field(() => String, { nullable: true })
    Message?: string;

    /** Stage name within the run (optional). */
    @Field(() => String, { nullable: true })
    Stage?: string;

    /** Severity level (info/warn/error/debug). */
    @Field(() => String, { nullable: true })
    Level?: string;

    /** Subsystem-specific structured payload, JSON-serialized. */
    @Field(() => String, { nullable: true })
    DataJSON?: string;
}

/**
 * Arguments the emitter/pipeline pass to {@link PublishIntegrationProgress}. The
 * helper derives `Topic` and serializes `Data`, so callers pass the raw event shape.
 */
export interface PublishIntegrationProgressArgs {
    RunID: string;
    Kind: IntegrationRunKind;
    EventType: IntegrationProgressEventType;
    Seq: number;
    CompanyIntegrationID?: string;
    Message?: string;
    Stage?: string;
    Level?: IntegrationProgressLevel;
    Data?: Record<string, unknown>;
}

/** Predicate used by the @Subscription filter — exported so it is unit-testable. */
export function MatchesIntegrationSubscription(
    payload: IntegrationProgressNotification,
    args: { runID?: string; companyIntegrationID?: string; topic?: string }
): boolean {
    if (args.runID && payload.RunID !== args.runID) return false;
    if (args.companyIntegrationID && payload.CompanyIntegrationID !== args.companyIntegrationID) return false;
    if (args.topic && payload.Topic !== args.topic) return false;
    return true;
}

/**
 * Build the notification payload from publish args. Pure + side-effect free so the
 * shape (including JSON serialization + topic derivation) can be asserted in tests
 * without touching PubSub.
 */
export function BuildIntegrationProgressNotification(
    args: PublishIntegrationProgressArgs
): IntegrationProgressNotification {
    return {
        RunID: args.RunID,
        CompanyIntegrationID: args.CompanyIntegrationID,
        Kind: args.Kind,
        Topic: IntegrationProgressTopicForKind(args.Kind),
        EventType: args.EventType,
        Seq: args.Seq,
        Message: args.Message,
        Stage: args.Stage,
        Level: args.Level,
        DataJSON: serializeData(args.Data),
    };
}

/** JSON-serialize the subsystem payload, swallowing cyclic/serialization failures. */
function serializeData(data?: Record<string, unknown>): string | undefined {
    if (data == null) return undefined;
    try {
        return JSON.stringify(data);
    } catch (e) {
        LogError(`IntegrationProgressResolver: failed to serialize data payload: ${e}`);
        return undefined;
    }
}

/**
 * Publish an integration progress event onto the subscription topic. This is the
 * entry point server-side producers (IntegrationProgressEmitter, pipelines, sync
 * engine, RSU) call to push live updates to subscribed clients. Uses the shared
 * PubSubManager — the same infrastructure as PipelineProgress and cache events.
 *
 * Returns the published notification (handy for tests / logging); returns
 * undefined and logs if publishing fails (never throws into the producer path).
 */
export function PublishIntegrationProgress(
    args: PublishIntegrationProgressArgs
): IntegrationProgressNotification | undefined {
    try {
        const notification = BuildIntegrationProgressNotification(args);
        PubSubManager.Instance.Publish(INTEGRATION_PROGRESS_TOPIC, { ...notification });
        return notification;
    } catch (e) {
        LogError(`PublishIntegrationProgress failed: ${e}`);
        return undefined;
    }
}

@Resolver()
export class IntegrationProgressResolver {
    /**
     * Subscribe to integration progress notifications. With no arguments the
     * subscriber receives every integration event on this server; pass any of
     * `runID`, `companyIntegrationID`, or `topic` to scope the stream.
     */
    @Subscription(() => IntegrationProgressNotification, {
        topics: INTEGRATION_PROGRESS_TOPIC,
        filter: ({ payload, args }: {
            payload: IntegrationProgressNotification;
            args: { runID?: string; companyIntegrationID?: string; topic?: string };
        }) => MatchesIntegrationSubscription(payload, args),
    })
    IntegrationProgress(
        @Root() notification: IntegrationProgressNotification,
        @Arg('runID', () => String, { nullable: true }) _runID?: string,
        @Arg('companyIntegrationID', () => String, { nullable: true }) _companyIntegrationID?: string,
        @Arg('topic', () => String, { nullable: true }) _topic?: string
    ): IntegrationProgressNotification {
        return notification;
    }
}

export default IntegrationProgressResolver;
