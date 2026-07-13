/**
 * Platform-agnostic turn-taking for bridged realtime agents.
 *
 * Turn-taking is **generic** — it operates on the diarized transcript stream a bridge provides,
 * is identical for Zoom or Twilio, and is fully unit-testable because every external dependency
 * (the addressed-matcher, the "worth saying" scorer, and the clock) is INJECTED. There is no real
 * time and no platform code in here.
 *
 * The agent always *hears* (inbound media is always routed to the model so it has context); this
 * policy gates only *generation* — whether the agent speaks, posts to chat, or stays silent.
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` §6.
 */

/**
 * The turn-taking mode for a bridged session (selected by `AIAgentSessionBridge.TurnMode`).
 *
 * - `Passive` (default): generate ONLY when the agent is addressed (name/mention detection). Two
 *   passive agents in one room never loop, because neither speaks unless called on.
 * - `Active`: a "worth saying" gate that fires ONLY in silence windows — proactive in gaps, never
 *   barging over a live speaker, and throttled so it can't dominate.
 * - `Hybrid`: passive voice PLUS a chat hand-raise — speak only when addressed, but post to chat
 *   (the social-cost-free "raise hand") when it has something to add and chat is available.
 */
export type BridgeTurnMode = 'Passive' | 'Active' | 'Hybrid';

/**
 * What the agent should do for the evaluated transcript segment.
 *
 * - `Speak`: take the floor and voice a response now.
 * - `PostToChat`: don't speak, but post a message to the meeting chat (hybrid hand-raise).
 * - `Silent`: do nothing.
 */
export type BridgeTurnAction = 'Speak' | 'PostToChat' | 'Silent';

/**
 * A single diarized transcript segment fed into the policy.
 *
 * Produced from the bridge's inbound transcript stream. `SpeakerLabel`/`IsAgent` come from the
 * provider's diarization; `EndMs` lets the policy compute silence windows deterministically.
 */
export interface TurnTranscriptSegment {
    /** The transcribed text of this segment. */
    Text: string;

    /** The diarized speaker label, when the provider supports it (e.g. a participant id or name). */
    SpeakerLabel?: string;

    /** Whether the speaker of this segment is an agent bot (excluded from "addressed me" detection). */
    IsAgent?: boolean;

    /**
     * Epoch-millisecond timestamp at which this segment's speech ENDED. Used to measure the silence
     * window since the last human speech. When omitted, the policy treats the clock's `now()` as the
     * end time (i.e. no measurable silence yet).
     */
    EndMs?: number;
}

/**
 * The input to a single {@link TurnTakingPolicy.EvaluateTurn} call.
 */
export interface TurnEvaluationInput {
    /** The transcript segment that just landed (the one the policy reacts to). */
    Segment: TurnTranscriptSegment;

    /**
     * Whether a human is currently speaking on the endpoint. When `true`, Active mode never fires
     * (no barging over a live speaker). Defaults to `false` when omitted.
     */
    HumanSpeaking?: boolean;

    /**
     * Whether the bridge supports posting to the meeting chat. Hybrid mode degrades to plain
     * passive when this is `false`. Defaults to `false` when omitted.
     */
    ChatAvailable?: boolean;
}

/**
 * The decision returned by {@link TurnTakingPolicy.EvaluateTurn}.
 */
export interface TurnDecision {
    /** What the agent should do. */
    Action: BridgeTurnAction;

    /** A short, human-readable explanation of why — useful for observability and tests. */
    Reason: string;
}

/**
 * Pluggable detector for whether the agent was ADDRESSED in a transcript segment.
 *
 * The default implementation ({@link RegexAddressedMatcher}) is a fast name/mention regex; an
 * LLM-backed fallback for indirect address ("what does our AI think?") is documented as a future
 * enhancement and would implement this same interface.
 */
export interface IAddressedMatcher {
    /**
     * @param segment The transcript segment to test.
     * @returns `true` if the agent was addressed in the segment.
     */
    IsAddressed(segment: TurnTranscriptSegment): boolean;
}

/**
 * Pluggable "worth saying" scorer for Active mode.
 *
 * Returns a score in `[0, 1]`; the policy speaks when the score meets the configured threshold AND
 * the silence/throttle gates pass. The scorer itself is injected (it may be a heuristic or an LLM
 * call) so the policy stays pure and deterministic in tests.
 */
export interface IWorthSayingScorer {
    /**
     * @param segment The most recent transcript segment.
     * @returns A worth-saying score in the range `[0, 1]`.
     */
    Score(segment: TurnTranscriptSegment): number;
}

/**
 * A default name/mention matcher: the agent is "addressed" when the segment text contains one of
 * the agent's names/aliases as a whole word (case-insensitive). Human-only segments are eligible;
 * agent-spoken segments are never treated as addressing the agent (avoids self-trigger loops).
 */
export class RegexAddressedMatcher implements IAddressedMatcher {
    private readonly patterns: RegExp[];

    /**
     * @param names The agent's name plus any aliases to match (e.g. `['Sage', 'the assistant']`).
     *              Each is matched as a whole word/phrase, case-insensitively. Empty/blank names are ignored.
     */
    constructor(names: string[]) {
        this.patterns = names
            .map(n => n.trim())
            .filter(n => n.length > 0)
            .map(n => new RegExp(`\\b${escapeRegExp(n)}\\b`, 'i'));
    }

    /** @inheritdoc */
    public IsAddressed(segment: TurnTranscriptSegment): boolean {
        if (segment.IsAgent === true) {
            return false;
        }
        const text = segment.Text ?? '';
        return this.patterns.some(p => p.test(text));
    }
}

/**
 * An addressed-matcher that treats EVERY human segment as addressing the agent (agent-spoken segments
 * are still excluded, to avoid self-trigger loops). Use it for a DIRECT one-on-one call — a "phone an
 * agent" room — where the user expects the agent to respond to whatever they say, without having to
 * name it each turn. (Name-based {@link RegexAddressedMatcher} is the right choice for multi-party rooms
 * where several agents must not all answer at once.)
 */
export class AlwaysAddressedMatcher implements IAddressedMatcher {
    /** @inheritdoc */
    public IsAddressed(segment: TurnTranscriptSegment): boolean {
        return segment.IsAgent !== true;
    }
}

/**
 * Configuration for a {@link TurnTakingPolicy} instance.
 */
export interface TurnTakingPolicyConfig {
    /** The turn-taking mode. */
    Mode: BridgeTurnMode;

    /** The addressed-matcher (Passive + Hybrid). Required for those modes. */
    Matcher?: IAddressedMatcher;

    /** The "worth saying" scorer (Active mode). Required for Active. */
    Scorer?: IWorthSayingScorer;

    /**
     * Minimum silence (ms) since the last human speech before Active mode may speak. Prevents
     * barging into gaps that are too short to be a real opening. Defaults to 1500ms.
     */
    SilenceWindowMs?: number;

    /**
     * Minimum interval (ms) between two Active-mode speak decisions, so a proactive agent cannot
     * dominate the room. Defaults to 15000ms.
     */
    ThrottleMs?: number;

    /**
     * Worth-saying score threshold in `[0, 1]` at/above which Active mode speaks. Defaults to 0.7.
     */
    ScoreThreshold?: number;

    /**
     * Injected clock returning epoch milliseconds. Defaults to `Date.now`. Tests inject a
     * controllable function so silence-window and throttle logic are fully deterministic.
     */
    Now?: () => number;
}

const DEFAULT_SILENCE_WINDOW_MS = 1500;
const DEFAULT_THROTTLE_MS = 15000;
const DEFAULT_SCORE_THRESHOLD = 0.7;

/**
 * Pure, platform-agnostic turn-taking policy. Construct one per bridged session with the desired
 * {@link BridgeTurnMode} and the injected matcher/scorer/clock, then call
 * {@link TurnTakingPolicy.EvaluateTurn} for each diarized transcript segment.
 *
 * The policy holds only the small amount of state needed for Active-mode throttling
 * (the last speak time); it performs no I/O and reads time only through the injected clock.
 */
export class TurnTakingPolicy {
    private readonly mode: BridgeTurnMode;
    private readonly matcher?: IAddressedMatcher;
    private readonly scorer?: IWorthSayingScorer;
    private readonly silenceWindowMs: number;
    private readonly throttleMs: number;
    private readonly scoreThreshold: number;
    private readonly now: () => number;

    /** Epoch-ms of the last Active-mode `Speak` decision; `null` until the first one. */
    private lastSpokeAtMs: number | null = null;

    /**
     * @param config The policy configuration — mode plus the injected matcher/scorer/clock and tuning.
     */
    constructor(config: TurnTakingPolicyConfig) {
        this.mode = config.Mode;
        this.matcher = config.Matcher;
        this.scorer = config.Scorer;
        this.silenceWindowMs = config.SilenceWindowMs ?? DEFAULT_SILENCE_WINDOW_MS;
        this.throttleMs = config.ThrottleMs ?? DEFAULT_THROTTLE_MS;
        this.scoreThreshold = config.ScoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
        this.now = config.Now ?? Date.now;
    }

    /**
     * The configured turn-taking mode for this policy.
     */
    public get Mode(): BridgeTurnMode {
        return this.mode;
    }

    /**
     * Evaluates a single diarized transcript segment and decides whether the agent should speak,
     * post to chat, or stay silent — per the configured mode.
     *
     * @param input The transcript segment plus the current speaking/chat-availability context.
     * @returns The turn decision (action + reason).
     */
    public EvaluateTurn(input: TurnEvaluationInput): TurnDecision {
        switch (this.mode) {
            case 'Passive':
                return this.evaluatePassive(input);
            case 'Active':
                return this.evaluateActive(input);
            case 'Hybrid':
                return this.evaluateHybrid(input);
            default:
                return { Action: 'Silent', Reason: `Unknown mode '${this.mode}'.` };
        }
    }

    /**
     * Passive: speak only when the agent is addressed; otherwise stay silent.
     *
     * @param input The evaluation input.
     * @returns The decision.
     */
    private evaluatePassive(input: TurnEvaluationInput): TurnDecision {
        if (this.isAddressed(input.Segment)) {
            return { Action: 'Speak', Reason: 'Agent was addressed (passive).' };
        }
        return { Action: 'Silent', Reason: 'Not addressed (passive).' };
    }

    /**
     * Active: speak proactively when the "worth saying" score clears the threshold, but only in a
     * sufficient silence window (no live speaker) and not more often than the throttle allows.
     *
     * @param input The evaluation input.
     * @returns The decision.
     */
    private evaluateActive(input: TurnEvaluationInput): TurnDecision {
        if (input.HumanSpeaking === true) {
            return { Action: 'Silent', Reason: 'A human is speaking — never barge in (active).' };
        }
        if (!this.silenceWindowElapsed(input.Segment)) {
            return { Action: 'Silent', Reason: 'Silence window not yet elapsed (active).' };
        }
        if (this.throttled()) {
            return { Action: 'Silent', Reason: 'Throttled — spoke too recently (active).' };
        }
        const score = this.scorer ? this.scorer.Score(input.Segment) : 0;
        if (score >= this.scoreThreshold) {
            this.lastSpokeAtMs = this.now();
            return { Action: 'Speak', Reason: `Worth saying (score ${score.toFixed(2)} ≥ ${this.scoreThreshold}).` };
        }
        return { Action: 'Silent', Reason: `Not worth saying (score ${score.toFixed(2)} < ${this.scoreThreshold}).` };
    }

    /**
     * Hybrid: passive voice (speak when addressed) PLUS a chat hand-raise — when not addressed but
     * the scorer says it has something AND chat is available, post to chat instead of speaking.
     * Degrades to plain passive when chat is unavailable.
     *
     * @param input The evaluation input.
     * @returns The decision.
     */
    private evaluateHybrid(input: TurnEvaluationInput): TurnDecision {
        if (this.isAddressed(input.Segment)) {
            return { Action: 'Speak', Reason: 'Agent was addressed (hybrid).' };
        }
        if (input.ChatAvailable === true && this.scorer) {
            const score = this.scorer.Score(input.Segment);
            if (score >= this.scoreThreshold) {
                return { Action: 'PostToChat', Reason: `Has something to add — raising hand in chat (score ${score.toFixed(2)}).` };
            }
        }
        return { Action: 'Silent', Reason: 'Not addressed; nothing worth posting (hybrid).' };
    }

    /**
     * Whether the agent was addressed, using the injected matcher (false if no matcher configured).
     *
     * @param segment The segment to test.
     * @returns `true` if addressed.
     */
    private isAddressed(segment: TurnTranscriptSegment): boolean {
        return this.matcher ? this.matcher.IsAddressed(segment) : false;
    }

    /**
     * Whether enough silence has elapsed since the segment's speech ended for Active mode to speak.
     *
     * @param segment The most recent segment (its `EndMs` anchors the silence window).
     * @returns `true` if the silence window has elapsed.
     */
    private silenceWindowElapsed(segment: TurnTranscriptSegment): boolean {
        const endMs = segment.EndMs ?? this.now();
        return this.now() - endMs >= this.silenceWindowMs;
    }

    /**
     * Whether Active mode is currently throttled (spoke within the throttle window).
     *
     * @returns `true` if a speak decision happened too recently.
     */
    private throttled(): boolean {
        if (this.lastSpokeAtMs === null) {
            return false;
        }
        return this.now() - this.lastSpokeAtMs < this.throttleMs;
    }
}

/**
 * Escapes a string for safe embedding inside a `RegExp`.
 *
 * @param value The raw string to escape.
 * @returns The regex-safe string.
 */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
