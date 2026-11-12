import { describe, it, expect, afterEach, vi } from 'vitest';
import type { DecisionAnswer, DecisionCalibrationEntry } from '@memberjunction/ai';
import type { DecisionAnsweringModel } from '@memberjunction/ai-core-plus';
import { ServeDecisionCalibrations } from './helpers/shipped-decision-calibrations';
import {
    BuildContradictionDecision,
    BuildExampleDedupeDecision,
    BuildNoteDedupeDecision,
    CompareContradictionDecision,
    CompareDedupeDecision,
    ContradictionVerdictFromDecision,
    DedupeVerdictFromDecision,
    MEMORY_CONTRADICTION_USE,
    MEMORY_CONTRADICTS_QUESTION,
    MEMORY_DECISION_BANDS,
    MEMORY_DECISION_DEFAULT_MODE,
    MEMORY_DECISION_MAX_TEXT_CHARS,
    MEMORY_DUPLICATE_QUESTION,
    MEMORY_EXAMPLE_DEDUPE_CALIBRATION_KEY,
    MEMORY_NOTE_DEDUPE_CALIBRATION_KEY,
    MEMORY_NOTE_DEDUPE_USE,
    PickContradictionAuthority,
    ReadMemoryDecision,
    type MemoryContradictionNote
} from '../memory-decision-uses';

const JEV: DecisionAnsweringModel = { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' };

/** An identity fit (calibrated = raw) for the given use and question, on Jev at its pinned version. */
function identitySource(...keys: Array<{ Use: string; Question: string }>): (name: string) => readonly DecisionCalibrationEntry[] {
    const entries: DecisionCalibrationEntry[] = keys.map(k => ({ ...k, ResolvedModel: JEV.ResolvedModel ?? '', A: 1, B: 0 }));
    return (name: string) => (name === 'Jev' ? entries : []);
}

const NO_CALIBRATIONS = (): readonly DecisionCalibrationEntry[] => [];

afterEach(() => vi.restoreAllMocks());

function likelihood(key: string, probability: number): Record<string, DecisionAnswer> {
    return { [key]: { Kind: 'Likelihood', Probability: probability } };
}

function note(id: string, overrides: Partial<MemoryContradictionNote> = {}): MemoryContradictionNote {
    return { ID: id, Type: 'Preference', Note: `note ${id}`, CreatedAt: new Date('2026-10-01T00:00:00Z'), ImportanceScore: 5, AccessCount: 3, ...overrides };
}

describe('memory decision uses', () => {
    it('defaults to Shadow, so the prompt stays the authority until a fit ships', () => {
        expect(MEMORY_DECISION_DEFAULT_MODE).toBe('Shadow');
    });

    describe('building the decisions', () => {
        it('asks one duplicate Likelihood about the candidate note against its similar notes, capping text', () => {
            const long = 'x'.repeat(MEMORY_DECISION_MAX_TEXT_CHARS + 50);
            const request = BuildNoteDedupeDecision({ type: 'Preference', content: long }, [{ type: 'Preference', content: 'Prefers dark mode', similarity: 0.9123 }]);

            expect(Object.keys(request.Questions)).toEqual([MEMORY_DUPLICATE_QUESTION]);
            expect(request.Questions[MEMORY_DUPLICATE_QUESTION].Kind).toBe('Likelihood');
            const state = request.State as { candidateNote: { content: string }; existingNotes: Array<{ similarity: number }> };
            expect(state.candidateNote.content).toHaveLength(MEMORY_DECISION_MAX_TEXT_CHARS);
            expect(state.existingNotes[0].similarity).toBe(0.91);
        });

        it('asks one duplicate Likelihood about the candidate example', () => {
            const request = BuildExampleDedupeDecision({ exampleInput: 'in', exampleOutput: 'out', successScore: 90 },
                [{ input: 'a', output: 'b', successScore: null, similarity: 0.8 }]);

            expect(Object.keys(request.Questions)).toEqual([MEMORY_DUPLICATE_QUESTION]);
            expect(request.State).toEqual({
                candidateExample: { input: 'in', output: 'out', successScore: 90 },
                existingExamples: [{ input: 'a', output: 'b', successScore: null, similarity: 0.8 }]
            });
        });

        it('asks only whether two notes contradict, not which wins', () => {
            const request = BuildContradictionDecision(note('A'), note('B'));
            expect(Object.keys(request.Questions)).toEqual([MEMORY_CONTRADICTS_QUESTION]);
            expect(Object.keys(request.State)).toEqual(['noteA', 'noteB']);
        });
    });

    describe('ReadMemoryDecision', () => {
        const source = identitySource(MEMORY_NOTE_DEDUPE_CALIBRATION_KEY);

        it.each([
            [0.9, 'Yes'],
            [MEMORY_DECISION_BANDS.Yes, 'Yes'],
            [0.5, 'Unsure'],
            [MEMORY_DECISION_BANDS.No - 0.01, 'No'],
            [0.1, 'No']
        ])('reads calibrated %s as %s', (probability, band) => {
            ServeDecisionCalibrations(source);
            const reading = ReadMemoryDecision(likelihood('duplicate', probability).duplicate, MEMORY_NOTE_DEDUPE_CALIBRATION_KEY, JEV);
            expect(reading.Band).toBe(band);
            expect(reading.CalibratedProbability).toBeCloseTo(probability, 6);
        });

        it('is unsure without a calibration for the answering model, keeping the raw probability', () => {
            ServeDecisionCalibrations(NO_CALIBRATIONS);
            const reading = ReadMemoryDecision(likelihood('duplicate', 0.99).duplicate, MEMORY_NOTE_DEDUPE_CALIBRATION_KEY, JEV);
            expect(reading).toMatchObject({ Band: 'Unsure', RawProbability: 0.99 });
            expect(reading.CalibratedProbability).toBeUndefined();
        });

        it('is unsure when a calibration exists only for another version of the model', () => {
            ServeDecisionCalibrations(source);
            const reading = ReadMemoryDecision(likelihood('duplicate', 0.99).duplicate, MEMORY_NOTE_DEDUPE_CALIBRATION_KEY,
                { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-2.0' });
            expect(reading.Band).toBe('Unsure');
        });

        it('is unsure on a missing or non-Likelihood answer', () => {
            ServeDecisionCalibrations(source);
            expect(ReadMemoryDecision(undefined, MEMORY_NOTE_DEDUPE_CALIBRATION_KEY, JEV).Band).toBe('Unsure');
            const choice: DecisionAnswer = { Kind: 'Choice', Value: 'x', Probabilities: { x: 1 }, Confidence: 1 };
            expect(ReadMemoryDecision(choice, MEMORY_NOTE_DEDUPE_CALIBRATION_KEY, JEV).Band).toBe('Unsure');
        });
    });

    describe('DedupeVerdictFromDecision', () => {
        const source = identitySource(MEMORY_NOTE_DEDUPE_CALIBRATION_KEY);

        it('rejects a confident duplicate and adds a confident non-duplicate', () => {
            ServeDecisionCalibrations(source);
            expect(DedupeVerdictFromDecision(likelihood('duplicate', 0.95), MEMORY_NOTE_DEDUPE_CALIBRATION_KEY, JEV)?.shouldAdd).toBe(false);
            expect(DedupeVerdictFromDecision(likelihood('duplicate', 0.05), MEMORY_NOTE_DEDUPE_CALIBRATION_KEY, JEV)?.shouldAdd).toBe(true);
        });

        it('returns null when unsure, so the prompt answers', () => {
            ServeDecisionCalibrations(source);
            expect(DedupeVerdictFromDecision(likelihood('duplicate', 0.5), MEMORY_NOTE_DEDUPE_CALIBRATION_KEY, JEV)).toBeNull();
        });

        it('never reads one use through another use\'s fit', () => {
            ServeDecisionCalibrations(source);
            expect(DedupeVerdictFromDecision(likelihood('duplicate', 0.95), MEMORY_EXAMPLE_DEDUPE_CALIBRATION_KEY, JEV)).toBeNull();
        });
    });

    describe('PickContradictionAuthority', () => {
        it('keeps the note more than seven days newer, whichever side it is on', () => {
            const older = note('A', { CreatedAt: '2026-10-01T00:00:00Z', ImportanceScore: 9 });
            const newer = note('B', { CreatedAt: '2026-10-09T00:00:01Z', ImportanceScore: 1 });
            expect(PickContradictionAuthority(older, newer)).toMatchObject({ Keep: { ID: 'B' }, Revoke: { ID: 'A' } });
            expect(PickContradictionAuthority(newer, older)).toMatchObject({ Keep: { ID: 'B' }, Revoke: { ID: 'A' } });
        });

        it('falls back to importance within seven days, then to access count', () => {
            expect(PickContradictionAuthority(note('A', { ImportanceScore: 8 }), note('B', { ImportanceScore: 6 }))).toMatchObject({ Keep: { ID: 'A' } });
            expect(PickContradictionAuthority(note('A', { AccessCount: 1 }), note('B', { AccessCount: 4 }))).toMatchObject({ Keep: { ID: 'B' } });
            expect(PickContradictionAuthority(note('A', { ImportanceScore: null, AccessCount: 2 }), note('B', { ImportanceScore: 7, AccessCount: 1 })))
                .toMatchObject({ Keep: { ID: 'A' } });
        });

        it('ties when every signal is equal, which keeps both', () => {
            expect(PickContradictionAuthority(note('A'), note('B'))).toBeNull();
        });
    });

    describe('ContradictionVerdictFromDecision', () => {
        const source = identitySource({ Use: MEMORY_CONTRADICTION_USE, Question: MEMORY_CONTRADICTS_QUESTION });

        it('revokes the older note on a confident contradiction', () => {
            ServeDecisionCalibrations(source);
            const verdict = ContradictionVerdictFromDecision(likelihood('contradicts', 0.9),
                note('A', { CreatedAt: '2026-09-01T00:00:00Z' }), note('B', { CreatedAt: '2026-10-01T00:00:00Z' }), JEV);
            expect(verdict).toMatchObject({ isContradiction: true, keepNoteId: 'B', revokeNoteId: 'A', triplesExtracted: 0 });
        });

        it('finds no contradiction on a confident no, or on a tie', () => {
            ServeDecisionCalibrations(source);
            expect(ContradictionVerdictFromDecision(likelihood('contradicts', 0.1), note('A'), note('B'), JEV)?.isContradiction).toBe(false);
            expect(ContradictionVerdictFromDecision(likelihood('contradicts', 0.9), note('A'), note('B'), JEV)?.isContradiction).toBe(false);
        });

        it('returns null when unsure or uncalibrated', () => {
            ServeDecisionCalibrations(source);
            expect(ContradictionVerdictFromDecision(likelihood('contradicts', 0.5), note('A'), note('B'), JEV)).toBeNull();
            ServeDecisionCalibrations(NO_CALIBRATIONS);
            expect(ContradictionVerdictFromDecision(likelihood('contradicts', 0.9), note('A'), note('B'), JEV)).toBeNull();
        });
    });

    describe('shadow comparisons', () => {
        it('labels a dedupe run with the prompt\'s verdict and compares the raw answer at 0.5 when uncalibrated', () => {
            ServeDecisionCalibrations(NO_CALIBRATIONS);
            const comparison = CompareDedupeDecision(likelihood('duplicate', 0.8), { shouldAdd: false, reason: 'dup' },
                MEMORY_NOTE_DEDUPE_CALIBRATION_KEY, JEV);
            expect(comparison.Agreed).toBe(true);
            expect(comparison.Details).toMatchObject({ Question: 'duplicate', Label: true, RawProbability: 0.8, CalibratedProbability: null, Band: 'Unsure' });
        });

        it('disagrees when the calibrated decision is unsure', () => {
            ServeDecisionCalibrations(identitySource(MEMORY_NOTE_DEDUPE_CALIBRATION_KEY));
            const comparison = CompareDedupeDecision(likelihood('duplicate', 0.5), { shouldAdd: true, reason: '' },
                MEMORY_NOTE_DEDUPE_CALIBRATION_KEY, JEV);
            expect(comparison.Agreed).toBe(false);
            expect(comparison.Summary).toContain('decision unsure');
        });

        it('compares a contradiction decision with the prompt, and records nothing to compare when the prompt failed', () => {
            ServeDecisionCalibrations(NO_CALIBRATIONS);
            expect(CompareContradictionDecision(likelihood('contradicts', 0.2), { isContradiction: false, reason: '', triplesExtracted: 2 }, JEV).Agreed).toBe(true);
            expect(CompareContradictionDecision(likelihood('contradicts', 0.2), null, JEV).Agreed).toBe(false);
        });

        it('names its uses distinctly', () => {
            expect(new Set([MEMORY_NOTE_DEDUPE_USE, MEMORY_EXAMPLE_DEDUPE_CALIBRATION_KEY.Use, MEMORY_CONTRADICTION_USE]).size).toBe(3);
        });
    });
});
