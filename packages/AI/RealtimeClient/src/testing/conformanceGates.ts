/**
 * @fileoverview When a check runs: what it needs from the provider (its traits) and from the harness (its optional
 * methods). Each gate returns why the check can't run, or `null`.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */
import type { IRealtimeVideoConformanceHarness } from './realtimeVideoConformanceTypes';

/** A gate: why a check can't run against a harness, or `null`. */
export type ConformanceGate = (harness: IRealtimeVideoConformanceHarness) => string | null;

/** The harness's optional methods a check can need. */
export type ConformanceHarnessMethod = 'SendPart' | 'GenerationComplete' | 'Resume' | 'RefusePlayback';

/** Runs for every provider. */
export const NoGate: ConformanceGate = () => null;

/** Needs a provider that hands over the agent's video. */
export const NeedsAgentVideo: ConformanceGate = (harness) =>
    harness.Traits.AgentVideo === 'none' ? `${harness.Name} hands over no agent video (Traits.AgentVideo is 'none')` : null;

/** Needs a provider whose server can grant an avatar. */
export const NeedsGrant: ConformanceGate = (harness) =>
    harness.Traits.GrantsAvatar ? null : `${harness.Name}'s server grants no avatar (Traits.GrantsAvatar is false)`;

/** Needs a provider whose video plays through a player the kit records. */
export const NeedsPlayout: ConformanceGate = (harness) =>
    harness.Traits.AgentVideo === 'playout'
        ? null
        : `${harness.Name} has no video player to record (Traits.AgentVideo is '${harness.Traits.AgentVideo}')`;

/** Needs a driver that plays the voice as PCM through the kit's recorder. */
export const NeedsPcmVoice: ConformanceGate = (harness) =>
    harness.Traits.Voice === 'pcm' ? null : `${harness.Name}'s voice plays through its transport, not a PCM playback (Traits.Voice is 'transport')`;

/** Needs a provider whose video can carry the voice. */
export const NeedsVideoThatCanCarryVoice: ConformanceGate = (harness) =>
    harness.Traits.VideoCanCarryVoice ? null : `${harness.Name}'s video never carries the voice (Traits.VideoCanCarryVoice is false)`;

/** Needs a driver that reports generated video seconds. */
export const NeedsVideoUsage: ConformanceGate = (harness) =>
    harness.Traits.VideoUsage ? null : `${harness.Name} reports no generated video seconds (Traits.VideoUsage is false)`;

/** Needs a driver that keeps its voice and its video on one media timeline. */
export const NeedsTimedVoice: ConformanceGate = (harness) =>
    harness.Traits.TimedVoice ? null : `${harness.Name}'s voice carries no media time (Traits.TimedVoice is not set)`;

/** Needs one of the harness's optional methods. */
export function NeedsHarnessMethod(method: ConformanceHarnessMethod): ConformanceGate {
    return (harness) => (typeof harness[method] === 'function' ? null : `${harness.Name}'s harness has no ${method}`);
}

/** All of the gates: the first reason any of them gives, or `null`. */
export function AllOf(...gates: ConformanceGate[]): ConformanceGate {
    return (harness) => {
        for (const gate of gates) {
            const reason = gate(harness);
            if (reason !== null) {
                return reason;
            }
        }
        return null;
    };
}
