/**
 * @fileoverview Expanding a labelled agent-discovery corpus × a matrix into Decision Eval test
 * records, estimating the run, and comparing the catalog with the corpus's snapshot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JoinDiscoveryCorpus, ParseDiscoveryCorpus, ParseDiscoveryLabels, SelectDiscoveryLabelSource } from '../decision-eval/discovery-corpus';
import {
    BuildDiscoveryEvalConfiguration,
    BuildDiscoveryEvalTestRecord,
    CompareDiscoveryCatalog,
    DEFAULT_DISCOVERY_EVAL_MATRIX,
    DiscoveryCellRepeats,
    EstimateDiscoveryEvalRun,
    ParseDiscoveryEvalMatrix,
    type DiscoveryEvalMatrixCell
} from '../decision-eval/discovery-suite';
import { DecisionEvalTestName, StableEvalId } from '../decision-eval/suite';
import { SplitDecisionEvalTestName } from '../decision-eval/scorecard';
import {
    DiscoveryCatalogSnapshotSchema,
    DiscoveryEvalConfigSchema,
    DiscoveryEvalExpectedSchema,
    DiscoveryEvalInputSchema
} from '../decision-eval/discovery-types';
import { ReadDecisionEvalKind } from '../drivers/DecisionEvalDriver';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/discovery-eval');
const CASES = JoinDiscoveryCorpus(
    ParseDiscoveryCorpus(readFileSync(join(FIXTURE_DIR, 'corpus.jsonl'), 'utf8')),
    SelectDiscoveryLabelSource(ParseDiscoveryLabels(readFileSync(join(FIXTURE_DIR, 'labels.jsonl'), 'utf8')), 'construction')
).Cases;
const CATALOG = DiscoveryCatalogSnapshotSchema.parse(JSON.parse(readFileSync(join(FIXTURE_DIR, 'agents.json'), 'utf8'))).agents;

const PINNED: DiscoveryEvalMatrixCell = { label: 'jev', modelId: '0B000000-0000-4000-8000-000000000001', inputPricePer1M: 1, outputPricePer1M: 2 };
const BASELINE: DiscoveryEvalMatrixCell = { label: 'semantic-search', baseline: 'semantic-search' };

describe('Agent-discovery suite', () => {
    describe('ParseDiscoveryEvalMatrix', () => {
        it('reads a decision cell and a baseline cell', () => {
            const matrix = ParseDiscoveryEvalMatrix(JSON.stringify({ reps: 3, cells: [PINNED, BASELINE], _comment: 'ignored' }), 'm.json');
            expect(matrix.reps).toBe(3);
            expect(matrix.cells.map(c => [c.label, c.baseline])).toEqual([['jev', undefined], ['semantic-search', 'semantic-search']]);
        });

        it('refuses a repeated label, a bracket in a label, and an unknown baseline', () => {
            const cells = (extra: object) => JSON.stringify({ cells: [{ label: 'a' }, extra] });
            expect(() => ParseDiscoveryEvalMatrix(cells({ label: 'a' }), 'm.json')).toThrow("cell label 'a' appears twice");
            expect(() => ParseDiscoveryEvalMatrix(cells({ label: 'b [x]' }), 'm.json')).toThrow(/cells\.1\.label/);
            expect(() => ParseDiscoveryEvalMatrix(cells({ label: 'b', baseline: 'keyword' }), 'm.json')).toThrow(/cells\.1\.baseline/);
        });

        it('defaults to the decision as the prompt selects its model, beside the semantic-search baseline', () => {
            expect(DEFAULT_DISCOVERY_EVAL_MATRIX.cells).toEqual([{ label: 'decision' }, { label: 'semantic-search', baseline: 'semantic-search' }]);
        });
    });

    describe('BuildDiscoveryEvalTestRecord', () => {
        const record = BuildDiscoveryEvalTestRecord(CASES[0], PINNED, 5, 'construction');

        it('names the record by request and cell, with a stable ID', () => {
            expect(record.fields.Name).toBe(DecisionEvalTestName(CASES[0].Request.id, 'jev'));
            expect(SplitDecisionEvalTestName(String(record.fields.Name))).toEqual({ CaseId: CASES[0].Request.id, Cell: 'jev' });
            expect(record.primaryKey.ID).toBe(StableEvalId(CASES[0].Request.id, 'jev'));
        });

        it('writes JSON columns the driver accepts', () => {
            expect(DiscoveryEvalInputSchema.parse(record.fields.InputDefinition)).toEqual({ request: CASES[0].Request.request });
            expect(DiscoveryEvalExpectedSchema.parse(record.fields.ExpectedOutcomes))
                .toEqual({ label: 'agent', agentId: 'E1000000-0000-4000-8000-000000000002', labelSource: 'construction' });
            const configuration = JSON.stringify(record.fields.Configuration);
            expect(ReadDecisionEvalKind({ Configuration: configuration })).toBe('agent-discovery');
            expect(DiscoveryEvalConfigSchema.parse(JSON.parse(configuration))).toEqual({
                decision: 'agent-discovery',
                modelId: PINNED.modelId,
                oracles: [{ type: 'discovery-label-match', weight: 1 }]
            });
        });

        it('carries a none label with its kind', () => {
            const noneRecord = BuildDiscoveryEvalTestRecord(CASES[5], PINNED, 5, 'construction');
            expect(noneRecord.fields.ExpectedOutcomes).toEqual({ label: 'none', kind: 'workflow', labelSource: 'construction' });
        });

        it('repeats a decision cell and runs a baseline cell once, and keeps corpus text out of the description', () => {
            expect(record.fields).toMatchObject({ RepeatCount: 5, Status: 'Active', TypeID: '@lookup:MJ: Test Types.Name=Decision Eval' });
            expect(BuildDiscoveryEvalTestRecord(CASES[0], BASELINE, 5, 'construction').fields.RepeatCount).toBe(1);
            expect(DiscoveryCellRepeats(BASELINE, 5)).toBe(1);
            expect(String(record.fields.Description)).not.toContain(CASES[0].Request.request);
            expect(BuildDiscoveryEvalConfiguration(BASELINE)).toMatchObject({ decision: 'agent-discovery', baseline: 'semantic-search' });
        });
    });

    describe('EstimateDiscoveryEvalRun', () => {
        it('prices the decision cell, charges nothing for the baseline, and grows with the catalog', () => {
            const estimate = EstimateDiscoveryEvalRun(CASES, [PINNED, BASELINE], 5, CATALOG);
            expect(estimate.CompletionTokens).toBe(CASES.length * 200 * 5);
            expect(estimate.PerCell[0].USD).toBeGreaterThan(0);
            expect(estimate.PerCell[1].USD).toBe(0);
            expect(estimate.USD).toBe(estimate.PerCell[0].USD);
            expect(EstimateDiscoveryEvalRun(CASES, [PINNED], 5, []).PromptTokens).toBeLessThan(estimate.PromptTokens);
        });

        it('is unpriced when a decision cell carries no price', () => {
            expect(EstimateDiscoveryEvalRun(CASES, [{ label: 'x' }, BASELINE], 1, CATALOG).USD).toBeNull();
            expect(EstimateDiscoveryEvalRun(CASES, [BASELINE], 1, CATALOG).USD).toBe(0);
        });
    });

    describe('CompareDiscoveryCatalog', () => {
        it('finds added, removed and changed agents, by ID in any case', () => {
            const current = [
                { ...CATALOG[0], ID: CATALOG[0].ID.toLowerCase() },
                { ...CATALOG[1], Description: 'Now also runs payroll.' },
                { ID: 'E1000000-0000-4000-8000-000000000009', Name: 'Legal Agent', Description: 'Reviews contracts.' }
            ];
            expect(CompareDiscoveryCatalog(CATALOG, current)).toEqual({
                Added: ['E1000000-0000-4000-8000-000000000009'],
                Removed: [CATALOG[2].ID],
                Changed: [CATALOG[1].ID]
            });
            expect(CompareDiscoveryCatalog(CATALOG, CATALOG)).toEqual({ Added: [], Removed: [], Changed: [] });
        });
    });
});
