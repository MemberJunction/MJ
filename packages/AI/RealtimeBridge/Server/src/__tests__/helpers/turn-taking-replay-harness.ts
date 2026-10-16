/**
 * Deterministic replay harness for multi-agent room turn-taking.
 *
 * A fixture is a hand-written, time-ordered recording of what happened in a room: who spoke and when, what
 * they said, who acknowledged, who handed the floor to whom. The harness replays it on a virtual clock through
 * the REAL pieces — {@link TurnTakingPolicy} (with the addressed-matchers) and {@link MultiAgentRoomCoordinator} —
 * and then derives, independently from the recorded intervals, the invariants a healthy room must hold:
 *
 * - no two agents' turns overlap;
 * - agents never run past the loop cap without a human in between;
 * - a human's speech always preempts: no agent turn overlaps a human's;
 * - a backchannel never takes (or changes) the floor.
 *
 * The invariants are computed from the recorded timeline, not read back from the coordinator's own state, so a
 * coordinator bug cannot make its own check pass vacuously. Nothing here touches media, a network, or a real clock.
 */

import {
    BuildAddressedMatcher,
    IsBackchannel,
    TurnTakingPolicy,
    type BridgeTurnAction,
    type BridgeTurnMode,
    type ModelSideAddressedMatcher,
    type TurnAddressingMode,
} from '@memberjunction/ai-bridge-base';
import {
    DEFAULT_MAX_CONSECUTIVE_AGENT_TURNS,
    MultiAgentRoomCoordinator,
    type FloorDecisionReason,
    type RoomFloorState,
    type YieldReason,
} from '../../multi-agent-room-coordinator';

// ──────────────────────────────────────────────────────────────────────────────
// Fixture schema.
// ──────────────────────────────────────────────────────────────────────────────

/** One agent seated in the replayed room. */
export interface ReplayAgent {
    /** Stable id; also used as the agent's session id in the coordinator. */
    Id: string;
    /** Names it answers to (the `Regex` matcher's patterns). */
    Names: string[];
    /** Turn-taking mode. Defaults to `Passive`. */
    Mode?: BridgeTurnMode;
    /** `ModelSide` makes the agent judge addressing itself (signalled with a `ModelAddressed` event). Defaults to `Regex`. */
    Addressing?: Exclude<TurnAddressingMode, 'Auto'>;
    /** Whether this agent is the room's facilitator (may override the floor). */
    Facilitator?: boolean;
}

/** A human speaks for `DurationMs` starting at `AtMs`. */
export interface HumanSpeechEvent {
    Type: 'HumanSpeech';
    AtMs: number;
    DurationMs: number;
    Text: string;
    /** Optional: the per-agent turn decision the policy must reach when the utterance ends. */
    ExpectDecisions?: Record<string, BridgeTurnAction>;
}

/** An agent speaks (a turn or a backchannel — the harness classifies it from `Text` and `DurationMs`). */
export interface AgentSpeechEvent {
    Type: 'AgentSpeech';
    AtMs: number;
    Agent: string;
    Text: string;
    DurationMs: number;
}

/** A model-side agent signals it judged itself addressed (`i_am_addressed`). */
export interface ModelAddressedEvent {
    Type: 'ModelAddressed';
    AtMs: number;
    Agent: string;
}

/** An agent hands the floor over, optionally to a named agent. */
export interface YieldEvent {
    Type: 'Yield';
    AtMs: number;
    Agent: string;
    To?: string;
}

/** Any recorded room event. */
export type ReplayEvent = HumanSpeechEvent | AgentSpeechEvent | ModelAddressedEvent | YieldEvent;

/** What a fixture expects of the speech attempt at a given position in `AgentSpeech` order. */
export interface ExpectedSpeech {
    Agent: string;
    Kind: 'Turn' | 'Backchannel';
    Granted: boolean;
    Reason: FloorDecisionReason;
}

/** What a fixture expects of the room after replay. All fields optional. */
export interface ReplayExpectations {
    /** One entry per `AgentSpeech` event, in order. */
    Speeches?: ExpectedSpeech[];
    /** One entry per `Yield` event, in order. */
    Yields?: Array<{ Reason: YieldReason; HandoffTo: string | null }>;
    /** The agents a human preempted, in order. */
    Preempted?: string[];
    /** How many backchannels the room recorded. */
    BackchannelCount?: number;
    /** Whether the loop cap was reached at the end. */
    LoopCapReached?: boolean;
    /** Who holds the floor at the end (`null` for nobody). */
    FinalFloorHolder?: string | null;
}

/** A recorded room, ready to replay. */
export interface ReplayFixture {
    Name: string;
    Description: string;
    /** Loop cap for this room (defaults to the coordinator default). */
    MaxConsecutiveAgentTurns?: number;
    Agents: ReplayAgent[];
    Events: ReplayEvent[];
    Expect: ReplayExpectations;
}

// ──────────────────────────────────────────────────────────────────────────────
// Replay results.
// ──────────────────────────────────────────────────────────────────────────────

/** The outcome of one `AgentSpeech` event. */
export interface SpeechOutcome {
    Agent: string;
    Kind: 'Turn' | 'Backchannel';
    Granted: boolean;
    Reason: FloorDecisionReason;
    StartMs: number;
}

/** A span an agent held the floor (a granted turn, truncated where it was preempted, replaced, or yielded). */
export interface TurnInterval {
    Agent: string;
    StartMs: number;
    EndMs: number;
}

/** The policy's per-agent decisions when one human utterance ended. */
export interface DecisionOutcome {
    AtMs: number;
    Text: string;
    ByAgent: Record<string, BridgeTurnAction>;
}

/** The invariants of a healthy room, derived from the recorded timeline. */
export interface ReplayInvariants {
    /** No two agents' turns overlap. */
    NoAgentOverlap: boolean;
    /** No run of consecutive agent turns exceeded the loop cap without a human in between. */
    LoopCapRespected: boolean;
    /** No agent turn overlaps a human's speech. */
    HumansAlwaysPreempt: boolean;
    /** Every granted backchannel left the floor holder unchanged. */
    BackchannelsNeverTookFloor: boolean;
}

/** Everything a replay produced. */
export interface ReplayResult {
    Speeches: SpeechOutcome[];
    Yields: Array<{ Reason: YieldReason; HandoffTo: string | null }>;
    Decisions: DecisionOutcome[];
    Intervals: TurnInterval[];
    Preempted: string[];
    FinalState: RoomFloorState;
    Invariants: ReplayInvariants;
}

// ──────────────────────────────────────────────────────────────────────────────
// Replay.
// ──────────────────────────────────────────────────────────────────────────────

const ROOM = 'replay-room';
const BASE_MS = 1_000_000;

/** A scheduled item: a fixture event or an internal end-of-activity marker. */
type Step =
    | { AtMs: number; Order: number; Kind: 'Event'; Event: ReplayEvent }
    | { AtMs: number; Order: number; Kind: 'TurnEnd'; Agent: string; Text: string; DurationMs: number; Interval: TurnInterval }
    | { AtMs: number; Order: number; Kind: 'HumanEnd'; Event: HumanSpeechEvent };

interface AgentRuntime {
    Policy: TurnTakingPolicy;
    ModelSide?: ModelSideAddressedMatcher;
}

/**
 * Replays a fixture and returns what happened plus the derived invariants.
 *
 * @param fixture The recorded room.
 * @returns The replay result.
 */
export function ReplayRoom(fixture: ReplayFixture): ReplayResult {
    const run = new Replay(fixture);
    return run.Execute();
}

class Replay {
    private now = BASE_MS;
    private readonly coordinator: MultiAgentRoomCoordinator;
    private readonly agents = new Map<string, AgentRuntime>();
    private readonly cap: number;

    private readonly speeches: SpeechOutcome[] = [];
    private readonly yields: Array<{ Reason: YieldReason; HandoffTo: string | null }> = [];
    private readonly decisions: DecisionOutcome[] = [];
    private readonly intervals: TurnInterval[] = [];
    private readonly preempted: string[] = [];
    private readonly open = new Map<string, TurnInterval>();
    private readonly humanSpans: HumanSpan[] = [];
    private readonly backchannelChecks: boolean[] = [];
    private readonly turnOrder: TurnOrderEntry[] = [];

    constructor(private readonly fixture: ReplayFixture) {
        this.cap = fixture.MaxConsecutiveAgentTurns ?? DEFAULT_MAX_CONSECUTIVE_AGENT_TURNS;
        this.coordinator = new MultiAgentRoomCoordinator(() => this.now, { MaxConsecutiveAgentTurns: this.cap });
        for (const agent of fixture.Agents) {
            this.coordinator.RegisterRoomParticipant(ROOM, agent.Id, agent.Facilitator === true);
            this.agents.set(agent.Id, this.buildAgent(agent));
        }
    }

    public Execute(): ReplayResult {
        const steps = this.schedule();
        while (steps.length > 0) {
            const step = steps.shift() as Step;
            this.now = BASE_MS + step.AtMs;
            this.refreshHumanActivity();
            this.runStep(step, steps);
        }
        return {
            Speeches: this.speeches,
            Yields: this.yields,
            Decisions: this.decisions,
            Intervals: this.intervals,
            Preempted: this.preempted,
            FinalState: this.coordinator.GetRoomState(ROOM) as RoomFloorState,
            Invariants: this.deriveInvariants(),
        };
    }

    // ── setup ─────────────────────────────────────────────────────────────────

    private buildAgent(agent: ReplayAgent): AgentRuntime {
        const addressing = agent.Addressing ?? 'Regex';
        const built = BuildAddressedMatcher(agent.Names, addressing, addressing === 'ModelSide', () => this.now);
        const policy = new TurnTakingPolicy({ Mode: agent.Mode ?? 'Passive', Matcher: built.Matcher, Now: () => this.now });
        return { Policy: policy, ModelSide: built.ModelSide };
    }

    /** Orders fixture events by time (stable), and adds each human utterance's end marker. */
    private schedule(): Step[] {
        const steps: Step[] = [];
        let order = 0;
        for (const event of this.fixture.Events) {
            steps.push({ AtMs: event.AtMs, Order: order++, Kind: 'Event', Event: event });
            if (event.Type === 'HumanSpeech') {
                this.humanSpans.push({ StartMs: BASE_MS + event.AtMs, EndMs: BASE_MS + event.AtMs + event.DurationMs });
                steps.push({ AtMs: event.AtMs + event.DurationMs, Order: order++, Kind: 'HumanEnd', Event: event });
            }
        }
        return steps.sort((a, b) => a.AtMs - b.AtMs || a.Order - b.Order);
    }

    // ── stepping ──────────────────────────────────────────────────────────────

    /** While a human is mid-utterance the detector would be reporting continuously; model that at every step. */
    private refreshHumanActivity(): void {
        const speaking = this.humanSpans.some(s => this.now > s.StartMs && this.now <= s.EndMs);
        if (speaking) {
            this.coordinator.NoteHumanSpeech(ROOM);
        }
    }

    private runStep(step: Step, steps: Step[]): void {
        switch (step.Kind) {
            case 'TurnEnd':
                this.finishTurn(step);
                break;
            case 'HumanEnd':
                this.finishHumanUtterance(step.Event);
                break;
            default:
                this.runEvent(step.Event, steps);
        }
    }

    private runEvent(event: ReplayEvent, steps: Step[]): void {
        switch (event.Type) {
            case 'HumanSpeech':
                this.startHumanUtterance();
                break;
            case 'AgentSpeech':
                this.agentSpeaks(event, steps);
                break;
            case 'ModelAddressed':
                this.agents.get(event.Agent)?.ModelSide?.NoteModelAddressed(this.now);
                break;
            case 'Yield':
                this.agentYields(event);
                break;
        }
    }

    // ── humans ────────────────────────────────────────────────────────────────

    private startHumanUtterance(): void {
        this.turnOrder.push({ AtMs: this.now, Kind: 'Human' });
        const { PreemptedAgentSessionId } = this.coordinator.NoteHumanSpeech(ROOM);
        if (PreemptedAgentSessionId) {
            this.preempted.push(PreemptedAgentSessionId);
            this.truncateOpenTurn(PreemptedAgentSessionId);
        }
    }

    /** When the utterance ends: tell the coordinator a human turn completed, and evaluate every agent's policy. */
    private finishHumanUtterance(event: HumanSpeechEvent): void {
        this.coordinator.NoteHumanTurn(ROOM);
        const byAgent: Record<string, BridgeTurnAction> = {};
        for (const [id, runtime] of this.agents) {
            byAgent[id] = runtime.Policy.EvaluateTurn({ Segment: { Text: event.Text, EndMs: this.now } }).Action;
        }
        this.decisions.push({ AtMs: event.AtMs, Text: event.Text, ByAgent: byAgent });
    }

    // ── agents ────────────────────────────────────────────────────────────────

    private agentSpeaks(event: AgentSpeechEvent, steps: Step[]): void {
        const kind = IsBackchannel({ Text: event.Text, DurationMs: event.DurationMs }) ? 'Backchannel' : 'Turn';
        const holderBefore = this.holder();
        const decision = this.coordinator.TakeFloor(ROOM, event.Agent, kind);
        this.speeches.push({ Agent: event.Agent, Kind: kind, Granted: decision.Granted, Reason: decision.Reason, StartMs: this.now });
        if (kind === 'Backchannel') {
            this.backchannelChecks.push(decision.Granted ? this.holder() === holderBefore : true);
            return;
        }
        if (decision.Granted) {
            this.startTurn(event, steps);
        }
    }

    /**
     * A granted turn begins: it supersedes any other open turn (a facilitator override) and is scheduled to end.
     * The end sorts BEFORE any same-time event (`Order: -1`), so a turn ending exactly as another starts reads as sequential.
     */
    private startTurn(event: AgentSpeechEvent, steps: Step[]): void {
        for (const other of Array.from(this.open.keys())) {
            if (other !== event.Agent) {
                this.truncateOpenTurn(other);
            }
        }
        this.turnOrder.push({ AtMs: this.now, Kind: 'Agent', Agent: event.Agent });
        const interval: TurnInterval = { Agent: event.Agent, StartMs: this.now, EndMs: this.now + event.DurationMs };
        this.open.set(event.Agent, interval);
        this.intervals.push(interval);
        const endAt = event.AtMs + event.DurationMs;
        steps.push({ AtMs: endAt, Order: -1, Kind: 'TurnEnd', Agent: event.Agent, Text: event.Text, DurationMs: event.DurationMs, Interval: interval });
        steps.sort((a, b) => a.AtMs - b.AtMs || a.Order - b.Order);
    }

    private finishTurn(step: Extract<Step, { Kind: 'TurnEnd' }>): void {
        if (this.open.get(step.Agent) === step.Interval) {
            this.open.delete(step.Agent);
            this.coordinator.CompleteTurn(ROOM, step.Agent, { Text: step.Text, DurationMs: step.DurationMs });
        }
    }

    private agentYields(event: YieldEvent): void {
        const result = this.coordinator.YieldFloor(ROOM, event.Agent, event.To);
        this.yields.push({ Reason: result.Reason, HandoffTo: result.HandoffToAgentSessionId });
        if (result.Released) {
            this.truncateOpenTurn(event.Agent);
        }
    }

    // ── bookkeeping ───────────────────────────────────────────────────────────

    /** Ends an agent's open turn at the current time (preempted, replaced, or yielded). */
    private truncateOpenTurn(agent: string): void {
        const interval = this.open.get(agent);
        if (interval) {
            interval.EndMs = Math.min(interval.EndMs, this.now);
            this.open.delete(agent);
        }
    }

    private holder(): string | null {
        return this.coordinator.GetRoomState(ROOM)?.FloorHolderAgentSessionId ?? null;
    }


    // ── invariants (derived from the recorded timeline, never from the coordinator's own opinion) ──

    private deriveInvariants(): ReplayInvariants {
        return {
            NoAgentOverlap: !HasAgentOverlap(this.intervals),
            LoopCapRespected: !LoopRunExceeds(this.turnOrder, this.cap),
            HumansAlwaysPreempt: !OverlapsHumanSpeech(this.intervals, this.humanSpans),
            BackchannelsNeverTookFloor: this.backchannelChecks.every(ok => ok),
        };
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// The invariant checks, as pure functions so a test can prove they FAIL on a bad timeline.
// ──────────────────────────────────────────────────────────────────────────────

/** A person speaking, as a span on the virtual clock. */
export interface HumanSpan {
    StartMs: number;
    EndMs: number;
}

/** One entry in the order turns began: an agent turn, or a person speaking. */
export interface TurnOrderEntry {
    AtMs: number;
    Kind: 'Agent' | 'Human';
    Agent?: string;
}

/** Whether any two agents' turn intervals overlap. */
export function HasAgentOverlap(intervals: readonly TurnInterval[]): boolean {
    const sorted = [...intervals].sort((a, b) => a.StartMs - b.StartMs);
    return sorted.some((cur, i) => i > 0 && cur.StartMs < sorted[i - 1].EndMs);
}

/** Whether a run of consecutive agent turns (no human between) exceeds `cap`. */
export function LoopRunExceeds(order: readonly TurnOrderEntry[], cap: number): boolean {
    let run = 0;
    for (const entry of order) {
        run = entry.Kind === 'Human' ? 0 : run + 1;
        if (run > cap) {
            return true;
        }
    }
    return false;
}

/** Whether any agent turn overlaps a person speaking. */
export function OverlapsHumanSpeech(intervals: readonly TurnInterval[], spans: readonly HumanSpan[]): boolean {
    return intervals.some(turn => spans.some(h => turn.EndMs > h.StartMs && turn.StartMs < h.EndMs));
}
