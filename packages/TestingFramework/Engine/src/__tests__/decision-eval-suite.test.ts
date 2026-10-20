/**
 * @fileoverview Expanding a labelled corpus × a matrix into Decision Eval test records.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JoinDecisionCorpus, ParseDecisionCorpus, ParseDecisionLabels, SelectLabelSource } from '../decision-eval/corpus';
import {
    BuildDecisionEvalSuiteRecord,
    BuildDecisionEvalTestRecord,
    DecisionEvalTestName,
    EstimateDecisionEvalRun,
    IsDecidableOffline,
    ParseDecisionEvalMatrix,
    StableEvalId,
    type DecisionEvalMatrixCell
} from '../decision-eval/suite';
import { DecisionEvalConfigSchema, DecisionEvalExpectedSchema, DecisionEvalInputSchema } from '../decision-eval/types';
import { SplitDecisionEvalTestName } from '../decision-eval/scorecard';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, 'fixtures/decision-eval');
const CASES = JoinDecisionCorpus(
    ParseDecisionCorpus(readFileSync(join(FIXTURE_DIR, 'corpus.jsonl'), 'utf8')),
    SelectLabelSource(ParseDecisionLabels(readFileSync(join(FIXTURE_DIR, 'labels.jsonl'), 'utf8')), 'construction')
).Cases;
const TEMPLATE_MATRIX = join(HERE, '../../../../../metadata-optional/decision-eval/matrix/example.json');

const CELL: DecisionEvalMatrixCell = {
    label: 'jev · production',
    stateLayout: 'production',
    modelId: '0B000000-0000-4000-8000-000000000001',
    temperature: 0
};

describe('Decision Eval suite', () => {
    describe('ParseDecisionEvalMatrix', () => {
        it('reads the committed template: four unpinned cells, Jev and LLM Decision, each layout', () => {
            const matrix = ParseDecisionEvalMatrix(readFileSync(TEMPLATE_MATRIX, 'utf8'), 'example.json');
            expect(matrix.cells.map(c => [c.label, c.stateLayout])).toEqual([
                ['jev · production', 'production'],
                ['jev · structured', 'structured'],
                ['llm-decision · production', 'production'],
                ['llm-decision · structured', 'structured']
            ]);
            expect(matrix.cells.every(c => c.modelId === undefined && c.vendorId === undefined)).toBe(true);
        });

        it('refuses a repeated label, a bracket in a label, and a model ID that is not a UUID', () => {
            const cells = (extra: object) => JSON.stringify({ cells: [{ label: 'a', stateLayout: 'production' }, extra] });
            expect(() => ParseDecisionEvalMatrix(cells({ label: 'a', stateLayout: 'structured' }), 'm.json')).toThrow("cell label 'a' appears twice");
            expect(() => ParseDecisionEvalMatrix(cells({ label: 'b [x]', stateLayout: 'production' }), 'm.json')).toThrow(/cells\.1\.label/);
            expect(() => ParseDecisionEvalMatrix(cells({ label: 'b', stateLayout: 'production', modelId: '<fill in>' }), 'm.json')).toThrow(/cells\.1\.modelId/);
            expect(() => ParseDecisionEvalMatrix('{', 'm.json')).toThrow(/^m\.json: not valid JSON/);
        });
    });

    describe('StableEvalId', () => {
        it('is the Prompt Eval generator\'s scheme, so regenerating updates the same records', () => {
            // Computed with generate-prompt-eval-suite.ts's stableId.
            expect(StableEvalId('11111111-1111-4111-8111-111111111111', 'jev · production')).toBe('68551AC4-02F9-4241-AF03-F925B204F927');
            expect(StableEvalId('Decision Eval — Conversation Routing', 'suite')).toBe('85882D1C-525F-404A-A753-5F063A545F07');
        });

        it('differs by cell and is stable across calls', () => {
            expect(StableEvalId('p', 'a')).toBe(StableEvalId('p', 'a'));
            expect(StableEvalId('p', 'a')).not.toBe(StableEvalId('p', 'b'));
        });
    });

    describe('BuildDecisionEvalTestRecord', () => {
        const record = BuildDecisionEvalTestRecord(CASES[1], CELL, 5, 'construction');

        it('names the record by point and cell, so the scorecard can split it back', () => {
            expect(record.fields.Name).toBe(DecisionEvalTestName(CASES[1].Point.id, CELL.label));
            expect(SplitDecisionEvalTestName(String(record.fields.Name))).toEqual({ CaseId: CASES[1].Point.id, Cell: CELL.label });
            expect(record.primaryKey.ID).toBe(StableEvalId(CASES[1].Point.id, CELL.label));
        });

        it('writes JSON columns the driver accepts', () => {
            expect(DecisionEvalInputSchema.parse(record.fields.InputDefinition).point).toEqual(CASES[1].Point);
            expect(DecisionEvalExpectedSchema.parse(record.fields.ExpectedOutcomes)).toEqual({ label: 'switch', labelSource: 'construction' });
            const config = DecisionEvalConfigSchema.parse(JSON.parse(JSON.stringify(record.fields.Configuration)));
            expect(config).toMatchObject({ decision: 'conversation-routing', stateLayout: 'production', modelId: CELL.modelId, temperature: 0 });
            expect(config.oracles).toEqual([{ type: 'decision-label-match', weight: 1, config: { question: 'continues', positiveLabel: 'continue', threshold: 0.5 } }]);
        });

        it('carries the repeat count, the test type and no corpus text in its description', () => {
            expect(record.fields).toMatchObject({ RepeatCount: 5, Status: 'Active', TypeID: '@lookup:MJ: Test Types.Name=Decision Eval' });
            expect(String(record.fields.Description)).not.toContain(CASES[1].Point.latest_message);
        });
    });

    describe('BuildDecisionEvalSuiteRecord', () => {
        it('lists every test in order, keyed back to the suite', () => {
            const suite = BuildDecisionEvalSuiteRecord('Suite', ['a [x]', 'b [x]'], 'desc');
            const members = suite.relatedEntities?.['MJ: Test Suite Tests'] ?? [];
            expect(members.map(m => m.fields)).toEqual([
                { SuiteID: '@parent:ID', TestID: '@lookup:MJ: Tests.Name=a [x]', Sequence: 1, Status: 'Active' },
                { SuiteID: '@parent:ID', TestID: '@lookup:MJ: Tests.Name=b [x]', Sequence: 2, Status: 'Active' }
            ]);
            expect(suite.primaryKey.ID).toBe(StableEvalId('Suite', 'suite'));
        });
    });

    describe('IsDecidableOffline', () => {
        it('finds something to decide on every fixture point', () => {
            expect(CASES.every(c => IsDecidableOffline(c.Point))).toBe(true);
        });

        it('finds nothing to decide when the previous agent never answered in the history', () => {
            const point = CASES[0].Point;
            expect(IsDecidableOffline({ ...point, history: point.history.filter(row => row.role === 'User') })).toBe(false);
        });
    });

    describe('EstimateDecisionEvalRun', () => {
        it('prices priced cells and leaves the rest unpriced', () => {
            const priced: DecisionEvalMatrixCell = { ...CELL, inputPricePer1M: 1, outputPricePer1M: 2 };
            const unpriced: DecisionEvalMatrixCell = { label: 'b', stateLayout: 'structured' };
            const estimate = EstimateDecisionEvalRun(CASES, [priced, unpriced], 5);
            expect(estimate.PromptTokens).toBeGreaterThan(CASES.length * 5 * 2 * 600);
            expect(estimate.CompletionTokens).toBe(CASES.length * 120 * 5 * 2);
            expect(estimate.PerCell[0].USD).toBeGreaterThan(0);
            expect(estimate.PerCell[1].USD).toBeNull();
            expect(estimate.USD).toBe(estimate.PerCell[0].USD);
        });

        it('is unpriced when no cell carries prices', () => {
            expect(EstimateDecisionEvalRun(CASES, [CELL], 1).USD).toBeNull();
        });
    });
});
