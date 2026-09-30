import { describe, it, expect } from 'vitest';
import { CapFinishIfState, FormatActionForFinishIf } from '@memberjunction/ai-agents';
import {
    AI_DIRECTIVE_ACTION_NAMES,
    BuildRoundState,
    ExtractRounds,
    LabelNextStep,
    ReadRecordedAction,
    RoundSavingsOf,
    SampleRounds
} from '../../finishif-replay/rounds';
import type { ReplayStepRow } from '../../finishif-replay/types';
import {
    ActionStep,
    AsksForActions,
    Chats,
    Guid,
    OddStep,
    PromptRun,
    PromptStep,
    Retries,
    SENTINEL,
    Succeeds,
    TerminatesWithActions
} from './fixtures';

const RUN_A = Guid(9, 1);
const RUN_B = Guid(9, 2);

describe('ExtractRounds', () => {
    it('makes one round of the Actions steps between two Prompt steps, however many there are', () => {
        const steps: ReplayStepRow[] = [
            PromptStep(RUN_A, 1, AsksForActions()),
            ActionStep(RUN_A, 2),
            ActionStep(RUN_A, 3, { Name: 'Create Record' }),
            ActionStep(RUN_A, 4, { Name: 'Send Email' }),
            PromptStep(RUN_A, 5, Succeeds(), Guid(3, 5))
        ];
        const { Rounds, Excluded } = ExtractRounds(steps);
        expect(Excluded).toEqual([]);
        expect(Rounds).toHaveLength(1);
        const round = Rounds[0];
        expect(round.RoundId).toBe(steps[0].ID);
        expect(round.LabelStepID).toBe(steps[4].ID);
        expect(round.LabelPromptRunID).toBe(Guid(3, 5));
        expect(round.Actions.map(a => a.ActionName)).toEqual(['Web Search', 'Create Record', 'Send Email']);
        expect(round.Label).toBe('finish');
        expect(round.NextStep).toBe('Success');
        expect(round.GateStatus).toBe('gated');
        expect(round.Reasoning).toBe(`${SENTINEL} reasoning before the actions`);
        expect(round.RequestedActions).toEqual([{ Name: 'Web Search', Params: { Query: `${SENTINEL} requested params` } }]);
    });

    it('chains rounds, each labelled by the turn after it, and orders steps by step number', () => {
        const steps: ReplayStepRow[] = [
            PromptStep(RUN_A, 3, AsksForActions()),
            ActionStep(RUN_A, 2),
            PromptStep(RUN_A, 1, AsksForActions()),
            ActionStep(RUN_A, 4),
            PromptStep(RUN_A, 5, Chats())
        ];
        const { Rounds } = ExtractRounds(steps);
        expect(Rounds.map(r => [r.RoundId, r.Label, r.NextStep])).toEqual([
            [steps[2].ID, 'continue', 'Actions'],
            [steps[0].ID, 'finish', 'Chat']
        ]);
    });

    it('excludes, and says why, a stretch with no next Prompt step, no previous one, or an unreadable next one', () => {
        const steps: ReplayStepRow[] = [
            ActionStep(RUN_A, 1),
            PromptStep(RUN_A, 2, AsksForActions()),
            ActionStep(RUN_A, 3),
            PromptStep(RUN_A, 4, null),
            ActionStep(RUN_A, 5),
            PromptStep(RUN_B, 1, AsksForActions()),
            ActionStep(RUN_B, 2)
        ];
        const { Rounds, Excluded } = ExtractRounds(steps);
        expect(Rounds).toEqual([]);
        expect(Excluded.map(e => [e.FirstActionStepID, e.Reason])).toEqual([
            [steps[0].ID, 'no-previous-prompt'],
            [steps[2].ID, 'label-unreadable'],
            [steps[4].ID, 'no-next-prompt'],
            [steps[6].ID, 'no-next-prompt']
        ]);
    });

    it('ignores steps of other types between the Prompt steps', () => {
        const other: ReplayStepRow = { ...ActionStep(RUN_A, 3), StepType: 'Tool' };
        const { Rounds } = ExtractRounds([PromptStep(RUN_A, 1, AsksForActions()), ActionStep(RUN_A, 2), other, PromptStep(RUN_A, 4, Retries())]);
        expect(Rounds).toHaveLength(1);
        expect(Rounds[0].Actions).toHaveLength(1);
    });

    describe('the code checks, before any decision', () => {
        function roundWith(...actions: ReplayStepRow[]): ReturnType<typeof ExtractRounds>['Rounds'][number] {
            return ExtractRounds([PromptStep(RUN_A, 1, AsksForActions()), ...actions, PromptStep(RUN_A, 9, Succeeds())]).Rounds[0];
        }

        it('never gates a round where any action failed, even when others succeeded', () => {
            expect(roundWith(ActionStep(RUN_A, 2), ActionStep(RUN_A, 3, { Success: false })).GateStatus).toBe('action-failed');
            expect(roundWith(ActionStep(RUN_A, 2, { Status: 'Failed' })).GateStatus).toBe('action-failed');
        });

        it('never gates a round with an action that can return AIDirectives', () => {
            expect(AI_DIRECTIVE_ACTION_NAMES).toContain('Search Query Catalog');
            expect(roundWith(ActionStep(RUN_A, 2), ActionStep(RUN_A, 3, { Name: 'Search Query Catalog' })).GateStatus).toBe('may-have-directives');
        });

        it('checks failure before directives, in production order', () => {
            expect(roundWith(ActionStep(RUN_A, 2, { Name: 'Search Query Catalog', Success: false })).GateStatus).toBe('action-failed');
        });

        it('never gates a round whose recorded result carries AIDirectives', () => {
            const step = ActionStep(RUN_A, 2, { Directives: [{ Message: 'follow up', Type: 'instruction' }] });
            expect(roundWith(step).GateStatus).toBe('may-have-directives');
        });
    });
});

describe('LabelNextStep', () => {
    it.each([
        ['Success', Succeeds(), 'finish'],
        ['a terminating Chat', Chats(), 'finish'],
        ['a terminating Retry with no actions', { ...Retries(), terminate: true }, 'finish'],
        ['a terminating turn that asks for actions', TerminatesWithActions(), 'continue'],
        ['more actions', AsksForActions(), 'continue'],
        ['a Retry', Retries(), 'continue'],
        ['a free-text step', OddStep(), 'continue']
    ])('labels %s', (_label, nextStep, expected) => {
        expect(LabelNextStep(nextStep)).toBe(expected);
    });

    it('reports an unknown step as Other, never as its text', () => {
        const { Rounds } = ExtractRounds([PromptStep(RUN_A, 1, AsksForActions()), ActionStep(RUN_A, 2), PromptStep(RUN_A, 3, OddStep())]);
        expect(Rounds[0].NextStep).toBe('Other');
    });
});

describe('the state', () => {
    it('keeps only Output and Both params, and falls back to "Action completed" for an empty message', () => {
        const action = ReadRecordedAction(ActionStep(RUN_A, 2, { Message: '' }));
        expect(action.OutputParams).toEqual([{ Name: 'Results', Type: 'Output', Value: { Hits: [`${SENTINEL} result one`], Count: 1 } }]);
        expect(action.Message).toBe('Action completed');
    });

    it("is production's formatter over the round's actions, joined and capped", () => {
        const { Rounds } = ExtractRounds([
            PromptStep(RUN_A, 1, AsksForActions()),
            ActionStep(RUN_A, 2),
            ActionStep(RUN_A, 3, { Name: 'Create Record', Message: 'Created' }),
            PromptStep(RUN_A, 4, Succeeds())
        ]);
        const expected = [
            ['Action: Web Search', `Message: ${SENTINEL} action message`, `Output Results: {"Hits":["${SENTINEL} result one"],"Count":1}`].join('\n'),
            ['Action: Create Record', 'Message: Created', `Output Results: {"Hits":["${SENTINEL} result one"],"Count":1}`].join('\n')
        ].join('\n\n');
        expect(BuildRoundState(Rounds[0])).toBe(expected);
        expect(BuildRoundState(Rounds[0])).toBe(CapFinishIfState(Rounds[0].Actions.map(a => FormatActionForFinishIf({ actionName: a.ActionName, message: a.Message, params: a.OutputParams })).join('\n\n')));
    });
});

describe('RoundSavingsOf', () => {
    const runs = new Map([
        [Guid(3, 1), PromptRun(Guid(3, 1), 1200, 0.02, 0.01, 900)],
        [Guid(3, 2), PromptRun(Guid(3, 2), 800, null, 0.005, null)]
    ]);

    it("takes the label turn's latency, TotalCost before Cost, and tokens, matching IDs in any case", () => {
        expect(RoundSavingsOf({ LabelPromptRunID: Guid(3, 1).toLowerCase() }, runs)).toEqual({ LatencyMs: 1200, CostUSD: 0.02, Tokens: 900 });
        expect(RoundSavingsOf({ LabelPromptRunID: Guid(3, 2) }, runs)).toEqual({ LatencyMs: 800, CostUSD: 0.005, Tokens: null });
    });

    it('is all nulls without a prompt run', () => {
        expect(RoundSavingsOf({ LabelPromptRunID: null }, runs)).toEqual({ LatencyMs: null, CostUSD: null, Tokens: null });
        expect(RoundSavingsOf({ LabelPromptRunID: Guid(3, 9) }, runs)).toEqual({ LatencyMs: null, CostUSD: null, Tokens: null });
    });
});

describe('SampleRounds', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);

    it('keeps everything without a limit, or with one at least as large', () => {
        expect(SampleRounds(items, null, 7)).toEqual(items);
        expect(SampleRounds(items, 20, 7)).toEqual(items);
    });

    it('draws the same subset for the same seed, in the original order', () => {
        const first = SampleRounds(items, 5, 7);
        expect(first).toHaveLength(5);
        expect(SampleRounds(items, 5, 7)).toEqual(first);
        expect([...first].sort((a, b) => a - b)).toEqual(first);
        expect(SampleRounds(items, 5, 8)).not.toEqual(first);
    });
});
