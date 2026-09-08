/**
 * @fileoverview The shape of "everywhere this agent runs without anyone pressing Run", and the pure
 * functions that derive it.
 *
 * **Why this exists.** MJ already has every mechanism an agent needs to be invoked automatically —
 * Scheduled Jobs, User Routines, Entity Actions, Record Processes, a step inside another agent's
 * flow. What it has never had is the *inverse* index: standing on an agent and asking "what fires
 * me?" Answering that meant knowing all five substrates existed and checking each one by hand, so in
 * practice nobody answered it — which is how an agent ends up quietly running on a schedule someone
 * set up months ago and forgot.
 *
 * **Pure on purpose.** Everything here is data-in/data-out so the interesting decisions — what counts
 * as live, how a cron reads in English, which pathway outranks which — are unit-testable without a
 * database or a browser. The component does the querying; this does the thinking.
 *
 * @module @memberjunction/ng-agents
 */

/**
 * The substrates an agent can be invoked from.
 *
 * Not an open-ended string: each arm has a runner behind it, and a pathway with no substrate is a
 * pathway nobody can trace back to a row.
 */
export type AgentInvocationKind =
    /** A Scheduled Job whose configuration names this agent. */
    | 'Schedule'
    /** A User Routine targeting this agent — a person's own recurring ask. */
    | 'Routine'
    /** An Entity Action binding: a data change on some entity dispatches this agent. */
    | 'DataChange'
    /** A Record Process that runs this agent across a set of records. */
    | 'BulkOperation'
    /** A step or relationship inside another agent that delegates here. */
    | 'CalledByAgent'
    /** `ExposeAsAction` — anything that can run an Action can run this agent. */
    | 'ExposedAsAction';

/**
 * Whether a pathway can actually fire right now.
 *
 * Three states rather than a boolean because "switched off" and "switched on but its owner is
 * disabled" are different problems with different fixes, and collapsing them would hide the second.
 */
export type AgentInvocationState = 'Live' | 'Paused' | 'Off';

/** One concrete way this agent gets invoked, traceable back to the row that says so. */
export type AgentInvocationPathway = {
    Kind: AgentInvocationKind;
    /** What the user reads first — the job's name, the calling agent's name, the entity. */
    Title: string;
    /** One line answering "when does this fire?" in the user's language, never cron syntax alone. */
    Trigger: string;
    State: AgentInvocationState;
    /** Why it is not Live, when it is not. Absent for a Live pathway — nothing to explain. */
    StateDetail?: string;
    /** The row behind this pathway, so the host can open it. Absent for `ExposedAsAction`, which is a flag on the agent itself. */
    EntityName?: string;
    RecordID?: string;
    LastRunAt?: Date | null;
    NextRunAt?: Date | null;
};

/** Pathways of one kind, with the chrome needed to render the group. */
export type AgentInvocationGroup = {
    Kind: AgentInvocationKind;
    Label: string;
    Icon: string;
    /** What this substrate *is*, for someone who has not met it before. */
    Blurb: string;
    Pathways: AgentInvocationPathway[];
    /** How many of them can fire right now. */
    LiveCount: number;
};

/** The one-glance answer at the top of the surface. */
export type AgentInvocationSummary = {
    Total: number;
    Live: number;
    /** True when at least one pathway can fire without a person. */
    IsAutomated: boolean;
    /** The soonest scheduled run across every pathway that knows its next run. */
    NextRunAt: Date | null;
};

/**
 * Display order and copy for each substrate.
 *
 * Ordered by how surprising the pathway is to someone auditing an agent: a schedule you set up is
 * expected, another agent calling you is less so, and `ExposeAsAction` — which opens the agent to
 * *anything* that can run an action — is the one most worth seeing last and largest.
 */
const GROUP_CHROME: ReadonlyArray<{ Kind: AgentInvocationKind; Label: string; Icon: string; Blurb: string }> = [
    {
        Kind: 'Schedule',
        Label: 'Schedules',
        Icon: 'fa-solid fa-clock',
        Blurb: 'Runs on a recurring schedule, with no one present.',
    },
    {
        Kind: 'Routine',
        Label: 'Routines',
        Icon: 'fa-solid fa-repeat',
        Blurb: "Someone's own recurring request, run on their behalf.",
    },
    {
        Kind: 'DataChange',
        Label: 'Data changes',
        Icon: 'fa-solid fa-bolt',
        Blurb: 'Fires when a record is created, updated or deleted.',
    },
    {
        Kind: 'BulkOperation',
        Label: 'Bulk operations',
        Icon: 'fa-solid fa-layer-group',
        Blurb: 'Runs across a whole set of records in one pass.',
    },
    {
        Kind: 'CalledByAgent',
        Label: 'Called by other agents',
        Icon: 'fa-solid fa-diagram-project',
        Blurb: 'Another agent delegates part of its work here.',
    },
    {
        Kind: 'ExposedAsAction',
        Label: 'Available as an action',
        Icon: 'fa-solid fa-plug',
        Blurb: 'Anything that can run an action can run this agent.',
    },
];

/**
 * Buckets pathways into their groups, in a fixed order, dropping the empty ones.
 *
 * Empty groups are dropped rather than shown greyed: a surface answering "what invokes this?" that
 * lists six headings with nothing under five of them buries the one real answer.
 */
export function GroupInvocations(pathways: readonly AgentInvocationPathway[]): AgentInvocationGroup[] {
    const groups: AgentInvocationGroup[] = [];
    for (const chrome of GROUP_CHROME) {
        const members = pathways.filter((p) => p.Kind === chrome.Kind);
        if (members.length === 0) continue;
        groups.push({
            ...chrome,
            Pathways: members,
            LiveCount: members.filter((p) => p.State === 'Live').length,
        });
    }
    return groups;
}

/** The header line: how many pathways exist, how many are live, and when the next one fires. */
export function SummarizeInvocations(pathways: readonly AgentInvocationPathway[]): AgentInvocationSummary {
    const live = pathways.filter((p) => p.State === 'Live');
    const nextRuns = live
        .map((p) => p.NextRunAt)
        .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
    return {
        Total: pathways.length,
        Live: live.length,
        IsAutomated: live.length > 0,
        NextRunAt: nextRuns.length > 0 ? new Date(Math.min(...nextRuns.map((d) => d.getTime()))) : null,
    };
}

/**
 * Maps a lifecycle status onto the three states this surface cares about.
 *
 * Every substrate spells its statuses differently (`Disabled`, `Paused`, `Revoked`, `Draft`,
 * `Pending`) but they collapse into the same three questions, so the mapping lives here once rather
 * than being re-decided per query.
 */
export function ResolveInvocationState(status: string | null | undefined): AgentInvocationState {
    switch ((status ?? '').trim().toLowerCase()) {
        case 'active':
            return 'Live';
        case 'paused':
            return 'Paused';
        // 'Pending' and 'Draft' are pre-live rather than switched off, but neither fires, and telling
        // someone auditing an agent that a Draft "might run" would be the wrong kind of wrong.
        default:
            return 'Off';
    }
}

/** Field-count-preserving cron parts, so a malformed expression is described as itself, not guessed at. */
const CRON_DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Renders a cron expression as a sentence, and refuses to invent one it cannot justify.
 *
 * Covers the shapes people actually write — every N minutes, daily at a time, weekly on a day — and
 * falls back to showing the raw expression for anything else. A humanizer that guesses produces a
 * confident sentence describing a schedule the job does not have, which on this surface is worse
 * than showing five fields the reader can look up.
 */
export function DescribeCron(expression: string | null | undefined, timezone?: string | null): string {
    const raw = (expression ?? '').trim();
    if (!raw) return 'No schedule set';

    const suffix = timezone && timezone.trim() && timezone.trim().toLowerCase() !== 'utc' ? ` (${timezone.trim()})` : '';
    const parts = raw.split(/\s+/);
    if (parts.length < 5) return raw;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const everyDate = dayOfMonth === '*' && month === '*';
    // Captured explicitly rather than read back off `RegExp.$1`: that global is rewritten by the very
    // next `.test()` in the same condition, so `*/6` in the hour field silently became "every 0 hours"
    // the moment the minute field was checked alongside it.
    const minuteStep = stepOf(minute);
    const hourStep = stepOf(hour);
    const isNumber = (v: string) => /^\d+$/.test(v);

    if (everyDate && dayOfWeek === '*') {
        if (hour === '*' && minuteStep !== null) {
            return `Every ${minuteStep} minute${minuteStep === 1 ? '' : 's'}${suffix}`;
        }
        if (hour === '*' && isNumber(minute)) return `Hourly, at :${minute.padStart(2, '0')}${suffix}`;
        if (hourStep !== null && isNumber(minute)) {
            return `Every ${hourStep} hour${hourStep === 1 ? '' : 's'}${suffix}`;
        }
        if (isNumber(hour) && isNumber(minute)) return `Daily at ${formatClock(hour, minute)}${suffix}`;
    }

    if (everyDate && /^[0-6]$/.test(dayOfWeek) && /^\d+$/.test(hour) && /^\d+$/.test(minute)) {
        return `Every ${CRON_DOW[Number(dayOfWeek)]} at ${formatClock(hour, minute)}${suffix}`;
    }

    // Nothing above matched with confidence. The expression itself is more honest than a guess.
    return `${raw}${suffix}`;
}

function formatClock(hour: string, minute: string): string {
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

/** The N in a `*&#47;N` cron field, or null when the field is not a step. */
function stepOf(field: string): number | null {
    const match = /^\*\/(\d+)$/.exec(field);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Turns invocation-type names into the phrase a person would say.
 *
 * MJ names them `Create`, `Update`, `Delete`, `Validate`, `BeforeSave` and so on; a list of those on
 * screen reads like schema. "when a record is created or updated" reads like an answer.
 */
export function DescribeInvocationTypes(typeNames: readonly string[]): string {
    const verbs = typeNames
        .map((n) => (n ?? '').trim())
        .filter((n) => n.length > 0)
        .map((n) => INVOCATION_VERBS[n.toLowerCase()] ?? n.toLowerCase());
    const unique = [...new Set(verbs)];
    if (unique.length === 0) return 'On a data change';
    return `When a record is ${joinWithOr(unique)}`;
}

const INVOCATION_VERBS: Record<string, string> = {
    create: 'created',
    created: 'created',
    aftercreate: 'created',
    update: 'updated',
    updated: 'updated',
    afterupdate: 'updated',
    delete: 'deleted',
    deleted: 'deleted',
    afterdelete: 'deleted',
    validate: 'validated',
    beforesave: 'saved',
    aftersave: 'saved',
    beforedelete: 'deleted',
    read: 'read',
};

/** `a`, `a or b`, `a, b or c` — the Oxford-free form people speak. */
export function joinWithOr(items: readonly string[]): string {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/**
 * Whether a string is a plain UUID.
 *
 * Guards the one place a value reaches an `ExtraFilter` as a literal: `ScheduledJob.Configuration`
 * is free-form JSON, so finding the jobs that name an agent means a `LIKE` against it, and a `LIKE`
 * is string concatenation into SQL. Every id used that way is checked here first — the agent's own
 * primary key always passes, and anything that does not is not queried at all.
 */
export function IsUUID(value: string | null | undefined): boolean {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test((value ?? '').trim());
}

/**
 * Renders a moment as something scannable — "in 3 hours", "2 days ago".
 *
 * Coarse on purpose: on this surface nobody needs the second, they need to know whether the last run
 * was recent enough that the agent is still doing its job.
 */
export function DescribeWhen(when: Date | null | undefined, now: Date): string | null {
    if (!(when instanceof Date) || Number.isNaN(when.getTime())) return null;
    const deltaMs = when.getTime() - now.getTime();
    const future = deltaMs > 0;
    const mins = Math.round(Math.abs(deltaMs) / 60_000);

    if (mins < 1) return future ? 'in under a minute' : 'just now';
    const phrase = describeSpan(mins);
    return future ? `in ${phrase}` : `${phrase} ago`;
}

function describeSpan(mins: number): string {
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
    const years = Math.round(months / 12);
    return `${years} year${years === 1 ? '' : 's'}`;
}
