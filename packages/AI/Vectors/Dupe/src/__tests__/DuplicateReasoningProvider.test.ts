import { describe, it, expect, vi } from 'vitest';

// The base provider only imports LogError from @memberjunction/core at runtime; the rest
// of its core imports (UserInfo, IMetadataProvider) and the core-entities import are type-only.
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
}));
vi.mock('@memberjunction/core-entities', () => ({
    MJEntityDocumentEntity: class {},
}));

import { DuplicateReasoningProvider } from '../reasoning/DuplicateReasoningProvider';
import {
    DuplicateReasoningInput,
    DuplicateReasoningOutput,
    DuplicateReasoningContext,
} from '../reasoning/DuplicateReasoningTypes';

/**
 * Minimal concrete subclass that exposes the protected parse/build helpers so we can test
 * the shared contract logic both providers depend on. `Reason` is never called here.
 */
class TestableProvider extends DuplicateReasoningProvider {
    public async Reason(
        _input: DuplicateReasoningInput,
        _context: DuplicateReasoningContext
    ): Promise<DuplicateReasoningOutput> {
        throw new Error('not used in these tests');
    }
    public parse(raw: unknown): DuplicateReasoningOutput {
        return this.parseRawOutput(raw);
    }
    public build(input: DuplicateReasoningInput): Record<string, unknown> {
        return this.buildPromptData(input);
    }
}

describe('DuplicateReasoningProvider.parseRawOutput', () => {
    const p = new TestableProvider();

    it('parses a well-formed object verdict', () => {
        const out = p.parse({
            recommendation: 'Merge',
            confidence: 0.92,
            reasoning: 'Same company, different casing',
            survivorRecordId: 'ID|a',
            fieldChoices: [{ fieldName: 'Email', sourceRecordId: 'ID|b' }],
        });
        expect(out.Success).toBe(true);
        expect(out.Recommendation).toBe('Merge');
        expect(out.Confidence).toBe(0.92);
        expect(out.Reasoning).toBe('Same company, different casing');
        expect(out.SurvivorRecordID).toBe('ID|a');
        expect(out.FieldChoices).toEqual([{ FieldName: 'Email', SourceRecordID: 'ID|b' }]);
    });

    it('parses a JSON-string verdict', () => {
        const out = p.parse(JSON.stringify({ recommendation: 'NotDuplicate', confidence: 0.1 }));
        expect(out.Success).toBe(true);
        expect(out.Recommendation).toBe('NotDuplicate');
        expect(out.Confidence).toBe(0.1);
    });

    it('returns a failed output for non-JSON garbage', () => {
        const out = p.parse('not json at all {');
        expect(out.Success).toBe(false);
        expect(out.Recommendation).toBe('Uncertain');
        expect(out.Confidence).toBeNull(); // absent confidence is null, not a misleading 0
    });

    it('returns a failed output for null/number input', () => {
        expect(p.parse(null).Success).toBe(false);
        expect(p.parse(42).Success).toBe(false);
    });

    it('defaults an unknown recommendation to Uncertain', () => {
        const out = p.parse({ recommendation: 'Maybe', confidence: 0.5 });
        expect(out.Recommendation).toBe('Uncertain');
    });

    it('clamps a real confidence into [0,1] and returns null when absent/non-numeric', () => {
        expect(p.parse({ confidence: 5 }).Confidence).toBe(1);
        expect(p.parse({ confidence: -3 }).Confidence).toBe(0);   // -3 is a real number → clamps to 0
        expect(p.parse({ confidence: 'abc' }).Confidence).toBeNull(); // non-numeric → unknown, not 0
        expect(p.parse({}).Confidence).toBeNull();                 // absent → unknown, not 0
        expect(p.parse({ confidence: '0.4' }).Confidence).toBe(0.4);
    });

    it('normalizes the survivor: trims, drops empty', () => {
        expect(p.parse({ survivorRecordId: '  ID|x  ' }).SurvivorRecordID).toBe('ID|x');
        expect(p.parse({ survivorRecordId: '' }).SurvivorRecordID).toBeNull();
        expect(p.parse({ survivorRecordId: 123 }).SurvivorRecordID).toBeNull();
    });

    it('drops malformed fieldChoices entries', () => {
        const out = p.parse({
            fieldChoices: [
                { fieldName: 'Good', sourceRecordId: 'ID|a' },
                { fieldName: 'NoSource' },
                { sourceRecordId: 'ID|b' },
                'garbage',
                42,
            ],
        });
        expect(out.FieldChoices).toEqual([{ FieldName: 'Good', SourceRecordID: 'ID|a' }]);
    });

    it('returns [] fieldChoices when not an array', () => {
        expect(p.parse({ fieldChoices: 'nope' }).FieldChoices).toEqual([]);
    });
});

describe('DuplicateReasoningProvider.parseRawOutput — per-candidate verdicts', () => {
    const p = new TestableProvider();

    it('parses per-candidate verdicts and preserves each independent verdict', () => {
        const out = p.parse({
            candidateVerdicts: [
                { recordId: 'ID|maria', recommendation: 'Merge', confidence: 0.95, reasoning: 'Same person' },
                { recordId: 'ID|susan', recommendation: 'NotDuplicate', confidence: 0.9, reasoning: 'Different person' },
            ],
            survivorRecordId: 'ID|maria',
            reasoning: 'One true dup, one false positive',
        });
        expect(out.CandidateVerdicts).toHaveLength(2);
        const susan = out.CandidateVerdicts.find(v => v.RecordID === 'ID|susan')!;
        expect(susan.Recommendation).toBe('NotDuplicate'); // not contaminated by the Merge candidate
        expect(susan.Reasoning).toBe('Different person');
    });

    it('derives overall Merge when ANY candidate is a Merge (max merge confidence)', () => {
        const out = p.parse({
            candidateVerdicts: [
                { recordId: 'ID|a', recommendation: 'Merge', confidence: 0.95, reasoning: '' },
                { recordId: 'ID|b', recommendation: 'NotDuplicate', confidence: 0.99, reasoning: '' },
            ],
        });
        expect(out.Recommendation).toBe('Merge');
        expect(out.Confidence).toBe(0.95); // max among the winning (Merge) verdicts, not the 0.99 NotDuplicate
    });

    it('derives NotDuplicate only when every candidate is NotDuplicate', () => {
        const out = p.parse({
            candidateVerdicts: [
                { recordId: 'ID|a', recommendation: 'NotDuplicate', confidence: 0.8, reasoning: '' },
                { recordId: 'ID|b', recommendation: 'NotDuplicate', confidence: 0.7, reasoning: '' },
            ],
        });
        expect(out.Recommendation).toBe('NotDuplicate');
    });

    it('drops verdict entries with no recordId', () => {
        const out = p.parse({
            candidateVerdicts: [
                { recordId: 'ID|a', recommendation: 'Merge', confidence: 0.9, reasoning: '' },
                { recommendation: 'Merge', confidence: 0.9, reasoning: 'no id' },
                'garbage',
            ],
        });
        expect(out.CandidateVerdicts).toHaveLength(1);
        expect(out.CandidateVerdicts[0].RecordID).toBe('ID|a');
    });

    it('falls back to top-level recommendation when no per-candidate verdicts are returned', () => {
        const out = p.parse({ recommendation: 'Uncertain', confidence: 0.5 });
        expect(out.CandidateVerdicts).toEqual([]);
        expect(out.Recommendation).toBe('Uncertain');
        expect(out.Confidence).toBe(0.5);
    });
});

describe('DuplicateReasoningProvider.buildPromptData', () => {
    const p = new TestableProvider();

    function input(): DuplicateReasoningInput {
        return {
            EntityName: 'Accounts',
            EntityDescription: 'company records',
            EntityDocument: {} as never,
            SourceRecord: { RecordID: 'ID|a', Label: 'Acme', Provenance: 'Local', DependentCount: 3 },
            Candidates: [
                { RecordID: 'ID|b', Label: 'Acme Inc', VectorScore: 0.91, Provenance: 'Local', DependentCount: 1 },
            ],
            FieldDeltas: [
                { FieldName: 'Email', Values: [
                    { RecordID: 'ID|a', Value: 'a@x.com' },
                    { RecordID: 'ID|b', Value: 'b@x.com' },
                ] },
            ],
        };
    }

    it('maps to the seeded template variable names (camelCase)', () => {
        const data = p.build(input());
        expect(data['entityName']).toBe('Accounts');
        expect(data['entityDescription']).toBe('company records');
        expect((data['sourceRecord'] as Record<string, unknown>)['recordId']).toBe('ID|a');
        expect((data['candidates'] as unknown[])).toHaveLength(1);
        const delta = (data['fieldDeltas'] as Record<string, unknown>[])[0];
        expect(delta['fieldName']).toBe('Email');
        expect((delta['values'] as unknown[])).toHaveLength(2);
    });

    it('falls back to empty string for a null entity description', () => {
        const i = input();
        i.EntityDescription = null;
        expect(p.build(i)['entityDescription']).toBe('');
    });
});
