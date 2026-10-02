/**
 * @fileoverview Unit tests for how the measurement rig reads each arm's model call.
 *
 * The decision reading is checked against production's own provider: a candidate the decision
 * gave no answer for is flagged, as `DecisionReasoningProvider.BandCandidate` bands it, and a
 * failed decision flags nothing, as the entry check does. No model or DB calls.
 */

import { describe, expect, it } from 'vitest';
import { DecisionReasoningProvider } from '@memberjunction/ai-vector-dupe';
import type { DuplicateDecisionResult } from '@memberjunction/ai-vector-dupe';
import {
    ReadDecisionArm,
    ReadPromptArm,
    RecordTextsOf,
    WITHHELD_ERROR_MESSAGE,
} from '../../dupe-check-measurement/arm-readings';

const SOURCE_ID = 'AAAAAAAA-1111-2222-3333-444444444444';
const OTHER_ID = 'BBBBBBBB-1111-2222-3333-444444444444';
const UNANSWERED_ID = 'CCCCCCCC-1111-2222-3333-444444444444';

describe('ReadDecisionArm', () => {
    const provider = new DecisionReasoningProvider(0.5);

    it('flags what production flags: at or above the band, and every candidate the decision gave no answer for', () => {
        const decision: DuplicateDecisionResult = {
            Success: true,
            AIPromptRunID: 'run-1',
            Candidates: [
                { RecordID: SOURCE_ID, Probability: 0.9, RawProbability: 0.95 },
                // Raw runs high; calibrated, it falls below the band
                { RecordID: OTHER_ID, Probability: 0.1, RawProbability: 0.8 },
                { RecordID: UNANSWERED_ID, Probability: null, RawProbability: null },
            ],
        };

        const reading = ReadDecisionArm(decision, provider);

        expect(reading.Success).toBe(true);
        expect(reading.MissingAnswers).toBe(1);
        // Keys are normalized, so a lower-case id finds the candidate.
        expect(reading.Flagged.get(SOURCE_ID.toLowerCase())).toBe(true);
        expect(reading.Flagged.get(OTHER_ID.toLowerCase())).toBe(false);
        expect(reading.Flagged.get(UNANSWERED_ID.toLowerCase())).toBe(true);
        // The raw probability is recorded, for the calibration section to fit on.
        expect(reading.Probabilities.get(OTHER_ID.toLowerCase())).toBe(0.8);
        expect(reading.Probabilities.get(UNANSWERED_ID.toLowerCase())).toBeNull();
        // The unanswered candidate is flagged because production's band flags it.
        expect(provider.BandCandidate({ RecordID: UNANSWERED_ID, Probability: null }).Recommendation).toBe('Uncertain');
    });

    it('flags nothing for a model with no calibration, as the entry check does, and keeps its raw answers', () => {
        const decision: DuplicateDecisionResult = {
            Success: true,
            AIPromptRunID: 'run-2',
            UncalibratedModel: 'Some New Decision Model',
            Candidates: [
                { RecordID: SOURCE_ID, Probability: null, RawProbability: 0.97 },
                { RecordID: OTHER_ID, Probability: null, RawProbability: 0.01 },
            ],
        };

        const reading = ReadDecisionArm(decision, provider);

        expect(reading.Success).toBe(true);
        expect(reading.UncalibratedModel).toBe('Some New Decision Model');
        // The provider's band alone would flag both (no calibrated probability fails toward inclusion).
        expect(provider.BandCandidate(decision.Candidates[0]).Recommendation).toBe('Uncertain');
        expect([...reading.Flagged.values()]).toEqual([false, false]);
        expect(reading.Probabilities.get(SOURCE_ID.toLowerCase())).toBe(0.97);
        expect(reading.MissingAnswers).toBe(0);
    });

    it('flags nothing when the decision failed, and keeps the reason', () => {
        const decision: DuplicateDecisionResult = {
            Success: false,
            ErrorMessage: 'Decision execution failed: rate limited',
            AIPromptRunID: null,
            Candidates: [],
        };

        const reading = ReadDecisionArm(decision, provider);

        expect(reading.Success).toBe(false);
        expect(reading.ErrorMessage).toBe('Decision execution failed: rate limited');
        expect(reading.Flagged.size).toBe(0);
        expect(reading.Probabilities.size).toBe(0);
        expect(reading.MissingAnswers).toBe(0);
    });

    it('withholds an error message that quotes record text', () => {
        const decision: DuplicateDecisionResult = {
            Success: false,
            ErrorMessage: 'Could not parse the answer about "Send Quarterly Invoice Reminder"',
            AIPromptRunID: null,
            Candidates: [],
        };

        const reading = ReadDecisionArm(decision, provider, ['Send Quarterly Invoice Reminder']);

        expect(reading.ErrorMessage).toBe(WITHHELD_ERROR_MESSAGE);
    });
});

describe('ReadPromptArm', () => {
    it('counts each asked candidate the prompt gave no verdict for', () => {
        const reading = ReadPromptArm(
            {
                Success: true,
                CandidateVerdicts: [
                    { RecordID: SOURCE_ID.toLowerCase(), Recommendation: 'Merge', Confidence: 0.9, Reasoning: 'same' },
                ],
            },
            [SOURCE_ID, OTHER_ID]
        );

        expect(reading.Success).toBe(true);
        expect(reading.MissingAnswers).toBe(1);
        expect(reading.Recommendations.get(SOURCE_ID.toLowerCase())).toBe('Merge');
        expect(reading.Recommendations.has(OTHER_ID.toLowerCase())).toBe(false);
    });

    it('records a failed call with no verdicts', () => {
        const reading = ReadPromptArm(
            { Success: false, ErrorMessage: 'Prompt execution failed', CandidateVerdicts: [] },
            [SOURCE_ID]
        );

        expect(reading.Success).toBe(false);
        expect(reading.ErrorMessage).toBe('Prompt execution failed');
        expect(reading.Recommendations.size).toBe(0);
    });
});

describe('RecordTextsOf', () => {
    it('collects the entered values and the reasoning input\'s labels and field values', () => {
        const texts = RecordTextsOf(
            { Name: 'Send Quarterly Invoice Reminder' },
            {
                SourceRecord: { RecordID: 'new', Label: 'Send Quarterly Invoice Reminder', Provenance: 'Local', DependentCount: 0 },
                Candidates: [{ RecordID: SOURCE_ID, Label: 'Send Invoice Reminder', VectorScore: 0.9, Provenance: 'Local', DependentCount: 2 }],
                FieldDeltas: [{ FieldName: 'Description', Values: [{ RecordID: SOURCE_ID, Value: 'Emails a reminder' }, { RecordID: 'new', Value: null }] }],
            }
        );

        expect(texts).toEqual(expect.arrayContaining(['Send Quarterly Invoice Reminder', 'Send Invoice Reminder', 'Emails a reminder']));
        expect(texts).not.toContain(null);
    });
});
