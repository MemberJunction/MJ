/**
 * The pure half of decision discovery (decision-discovery.ts): the switch, @mention detection, the
 * options and the option cap, narrowing by search rank, the questions, how answers are judged, and
 * the injected message.
 */
import { describe, it, expect } from 'vitest';
import type { DecisionAnswer } from '@memberjunction/ai';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import {
    AgentsWithoutDescription,
    BuildDecisionDiscoveryQuestions,
    CanSearchEntities,
    DECISION_DISCOVERY_AGENT_QUESTION,
    DECISION_DISCOVERY_APPLIES_INSTRUCTIONS,
    DECISION_DISCOVERY_APPLIES_QUESTION,
    DECISION_DISCOVERY_HOST_AGENTS_KEY,
    DECISION_DISCOVERY_MAX_OPTIONS,
    DECISION_DISCOVERY_MAX_RECORDED_IDS,
    DECISION_DISCOVERY_MIN_CONFIDENCE,
    DECISION_DISCOVERY_TIMEOUT_MS,
    DecisionDiscoveryFromResult,
    DecisionDiscoveryOption,
    DecisionDiscoveryOptions,
    DecisionOptionLimit,
    FailedDecisionDiscovery,
    HostAllowedAgentIDs,
    IsDecisionDiscoveryOn,
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

describe('the named constants', () => {
    it('start where the brief puts them', () => {
        expect(DECISION_DISCOVERY_MAX_OPTIONS).toBe(25);
        expect(DECISION_DISCOVERY_MIN_CONFIDENCE).toBe(0.7);
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
        expect(DECISION_DISCOVERY_APPLIES_INSTRUCTIONS).toBe(
            'This request asks for work that a specialist agent should do, rather than something the conversation manager should answer directly or plan as a multi-agent workflow.'
        );
        expect(DECISION_DISCOVERY_APPLIES_INSTRUCTIONS).not.toMatch(/these agents/i);
    });
});

describe('JudgeDecisionDiscovery', () => {
    it('is confident when both answers reach the threshold, and reports the answer by name', () => {
        const verdict = JudgeDecisionDiscovery(answers(BILLING.ID, 0.84, 0.9), OPTIONS);

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
        expect(JudgeDecisionDiscovery(answers(BILLING.ID, 0.7, 0.7), OPTIONS).Confident).toBe(true);
    });

    it.each([
        ['a low Choice confidence', 0.69, 0.95, 'agent confidence 0.69'],
        ['a low Likelihood', 0.95, 0.4, 'any agent applies, 0.40'],
    ])('is not confident with %s, and says why', (_label, confidence, applies, reason) => {
        const verdict = JudgeDecisionDiscovery(answers(BILLING.ID, confidence, applies), OPTIONS);

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

describe('DecisionDiscoveryFromResult', () => {
    function result(success: boolean, given: Record<string, DecisionAnswer>, errorMessage?: string): AIDecisionRunResult {
        return { success, errorMessage, Answers: given };
    }

    it('injects the suggestion for a confident answer', () => {
        const outcome = DecisionDiscoveryFromResult(result(true, answers(BILLING.ID, 0.84, 0.9)), OPTIONS);

        expect(outcome).toMatchObject({ Injected: true, Succeeded: true, Message: SuggestedAgentMessage(BILLING, 0.84) });
        expect(outcome.Answer?.Agent).toEqual(BILLING);
    });

    it('injects nothing, as a success, for an unsure answer', () => {
        const outcome = DecisionDiscoveryFromResult(result(true, answers(BILLING.ID, 0.5, 0.9)), OPTIONS);

        expect(outcome).toMatchObject({ Injected: false, Succeeded: true });
        expect(outcome.Message).toBeUndefined();
        expect(outcome.Reason).toContain('below 0.7');
    });

    it('fails for a failed call or an unusable answer', () => {
        expect(DecisionDiscoveryFromResult(result(false, {}, 'No decision model'), OPTIONS)).toMatchObject({ Injected: false, Succeeded: false, Reason: 'No decision model' });
        expect(DecisionDiscoveryFromResult(result(true, {}), OPTIONS)).toMatchObject({ Injected: false, Succeeded: false });
    });

    it('uses the threshold it is given', () => {
        expect(DecisionDiscoveryFromResult(result(true, answers(BILLING.ID, 0.5, 0.5)), OPTIONS, 0.5).Injected).toBe(true);
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
