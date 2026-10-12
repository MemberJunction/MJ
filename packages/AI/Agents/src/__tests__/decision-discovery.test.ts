/**
 * The pure half of decision discovery (decision-discovery.ts): the switch, the opening turn, @mention
 * detection, the options and the option cap, narrowing by search rank, the questions, how answers
 * are judged, and the injected message.
 */
import { describe, it, expect } from 'vitest';
import { ApplyPlattCalibration, DecisionResult, type ChatMessage, type DecisionAnswer } from '@memberjunction/ai';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import {
    AgentsWithoutDescription,
    BuildDecisionDiscoveryQuestions,
    CalibrateDiscoveryAnswers,
    CanSearchEntities,
    DECISION_DISCOVERY_AGENT_QUESTION,
    DECISION_DISCOVERY_APPLIES_INSTRUCTIONS,
    DECISION_DISCOVERY_APPLIES_QUESTION,
    DECISION_DISCOVERY_CALIBRATION,
    DECISION_DISCOVERY_HOST_AGENTS_KEY,
    DECISION_DISCOVERY_MAX_OPTIONS,
    DECISION_DISCOVERY_MAX_RECORDED_IDS,
    DECISION_DISCOVERY_MIN_CONFIDENCE,
    DECISION_DISCOVERY_MIN_OPTIONS,
    DECISION_DISCOVERY_TIMEOUT_MS,
    DecisionDiscoveryFromResult,
    DecisionDiscoveryOption,
    DecisionDiscoveryOptions,
    DecisionOptionLimit,
    FailedDecisionDiscovery,
    HostAllowedAgentIDs,
    IsDecisionDiscoveryOn,
    IsOpeningTurn,
    JudgeDecisionDiscovery,
    KeepHostAllowedAgents,
    MentionsAgent,
    RankOptionsBySearch,
    SmallestOptionCap,
    SuggestedAgentMessage,
} from '../decision-discovery';

const SELF_ID = 'DDDDDDDD-0000-4000-8000-000000000001';
const RESEARCH: DecisionDiscoveryOption = { ID: 'DDDDDDDD-1000-4000-8000-000000000001', Name: 'Research Agent', Description: 'Researches topics on the web' };
const BILLING: DecisionDiscoveryOption = { ID: 'DDDDDDDD-1000-4000-8000-000000000002', Name: 'Billing Agent', Description: 'Handles invoices and payments' };
const MARKETING: DecisionDiscoveryOption = { ID: 'DDDDDDDD-1000-4000-8000-000000000003', Name: 'Marketing Agent', Description: 'Writes marketing copy' };
const OPTIONS: DecisionDiscoveryOption[] = [RESEARCH, BILLING, MARKETING];

const AGENTS = [
    { ID: SELF_ID, Name: 'Sage' },
    { ID: RESEARCH.ID, Name: RESEARCH.Name },
    { ID: BILLING.ID, Name: BILLING.Name },
];

/** The composer's mention token for an agent. */
function mentionToken(id: string, name: string, type: 'agent' | 'user' = 'agent'): string {
    return `@{"_mode":"mention","type":"${type}","id":"${id}","name":"${name}"}`;
}

/** A Choice answer for `value` and a Likelihood answer, keyed as the questions are. */
function answers(value: string, confidence: number, applies: number): Record<string, DecisionAnswer> {
    return {
        [DECISION_DISCOVERY_AGENT_QUESTION]: {
            Kind: 'Choice',
            Value: value,
            Confidence: confidence,
            Probabilities: { [RESEARCH.ID]: 0.1, [BILLING.ID]: confidence, [MARKETING.ID]: 0.9 - confidence },
        },
        [DECISION_DISCOVERY_APPLIES_QUESTION]: { Kind: 'Likelihood', Probability: applies },
    };
}

/** The judge's tests pin their own threshold, so they test its rule rather than the production value. */
const JUDGE_THRESHOLD = 0.7;

/** A raw probability as the named model's discovery calibration maps it. */
function calibrated(model: string, question: 'Confidence' | 'AnyApplies', p: number): number {
    return ApplyPlattCalibration(p, calibrationEntry(model).Calibration[question]);
}

/** The calibration table's entry for a decision model. */
function calibrationEntry(model: string): (typeof DECISION_DISCOVERY_CALIBRATION)[number] {
    const entry = DECISION_DISCOVERY_CALIBRATION.find(c => c.ModelName === model);
    if (!entry) {
        throw new Error(`no discovery calibration for ${model}`);
    }
    return entry;
}

/** The exact model Jev's calibration was fitted on: its pinned APIName, which it reports back. */
const JEV_RESOLVED_MODEL = 'typesafe/jev-1.13-20260917';

describe('the named constants', () => {
    it('start where the brief puts them', () => {
        expect(DECISION_DISCOVERY_MAX_OPTIONS).toBe(25);
        expect(DECISION_DISCOVERY_MIN_OPTIONS).toBe(3);
        expect(DECISION_DISCOVERY_MIN_CONFIDENCE).toBe(0.85);
        expect(DECISION_DISCOVERY_TIMEOUT_MS).toBe(1500);
        expect(DECISION_DISCOVERY_MAX_RECORDED_IDS).toBe(50);
        expect(DECISION_DISCOVERY_HOST_AGENTS_KEY).toBe('ALL_AVAILABLE_AGENTS');
    });
});

describe('IsDecisionDiscoveryOn', () => {
    it('is on only for decisionDiscovery: true', () => {
        expect(IsDecisionDiscoveryOn({ decisionDiscovery: true })).toBe(true);
        expect(IsDecisionDiscoveryOn(undefined)).toBe(false);
        expect(IsDecisionDiscoveryOn({})).toBe(false);
        expect(IsDecisionDiscoveryOn({ decisionDiscovery: false })).toBe(false);
        expect(IsDecisionDiscoveryOn({ decisionDiscovery: 'true' })).toBe(false);
        expect(IsDecisionDiscoveryOn({ decisionDiscovery: 1 })).toBe(false);
    });
});

describe('IsOpeningTurn', () => {
    const user = (content: string): ChatMessage => ({ role: 'user', content });
    const assistant = (content: string): ChatMessage => ({ role: 'assistant', content });
    const system = (content: string): ChatMessage => ({ role: 'system', content });

    it('is the opening turn when the run holds exactly one user message', () => {
        expect(IsOpeningTurn([user('Invoice Acme')])).toBe(true);
    });

    it('ignores assistant and system messages, so a greeting or injected context before the request still counts', () => {
        expect(IsOpeningTurn([system('<retrieved_context>'), assistant('Hi! How can I help?'), user('Invoice Acme')])).toBe(true);
    });

    it('is a follow-up when an earlier request, or the summary of earlier turns, is in the history', () => {
        expect(IsOpeningTurn([user('Invoice Acme'), assistant('Done.'), user('Make it shorter')])).toBe(false);
        expect(IsOpeningTurn([user('Summary of the earlier conversation'), user('Make it shorter')])).toBe(false);
    });

    it('is not an opening turn without a user message', () => {
        expect(IsOpeningTurn([])).toBe(false);
        expect(IsOpeningTurn(undefined)).toBe(false);
        expect(IsOpeningTurn([assistant('Hi!')])).toBe(false);
    });
});

describe('MentionsAgent', () => {
    it('sees an agent mention token', () => {
        expect(MentionsAgent(`${mentionToken(BILLING.ID, 'Billing Agent')} invoice Acme`, AGENTS, SELF_ID)).toBe(true);
    });

    it('sees the "@Agent Name" text a token is converted to, in any case', () => {
        expect(MentionsAgent('@Billing Agent please invoice Acme', AGENTS, SELF_ID)).toBe(true);
        expect(MentionsAgent('ask @billing agent, please', AGENTS, SELF_ID)).toBe(true);
        expect(MentionsAgent('Please ask (@Research Agent) about it', AGENTS, SELF_ID)).toBe(true);
    });

    it('ignores a mention of the running agent itself', () => {
        expect(MentionsAgent(`${mentionToken(SELF_ID, 'Sage')} invoice Acme`, AGENTS, SELF_ID)).toBe(false);
        expect(MentionsAgent('@Sage please invoice Acme', AGENTS, SELF_ID)).toBe(false);
    });

    it('ignores user mentions, a name inside a longer word, and an email address', () => {
        expect(MentionsAgent(`${mentionToken('DDDDDDDD-9000-4000-8000-000000000001', 'Billing Agent', 'user')} hi`, [], SELF_ID)).toBe(false);
        expect(MentionsAgent('@Billing Agents are busy', AGENTS, SELF_ID)).toBe(false);
        expect(MentionsAgent('write to accounts@billing agent', AGENTS, SELF_ID)).toBe(false);
    });

    it('is false without an @, or for an agent with no name', () => {
        expect(MentionsAgent('Billing Agent, please invoice Acme', AGENTS, SELF_ID)).toBe(false);
        expect(MentionsAgent('@ hello', [{ ID: RESEARCH.ID, Name: null }, { ID: BILLING.ID, Name: '  ' }], SELF_ID)).toBe(false);
    });
});

describe('DecisionDiscoveryOptions', () => {
    it('keeps each agent with a description, in order, with its trimmed description', () => {
        const options = DecisionDiscoveryOptions([
            { ID: RESEARCH.ID, Name: RESEARCH.Name, Description: `  ${RESEARCH.Description} ` },
            { ID: 'DDDDDDDD-1000-4000-8000-000000000009', Name: 'Blank', Description: '   ' },
            { ID: 'DDDDDDDD-1000-4000-8000-000000000010', Name: 'Null', Description: null },
            { ID: BILLING.ID, Name: BILLING.Name, Description: BILLING.Description },
        ]);

        expect(options).toEqual([RESEARCH, BILLING]);
    });
});

describe('the option cap', () => {
    it('SmallestOptionCap takes the smallest positive cap, or undefined when none is declared', () => {
        expect(SmallestOptionCap([255, null, 40, undefined])).toBe(40);
        expect(SmallestOptionCap([null, undefined, 0, -1])).toBeUndefined();
        expect(SmallestOptionCap([])).toBeUndefined();
    });

    it('DecisionOptionLimit is DECISION_DISCOVERY_MAX_OPTIONS, or the declared cap when smaller', () => {
        expect(DecisionOptionLimit(255)).toBe(DECISION_DISCOVERY_MAX_OPTIONS);
        expect(DecisionOptionLimit(10)).toBe(10);
    });

    it('DecisionOptionLimit still applies when no cap is declared', () => {
        expect(DecisionOptionLimit(undefined)).toBe(DECISION_DISCOVERY_MAX_OPTIONS);
    });
});

describe('AgentsWithoutDescription', () => {
    it('lists, in order, the IDs DecisionDiscoveryOptions leaves out', () => {
        const agents = [
            { ID: RESEARCH.ID, Name: RESEARCH.Name, Description: RESEARCH.Description },
            { ID: 'DDDDDDDD-1000-4000-8000-000000000009', Name: 'Blank', Description: '   ' },
            { ID: BILLING.ID, Name: BILLING.Name, Description: BILLING.Description },
            { ID: 'DDDDDDDD-1000-4000-8000-000000000010', Name: 'Null', Description: null },
        ];

        expect(AgentsWithoutDescription(agents)).toEqual(['DDDDDDDD-1000-4000-8000-000000000009', 'DDDDDDDD-1000-4000-8000-000000000010']);
        expect(DecisionDiscoveryOptions(agents).map(o => o.ID)).toEqual([RESEARCH.ID, BILLING.ID]);
    });
});

describe("the host's allow-list", () => {
    it('HostAllowedAgentIDs reads the IDs of ALL_AVAILABLE_AGENTS, skipping entries without one', () => {
        const data = {
            [DECISION_DISCOVERY_HOST_AGENTS_KEY]: [
                { ID: RESEARCH.ID, Name: RESEARCH.Name, Description: RESEARCH.Description },
                { Name: 'No ID' },
                'not an object',
                { ID: BILLING.ID },
            ],
        };

        expect(HostAllowedAgentIDs(data)).toEqual([RESEARCH.ID, BILLING.ID]);
    });

    it('HostAllowedAgentIDs is undefined without an array, and empty for an empty one', () => {
        expect(HostAllowedAgentIDs(undefined)).toBeUndefined();
        expect(HostAllowedAgentIDs({})).toBeUndefined();
        expect(HostAllowedAgentIDs({ [DECISION_DISCOVERY_HOST_AGENTS_KEY]: 'everyone' })).toBeUndefined();
        expect(HostAllowedAgentIDs({ [DECISION_DISCOVERY_HOST_AGENTS_KEY]: [] })).toEqual([]);
    });

    it('KeepHostAllowedAgents keeps the allowed agents in order, comparing IDs in any case', () => {
        expect(KeepHostAllowedAgents(OPTIONS, [MARKETING.ID.toLowerCase(), RESEARCH.ID])).toEqual([RESEARCH, MARKETING]);
        expect(KeepHostAllowedAgents(OPTIONS, [])).toEqual([]);
    });

    it('KeepHostAllowedAgents keeps every agent without an allow-list', () => {
        expect(KeepHostAllowedAgents(OPTIONS, undefined)).toBe(OPTIONS);
    });
});

describe('RankOptionsBySearch', () => {
    it('keeps the options the search returned, in its rank order, up to the limit', () => {
        const ranked = [MARKETING.ID, 'DDDDDDDD-7000-4000-8000-000000000001', RESEARCH.ID.toLowerCase(), MARKETING.ID, BILLING.ID];

        expect(RankOptionsBySearch(OPTIONS, ranked, 2)).toEqual([MARKETING, RESEARCH]);
        expect(RankOptionsBySearch(OPTIONS, ranked, 10)).toEqual([MARKETING, RESEARCH, BILLING]);
    });

    it('drops an option the search did not return', () => {
        expect(RankOptionsBySearch(OPTIONS, [BILLING.ID], 25)).toEqual([BILLING]);
        expect(RankOptionsBySearch(OPTIONS, [], 25)).toEqual([]);
    });
});

describe('BuildDecisionDiscoveryQuestions', () => {
    it('asks a Choice over the agent IDs with their descriptions, and whether a specialist should handle the request', () => {
        expect(BuildDecisionDiscoveryQuestions([RESEARCH, BILLING])).toEqual({
            agent: {
                Kind: 'Choice',
                Instructions: 'Which agent should handle this request?',
                Options: [
                    { Value: RESEARCH.ID, Description: RESEARCH.Description },
                    { Value: BILLING.ID, Description: BILLING.Description },
                ],
            },
            anyApplies: {
                Kind: 'Likelihood',
                Instructions: DECISION_DISCOVERY_APPLIES_INSTRUCTIONS,
            },
        });
    });

    it('words the Likelihood so it stands on the request alone, without the options', () => {
        // Pinned on purpose: the discovery eval measured, and its calibration fitted, exactly this
        // wording. Naming the options (so the decision can say none fits) needs a re-measurement first.
        expect(DECISION_DISCOVERY_APPLIES_INSTRUCTIONS).toBe(
            'This request asks for work that a specialist agent should do, rather than something the conversation manager should answer directly or plan as a multi-agent workflow.'
        );
        expect(DECISION_DISCOVERY_APPLIES_INSTRUCTIONS).not.toMatch(/these agents/i);
    });
});

describe('JudgeDecisionDiscovery', () => {
    it('is confident when both answers reach the threshold, and reports the answer by name', () => {
        const verdict = JudgeDecisionDiscovery(answers(BILLING.ID, 0.84, 0.9), OPTIONS, JUDGE_THRESHOLD);

        expect(verdict.Confident).toBe(true);
        expect(verdict.Reason).toBeUndefined();
        expect(verdict.Answer).toEqual({
            Agent: BILLING,
            Confidence: 0.84,
            AnyApplies: 0.9,
            Probabilities: { 'Research Agent': 0.1, 'Billing Agent': 0.84, 'Marketing Agent': 0.9 - 0.84 },
        });
    });

    it('counts a confidence exactly at the threshold as confident', () => {
        expect(JudgeDecisionDiscovery(answers(BILLING.ID, 0.7, 0.7), OPTIONS, JUDGE_THRESHOLD).Confident).toBe(true);
    });

    it.each([
        ['a low Choice confidence', 0.69, 0.95, 'agent confidence 0.69'],
        ['a low Likelihood', 0.95, 0.4, 'any agent applies, 0.40'],
    ])('is not confident with %s, and says why', (_label, confidence, applies, reason) => {
        const verdict = JudgeDecisionDiscovery(answers(BILLING.ID, confidence, applies), OPTIONS, JUDGE_THRESHOLD);

        expect(verdict.Confident).toBe(false);
        expect(verdict.Answer?.Agent).toEqual(BILLING);
        expect(verdict.Reason).toContain(reason);
    });

    it('matches the chosen value to an option whatever its case', () => {
        expect(JudgeDecisionDiscovery(answers(BILLING.ID.toLowerCase(), 0.9, 0.9), OPTIONS).Answer?.Agent).toEqual(BILLING);
    });

    it.each([
        ['no answers', {}],
        ['a missing Likelihood', { agent: answers(BILLING.ID, 0.9, 0.9).agent }],
        ['a Choice answered as a Likelihood', { agent: { Kind: 'Likelihood', Probability: 0.9 }, anyApplies: { Kind: 'Likelihood', Probability: 0.9 } }],
        ['a confidence that is not a number', answers(BILLING.ID, Number.NaN, 0.9)],
        ['a probability that is not a number', answers(BILLING.ID, 0.9, Number.NaN)],
        ['a value that is not an option', answers('DDDDDDDD-7000-4000-8000-000000000001', 0.9, 0.9)],
    ] as Array<[string, Record<string, DecisionAnswer>]>)('gives no answer for %s', (_label, given) => {
        const verdict = JudgeDecisionDiscovery(given, OPTIONS);

        expect(verdict.Confident).toBe(false);
        expect(verdict.Answer).toBeUndefined();
        expect(verdict.Reason).toBeTruthy();
    });
});

/** The chat model LLM Decision's calibration was fitted on. */
const LLM_DECISION_CHAT_MODEL = 'GPT-OSS-120B';

describe('DecisionDiscoveryFromResult', () => {
    /**
     * A decision result, from Jev at its calibrated version unless told otherwise; `modelName` null
     * means the result names no model. `resolvedModel` is what the driver reports behind the model:
     * Jev's dated version, or LLM Decision's chat model; null means it reports none.
     */
    function result(
        success: boolean,
        given: Record<string, DecisionAnswer>,
        errorMessage?: string,
        modelName: string | null = 'Jev',
        resolvedModel: string | null = modelName === 'Jev' ? JEV_RESOLVED_MODEL : null
    ): AIDecisionRunResult {
        const driverResult = new DecisionResult(success, new Date(0), new Date(1));
        driverResult.ResolvedModel = resolvedModel ?? undefined;
        return { success, errorMessage, Answers: given, modelInfo: modelName ? { modelId: 'model-1', modelName } : undefined, DecisionResult: driverResult };
    }

    it('injects the suggestion for an answer whose calibrated values are confident', () => {
        const outcome = DecisionDiscoveryFromResult(result(true, answers(BILLING.ID, 0.99, 0.8)), OPTIONS);
        const confidence = calibrated('Jev', 'Confidence', 0.99);

        expect(confidence).toBeGreaterThanOrEqual(DECISION_DISCOVERY_MIN_CONFIDENCE);
        expect(outcome).toMatchObject({ Injected: true, Succeeded: true, Message: SuggestedAgentMessage(BILLING, confidence) });
        expect(outcome.Answer?.Agent).toEqual(BILLING);
        expect(outcome.Answer?.AnyApplies).toBeCloseTo(calibrated('Jev', 'AnyApplies', 0.8), 10);
    });

    it('judges the calibrated values, not the raw ones', () => {
        // Raw 0.84 and 0.9 clear the old raw 0.7; Jev's calibrated confidence for 0.84 is about 0.77.
        const outcome = DecisionDiscoveryFromResult(result(true, answers(BILLING.ID, 0.84, 0.9)), OPTIONS);

        expect(calibrated('Jev', 'Confidence', 0.84)).toBeLessThan(DECISION_DISCOVERY_MIN_CONFIDENCE);
        expect(outcome).toMatchObject({ Injected: false, Succeeded: true });
        expect(outcome.Reason).toContain(`below ${DECISION_DISCOVERY_MIN_CONFIDENCE}`);
    });

    it('injects nothing, as a success, for an unsure answer', () => {
        const outcome = DecisionDiscoveryFromResult(result(true, answers(BILLING.ID, 0.5, 0.9)), OPTIONS);

        expect(outcome).toMatchObject({ Injected: false, Succeeded: true });
        expect(outcome.Message).toBeUndefined();
        expect(outcome.Reason).toContain(`below ${DECISION_DISCOVERY_MIN_CONFIDENCE}`);
    });

    it.each([
        ['a model with no calibration', 'Some Other Model'],
        ['an unnamed model', null],
    ])('treats an answer from %s as unsure, and keeps the raw answer', (_label, modelName) => {
        const outcome = DecisionDiscoveryFromResult(result(true, answers(BILLING.ID, 0.99, 0.99), undefined, modelName), OPTIONS);

        expect(outcome).toMatchObject({ Injected: false, Succeeded: true, UncalibratedModel: `${modelName ?? 'an unnamed model'} (resolved model not reported)` });
        expect(outcome.Reason).toContain('has no discovery calibration');
        expect(outcome.Answer).toMatchObject({ Agent: BILLING, Confidence: 0.99, AnyApplies: 0.99 });
    });

    it("calibrates LLM Decision's answers with its parameters when its fitted chat model answered", () => {
        const outcome = DecisionDiscoveryFromResult(result(true, answers(BILLING.ID, 0.95, 0.99), undefined, 'LLM Decision', LLM_DECISION_CHAT_MODEL), OPTIONS);

        expect(outcome.UncalibratedModel).toBeUndefined();
        expect(outcome.Answer?.Confidence).toBeCloseTo(calibrated('LLM Decision', 'Confidence', 0.95), 10);
        expect(outcome.Answer?.AnyApplies).toBeCloseTo(calibrated('LLM Decision', 'AnyApplies', 0.99), 10);
        expect(outcome.Injected).toBe(true);
    });

    it.each([
        ["LLM Decision answering through another chat model, which gets no GPT-OSS-120B parameters", 'LLM Decision', 'GPT 5.5 Instant', 'LLM Decision (GPT 5.5 Instant)'],
        ['LLM Decision with no chat model reported', 'LLM Decision', null, 'LLM Decision (resolved model not reported)'],
        ['Jev at another version than its calibration was fitted on', 'Jev', 'typesafe/jev-1.14-20261001', 'Jev (typesafe/jev-1.14-20261001)'],
        ['Jev with no version reported', 'Jev', null, 'Jev (resolved model not reported)'],
        ['a model named after an inherited member', 'constructor', 'toString', 'constructor (toString)'],
    ])('treats an answer from %s as unsure', (_label, modelName, resolvedModel, described) => {
        // Raw answers so confident that any calibration would inject them.
        const outcome = DecisionDiscoveryFromResult(result(true, answers(BILLING.ID, 0.99, 0.99), undefined, modelName, resolvedModel), OPTIONS);

        expect(outcome).toMatchObject({ Injected: false, Succeeded: true, UncalibratedModel: described });
        expect(outcome.Reason).toBe(`the answering model ${described} has no discovery calibration, so its answer is treated as unsure`);
        expect(outcome.Answer).toMatchObject({ Confidence: 0.99, AnyApplies: 0.99 });
    });

    it('fails for a failed call or an unusable answer', () => {
        expect(DecisionDiscoveryFromResult(result(false, {}, 'No decision model'), OPTIONS)).toMatchObject({ Injected: false, Succeeded: false, Reason: 'No decision model' });
        expect(DecisionDiscoveryFromResult(result(true, {}), OPTIONS)).toMatchObject({ Injected: false, Succeeded: false });
    });

    it('uses the threshold it is given', () => {
        expect(DecisionDiscoveryFromResult(result(true, answers(BILLING.ID, 0.5, 0.5)), OPTIONS, 0.5).Injected).toBe(true);
    });
});

describe('DECISION_DISCOVERY_CALIBRATION', () => {
    it('ties each calibration to the exact model it was fitted on: Jev at its pinned version, LLM Decision through GPT-OSS-120B', () => {
        expect(DECISION_DISCOVERY_CALIBRATION.map(c => [c.ModelName, c.ResolvedModel])).toEqual([
            ['Jev', JEV_RESOLVED_MODEL],
            ['LLM Decision', LLM_DECISION_CHAT_MODEL]
        ]);
    });
});

describe('CalibrateDiscoveryAnswers', () => {
    it('calibrates the Choice confidence and the Likelihood with the model\'s Platt parameters', () => {
        for (const entry of DECISION_DISCOVERY_CALIBRATION) {
            const out = CalibrateDiscoveryAnswers(answers(BILLING.ID, 0.6, 0.3), { ModelName: entry.ModelName, ResolvedModel: entry.ResolvedModel });
            const choice = out?.[DECISION_DISCOVERY_AGENT_QUESTION];
            const applies = out?.[DECISION_DISCOVERY_APPLIES_QUESTION];

            expect(choice?.Kind === 'Choice' ? choice.Confidence : null).toBeCloseTo(ApplyPlattCalibration(0.6, entry.Calibration.Confidence), 10);
            expect(applies?.Kind === 'Likelihood' ? applies.Probability : null).toBeCloseTo(ApplyPlattCalibration(0.3, entry.Calibration.AnyApplies), 10);
        }
    });

    it('leaves the Choice value and distribution as they are, and trims the model name', () => {
        const given = answers(BILLING.ID, 0.6, 0.3);
        const out = CalibrateDiscoveryAnswers(given, { ModelName: ' Jev ', ResolvedModel: ` ${JEV_RESOLVED_MODEL} ` });
        const choice = out?.[DECISION_DISCOVERY_AGENT_QUESTION];
        const original = given[DECISION_DISCOVERY_AGENT_QUESTION];

        expect(choice?.Kind === 'Choice' ? choice.Value : null).toBe(BILLING.ID);
        expect(choice?.Kind === 'Choice' && original.Kind === 'Choice' ? choice.Probabilities : null).toEqual(original.Kind === 'Choice' ? original.Probabilities : null);
    });

    it('returns null for a model with no calibration', () => {
        expect(CalibrateDiscoveryAnswers(answers(BILLING.ID, 0.6, 0.3), { ModelName: 'Some Other Model', ResolvedModel: 'x' })).toBeNull();
        expect(CalibrateDiscoveryAnswers(answers(BILLING.ID, 0.6, 0.3), {})).toBeNull();
        expect(CalibrateDiscoveryAnswers(answers(BILLING.ID, 0.6, 0.3), { ModelName: 'Jev' })).toBeNull();
        expect(CalibrateDiscoveryAnswers(answers(BILLING.ID, 0.6, 0.3), { ModelName: 'LLM Decision', ResolvedModel: 'GPT 5.5 Instant' })).toBeNull();
    });
});

describe('SuggestedAgentMessage', () => {
    it('names the agent, its description and the confidence to two places', () => {
        expect(SuggestedAgentMessage(BILLING, 0.8367)).toBe([
            '<suggested_agent>',
            'A typed decision over the agents you may delegate to chose: Billing Agent — Handles invoices and payments',
            '(confidence 0.84). Delegate to it directly unless the request clearly needs something else.',
            '</suggested_agent>',
        ].join('\n'));
    });
});

describe('FailedDecisionDiscovery', () => {
    it('injects nothing and carries the reason', () => {
        expect(FailedDecisionDiscovery('timed out')).toEqual({ Injected: false, Succeeded: false, Reason: 'timed out' });
    });
});

describe('CanSearchEntities', () => {
    it('is true only for a provider with a SearchEntity function', () => {
        expect(CanSearchEntities({ SearchEntity: async (): Promise<[]> => [] })).toBe(true);
        expect(CanSearchEntities({ SearchEntity: 'not a function' })).toBe(false);
        expect(CanSearchEntities({})).toBe(false);
        expect(CanSearchEntities(undefined)).toBe(false);
    });
});
