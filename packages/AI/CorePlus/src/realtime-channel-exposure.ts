/**
 * @fileoverview **Channel exposure policy** — how much of a channel the model is allowed to perceive.
 *
 * A channel can show the model two kinds of thing without being asked: its STATE (a form's field
 * values, a game board, structured notes about what the user just did) and its PIXELS (frames of what
 * it looks like). A channel declares the most it CAN expose (`RealtimeChannelDescriptor.MaxExposure`),
 * and that is a ceiling, not a promise: the exposure a session actually gets is the lowest of
 *
 * 1. the channel's own ceiling,
 * 2. the agent's configuration (`realtime.channels.config.<Key>.maxExposure` in the config cascade),
 * 3. a zero-data-retention requirement (below), and
 * 4. the user's own choice (the "agent can see" toggle).
 *
 * | level | the model receives |
 * |---|---|
 * | `'none'` | nothing about the channel's contents: no state notes, no frames |
 * | `'state'` | structured state notes (snapshots and deltas); no frames |
 * | `'pixels'` | state notes and frames |
 *
 * **Zero data retention.** Some content must never reach a model whose provider might retain it. An
 * agent says which levels need a zero-data-retention model with `requireZeroDataRetentionFor`
 * (`'state'`, `'pixels'`, or both). If the session's model does not declare
 * `Privacy.ZeroDataRetention: true` in its configuration, exposure is lowered to below the LOWEST level
 * listed. A requirement for `'state'` therefore also withholds `'pixels'`, because pixels reveal
 * everything state does and more; a requirement for `'pixels'` alone leaves state flowing.
 *
 * The first three layers are decided on the SERVER (it holds the agent's configuration and the model's
 * catalog row, and the browser must not be able to raise them) and ride to the client in the session
 * policy. The fourth is the user's and lives on the client, applied as a final minimum. These functions
 * are pure so both sides, and the tests, share one definition.
 *
 * @module @memberjunction/ai-core-plus
 */

import type { JSONObject } from '@memberjunction/ai';
import { IsPlainObject } from '@memberjunction/global';
import type { RealtimeChannelExposure, RealtimeChannelVerb } from './realtime-channel-descriptor';
import type { RealtimeZeroDataRetentionLevel } from './realtime-channel-scope';

/** Exposure levels from least to most revealing. The order is the whole definition of "lower". */
export const REALTIME_EXPOSURE_ORDER: readonly RealtimeChannelExposure[] = Object.freeze(['none', 'state', 'pixels'] as const);

/** Rank of a level in {@link REALTIME_EXPOSURE_ORDER}: 0 (`'none'`) to 2 (`'pixels'`). */
function rank(level: RealtimeChannelExposure): number {
    return REALTIME_EXPOSURE_ORDER.indexOf(level);
}

/** Whether `level` is a valid exposure level. */
export function IsExposureLevel(value: unknown): value is RealtimeChannelExposure {
    return value === 'none' || value === 'state' || value === 'pixels';
}

/**
 * Compares two exposure levels: negative when `a` reveals less than `b`, zero when equal, positive when more.
 */
export function CompareExposure(a: RealtimeChannelExposure, b: RealtimeChannelExposure): number {
    return rank(a) - rank(b);
}

/**
 * The lowest of the given levels. `undefined` entries mean "no opinion" and are skipped, so a layer that
 * says nothing never lowers anything. With no opinions at all the answer is `'pixels'` (the most
 * permissive level): the minimum of no constraints is no constraint.
 */
export function MinExposure(...levels: ReadonlyArray<RealtimeChannelExposure | undefined>): RealtimeChannelExposure {
    let lowest: RealtimeChannelExposure = 'pixels';
    for (const level of levels) {
        if (level !== undefined && CompareExposure(level, lowest) < 0) {
            lowest = level;
        }
    }
    return lowest;
}

/** Which layer imposed a limit. */
export type RealtimeExposureLimitSource = 'agent' | 'zero-data-retention' | 'user';

/** One limit on a channel's exposure, with the reason the model (and a person reading a log) can be given. */
export interface RealtimeExposureLimit {
    /** The layer that imposed it. */
    Source: RealtimeExposureLimitSource;
    /** The highest level this limit allows. */
    Level: RealtimeChannelExposure;
    /** Why, in a sentence that can be shown to the agent as is. */
    Reason: string;
}

/**
 * Reads `maxExposure` from a channel's resolved per-channel config — the agent/app/host layer's cap.
 * Anything but a valid level is ignored (config is hand-edited JSON of unknown shape), so a typo
 * never turns into "exposure off" or "exposure on".
 *
 * @param config The channel's resolved config (`ResolvedRealtimeChannel.Config`), if any.
 */
export function ReadConfiguredMaxExposure(config: JSONObject | undefined | null): RealtimeChannelExposure | undefined {
    if (!IsPlainObject(config)) {
        return undefined;
    }
    const value = (config as JSONObject)['maxExposure'];
    return IsExposureLevel(value) ? value : undefined;
}

/**
 * The highest exposure a session may have given a zero-data-retention requirement and whether the model
 * has it. Without a requirement, or with a model that declares zero data retention, there is no limit
 * (`'pixels'`). Otherwise the answer is the level just BELOW the lowest one the agent requires it for.
 *
 * @param required The levels the agent requires zero data retention for.
 * @param modelHasZeroDataRetention Whether the session model's configuration declares `Privacy.ZeroDataRetention: true`.
 */
export function ZeroDataRetentionCeiling(
    required: ReadonlyArray<RealtimeZeroDataRetentionLevel> | undefined,
    modelHasZeroDataRetention: boolean
): RealtimeChannelExposure {
    if (modelHasZeroDataRetention || !required || required.length === 0) {
        return 'pixels';
    }
    const lowestRequired = required.reduce<RealtimeChannelExposure>(
        (lowest, level) => (CompareExposure(level, lowest) < 0 ? level : lowest),
        'pixels'
    );
    return REALTIME_EXPOSURE_ORDER[Math.max(0, rank(lowestRequired) - 1)];
}

/** Input to {@link ResolveChannelExposure}. */
export interface ResolveChannelExposureInput {
    /** The channel's own ceiling (`GetDescriptor().MaxExposure`). */
    Ceiling: RealtimeChannelExposure;
    /** The agent/app/host cap from the channel's config, when set (see {@link ReadConfiguredMaxExposure}). */
    ConfiguredMax?: RealtimeChannelExposure;
    /** Levels the agent requires zero data retention for. */
    RequireZeroDataRetentionFor?: ReadonlyArray<RealtimeZeroDataRetentionLevel>;
    /** Whether the session model declares `Privacy.ZeroDataRetention: true`. */
    ModelHasZeroDataRetention?: boolean;
    /** The user's own choice, when they made one. */
    User?: RealtimeChannelExposure;
}

/** The outcome of {@link ResolveChannelExposure}. */
export interface ResolvedChannelExposure {
    /** What actually flows to the model: the minimum of every layer. */
    Effective: RealtimeChannelExposure;
    /** The channel's own ceiling, echoed for convenience. */
    Ceiling: RealtimeChannelExposure;
    /**
     * The limits that BIND, i.e. the ones holding exposure below the ceiling right now, each with its
     * reason. Empty when nothing lowered it. A limit that is looser than another binding one is not
     * listed: the agent only needs to hear why it sees what it sees.
     */
    Limits: RealtimeExposureLimit[];
}

/** The reason text for the user's own limit — shared so the browser, which holds the user's choice, words it the same way. */
export function UserExposureReason(level: RealtimeChannelExposure): string {
    return `the user chose to share only '${level}' of this channel with the agent`;
}

/** The reason text for a zero-data-retention downgrade. */
function zeroDataRetentionReason(required: ReadonlyArray<RealtimeZeroDataRetentionLevel>): string {
    return (
        `this agent requires a zero-data-retention model for '${required.join("' and '")}' exposure, ` +
        `and the model for this session does not declare zero data retention`
    );
}

/**
 * Resolves a channel's effective exposure from every layer, and which layers are holding it down.
 *
 * `effective = min(channel ceiling, agent cap, zero-data-retention ceiling, user choice)`.
 *
 * @param input Each layer's opinion (an absent layer has none).
 */
export function ResolveChannelExposure(input: ResolveChannelExposureInput): ResolvedChannelExposure {
    const required = input.RequireZeroDataRetentionFor ?? [];
    const zdrCeiling = ZeroDataRetentionCeiling(required, input.ModelHasZeroDataRetention === true);
    const candidates: RealtimeExposureLimit[] = [];
    if (input.ConfiguredMax !== undefined) {
        candidates.push({
            Source: 'agent',
            Level: input.ConfiguredMax,
            Reason: `this agent's configuration limits the channel to '${input.ConfiguredMax}'`,
        });
    }
    if (zdrCeiling !== 'pixels') {
        candidates.push({ Source: 'zero-data-retention', Level: zdrCeiling, Reason: zeroDataRetentionReason(required) });
    }
    if (input.User !== undefined) {
        candidates.push({
            Source: 'user',
            Level: input.User,
            Reason: UserExposureReason(input.User),
        });
    }
    const effective = MinExposure(input.Ceiling, ...candidates.map((c) => c.Level));
    const binding =
        CompareExposure(effective, input.Ceiling) < 0 ? candidates.filter((c) => CompareExposure(c.Level, effective) === 0) : [];
    return { Effective: effective, Ceiling: input.Ceiling, Limits: binding };
}

/**
 * The part of a resolved exposure the SERVER decides (everything but the user's choice): what rides in
 * the session policy, so the browser can take its own minimum with the user's choice and cannot raise it.
 */
export interface PolicyExposure {
    /** The exposure after the channel ceiling, the agent cap and the zero-data-retention requirement. */
    Exposure: RealtimeChannelExposure;
    /** The limits that bind it. */
    Limits: RealtimeExposureLimit[];
}

/**
 * Resolves the server-decided half of exposure (everything except the user's choice).
 *
 * @param input The same inputs as {@link ResolveChannelExposure} without `User`.
 */
export function ResolvePolicyExposure(input: Omit<ResolveChannelExposureInput, 'User'>): PolicyExposure {
    const resolved = ResolveChannelExposure(input);
    return { Exposure: resolved.Effective, Limits: resolved.Limits };
}

/**
 * Describes limits in one line for the agent: `'pixels' withheld — <reason>; <reason>`. Returns `null`
 * when there is nothing to say (exposure is at the ceiling).
 *
 * @param effective The exposure the channel actually has.
 * @param ceiling The channel's own ceiling.
 * @param reasons Why it is lower.
 */
export function DescribeExposureLimit(
    effective: RealtimeChannelExposure,
    ceiling: RealtimeChannelExposure,
    reasons: ReadonlyArray<string>
): string | null {
    if (CompareExposure(effective, ceiling) >= 0) {
        return null;
    }
    const withheld = REALTIME_EXPOSURE_ORDER.filter((level) => CompareExposure(level, effective) > 0 && CompareExposure(level, ceiling) <= 0);
    const what =
        effective === 'none'
            ? 'you will not be told what the channel contains and will not see it'
            : `you receive ${effective} only; '${withheld.join("' and '")}' is withheld`;
    return reasons.length > 0 ? `${what} (${reasons.join('; ')})` : what;
}

/**
 * Whether a verb's RESULT is withheld at the given exposure: the verb says its result carries channel data
 * (`ReturnsChannelData`) and the channel's effective exposure is below that level.
 *
 * @param verb The verb.
 * @param effective The channel's effective exposure.
 */
export function IsVerbWithheld(verb: Pick<RealtimeChannelVerb, 'ReturnsChannelData'>, effective: RealtimeChannelExposure): boolean {
    return verb.ReturnsChannelData !== undefined && CompareExposure(effective, verb.ReturnsChannelData) < 0;
}

/** The verbs of a channel that are withheld at the given exposure (see {@link IsVerbWithheld}). */
export function WithheldVerbs<T extends Pick<RealtimeChannelVerb, 'ReturnsChannelData'>>(verbs: readonly T[], effective: RealtimeChannelExposure): T[] {
    return verbs.filter((verb) => IsVerbWithheld(verb, effective));
}

/**
 * The sentence an agent is given when it calls a verb that is withheld: what is withheld, why, and what to do instead.
 *
 * @param verbName The verb.
 * @param channelName The channel's display name.
 * @param effective The channel's effective exposure.
 * @param reasons Why exposure is below what the channel could expose (the limits that bind).
 */
export function DescribeWithheldVerb(verbName: string, channelName: string, effective: RealtimeChannelExposure, reasons: ReadonlyArray<string>): string {
    const why = reasons.length > 0 ? ` (${reasons.join('; ')})` : '';
    return (
        `"${verbName}" is unavailable right now: its result would show you what the ${channelName} channel holds, ` +
        `and you may perceive only '${effective}' of it${why}. Tell the user you cannot do that, or ask them to share it.`
    );
}
