/**
 * @fileoverview Reading an agent-discovery corpus: every line validated, a bad line named by number,
 * labels chosen by source and joined to the requests. Runs on the invented fixture in
 * fixtures/discovery-eval.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DecisionCorpusError } from '../decision-eval/corpus';
import {
    DescribeDiscoveryLabel,
    JoinDiscoveryCorpus,
    ParseDiscoveryCorpus,
    ParseDiscoveryLabels,
    SelectDiscoveryLabelSource
} from '../decision-eval/discovery-corpus';
import {
    DiscoveryCatalogSnapshotSchema,
    DiscoveryEvalConfigSchema,
    DiscoveryEvalExpectedSchema,
    DiscoveryEvalInputSchema
} from '../decision-eval/discovery-types';
import { DecisionEvalKindSchema } from '../decision-eval/types';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/discovery-eval');
const CORPUS = readFileSync(join(FIXTURE_DIR, 'corpus.jsonl'), 'utf8');
const LABELS = readFileSync(join(FIXTURE_DIR, 'labels.jsonl'), 'utf8');
const BILLING = 'E1000000-0000-4000-8000-000000000002';

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

describe('Agent-discovery corpus', () => {
    describe('ParseDiscoveryCorpus', () => {
        it('reads every request, skipping blank lines and dropping unknown fields', () => {
            const requests = ParseDiscoveryCorpus(CORPUS);
            expect(requests).toHaveLength(6);
            expect(Object.keys(requests[0]).sort()).toEqual(['created_at', 'id', 'request']);
            expect(requests[3].request).toBe("thanks, that's all for now!");
        });

        it('names the line that is not JSON', () => {
            const error = errorOf(() => ParseDiscoveryCorpus(`${CORPUS.split('\n')[0]}\n{nope`));
            expect(error.Line).toBe(2);
            expect(error.message).toMatch(/^corpus\.jsonl line 2: not valid JSON/);
        });

        it('refuses an empty request and an ID that is not a UUID', () => {
            expect(errorOf(() => ParseDiscoveryCorpus('{"id": "F1000000-0000-4000-8000-000000000001", "request": "", "created_at": "x"}')).message)
                .toContain('request');
            expect(errorOf(() => ParseDiscoveryCorpus('{"id": "7", "request": "hi", "created_at": "x"}')).message).toContain('id');
        });

        it('refuses a repeated request ID, in any case, naming both lines', () => {
            const line = '{"id": "F1000000-0000-4000-8000-000000000001", "request": "hi", "created_at": "x"}';
            const error = errorOf(() => ParseDiscoveryCorpus(`${line}\n${line.toLowerCase()}`));
            expect(error.Line).toBe(2);
            expect(error.message).toContain('repeats the request on line 1');
        });
    });

    describe('ParseDiscoveryLabels', () => {
        it('reads both label kinds, keeping line numbers', () => {
            const labels = ParseDiscoveryLabels(LABELS);
            expect(labels).toHaveLength(8);
            expect(labels[0]).toEqual({ Line: 1, Value: { id: 'F1000000-0000-4000-8000-000000000001', label: 'agent', agentId: BILLING, source: 'construction' } });
            expect(labels[3].Value).toEqual({ id: 'F1000000-0000-4000-8000-000000000004', label: 'none', kind: 'chat', source: 'construction' });
        });

        it('refuses an agent label without an agent, and a none label without a known kind', () => {
            expect(errorOf(() => ParseDiscoveryLabels('{"id": "F1000000-0000-4000-8000-000000000001", "label": "agent", "source": "x"}')).message)
                .toContain('agentId');
            expect(errorOf(() => ParseDiscoveryLabels('{"id": "F1000000-0000-4000-8000-000000000001", "label": "none", "kind": "banter", "source": "x"}')).message)
                .toContain('kind');
            expect(errorOf(() => ParseDiscoveryLabels('{"id": "F1000000-0000-4000-8000-000000000001", "label": "continue", "source": "x"}')).message)
                .toContain('label');
        });
    });

    describe('SelectDiscoveryLabelSource and JoinDiscoveryCorpus', () => {
        const requests = ParseDiscoveryCorpus(CORPUS);
        const labels = ParseDiscoveryLabels(LABELS);

        it('joins the construction labels to every request, matching IDs in any case', () => {
            const joined = JoinDiscoveryCorpus(requests, SelectDiscoveryLabelSource(labels, 'construction'));
            expect(joined.Cases).toHaveLength(6);
            expect(joined.Cases[2].Label).toEqual({ label: 'agent', agentId: 'E1000000-0000-4000-8000-000000000003' });
            expect(joined.Cases[5].Label).toEqual({ label: 'none', kind: 'workflow' });
            expect(joined.UnlabelledRequestIds).toEqual([]);
            expect(joined.OrphanLabelCount).toBe(0);
        });

        it('reports unlabelled requests and labels for requests the corpus lacks', () => {
            const joined = JoinDiscoveryCorpus(requests, SelectDiscoveryLabelSource(labels, 'hand'));
            expect(joined.Cases.map(c => c.Request.id)).toEqual(['F1000000-0000-4000-8000-000000000002']);
            expect(joined.UnlabelledRequestIds).toHaveLength(5);
            expect(joined.OrphanLabelCount).toBe(1);
        });

        it('accepts the same label twice, and refuses two different labels from one source', () => {
            const same = ParseDiscoveryLabels(`${LABELS.split('\n')[0]}\n${LABELS.split('\n')[0].replace(BILLING, BILLING.toLowerCase())}`);
            expect(SelectDiscoveryLabelSource(same, 'construction').size).toBe(1);
            const conflicting = ParseDiscoveryLabels(`${LABELS.split('\n')[0]}\n{"id": "F1000000-0000-4000-8000-000000000001", "label": "none", "kind": "chat", "source": "construction"}`);
            const error = errorOf(() => SelectDiscoveryLabelSource(conflicting, 'construction'));
            expect(error.Line).toBe(2);
            expect(error.message).toContain(`labelled 'none:chat' by 'construction', but line 1 labels it 'agent:${BILLING}'`);
        });

        it('describes a label as one comparable string', () => {
            expect(DescribeDiscoveryLabel({ label: 'agent', agentId: BILLING.toLowerCase() })).toBe(`agent:${BILLING}`);
            expect(DescribeDiscoveryLabel({ label: 'none', kind: 'direct' })).toBe('none:direct');
        });
    });

    describe('the test columns', () => {
        it('reads a discovery configuration, a request and either label', () => {
            expect(DecisionEvalKindSchema.parse({ decision: 'agent-discovery', anything: 1 })).toEqual({ decision: 'agent-discovery' });
            expect(DiscoveryEvalConfigSchema.parse({ decision: 'agent-discovery', baseline: null, oracles: [{ type: 'discovery-label-match' }] }).baseline).toBeNull();
            expect(DiscoveryEvalInputSchema.safeParse({ request: '' }).success).toBe(false);
            expect(DiscoveryEvalExpectedSchema.parse({ label: 'agent', agentId: BILLING, labelSource: 'construction' })).toMatchObject({ agentId: BILLING });
            expect(DiscoveryEvalExpectedSchema.safeParse({ label: 'none', labelSource: 'construction' }).success).toBe(false);
        });

        it('refuses a routing configuration as a discovery one, and an unknown baseline', () => {
            expect(DiscoveryEvalConfigSchema.safeParse({ decision: 'conversation-routing', oracles: [{ type: 'x' }] }).success).toBe(false);
            expect(DiscoveryEvalConfigSchema.safeParse({ decision: 'agent-discovery', baseline: 'keyword', oracles: [{ type: 'x' }] }).success).toBe(false);
        });

        it('reads the catalog snapshot the generator writes', () => {
            const snapshot = DiscoveryCatalogSnapshotSchema.parse(JSON.parse(readFileSync(join(FIXTURE_DIR, 'agents.json'), 'utf8')));
            expect(snapshot.agents.map(a => a.Name)).toEqual(['Research Agent', 'Billing Agent', 'Marketing Agent']);
        });
    });
});
