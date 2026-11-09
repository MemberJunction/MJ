/**
 * memory-guards-phase-p.test.ts — MG1/MG2 phase P checks the instructed memory TYPES, not just the count.
 *
 * Phase P used to pass on "at least N writes", so a model that emitted ten writes of the wrong type
 * passed it and fell through to phase-A assertions that could never hold, reading as a product
 * failure ("the allowed 'Preference' write did not land"). The predicate now requires the types the
 * check instructed, so that run is reported as `model-noncompliance:` instead.
 */
import { describe, it, expect } from 'vitest';
import {
    MemoryWriteTypeMismatch,
    ParseMemoryWriteStep,
    MG1_TYPE_RULES,
    MG2_TYPE_RULES,
} from '../checks/agent-memory-guards.checks';

describe('MemoryWriteTypeMismatch — MG1 rules (exactly 1 Constraint, at least 1 Preference)', () => {
    it('accepts the instructed pair', () => {
        expect(MemoryWriteTypeMismatch(['Constraint', 'Preference'], MG1_TYPE_RULES)).toBeUndefined();
    });

    it('rejects ten writes of the wrong type, the run that used to pass on count alone', () => {
        const message = MemoryWriteTypeMismatch(Array<string>(10).fill('constraint'), MG1_TYPE_RULES);
        expect(message).toContain("exactly 1 'Constraint' (got 0)");
        expect(message).toContain("at least 1 'Preference' (got 0)");
    });

    it('rejects a second Constraint', () => {
        expect(MemoryWriteTypeMismatch(['Constraint', 'Constraint', 'Preference'], MG1_TYPE_RULES))
            .toContain("exactly 1 'Constraint' (got 2)");
    });

    it('rejects a missing Preference and counts a write with no type as none', () => {
        const message = MemoryWriteTypeMismatch(['Constraint', undefined], MG1_TYPE_RULES);
        expect(message).toContain("at least 1 'Preference' (got 0)");
        expect(message).toContain('(none)');
    });

    it('compares types case-sensitively, as the in-flight type guard does', () => {
        expect(MemoryWriteTypeMismatch(['Constraint', 'preference'], MG1_TYPE_RULES)).toBeDefined();
    });
});

describe('MemoryWriteTypeMismatch — MG2 rules (at least 7 Preference)', () => {
    it('accepts nine Preference writes', () => {
        expect(MemoryWriteTypeMismatch(Array<string>(9).fill('Preference'), MG2_TYPE_RULES)).toBeUndefined();
    });

    it('rejects six Preference writes plus other types', () => {
        expect(MemoryWriteTypeMismatch([...Array<string>(6).fill('Preference'), 'Context', 'Constraint'], MG2_TYPE_RULES))
            .toContain("at least 7 'Preference' (got 6)");
    });
});

describe('ParseMemoryWriteStep', () => {
    it('reads the requested type from InputData and the disposition from OutputData', () => {
        const attempt = ParseMemoryWriteStep({
            ID: 'step-1',
            InputData: JSON.stringify({ note: 'n', type: 'Preference', scopeHint: 'user', context: { depth: 0 } }),
            OutputData: JSON.stringify({ disposition: 'written', noteId: 'note-1' }),
        });
        expect(attempt).toMatchObject({ type: 'Preference', disposition: 'written', noteId: 'note-1' });
    });

    it('leaves type undefined when the model emitted none', () => {
        expect(ParseMemoryWriteStep({ ID: 'step-1', InputData: '{"note":"n"}', OutputData: null }).type).toBeUndefined();
    });

    it('throws naming the step when InputData is missing or unreadable — a harness fault, not model variance', () => {
        expect(() => ParseMemoryWriteStep({ ID: 'step-9', InputData: null, OutputData: null })).toThrow(/step-9/);
        expect(() => ParseMemoryWriteStep({ ID: 'step-9', InputData: '{', OutputData: null })).toThrow(/step-9/);
    });
});
