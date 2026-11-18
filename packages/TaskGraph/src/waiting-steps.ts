/**
 * @fileoverview The pure half of waiting steps: which steps wait, for what, and what they hand on.
 *
 * Three step kinds finish without a runner. The dispatcher REACHES them (their prerequisites are
 * satisfied), marks them waiting, and something else completes them:
 *
 * | Kind | Completed by |
 * |---|---|
 * | `Wait` | the dispatcher, once `Task.DueAt` has passed |
 * | `External` | an outside caller, by task ID or by correlation key |
 * | `Human` with a plugged-in provider | that provider, when its own record is decided |
 *
 * A `Human` step on the built-in inbox (`AgentRequest`) is NOT a waiting step in this sense. Its
 * lifecycle — raise a request, settle from the answer, expire on the request's deadline — predates
 * this module and is unchanged.
 *
 * Everything here is a decision rather than I/O, so it is tested without a database; the dispatcher
 * keeps the loading and the guarded writes.
 *
 * @module @memberjunction/task-graph
 */
import { GetValueFromPath, IsDefaultHumanTaskProvider } from '@memberjunction/ai-core-plus';
import type { TaskStepConfiguration } from './decision-node';

/**
 * Marks a reached waiting step on `Task.ClaimedBy`.
 *
 * Distinct from the built-in inbox's notified marker on purpose: the inbox's sweeps re-raise a
 * request for any notified task whose request has gone, and a provider-Human step has no request.
 * Sharing the marker would have those sweeps re-raise an inbox request for a step the provider owns.
 */
export const WAITING_STEP_MARKER = '__waiting__';

/** The fields deciding whether a task is a waiting step. Structural, so `MJTaskEntity` satisfies it. */
export type WaitingStepRow = {
    StepType: string | null;
    Configuration: string | null;
};

/** A waiting step's kind, or `null` for any task that is not one. */
export type WaitingStepKind = 'External' | 'Wait' | 'ProviderHuman';

/** Parses `Task.Configuration`, yielding an empty bag for anything unusable. */
export function ParseStepConfiguration(raw: string | null | undefined): TaskStepConfiguration {
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as TaskStepConfiguration) : {};
    } catch {
        return {};
    }
}

/** Which kind of waiting step this task is, or `null`. */
export function WaitingStepKindOf(task: WaitingStepRow): WaitingStepKind | null {
    if (task.StepType === 'External') return 'External';
    if (task.StepType === 'Wait') return 'Wait';
    if (task.StepType === 'Human') {
        const provider = ParseStepConfiguration(task.Configuration).human?.provider;
        return IsDefaultHumanTaskProvider(provider) ? null : 'ProviderHuman';
    }
    return null;
}

/** True for a Human step handed to a plugged-in provider rather than the built-in inbox. */
export function IsProviderHumanTask(task: WaitingStepRow): boolean {
    return WaitingStepKindOf(task) === 'ProviderHuman';
}

/** Either a value, or the reason it could not be produced — stated rather than defaulted. */
export type Resolved<T> = { Value: T } | { Error: string };

/**
 * When a Wait step continues.
 *
 * `durationSeconds` counts from `now` — the moment the step is reached. `until` is a timestamp or a
 * `payload.<path>` read from the payload the step was reached with; the path may hold a Date, an
 * ISO string or epoch milliseconds. A moment in the past is returned as-is: the wait is then simply
 * already over, which is the useful reading of "charge on the 3rd" when the 3rd has passed.
 *
 * An unresolvable `until` is an error, never "now": continuing immediately because a payload value
 * was missing is exactly the silent wrong turn a workflow cannot recover from.
 */
export function ResolveWaitDueAt(
    wait: { until?: string; durationSeconds?: number } | undefined,
    payload: Record<string, unknown>,
    now: Date,
): Resolved<Date> {
    if (!wait) return { Error: 'it has no wait settings' };
    if (typeof wait.durationSeconds === 'number' && Number.isFinite(wait.durationSeconds)) {
        if (wait.durationSeconds < 0) return { Error: 'its durationSeconds is negative' };
        return { Value: new Date(now.getTime() + wait.durationSeconds * 1000) };
    }
    const until = wait.until?.trim();
    if (!until) return { Error: 'it sets neither "until" nor "durationSeconds"' };

    const raw = until.startsWith('payload.') ? GetValueFromPath(payload, until.slice('payload.'.length)) : until;
    const moment = toDate(raw);
    if (!moment) {
        return {
            Error: until.startsWith('payload.')
                ? `"${until}" holds ${raw === undefined ? 'nothing' : `"${String(raw)}"`}, which is not a moment in time`
                : `"${until}" is not a moment in time`,
        };
    }
    return { Value: moment };
}

/**
 * The key an External step waits on: a literal, or a `payload.<path>` read when the step is reached.
 *
 * `null` (no key) is a legitimate answer — the step is then signalled by its task ID. A key that names
 * a payload path holding nothing is an error, not `null`: the author asked to be signalled by key,
 * and a step that silently fell back to ID-only signalling would wait forever on a key nobody sends.
 */
export function ResolveCorrelationKey(
    external: { correlationKey?: string } | undefined,
    payload: Record<string, unknown>,
): Resolved<string | null> {
    const key = external?.correlationKey?.trim();
    if (!key) return { Value: null };
    if (!key.startsWith('payload.')) return { Value: key };
    const raw = GetValueFromPath(payload, key.slice('payload.'.length));
    if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) {
        return { Error: `its correlationKey "${key}" resolved to nothing` };
    }
    if (typeof raw === 'object') return { Error: `its correlationKey "${key}" resolved to an object, not a value` };
    return { Value: String(raw).trim() };
}

/** `now + hours`, or `null` when the step has no deadline. */
export function DeadlineFrom(expiresInHours: number | undefined, now: Date): Date | null {
    if (typeof expiresInHours !== 'number' || !Number.isFinite(expiresInHours) || expiresInHours <= 0) return null;
    return new Date(now.getTime() + expiresInHours * 3600 * 1000);
}

/**
 * The deadline a reached waiting step carries: the Wait's moment, or an External/Human step's
 * `expiresInHours` counted from now.
 */
export function WaitingStepDueAt(
    kind: WaitingStepKind,
    config: TaskStepConfiguration,
    payload: Record<string, unknown>,
    now: Date,
): Resolved<Date | null> {
    switch (kind) {
        case 'Wait':
            return ResolveWaitDueAt(config.wait, payload, now);
        case 'External':
            return { Value: DeadlineFrom(config.external?.expiresInHours, now) };
        case 'ProviderHuman':
            return { Value: DeadlineFrom(config.human?.expiresInHours, now) };
    }
}

/**
 * What a completed waiting step hands on: the payload it was reached with, with its own output
 * merged over it.
 *
 * A runner's output already carries everything it received, which is how the payload accumulates
 * through a graph. A waiting step has no runner, so the dispatcher does the accumulating — keeping
 * the payload it was reached with on the row, and merging the signal's payload (or a Wait's
 * `waitedUntil`) over it. Emitting only the step's own output would drop everything upstream from
 * every step downstream, and a branch reading `payload.customer` three steps later would quietly
 * read `undefined`.
 */
export function ComposeWaitingStepOutput(
    payloadAtStart: Record<string, unknown> | undefined,
    own: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
    return mergeDeep(payloadAtStart ?? {}, own ?? {});
}

/**
 * Whether what a waiting step hands on is tainted — recorded on completion as a runner's output is,
 * so the steps after it are gated by what actually reached them.
 *
 * - A **Wait** hands on exactly what it was reached with: its input taint, nothing added.
 * - An **External** or **provider-Human** step adds the signal's payload. A payload is content from
 *   outside the graph — a webhook body, another app's record — so it taints. A signal that only
 *   releases the step (no payload) adds nothing.
 *
 * A provider's completion never CLEARS taint, even when it names the person who decided: only the
 * server-verified review of the built-in inbox does (`HumanReviewClearsTaint`), and a provider's
 * account of who decided is code's word, not the server's.
 *
 * An input taint that was never recorded reads as tainted. Fail closed.
 */
export function WaitingStepOutputTaint(
    config: TaskStepConfiguration,
    signalPayload: Record<string, unknown> | null | undefined,
): boolean {
    const inputTainted = config.runtime?.isInputTainted !== false;
    return inputTainted || (!!signalPayload && Object.keys(signalPayload).length > 0);
}

/** A signal held on a step that was not reached yet; applied the moment the dispatcher reaches it. */
export type PendingWaitingSignal = {
    status: 'Complete' | 'Failed';
    payload?: Record<string, unknown> | null;
    errorMessage?: string | null;
    completedByUserID?: string | null;
    receivedAt: string;
};

/** The signal held on a step, or `null`. Tolerant of a malformed bag, which yields `null`. */
export function PendingSignalOf(config: TaskStepConfiguration): PendingWaitingSignal | null {
    const runtime = config.runtime as (TaskStepConfiguration['runtime'] & { pendingSignal?: unknown }) | undefined;
    const raw = runtime?.pendingSignal;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const signal = raw as Partial<PendingWaitingSignal>;
    if (signal.status !== 'Complete' && signal.status !== 'Failed') return null;
    return {
        status: signal.status,
        payload: isRecord(signal.payload) ? signal.payload : null,
        errorMessage: typeof signal.errorMessage === 'string' ? signal.errorMessage : null,
        completedByUserID: typeof signal.completedByUserID === 'string' ? signal.completedByUserID : null,
        receivedAt: typeof signal.receivedAt === 'string' ? signal.receivedAt : new Date(0).toISOString(),
    };
}

/** The payload a step was reached with, from its runtime record. */
export function PayloadAtStartOf(config: TaskStepConfiguration): Record<string, unknown> | undefined {
    const start = config.runtime?.payloadAtStart;
    return isRecord(start) ? start : undefined;
}

function toDate(raw: unknown): Date | null {
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
    if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw);
    if (typeof raw === 'string' && raw.trim()) {
        const ms = Date.parse(raw.trim());
        return Number.isNaN(ms) ? null : new Date(ms);
    }
    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(base: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(incoming)) {
        const existing = out[key];
        out[key] = isRecord(existing) && isRecord(value) ? mergeDeep(existing, value) : value;
    }
    return out;
}
