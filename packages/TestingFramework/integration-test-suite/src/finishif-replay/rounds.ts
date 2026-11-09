/**
 * rounds.ts — rebuilds the finishIf gate's rounds from recorded agent run steps.
 *
 * A **round** is the Actions steps between two Prompt steps of one run. The Prompt step before them
 * asked for the actions; the Prompt step after them is the model's next turn, and gives the label:
 * `finish` when that turn ended the run without asking for more actions, `continue` otherwise.
 *
 * Production's code checks come first, as `BaseAgent` applies them. Production gates only the
 * Actions step a Loop agent's turn asked for, which `executeNextStep` dispatches with a conversation
 * message: a ForEach or While loop's iterations (recorded as Actions steps under the loop's step),
 * actions another kind of turn led to, and a non-Loop agent's actions never reach the decision.
 * Then, as `BaseAgent.finishAfterActions` checks, neither does a round where any action failed, or
 * where an action may have returned AIDirectives. The state is the round's actions through the same
 * formatter production uses.
 */
import type { ActionParam } from '@memberjunction/actions-base';
import type { JSONObject, JSONValue } from '@memberjunction/ai';
import { CapFinishIfState, FormatActionForFinishIf, type FinishIfActionResult } from '@memberjunction/ai-agents';
import { CreateSeededRandom } from '@memberjunction/testing-engine';
import type {
    FinishIfGateStatus,
    FinishIfNextStepName,
    FinishIfReplayLabel,
    ReplayAction,
    ReplayExclusion,
    ReplayPromptRunRow,
    ReplayRound,
    ReplayStepRow,
    RequestedAction,
    RoundExtraction,
    RoundSavings
} from './types';

/**
 * Actions that can return AIDirectives. The recorded Actions steps do not keep a result's
 * AIDirectives, so a round with one of these is treated as production would treat it if it had
 * returned some: never gated. `Search Query Catalog` is the only core action that returns them.
 */
export const AI_DIRECTIVE_ACTION_NAMES: readonly string[] = ['Search Query Catalog'];

/** The agent type whose turns carry a `finishIf`: only the Loop agent type writes one. */
export const LOOP_AGENT_TYPE_NAME = 'Loop';

/** The `nextStep.step` values that run a loop: their Actions steps are iterations, never gated. */
const LOOP_STEPS: readonly string[] = ['ForEach', 'While'];

/** The `nextStep.step` values reported by name; anything else is reported as `Other`. */
const KNOWN_NEXT_STEPS: readonly FinishIfNextStepName[] = [
    'Actions', 'Chat', 'Failed', 'ForEach', 'Retry', 'Sub-Agent', 'Success', 'While', 'ClientTools', 'Skill', 'Plan'
];

/** Whether a recorded param is one production passes to the formatter: an Output or Both param. */
function isOutputParamType(value: JSONValue | undefined): value is Extract<ActionParam['Type'], 'Output' | 'Both'> {
    return value === 'Output' || value === 'Both';
}

/** A JSON value that is an object, not null, an array or a primitive. */
export function IsJsonObject(value: JSONValue | undefined): value is JSONObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses a JSON column into an object, or null when it is empty, malformed or not an object. */
export function ParseJsonObject(text: string | null): JSONObject | null {
    if (!text) {
        return null;
    }
    try {
        const parsed: JSONValue = JSON.parse(text);
        return IsJsonObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/** An ID in the form the replay keys maps by. */
export function NormalizeId(id: string): string {
    return id.trim().toUpperCase();
}

/** A Prompt step's `nextStep`, or null when its output has none. */
export function ReadNextStep(outputData: string | null): JSONObject | null {
    const nextStep = ParseJsonObject(outputData)?.nextStep;
    return IsJsonObject(nextStep) ? nextStep : null;
}

/** The label a next turn gives a round: `finish` when it is Success, or terminates without asking for actions. */
export function LabelNextStep(nextStep: JSONObject): FinishIfReplayLabel {
    const actions = nextStep.actions;
    const asksForActions = Array.isArray(actions) && actions.length > 0;
    return nextStep.step === 'Success' || (nextStep.terminate === true && !asksForActions) ? 'finish' : 'continue';
}

function nextStepName(nextStep: JSONObject): FinishIfNextStepName {
    const step = nextStep.step;
    return KNOWN_NEXT_STEPS.find(known => known === step) ?? 'Other';
}

function readString(value: JSONValue | undefined): string | null {
    return typeof value === 'string' ? value : null;
}

/** The actions a pre-action turn asked for, from its `nextStep.actions`. */
export function ReadRequestedActions(nextStep: JSONObject | null): RequestedAction[] {
    const actions = nextStep?.actions;
    if (!Array.isArray(actions)) {
        return [];
    }
    return actions.filter(IsJsonObject).map(action => ({ Name: readString(action.name) ?? '', Params: action.params ?? null }));
}

/** The Output and Both params of a recorded result, as `ActionParam`s. */
function readOutputParams(parameters: JSONValue | undefined): ActionParam[] {
    if (!Array.isArray(parameters)) {
        return [];
    }
    const params: ActionParam[] = [];
    for (const param of parameters.filter(IsJsonObject)) {
        if (isOutputParamType(param.Type)) {
            params.push({ Name: readString(param.Name) ?? '', Type: param.Type, Value: param.Value });
        }
    }
    return params;
}

/** Whether a recorded action may have returned AIDirectives. */
function mayHaveDirectives(actionName: string, actionResult: JSONObject | null): boolean {
    const recorded = actionResult?.aiDirectives;
    if (Array.isArray(recorded) && recorded.length > 0) {
        return true;
    }
    const name = actionName.trim().toLowerCase();
    return AI_DIRECTIVE_ACTION_NAMES.some(known => known.toLowerCase() === name);
}

/**
 * One recorded Actions step. `InputData` is `{ actionName, actionParams }` and `OutputData` is
 * `{ actionResult: { success, resultCode, message, parameters } }`. The message falls back the way
 * production's summary does.
 */
export function ReadRecordedAction(step: ReplayStepRow): ReplayAction {
    const actionName = readString(ParseJsonObject(step.InputData)?.actionName) ?? '';
    const actionResultValue = ParseJsonObject(step.OutputData)?.actionResult;
    const actionResult = IsJsonObject(actionResultValue) ? actionResultValue : null;
    const succeeded = step.Status !== 'Failed' && actionResult?.success === true;
    return {
        StepID: step.ID,
        ActionName: actionName,
        Succeeded: succeeded,
        ResultCode: readString(actionResult?.resultCode),
        Message: readString(actionResult?.message) || (succeeded ? 'Action completed' : 'Unknown error'),
        OutputParams: readOutputParams(actionResult?.parameters),
        MayHaveDirectives: mayHaveDirectives(actionName, actionResult)
    };
}

/**
 * Why production would never gate a stretch of Actions steps whatever its results, or null when it
 * would reach the result checks. In order:
 * - an iteration of a ForEach or While loop: an Actions step under another step, or after a turn
 *   that asked for a loop (production runs these with no conversation message, and never gates them);
 * - after a turn that did not ask for an Actions step;
 * - a run whose agent is not a Loop agent.
 *
 * @param request The `nextStep` of the turn before the actions, or null when it has none.
 * @param actionSteps The stretch's Actions steps.
 * @param agentType The name of the run's agent's type.
 */
export function StructuralGateStatus(
    request: JSONObject | null,
    actionSteps: ReadonlyArray<Pick<ReplayStepRow, 'ParentID'>>,
    agentType: string | null
): FinishIfGateStatus | null {
    const step = request?.step;
    if (actionSteps.some(s => !!s.ParentID) || (typeof step === 'string' && LOOP_STEPS.includes(step))) {
        return 'loop-iteration';
    }
    if (step !== 'Actions') {
        return 'not-an-actions-turn';
    }
    return (agentType ?? '').trim().toLowerCase() === LOOP_AGENT_TYPE_NAME.toLowerCase() ? null : 'not-a-loop-agent';
}

/** Production's result checks, in its order: every action succeeded, then none returned AIDirectives. */
export function GateStatusOf(actions: readonly ReplayAction[]): FinishIfGateStatus {
    if (!actions.every(action => action.Succeeded)) {
        return 'action-failed';
    }
    return actions.some(action => action.MayHaveDirectives) ? 'may-have-directives' : 'gated';
}

/** A recorded action in the shape production's formatter reads. */
export function ToFinishIfActionResult(action: ReplayAction): FinishIfActionResult {
    return { actionName: action.ActionName, message: action.Message, params: action.OutputParams };
}

/** The gate's state for a round, built exactly as `BaseAgent.finishAfterActions` builds it. */
export function BuildRoundState(round: Pick<ReplayRound, 'Actions'>): string {
    return CapFinishIfState(round.Actions.map(action => FormatActionForFinishIf(ToFinishIfActionResult(action))).join('\n\n'));
}

function buildRound(before: ReplayStepRow, actionSteps: readonly ReplayStepRow[], after: ReplayStepRow, label: JSONObject): ReplayRound {
    const request = ReadNextStep(before.OutputData);
    const actions = actionSteps.map(ReadRecordedAction);
    return {
        RoundId: before.ID,
        AgentRunID: before.AgentRunID,
        LabelStepID: after.ID,
        LabelPromptRunID: after.TargetLogID,
        Label: LabelNextStep(label),
        NextStep: nextStepName(label),
        Reasoning: readString(request?.reasoning) ?? '',
        RequestedActions: ReadRequestedActions(request),
        Actions: actions,
        GateStatus: StructuralGateStatus(request, actionSteps, before.AgentType) ?? GateStatusOf(actions)
    };
}

/** Closes one stretch of Actions steps: a round, or an exclusion saying why it is not one. */
function closeStretch(before: ReplayStepRow | null, actionSteps: readonly ReplayStepRow[], after: ReplayStepRow | null, into: RoundExtraction): void {
    const exclude = (reason: ReplayExclusion['Reason']): void => {
        into.Excluded.push({ AgentRunID: actionSteps[0].AgentRunID, FirstActionStepID: actionSteps[0].ID, Reason: reason });
    };
    if (!before) {
        return exclude('no-previous-prompt');
    }
    if (!after) {
        return exclude('no-next-prompt');
    }
    const label = ReadNextStep(after.OutputData);
    if (!label) {
        return exclude('label-unreadable');
    }
    into.Rounds.push(buildRound(before, actionSteps, after, label));
}

/** Walks one run's steps in order, closing a stretch of Actions steps at each Prompt step. */
function extractRunRounds(steps: readonly ReplayStepRow[], into: RoundExtraction): void {
    let before: ReplayStepRow | null = null;
    let pending: ReplayStepRow[] = [];
    for (const step of steps) {
        if (step.StepType === 'Actions') {
            pending.push(step);
        } else if (step.StepType === 'Prompt') {
            if (pending.length > 0) {
                closeStretch(before, pending, step, into);
                pending = [];
            }
            before = step;
        }
    }
    if (pending.length > 0) {
        closeStretch(before, pending, null, into);
    }
}

/** The rows grouped by run, each run's steps stably sorted by step number. */
function groupByRun(rows: readonly ReplayStepRow[]): Map<string, ReplayStepRow[]> {
    const runs = new Map<string, ReplayStepRow[]>();
    for (const row of rows) {
        const key = NormalizeId(row.AgentRunID);
        const steps = runs.get(key) ?? [];
        steps.push(row);
        runs.set(key, steps);
    }
    for (const steps of runs.values()) {
        steps.sort((a, b) => a.StepNumber - b.StepNumber);
    }
    return runs;
}

/**
 * Every round in the rows, and every stretch of Actions steps that is not one. Rows of other step
 * types are ignored. Within a run, rows keep their given order among equal step numbers.
 */
export function ExtractRounds(rows: readonly ReplayStepRow[]): RoundExtraction {
    const extraction: RoundExtraction = { Rounds: [], Excluded: [] };
    for (const steps of groupByRun(rows).values()) {
        extractRunRounds(steps, extraction);
    }
    return extraction;
}

/** What a passing gate would have saved on a round: its label turn's recorded latency, cost and tokens. */
export function RoundSavingsOf(round: Pick<ReplayRound, 'LabelPromptRunID'>, promptRuns: ReadonlyMap<string, ReplayPromptRunRow>): RoundSavings {
    const run = round.LabelPromptRunID ? promptRuns.get(NormalizeId(round.LabelPromptRunID)) : undefined;
    return {
        LatencyMs: run?.ExecutionTimeMS ?? null,
        CostUSD: run ? run.TotalCost ?? run.Cost ?? null : null,
        Tokens: run?.TokensUsed ?? null
    };
}

/**
 * At most `limit` of the rounds, drawn with a generator seeded with `seed`, in their original
 * order. All of them when `limit` is null or not smaller.
 */
export function SampleRounds<T>(rounds: readonly T[], limit: number | null, seed: number): T[] {
    if (limit === null || limit >= rounds.length) {
        return [...rounds];
    }
    const random = CreateSeededRandom(seed);
    const indexes = rounds.map((_, i) => i);
    for (let i = indexes.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
    }
    return indexes.slice(0, Math.max(0, limit)).sort((a, b) => a - b).map(i => rounds[i]);
}
