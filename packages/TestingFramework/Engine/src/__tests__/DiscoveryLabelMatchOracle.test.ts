/**
 * @fileoverview The `discovery-label-match` oracle: an `agent` label is right when its agent was
 * chosen; a `none` label is right when discovery would not inject; either arm; no answer fails.
 */
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJTestEntity } from '@memberjunction/core-entities';
import { DiscoveryLabelMatchOracle, ScoreDiscoveryRun } from '../oracles/DiscoveryLabelMatchOracle';
import { DiscoveryLabelMatchDetailsSchema, type DiscoveryEvalActualOutput, type DiscoveryEvalExpected } from '../decision-eval/discovery-types';
import type { OracleInput } from '../types';

const A = 'A0000000-0000-4000-8000-000000000001';
const B = 'A0000000-0000-4000-8000-000000000002';
const TEST = { Name: 'request [cell]' } satisfies Pick<MJTestEntity, 'Name'>;
const USER = { ID: 'user-1' } satisfies Pick<UserInfo, 'ID'>;
const AGENT_A: DiscoveryEvalExpected = { label: 'agent', agentId: A, labelSource: 'construction' };
const NONE_CHAT: DiscoveryEvalExpected = { label: 'none', kind: 'chat', labelSource: 'construction' };

/** A decision run's actual output; override anything. */
function decisionRun(overrides: Partial<DiscoveryEvalActualOutput> = {}): DiscoveryEvalActualOutput {
    return {
        Decision: 'agent-discovery',
        Arm: 'decision',
        PromptName: 'Default Decision',
        Options: { Count: 3, Limit: 25, CatalogSize: 3, WithoutDescription: 0, DeclaredCap: null, NarrowedFrom: null },
        LabelledAgentOffered: true,
        Answers: {},
        ChosenAgentId: A,
        ChosenAgentName: 'Agent A',
        Confidence: 0.9,
        AnyApplies: 0.8,
        WouldInject: true,
        MinConfidence: 0.7,
        VerdictReason: null,
        Baseline: null,
        Model: null,
        Sampling: { RequestedTemperature: null, RequestedSeed: null, Applied: false, Note: null },
        LatencyMs: 200,
        WithinProductionTimeout: true,
        PromptRunId: 'prun-1',
        CostUSD: 0.001,
        Error: null,
        ...overrides
    };
}

/** A baseline run's actual output whose first row is `topMatch`. */
function baselineRun(topMatch: string | null): DiscoveryEvalActualOutput {
    const candidate = topMatch ? { AgentId: topMatch, AgentName: null, Rank: 1, Score: 0.62, Semantic: 0.62, Lexical: null, PassesFloor: true } : null;
    return decisionRun({
        Arm: 'semantic-search', PromptName: null, Options: null, Confidence: null, AnyApplies: null, MinConfidence: null,
        ChosenAgentId: topMatch, WouldInject: topMatch !== null, PromptRunId: null, CostUSD: null, WithinProductionTimeout: null,
        Baseline: { Floor: 0.5, TopK: 15, Results: 4, TopRanked: candidate, TopMatch: candidate }
    });
}

async function evaluate(expected: unknown, actual: unknown) {
    const input: OracleInput = {
        test: TEST as MJTestEntity,
        expectedOutput: expected,
        actualOutput: actual,
        contextUser: USER as UserInfo
    };
    return new DiscoveryLabelMatchOracle().evaluate(input, {});
}

describe('DiscoveryLabelMatchOracle', () => {
    it('passes an agent label when its agent was chosen, whatever the confidence', async () => {
        const result = await evaluate(AGENT_A, decisionRun({ ChosenAgentId: A.toLowerCase(), Confidence: 0.3, WouldInject: false }));
        expect(result).toMatchObject({ oracleType: 'discovery-label-match', passed: true, score: 1 });
        expect(DiscoveryLabelMatchDetailsSchema.parse(result.details)).toMatchObject({ arm: 'decision', label: 'agent', correct: true, confidence: 0.3 });
    });

    it('fails an agent label when another agent was chosen', async () => {
        const result = await evaluate(AGENT_A, decisionRun({ ChosenAgentId: B }));
        expect(result).toMatchObject({ passed: false, score: 0 });
        expect(result.message).toContain('disagrees');
    });

    it('passes a none label only when discovery would not inject', async () => {
        expect((await evaluate(NONE_CHAT, decisionRun({ WouldInject: false }))).passed).toBe(true);
        const injected = await evaluate(NONE_CHAT, decisionRun({ WouldInject: true }));
        expect(injected.passed).toBe(false);
        expect(DiscoveryLabelMatchDetailsSchema.parse(injected.details)).toMatchObject({ label: 'none', kind: 'chat', wouldInject: true, correct: false });
    });

    it('scores the baseline by the action\'s first row, and a none label by nothing passing the floor', async () => {
        expect((await evaluate(AGENT_A, baselineRun(A))).passed).toBe(true);
        expect((await evaluate(AGENT_A, baselineRun(null))).passed).toBe(false);
        expect((await evaluate(NONE_CHAT, baselineRun(null))).passed).toBe(true);
        const listed = await evaluate(NONE_CHAT, baselineRun(B));
        expect(listed.passed).toBe(false);
        expect(DiscoveryLabelMatchDetailsSchema.parse(listed.details)).toMatchObject({ arm: 'semantic-search', topScore: 0.62 });
    });

    it('fails a run with no usable answer, with correct null', async () => {
        const result = await evaluate(AGENT_A, decisionRun({ ChosenAgentId: null, WouldInject: null, VerdictReason: "the 'agent' answer was missing" }));
        expect(result.passed).toBe(false);
        expect(result.message).toContain("the 'agent' answer was missing");
        expect(ScoreDiscoveryRun(AGENT_A, decisionRun({ ChosenAgentId: null, WouldInject: null })).correct).toBeNull();
    });

    it('fails, naming why, when the label or the output cannot be read', async () => {
        expect((await evaluate({ label: 'continue', labelSource: 'x' }, decisionRun())).message).toMatch(/^Expected outcome has no usable label/);
        expect((await evaluate(AGENT_A, { Answers: {} })).message).toMatch(/^Actual output is not a discovery run's/);
    });
});
