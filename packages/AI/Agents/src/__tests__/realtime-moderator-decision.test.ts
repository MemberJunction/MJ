import { describe, it, expect } from 'vitest';
import type { DecisionAnswer, DecisionCalibrationEntry } from '@memberjunction/ai';
import type { DecisionAnsweringModel, DecisionCalibrationSource } from '@memberjunction/ai-core-plus';
import {
    BuildModeratorQuestions,
    CompareModeratorDecision,
    ModeratorQuestionKey,
    ModeratorSpeakersFromDecision,
    REALTIME_MODERATOR_CALIBRATION_KEY,
    REALTIME_MODERATOR_MIN_PROBABILITY,
    type ModeratorDecisionAgent
} from '../realtime/realtime-moderator-decision';

const JEV: DecisionAnsweringModel = { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' };

const IDENTITY: DecisionCalibrationSource = {
    GetDecisionCalibrations: (name: string): readonly DecisionCalibrationEntry[] =>
        name === 'Jev' ? [{ ...REALTIME_MODERATOR_CALIBRATION_KEY, ResolvedModel: JEV.ResolvedModel ?? '', A: 1, B: 0 }] : []
};
const NONE: DecisionCalibrationSource = { GetDecisionCalibrations: () => [] };

const ROSTER: ModeratorDecisionAgent[] = [
    { name: 'Sage', aliases: ['the assistant'], role: 'Answers general questions', mode: 'proactive' },
    { name: 'Skip', role: 'Analyzes data', mode: 'proactive' },
    { name: 'Scribe', mode: 'addressed-only' }
];

function answers(...probabilities: number[]): Record<string, DecisionAnswer> {
    const out: Record<string, DecisionAnswer> = {};
    probabilities.forEach((p, i) => { out[ModeratorQuestionKey(i)] = { Kind: 'Likelihood', Probability: p }; });
    return out;
}

describe('realtime moderator decision', () => {
    it('asks one Likelihood per agent, naming the agent, its role, and an addressed-only rule', () => {
        const questions = BuildModeratorQuestions(ROSTER);

        expect(Object.keys(questions)).toEqual(['a1', 'a2', 'a3']);
        expect(questions.a1.Instructions).toContain('Sage (Answers general questions)');
        expect(questions.a2.Instructions).toContain('Skip (Analyzes data)');
        expect(questions.a3.Instructions).toContain('only when the latest turn addresses it');
        expect(questions.a1.Instructions).not.toContain('only when the latest turn addresses it');
    });

    it('picks the agents at or over the threshold, most likely first, roster order breaking ties', () => {
        expect(ModeratorSpeakersFromDecision(answers(0.7, 0.9, 0.2), ROSTER, JEV, IDENTITY)).toEqual(['Skip', 'Sage']);
        expect(ModeratorSpeakersFromDecision(answers(0.8, 0.8, REALTIME_MODERATOR_MIN_PROBABILITY), ROSTER, JEV, IDENTITY))
            .toEqual(['Sage', 'Skip', 'Scribe']);
    });

    it('lets nobody speak when no agent clears the threshold', () => {
        expect(ModeratorSpeakersFromDecision(answers(0.1, 0.2, 0.3), ROSTER, JEV, IDENTITY)).toEqual([]);
    });

    it('cannot pick without a calibration for the answering model, or with an answer missing', () => {
        expect(ModeratorSpeakersFromDecision(answers(0.9, 0.9, 0.9), ROSTER, JEV, NONE)).toBeNull();
        expect(ModeratorSpeakersFromDecision(answers(0.9, 0.9), ROSTER, JEV, IDENTITY)).toBeNull();
    });

    it('agrees on the same set of speakers whatever their order, and labels each agent for a fit', () => {
        const comparison = CompareModeratorDecision(answers(0.7, 0.9, 0.2), ['Sage', 'skip'], ROSTER, JEV, IDENTITY);

        expect(comparison.Agreed).toBe(true);
        expect(comparison.Details?.Agents).toEqual([
            { Key: 'a1', Name: 'Sage', Label: true, RawProbability: 0.7 },
            { Key: 'a2', Name: 'Skip', Label: true, RawProbability: 0.9 },
            { Key: 'a3', Name: 'Scribe', Label: false, RawProbability: 0.2 }
        ]);
    });

    it('labels an agent the prompt named by an alias', () => {
        const comparison = CompareModeratorDecision(answers(0.9, 0.1, 0.1), ['the assistant'], ROSTER, JEV, NONE);
        const agents = comparison.Details?.Agents as Array<{ Name: string; Label: boolean }>;
        expect(agents.find(a => a.Name === 'Sage')?.Label).toBe(true);
    });

    it('compares uncalibrated answers at 0.5 and says so', () => {
        const comparison = CompareModeratorDecision(answers(0.6, 0.4, 0.1), ['Skip'], ROSTER, JEV, NONE);
        expect(comparison.Agreed).toBe(false);
        expect(comparison.Summary).toContain('uncalibrated');
        expect(comparison.Details?.Calibrated).toBe(false);
    });
});
