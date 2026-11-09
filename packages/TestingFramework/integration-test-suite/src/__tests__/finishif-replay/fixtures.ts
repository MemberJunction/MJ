/**
 * Hand-written step rows for the finishIf replay tests. Every text field carries {@link SENTINEL},
 * so a test can prove that no step text reaches a written file.
 */
import type { JSONObject, JSONValue } from '@memberjunction/ai';
import type { ReplayPromptRunRow, ReplayStepRow } from '../../finishif-replay/types';

/** Text that stands for step text: it must never appear in the report. */
export const SENTINEL = 'PLUM-SENTINEL';

/** A GUID-shaped ID, uppercase as SQL Server returns it. */
export function Guid(prefix: number, n: number): string {
    return `${String(prefix).padStart(8, '0')}-0000-0000-0000-${String(n).padStart(12, '0')}`;
}

/** The agent type of every fixture run, unless a test says otherwise. */
export const LOOP = 'Loop';

/** A Prompt step of a Loop agent's run, whose output is `{ nextStep, scratchpad }`, or has no output at all. */
export function PromptStep(run: string, stepNumber: number, nextStep: JSONObject | null, promptRunId: string | null = null): ReplayStepRow {
    return {
        ID: Guid(1, Number(`${run.slice(-2)}${String(stepNumber).padStart(3, '0')}`)),
        AgentRunID: run,
        ParentID: null,
        AgentType: LOOP,
        StepNumber: stepNumber,
        StepType: 'Prompt',
        Status: nextStep ? 'Completed' : 'Failed',
        InputData: null,
        OutputData: nextStep ? JSON.stringify({ nextStep, scratchpad: { notes: `${SENTINEL} scratchpad notes` } }) : null,
        TargetLogID: promptRunId
    };
}

/** What an Actions step recorded. */
export interface RecordedActionFixture {
    Name?: string;
    Success?: boolean;
    Message?: string;
    Status?: string;
    /** More result params, after the default Input and Output ones. */
    ExtraParams?: JSONObject[];
    /** AIDirectives on the recorded result, which production does not record today. */
    Directives?: JSONValue[];
    /** The step it ran under: a ForEach or While step for a loop's iterations. */
    ParentID?: string;
}

/** An Actions step: `{ actionName, actionParams }` in, `{ actionResult }` out, with an Input and an Output param. */
export function ActionStep(run: string, stepNumber: number, fixture: RecordedActionFixture = {}): ReplayStepRow {
    const success = fixture.Success ?? true;
    return {
        ID: Guid(2, Number(`${run.slice(-2)}${String(stepNumber).padStart(3, '0')}`)),
        AgentRunID: run,
        ParentID: fixture.ParentID ?? null,
        AgentType: LOOP,
        StepNumber: stepNumber,
        StepType: 'Actions',
        Status: fixture.Status ?? (success ? 'Completed' : 'Failed'),
        InputData: JSON.stringify({ actionName: fixture.Name ?? 'Web Search', actionParams: { Query: `${SENTINEL} search terms` } }),
        OutputData: JSON.stringify({
            actionResult: {
                success,
                resultCode: success ? 'SUCCESS' : 'ERROR',
                message: fixture.Message ?? `${SENTINEL} action message`,
                parameters: [
                    { Name: 'Query', Type: 'Input', Value: `${SENTINEL} input value` },
                    { Name: 'Results', Type: 'Output', Value: { Hits: [`${SENTINEL} result one`], Count: 1 } },
                    ...(fixture.ExtraParams ?? [])
                ],
                ...(fixture.Directives ? { aiDirectives: fixture.Directives } : {})
            }
        }),
        TargetLogID: null
    };
}

/** A pre-action turn: asks for one action. */
export function AsksForActions(): JSONObject {
    return {
        step: 'Actions',
        terminate: false,
        reasoning: `${SENTINEL} reasoning before the actions`,
        actions: [{ name: 'Web Search', params: { Query: `${SENTINEL} requested params` } }]
    };
}

/** A turn that runs one action over each item of a list: a ForEach loop. */
export function LoopsOver(): JSONObject {
    return {
        step: 'ForEach',
        terminate: false,
        reasoning: `${SENTINEL} loop over the items`,
        forEach: { collectionPath: 'payload.items', itemVariable: 'item', action: { name: 'Web Search', params: { Query: '{{item}}' } } }
    };
}

/** A turn that runs one action while a condition holds: a While loop. */
export function LoopsWhile(): JSONObject {
    return {
        step: 'While',
        terminate: false,
        reasoning: `${SENTINEL} loop while more pages`,
        while: { condition: 'payload.hasMore', action: { name: 'Web Search', params: { Query: 'next' } } }
    };
}

export function Succeeds(): JSONObject {
    return { step: 'Success', terminate: true, reasoning: `${SENTINEL} done`, message: `${SENTINEL} final message` };
}

export function Chats(): JSONObject {
    return { step: 'Chat', terminate: true, reasoning: `${SENTINEL} ask`, message: `${SENTINEL} question for the user` };
}

export function Retries(): JSONObject {
    return { step: 'Retry', terminate: false, reasoning: `${SENTINEL} retry`, errorMessage: `${SENTINEL} error` };
}

/** A terminating turn that still asks for actions: not a finish. */
export function TerminatesWithActions(): JSONObject {
    return { ...AsksForActions(), terminate: true };
}

/** A turn whose step is free text: reported as `Other`, never as the text. */
export function OddStep(): JSONObject {
    return { step: `${SENTINEL} free text step`, terminate: false, reasoning: `${SENTINEL} odd` };
}

/** A label turn's prompt run. */
export function PromptRun(id: string, executionTimeMS: number | null, totalCost: number | null, cost: number | null, tokens: number | null): ReplayPromptRunRow {
    return { ID: id, ExecutionTimeMS: executionTimeMS, TotalCost: totalCost, Cost: cost, TokensUsed: tokens };
}

/** A small corpus: every kind of round, and its label turns' prompt runs. */
export interface FixtureCorpus {
    Steps: ReplayStepRow[];
    PromptRuns: ReplayPromptRunRow[];
    /** Round IDs by name. */
    Rounds: {
        /** Run A: two actions, then Success. Gated, finish. */
        GatedFinish: string;
        /** Run B: one action, then more actions. Gated, continue. */
        GatedContinue: string;
        /** Run B: one action (Send Email), then a Chat reply. Gated, finish. */
        GatedChat: string;
        /** Run C: a failed action, then a Retry. Never gated. */
        Failed: string;
        /** Run D: an action that can return AIDirectives, then Success. Never gated. */
        Directives: string;
    };
}

export function BuildCorpus(): FixtureCorpus {
    const [a, b, c, d, e] = [Guid(9, 11), Guid(9, 12), Guid(9, 13), Guid(9, 14), Guid(9, 15)];
    const steps: ReplayStepRow[] = [
        PromptStep(a, 1, AsksForActions()), ActionStep(a, 2), ActionStep(a, 3, { Name: 'Create Record' }), PromptStep(a, 4, Succeeds(), Guid(3, 1)),
        PromptStep(b, 1, AsksForActions()), ActionStep(b, 2), PromptStep(b, 3, AsksForActions(), Guid(3, 2)), ActionStep(b, 4, { Name: 'Send Email' }), PromptStep(b, 5, Chats(), Guid(3, 3)),
        PromptStep(c, 1, AsksForActions()), ActionStep(c, 2, { Success: false }), PromptStep(c, 3, Retries(), Guid(3, 4)),
        PromptStep(d, 1, AsksForActions()), ActionStep(d, 2, { Name: 'Search Query Catalog' }), PromptStep(d, 3, Succeeds(), Guid(3, 5)),
        PromptStep(e, 1, AsksForActions()), ActionStep(e, 2)
    ];
    return {
        Steps: steps,
        PromptRuns: [
            PromptRun(Guid(3, 1), 2000, 0.02, 0.01, 1000),
            PromptRun(Guid(3, 2), 1500, null, 0.015, 800),
            PromptRun(Guid(3, 3), 1000, 0.01, null, 600)
        ],
        Rounds: { GatedFinish: steps[0].ID, GatedContinue: steps[4].ID, GatedChat: steps[6].ID, Failed: steps[9].ID, Directives: steps[12].ID }
    };
}
