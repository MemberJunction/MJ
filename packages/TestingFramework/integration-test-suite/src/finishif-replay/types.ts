/**
 * types.ts — the shapes the finishIf replay passes between its steps.
 *
 * The replay reads recorded loop-agent runs, rebuilds each round of actions and the gate's state
 * from them, asks the gate's decision about each round, and reports how often the gate would have
 * ended the run where the model did, and where it did not. Everything text-bearing stays in memory:
 * the report carries IDs, labels and numbers only.
 */
import type { ActionParam } from '@memberjunction/actions-base';
import type { JSONValue } from '@memberjunction/ai';
import type { AgentFinishIf } from '@memberjunction/ai-core-plus';
import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';

/**
 * A round's label, from the model's next turn. `finish`: the turn ended the run without asking for
 * more actions, which is what a passing gate would have done. `continue`: anything else.
 */
export type FinishIfReplayLabel = 'finish' | 'continue';

/** The two ways the replay writes the gate's questions. */
export type FinishIfReplayArm = 'authored' | 'generic';

/**
 * Whether production's code checks let a round reach the decision, and if not, why, in the order
 * production applies them:
 * - `loop-iteration`: the actions are a ForEach or While loop's iterations, which production runs
 *   without a conversation message and never gates;
 * - `not-an-actions-turn`: the turn before the actions did not ask for an Actions step, so it could
 *   not have carried a `finishIf`;
 * - `not-a-loop-agent`: the run's agent is not a Loop agent, whose turns are the only ones that
 *   carry a `finishIf`;
 * - `action-failed`: an action failed;
 * - `may-have-directives`: an action may have returned AIDirectives.
 */
export type FinishIfGateStatus = 'gated' | 'loop-iteration' | 'not-an-actions-turn' | 'not-a-loop-agent' | 'action-failed' | 'may-have-directives';

/** Why a stretch of Actions steps is not a round. */
export type FinishIfExclusionReason = 'no-next-prompt' | 'no-previous-prompt' | 'label-unreadable';

/**
 * The `nextStep.step` values a label is reported under. Any other value is reported as `Other`,
 * so a recorded value never reaches the report as free text.
 */
export type FinishIfNextStepName = NonNullable<MJAIAgentRunEntity['FinalStep']> | 'ClientTools' | 'Skill' | 'Plan' | 'Other';

/** One `MJ: AI Agent Run Steps` row, as the corpus query returns it. */
export interface ReplayStepRow {
    ID: string;
    AgentRunID: string;
    /** The step this one ran under: a ForEach or While step for a loop's iterations, null at the top level. */
    ParentID: string | null;
    /** The name of the run's agent's type (`MJ: AI Agent Types`), null when the run's agent has none. */
    AgentType: string | null;
    StepNumber: number;
    StepType: string;
    Status: string;
    /** Read for Actions steps only. */
    InputData: string | null;
    OutputData: string | null;
    TargetLogID: string | null;
}

/** One `MJ: AI Prompt Runs` row's timing, cost and token columns. */
export interface ReplayPromptRunRow {
    ID: string;
    ExecutionTimeMS: number | null;
    TotalCost: number | null;
    Cost: number | null;
    TokensUsed: number | null;
}

/** An action the pre-action turn asked for: its name and params, as the model wrote them. */
export interface RequestedAction {
    Name: string;
    Params: JSONValue;
}

/** One recorded action of a round, as its Actions step holds it. */
export interface ReplayAction {
    StepID: string;
    ActionName: string;
    /** `actionResult.success`, and the step did not fail. */
    Succeeded: boolean;
    ResultCode: string | null;
    Message: string;
    /** The result's Output and Both params, as production passes them to the formatter. */
    OutputParams: ActionParam[];
    /** Whether the action may have returned AIDirectives, which production's gate never overrides. */
    MayHaveDirectives: boolean;
}

/** The Actions steps between two Prompt steps, with the turn that asked for them and the turn after. */
export interface ReplayRound {
    /** The ID of the Prompt step that asked for the actions. */
    RoundId: string;
    AgentRunID: string;
    /** The ID of the Prompt step after the actions: the turn a passing gate would have skipped. */
    LabelStepID: string;
    /** That turn's prompt run, which carries the latency and cost a pass would save. */
    LabelPromptRunID: string | null;
    Label: FinishIfReplayLabel;
    NextStep: FinishIfNextStepName;
    /** The pre-action turn's `nextStep.reasoning`. Text: never written to the report. */
    Reasoning: string;
    /** The actions the pre-action turn asked for. Text: never written to the report. */
    RequestedActions: RequestedAction[];
    Actions: ReplayAction[];
    GateStatus: FinishIfGateStatus;
}

/** A stretch of Actions steps that is not a round, and why. */
export interface ReplayExclusion {
    AgentRunID: string;
    /** The first Actions step of the stretch. */
    FirstActionStepID: string;
    Reason: FinishIfExclusionReason;
}

/** The rounds of a corpus, and the stretches left out. */
export interface RoundExtraction {
    Rounds: ReplayRound[];
    Excluded: ReplayExclusion[];
}

/** What a passing gate would have saved on a round: its label turn's recorded latency, cost and tokens. */
export interface RoundSavings {
    LatencyMs: number | null;
    CostUSD: number | null;
    Tokens: number | null;
}

/** A finishIf an LLM wrote for a round, from what the model saw before the actions ran. */
export interface AuthoredFinishIf {
    RoundId: string;
    FinishIf: AgentFinishIf;
}

/** One decision about one round in one arm and rep. */
export interface GateObservation {
    RoundId: string;
    Arm: FinishIfReplayArm;
    Rep: number;
    /** Whether the decision call succeeded. */
    CallSucceeded: boolean;
    /** Each answered question's probability, by key. */
    Probabilities: Record<string, number>;
    /** The minimum probability over the round's questions; null unless every question has a number. */
    Score: number | null;
    /** `JudgeFinishIf` at the production threshold. A failed call never passes. */
    Passed: boolean;
    ModelName: string | null;
    PromptRunID: string | null;
    LatencyMs: number;
    /** The decision's prompt run's `TotalCost ?? Cost`, read back from the dev database. */
    CostUSD: number | null;
}

/** Counts of rounds by label. */
export interface LabelCounts {
    Finish: number;
    Continue: number;
}
