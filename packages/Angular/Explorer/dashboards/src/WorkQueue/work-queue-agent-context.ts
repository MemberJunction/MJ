/**
 * @fileoverview Pure helpers for the Work Queue dashboard: tab ids, attention ordering, age formatting, the
 * tolerant subscription resolver the agent tools use, and the agent-context shaping. No Angular imports, so
 * every function here is unit-tested in isolation (see __tests__/work-queue-agent-context.test.ts).
 *
 * 🔒 SAFETY: the agent surface is read-only and navigational. Replay and discard are mutations that must be
 * confirmed by the user in the UI; the tools registered by the dashboard never execute them.
 */
import { UUIDsEqual } from '@memberjunction/global';

export const WORK_QUEUE_TABS = ['overview', 'dead-letters', 'partitions', 'bindings'] as const;
export type WorkQueueTab = (typeof WORK_QUEUE_TABS)[number];

export const WORK_QUEUE_TAB_LABELS: Record<WorkQueueTab, string> = {
    overview: 'Overview',
    'dead-letters': 'Dead Letters',
    partitions: 'Partitions',
    bindings: 'Bindings',
};

/** The partition conditions WorkQueue.ListPartitions accepts (03 §5.2). */
export const WORK_QUEUE_PARTITION_CONDITIONS = ['Blocked', 'InFlight', 'Idle'] as const;
export type WorkQueuePartitionCondition = (typeof WORK_QUEUE_PARTITION_CONDITIONS)[number];

/** Upper bound on any list published in the agent context; a companion count reports the true total. */
export const WORK_QUEUE_CONTEXT_LIST_CAP = 25;

export function isValidWorkQueueTab(value: unknown): value is WorkQueueTab {
    return typeof value === 'string' && (WORK_QUEUE_TABS as readonly string[]).includes(value);
}

export function isValidPartitionCondition(value: unknown): value is WorkQueuePartitionCondition {
    return typeof value === 'string' && (WORK_QUEUE_PARTITION_CONDITIONS as readonly string[]).includes(value);
}

/** One subscription as the dashboard reports it to the agent: topology plus the last stats read (null until loaded). */
export interface WorkQueueSubscriptionSnapshot {
    ID: string;
    Name: string;
    Topic: string;
    Transport: string;
    PartitionMode: string;
    Status: string;
    Pending: number | null;
    InFlight: number | null;
    DeadLettered: number | null;
    BlockedKeys: number | null;
    OldestPendingAgeSeconds: number | null;
}

/** A subscription needs an operator when it holds dead letters or a blocked Ordered key. */
export function needsAttention(snapshot: Pick<WorkQueueSubscriptionSnapshot, 'DeadLettered' | 'BlockedKeys'>): boolean {
    return (snapshot.DeadLettered ?? 0) > 0 || (snapshot.BlockedKeys ?? 0) > 0;
}

/** Attention first, then by name; returns a new array. */
export function sortByAttention<T extends Pick<WorkQueueSubscriptionSnapshot, 'DeadLettered' | 'BlockedKeys' | 'Name'>>(items: readonly T[]): T[] {
    return [...items].sort((a, b) => {
        const attention = Number(needsAttention(b)) - Number(needsAttention(a));
        return attention !== 0 ? attention : a.Name.localeCompare(b.Name);
    });
}

/** '—' for null, then s / m / h m / d h at the coarsest useful unit. */
export function formatAge(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
        return '—';
    }
    const s = Math.floor(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
}

export interface SubscriptionCandidate {
    ID: string;
    Name: string;
}

export type SubscriptionResolution<T extends SubscriptionCandidate> =
    | { Kind: 'Match'; Item: T }
    | { Kind: 'Ambiguous'; Matches: T[] }
    | { Kind: 'NotFound' };

/**
 * Resolves an agent-supplied id or name tolerantly: exact id, then exact name (case-insensitive), then a unique
 * case-insensitive substring of the name. Several substring matches are reported as Ambiguous, never guessed.
 */
export function resolveSubscription<T extends SubscriptionCandidate>(candidates: readonly T[], query: string): SubscriptionResolution<T> {
    const needle = query.trim();
    if (needle === '') {
        return { Kind: 'NotFound' };
    }
    const byId = candidates.find((c) => UUIDsEqual(c.ID, needle));
    if (byId) return { Kind: 'Match', Item: byId };
    const lower = needle.toLowerCase();
    const byName = candidates.find((c) => c.Name.toLowerCase() === lower);
    if (byName) return { Kind: 'Match', Item: byName };
    const partial = candidates.filter((c) => c.Name.toLowerCase().includes(lower));
    if (partial.length === 1) return { Kind: 'Match', Item: partial[0] };
    return partial.length > 1 ? { Kind: 'Ambiguous', Matches: partial } : { Kind: 'NotFound' };
}

export interface WorkQueueAgentContextInput {
    ActiveTab: string;
    Subscriptions: WorkQueueSubscriptionSnapshot[];
    StatsFailures: string[];
    StatsLoaded: boolean;
    SelectedSubscription: string | null;
    PartitionCondition: WorkQueuePartitionCondition | null;
    DeadLetterCount: number | null;
    SelectedDeadLetterCount: number;
    BindingErrorCount: number | null;
    BindingWarningCount: number | null;
    LastRefreshedAt: string | null;
}

/**
 * Shapes the dashboard state for NavigationService.SetAgentContext. Counts come only from loaded stats: before the
 * first stats read the aggregate fields are null rather than fabricated zeros.
 */
export function buildWorkQueueAgentContext(input: WorkQueueAgentContextInput): Record<string, unknown> {
    const attention = sortByAttention(input.Subscriptions).filter(needsAttention);
    const totals = input.StatsLoaded
        ? input.Subscriptions.reduce(
            (acc, s) => ({
                Pending: acc.Pending + (s.Pending ?? 0),
                InFlight: acc.InFlight + (s.InFlight ?? 0),
                DeadLettered: acc.DeadLettered + (s.DeadLettered ?? 0),
                BlockedKeys: acc.BlockedKeys + (s.BlockedKeys ?? 0),
            }),
            { Pending: 0, InFlight: 0, DeadLettered: 0, BlockedKeys: 0 },
        )
        : null;
    const context: Record<string, unknown> = {
        Surface: 'WorkQueue',
        ActiveTab: input.ActiveTab,
        ActiveTabLabel: isValidWorkQueueTab(input.ActiveTab) ? WORK_QUEUE_TAB_LABELS[input.ActiveTab] : input.ActiveTab,
        SubscriptionCount: input.Subscriptions.length,
        Subscriptions: input.Subscriptions.slice(0, WORK_QUEUE_CONTEXT_LIST_CAP).map((s) => `${s.Name} (${s.Topic} / ${s.PartitionMode}, ${s.Status})`),
        StatsLoaded: input.StatsLoaded,
        Totals: totals,
        SubscriptionsNeedingAttentionCount: attention.length,
        SubscriptionsNeedingAttention: attention.slice(0, WORK_QUEUE_CONTEXT_LIST_CAP).map((s) => ({
            Name: s.Name, DeadLettered: s.DeadLettered, BlockedKeys: s.BlockedKeys, OldestPendingAgeSeconds: s.OldestPendingAgeSeconds,
        })),
        StatsFailures: input.StatsFailures.slice(0, WORK_QUEUE_CONTEXT_LIST_CAP),
        SelectedSubscription: input.SelectedSubscription,
        LastRefreshedAt: input.LastRefreshedAt,
    };
    if (input.ActiveTab === 'dead-letters') {
        context['DeadLetterCount'] = input.DeadLetterCount;
        context['SelectedDeadLetterCount'] = input.SelectedDeadLetterCount;
    }
    if (input.ActiveTab === 'partitions') {
        context['PartitionCondition'] = input.PartitionCondition;
    }
    if (input.ActiveTab === 'bindings') {
        context['BindingErrorCount'] = input.BindingErrorCount;
        context['BindingWarningCount'] = input.BindingWarningCount;
    }
    return context;
}
