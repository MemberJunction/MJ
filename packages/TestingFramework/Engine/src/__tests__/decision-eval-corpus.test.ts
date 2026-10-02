/**
 * @fileoverview Reading a Decision Eval corpus: every line validated, a bad line named by number.
 * Runs on the invented fixture in fixtures/decision-eval.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DecisionCorpusError,
    JoinDecisionCorpus,
    ParseDecisionCorpus,
    ParseDecisionLabels,
    SelectLabelSource
} from '../decision-eval/corpus';
import type { DecisionCorpusPoint } from '../decision-eval/types';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/decision-eval');
const CORPUS = readFileSync(join(FIXTURE_DIR, 'corpus.jsonl'), 'utf8');
const LABELS = readFileSync(join(FIXTURE_DIR, 'labels.jsonl'), 'utf8');

/** The fixture's first point, parsed, to break one field of. */
function firstPoint(): DecisionCorpusPoint {
    return ParseDecisionCorpus(CORPUS)[0];
}

/** The error a parse throws, for asserting on its fields. */
function errorOf(parse: () => unknown): DecisionCorpusError {
    try {
        parse();
    } catch (error) {
        if (error instanceof DecisionCorpusError) {
            return error;
        }
        throw error;
    }
    throw new Error('expected a DecisionCorpusError');
}

describe('Decision Eval corpus', () => {
    describe('ParseDecisionCorpus', () => {
        it('reads every line of a good corpus', () => {
            const points = ParseDecisionCorpus(CORPUS);
            expect(points).toHaveLength(11);
            expect(points[2].artifacts[0].versions.map(v => v.versionNumber)).toEqual([2, 1]);
        });

        it('drops the fields the harness does not use', () => {
            const [point] = ParseDecisionCorpus(CORPUS);
            expect(Object.keys(point).sort()).toEqual(
                ['artifacts', 'conversation_id', 'created_at', 'history', 'id', 'latest_message', 'previous_agent', 'source']);
        });

        it('skips blank lines, and counts lines from 1 across them', () => {
            const broken = { ...firstPoint(), latest_message: 42 };
            const text = `${CORPUS.split('\n')[0]}\n\n${JSON.stringify(broken)}\n`;
            const error = errorOf(() => ParseDecisionCorpus(text));
            expect(error.Line).toBe(3);
        });

        it('names the line and the field when a line does not match the schema', () => {
            const broken = { ...firstPoint(), previous_agent: { id: 'not-a-uuid', name: 'x', description: 'y' } };
            const lines = CORPUS.trimEnd().split('\n');
            lines[4] = JSON.stringify(broken);
            const error = errorOf(() => ParseDecisionCorpus(lines.join('\n')));
            expect(error.Line).toBe(5);
            expect(error.message).toMatch(/^corpus\.jsonl line 5: previous_agent\.id: /);
        });

        it('names the line when a line is not JSON', () => {
            const error = errorOf(() => ParseDecisionCorpus(`${CORPUS.split('\n')[0]}\n{"id": `, 'my-corpus.jsonl'));
            expect(error.message).toMatch(/^my-corpus\.jsonl line 2: not valid JSON/);
        });

        it('rejects a history role the schema does not have', () => {
            const point = firstPoint();
            const broken = { ...point, history: [{ ...point.history[0], role: 'Error' }] };
            expect(errorOf(() => ParseDecisionCorpus(JSON.stringify(broken))).message).toMatch(/line 1: history\.0\.role/);
        });

        it('rejects a repeated point ID, naming both lines', () => {
            const first = CORPUS.split('\n')[0];
            const error = errorOf(() => ParseDecisionCorpus(`${first}\n${first}`));
            expect(error.Line).toBe(2);
            expect(error.message).toContain('repeats the point on line 1');
        });
    });

    describe('labels', () => {
        it('reads every label line with its number', () => {
            const labels = ParseDecisionLabels(LABELS);
            expect(labels).toHaveLength(25);
            expect(labels[0].Line).toBe(1);
        });

        it('names the line of a label outside the schema', () => {
            const text = `${LABELS.split('\n')[0]}\n${JSON.stringify({ id: 'D3000000-0000-4000-8000-000000000001', label: 'maybe', source: 's', note: '' })}`;
            expect(errorOf(() => ParseDecisionLabels(text)).message).toMatch(/^labels\.jsonl line 2: label: /);
        });

        it('selects one source\'s labels', () => {
            const labels = ParseDecisionLabels(LABELS);
            const construction = SelectLabelSource(labels, 'construction');
            expect(construction.size).toBe(11);
            expect(construction.get('D3000000-0000-4000-8000-000000000002')).toBe('switch');
            const audit = SelectLabelSource(labels, 'claude-audit');
            expect(audit.size).toBe(3);
            expect(audit.get('D3000000-0000-4000-8000-000000000002')).toBe('ambiguous');
        });

        it('accepts a repeated label, and refuses a contradicting one', () => {
            const line = { id: 'D3000000-0000-4000-8000-000000000001', label: 'continue', source: 'construction', note: '' };
            const same = ParseDecisionLabels([line, line].map(l => JSON.stringify(l)).join('\n'));
            expect(SelectLabelSource(same, 'construction').size).toBe(1);
            const clash = ParseDecisionLabels([line, { ...line, label: 'switch' }].map(l => JSON.stringify(l)).join('\n'));
            const error = errorOf(() => SelectLabelSource(clash, 'construction'));
            expect(error.Line).toBe(2);
            expect(error.message).toContain('line 1 labels it \'continue\'');
        });
    });

    describe('JoinDecisionCorpus', () => {
        it('keeps labelled points in corpus order, and counts the rest', () => {
            const points = ParseDecisionCorpus(CORPUS);
            const audit = SelectLabelSource(ParseDecisionLabels(LABELS), 'claude-audit');
            const extra = new Map([...audit, ['D3000000-0000-4000-8000-0000000000AA', 'switch' as const]]);
            const joined = JoinDecisionCorpus(points, extra);
            expect(joined.Cases.map(c => c.Point.id)).toEqual([
                'D3000000-0000-4000-8000-000000000002', 'D3000000-0000-4000-8000-000000000005', 'D3000000-0000-4000-8000-000000000008']);
            expect(joined.Cases.map(c => c.Label)).toEqual(['ambiguous', 'continue', 'switch']);
            expect(joined.UnlabelledPointIds).toHaveLength(8);
            expect(joined.OrphanLabelCount).toBe(1);
        });
    });
});
