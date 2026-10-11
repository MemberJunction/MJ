/**
 * The full-duplex turn gate — the **safety net** behind a full-duplex model's own turn-taking judgement.
 *
 * A turn-based model waits to be triggered, so the engine decides WHEN it speaks. A full-duplex model
 * (GPT-Live, the Gemini 3.8 Live models) listens while it speaks and decides for itself, so the first the
 * engine hears of a turn is the model's own outbound audio. This gate sits on that outbound path and asks the
 * room's {@link MultiAgentRoomCoordinator} whether the speech may proceed:
 *
 * - floor granted → the audio flows and the agent holds the floor until its turn ends;
 * - another agent holds the floor (or one is reserved by a hand-off) → the audio is let through ONLY while
 *   it is still short enough to be a backchannel ({@link BACKCHANNEL_MAX_DURATION_MS}); the moment it runs
 *   longer it is a turn that is not allowed to start, and it is cut;
 * - a human is speaking or the agent-to-agent loop cap is reached → cut at once.
 *
 * It is pure: no media, no entities, no timers — every dependency (coordinator, clock) is injected, so the
 * whole policy is unit-testable. The engine owns the side effects (flushing queued audio, arming the floor
 * safety timer) and acts on the returned {@link OutputGateResult}.
 *
 * Audio is assumed to be PCM16 mono — what the full-duplex models emit and what multi-agent rooms carry.
 */

import { BACKCHANNEL_MAX_DURATION_MS, type UtteranceShape } from '@memberjunction/ai-bridge-base';
import type { FloorDecisionReason, MultiAgentRoomCoordinator } from './multi-agent-room-coordinator';

/** A pause in outbound audio longer than this ends a burst for a session that is not holding the floor (ms). */
export const OUTPUT_BURST_GAP_MS = 1200;

/** Where an agent's current speech burst stands relative to the floor. */
export type OutputGatePhase =
    /** Not speaking. The next outbound audio starts a new burst. */
    | 'Idle'
    /** Holding the floor — a real turn. */
    | 'Floor'
    /** Speaking over someone else's floor, still short enough to be a backchannel. */
    | 'Overlay'
    /** Refused: the rest of this burst is dropped. */
    | 'Muted';

/** What the engine should do with one outbound audio chunk. */
export type OutputVerdict = 'Forward' | 'Drop' | 'Cut';

/** The gate's answer for one outbound chunk. */
export interface OutputGateResult {
    /** `Forward`: send it. `Drop`: discard it. `Cut`: discard it AND flush audio already queued (the burst was just refused). */
    Verdict: OutputVerdict;

    /** `true` when THIS chunk took the floor — the engine arms its floor safety timer. */
    TookFloor: boolean;
}

/** Denials that mean "someone else has the floor right now" — a short utterance may still overlay as a backchannel. */
const OVERLAYABLE_DENIALS: ReadonlySet<FloorDecisionReason> = new Set<FloorDecisionReason>(['HeldByOtherAgent', 'ReservedForHandoff']);

/** Dependencies of a {@link FullDuplexTurnGate}. */
export interface FullDuplexTurnGateDeps {
    /** The room's coordinator. */
    Coordinator: MultiAgentRoomCoordinator;

    /** The room id the coordinator keys on. */
    RoomId: string;

    /** This agent's `MJ: AI Agent Sessions` id. */
    AgentSessionId: string;

    /** The model's output sample rate (Hz) — converts bytes to duration. Defaults to 24000. */
    SampleRateHz?: number;

    /** Injected clock (epoch ms). Defaults to `Date.now`. */
    Now?: () => number;
}

/** Per-agent gate over a full-duplex model's outbound audio. One instance per bridged session. */
export class FullDuplexTurnGate {
    private readonly coordinator: MultiAgentRoomCoordinator;
    private readonly roomId: string;
    private readonly agentSessionId: string;
    private readonly sampleRateHz: number;
    private readonly now: () => number;

    private phase: OutputGatePhase = 'Idle';
    private burstAudioMs = 0;
    private lastChunkAtMs = 0;

    constructor(deps: FullDuplexTurnGateDeps) {
        this.coordinator = deps.Coordinator;
        this.roomId = deps.RoomId;
        this.agentSessionId = deps.AgentSessionId;
        this.sampleRateHz = deps.SampleRateHz && deps.SampleRateHz > 0 ? deps.SampleRateHz : 24000;
        this.now = deps.Now ?? Date.now;
    }

    /** The current phase (observability + tests). */
    public get Phase(): OutputGatePhase {
        return this.phase;
    }

    /**
     * Decides what to do with one chunk of the model's outbound audio.
     *
     * @param byteLength The chunk's size in bytes (PCM16 mono).
     * @returns Whether to forward, drop, or cut — and whether this chunk took the floor.
     */
    public OnOutputAudio(byteLength: number): OutputGateResult {
        const now = this.now();
        this.endStaleBurst(now);
        this.lastChunkAtMs = now;
        const chunkMs = (byteLength / 2 / this.sampleRateHz) * 1000;
        switch (this.phase) {
            case 'Idle':
                return this.startBurst(chunkMs);
            case 'Floor':
                return this.continueFloor(chunkMs);
            case 'Overlay':
                return this.continueOverlay(chunkMs);
            default:
                return { Verdict: 'Drop', TookFloor: false };
        }
    }

    /**
     * The agent's turn ended (its final assistant transcript). Releases the floor — reclassifying a short
     * utterance as a backchannel so it is not billed against the loop cap — or records an overlay as the
     * backchannel it was. Always returns the gate to `Idle`.
     *
     * @param utterance What was said, when known (the measured burst duration fills in `DurationMs`).
     */
    public EndTurn(utterance: UtteranceShape = {}): void {
        if (this.phase === 'Floor') {
            this.coordinator.CompleteTurn(this.roomId, this.agentSessionId, { Text: utterance.Text, DurationMs: utterance.DurationMs ?? this.burstAudioMs });
        } else if (this.phase === 'Overlay') {
            this.coordinator.RecordBackchannel(this.roomId, this.agentSessionId);
        }
        this.reset();
    }

    /** A human preempted this agent: mute the rest of the current burst. The floor itself is the coordinator's to release. */
    public Cut(): void {
        this.phase = 'Muted';
    }

    /** Returns to `Idle` with no coordinator side effects (teardown, barge-in). */
    public Reset(): void {
        this.reset();
    }

    // ── internals ────────────────────────────────────────────────────────────────

    /** A pause between chunks ends a burst for a session that is not holding the floor (it holds it until `EndTurn`). */
    private endStaleBurst(now: number): void {
        const stale = this.lastChunkAtMs > 0 && now - this.lastChunkAtMs > OUTPUT_BURST_GAP_MS;
        if (!stale || this.phase === 'Floor') {
            return;
        }
        if (this.phase === 'Overlay') {
            this.coordinator.RecordBackchannel(this.roomId, this.agentSessionId);
        }
        this.reset();
    }

    /** First chunk of a new burst: take the floor, overlay as a possible backchannel, or refuse. */
    private startBurst(chunkMs: number): OutputGateResult {
        this.burstAudioMs = chunkMs;
        const decision = this.coordinator.CanTakeFloor(this.roomId, this.agentSessionId, 'Turn');
        if (decision.Granted) {
            this.coordinator.TakeFloor(this.roomId, this.agentSessionId, 'Turn');
            this.phase = 'Floor';
            return { Verdict: 'Forward', TookFloor: true };
        }
        if (OVERLAYABLE_DENIALS.has(decision.Reason)) {
            this.phase = 'Overlay';
            return this.admitOverlay();
        }
        this.coordinator.TakeFloor(this.roomId, this.agentSessionId, 'Turn'); // records the denial in the room's events
        return this.refuse();
    }

    /** A turn in progress: keep forwarding while the agent still holds the floor, cut it the moment it does not. */
    private continueFloor(chunkMs: number): OutputGateResult {
        if (!this.coordinator.IsFloorHolder(this.roomId, this.agentSessionId)) {
            this.phase = 'Muted'; // preempted (a human started talking, or the facilitator took the floor)
            return { Verdict: 'Cut', TookFloor: false };
        }
        this.burstAudioMs += chunkMs;
        return { Verdict: 'Forward', TookFloor: false };
    }

    /** An overlay: still a backchannel while short; once it runs long it is a turn that must now win the floor or be cut. */
    private continueOverlay(chunkMs: number): OutputGateResult {
        this.burstAudioMs += chunkMs;
        return this.admitOverlay();
    }

    /** Forwards an overlay while its accumulated duration is still a backchannel; past the bound it must win the floor or be cut. */
    private admitOverlay(): OutputGateResult {
        if (this.burstAudioMs <= BACKCHANNEL_MAX_DURATION_MS) {
            return { Verdict: 'Forward', TookFloor: false };
        }
        const decision = this.coordinator.TakeFloor(this.roomId, this.agentSessionId, 'Turn');
        if (decision.Granted) {
            this.phase = 'Floor';
            return { Verdict: 'Forward', TookFloor: true };
        }
        return this.refuse();
    }

    /** Mutes the rest of the burst. The caller has already recorded the denial through the coordinator. */
    private refuse(): OutputGateResult {
        this.phase = 'Muted';
        return { Verdict: 'Cut', TookFloor: false };
    }

    private reset(): void {
        this.phase = 'Idle';
        this.burstAudioMs = 0;
    }
}

/** RMS level (of 32768 full scale) above which inbound audio is treated as speech rather than room noise. */
export const HUMAN_SPEECH_RMS_THRESHOLD = 700;

/** Minimum spacing (ms) between speech reports to the coordinator — frames arrive every ~20 ms. */
export const HUMAN_SPEECH_REPORT_INTERVAL_MS = 100;

/**
 * Root-mean-square level of a PCM16 little-endian buffer.
 *
 * @param pcm16 Raw PCM16 mono samples.
 * @returns The RMS in sample units (0 for an empty buffer).
 */
export function ComputePcm16Rms(pcm16: ArrayBuffer): number {
    const samples = new Int16Array(pcm16, 0, Math.floor(pcm16.byteLength / 2));
    if (samples.length === 0) {
        return 0;
    }
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
        sumSquares += samples[i] * samples[i];
    }
    return Math.sqrt(sumSquares / samples.length);
}

/**
 * Energy-based detector of human speech in inbound room audio. Deliberately simple: it only has to be
 * right enough to tell the coordinator "a person is talking" so agents yield; the room's own transcripts
 * remain the record of what was said. It throttles its reports so the coordinator is not called per frame.
 */
export class HumanSpeechDetector {
    private readonly now: () => number;
    private readonly threshold: number;
    private lastReportAtMs = 0;

    /**
     * @param now Injected clock (epoch ms). Defaults to `Date.now`.
     * @param threshold RMS threshold. Defaults to {@link HUMAN_SPEECH_RMS_THRESHOLD}.
     */
    constructor(now: () => number = Date.now, threshold: number = HUMAN_SPEECH_RMS_THRESHOLD) {
        this.now = now;
        this.threshold = threshold;
    }

    /**
     * Inspects one inbound PCM16 frame from a HUMAN participant.
     *
     * @param pcm16 The frame's samples.
     * @returns `true` when the caller should report human speech activity to the coordinator now (the frame
     *   is speech-like AND the report interval has elapsed); `false` otherwise.
     */
    public ShouldReportSpeech(pcm16: ArrayBuffer): boolean {
        if (ComputePcm16Rms(pcm16) < this.threshold) {
            return false;
        }
        const now = this.now();
        if (now - this.lastReportAtMs < HUMAN_SPEECH_REPORT_INTERVAL_MS) {
            return false;
        }
        this.lastReportAtMs = now;
        return true;
    }
}
