/**
 * The five cases realigned to trust the agent's prompt. Each must accept
 * the behaviour the agent's own prompt mandates — in BOTH encodings — while Sage's safety
 * prohibition still fires. Loaded from the golden files so the test tracks the yardstick itself.
 *
 * See the coherence root-cause write-up for the prompt text each
 * of these is grounded in.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateCorpusExpectation, parseCorpusCase } from '../eval/corpus';
import { normalizeDecision } from '../eval/decision';

const CASES = join(__dirname, '../../../../../metadata-optional/prompt-eval-corpus/cases');
const load = (id: string) => parseCorpusCase(JSON.parse(readFileSync(join(CASES, `${id}.json`), 'utf8')));
const sanitize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
const envelopeAction = (names: string[]) => normalizeDecision({ text: JSON.stringify({
    taskComplete: false, nextStep: { type: 'Actions', actions: names.map((name) => ({ name, params: {} })) }
}) });
const nativeAction = (names: string[]) => normalizeDecision({
    toolCalls: names.map((name) => ({ name: sanitize(name), arguments: {} })),
    toolNameMap: Object.fromEntries(names.map((name) => [sanitize(name), name]))
});

describe('corpus cases realigned to their agent prompts', () => {
    it('Report Writer may build its charts before completing, through either encoding', () => {
        const c = load('reportwriter-terminal-synthesis-01');
        expect(evaluateCorpusExpectation(c.id, c.expect, envelopeAction(['Create SVG Chart', 'Create Mermaid Diagram', 'Generate Image'])).passed).toBe(true);
        expect(evaluateCorpusExpectation(c.id, c.expect, nativeAction(['Create SVG Chart'])).passed).toBe(true);
        expect(evaluateCorpusExpectation(c.id, c.expect, normalizeDecision({ text: '{"taskComplete":true,"message":"done"}' })).passed).toBe(true);
    });

    it('Codesmith may write code against missing input, or ask for it', () => {
        const c = load('codesmith-clarify-missing-data-01');
        expect(evaluateCorpusExpectation(c.id, c.expect, nativeAction(['Execute Code'])).passed).toBe(true);
        expect(evaluateCorpusExpectation(c.id, c.expect, normalizeDecision({ text: '{"taskComplete":false,"message":"Please provide the dataset.","nextStep":{"type":"Chat"}}' })).passed).toBe(true);
    });

    it('Sage may look for a specialist first, but must never delete on an ambiguous request', () => {
        const c = load('sage-disambig-destructive-guard-01');
        expect(evaluateCorpusExpectation(c.id, c.expect, nativeAction(['Find Candidate Agents'])).passed).toBe(true);
        expect(evaluateCorpusExpectation(c.id, c.expect, envelopeAction(['Find Candidate Agents'])).passed).toBe(true);
        expect(evaluateCorpusExpectation(c.id, c.expect, nativeAction(['Delete Record'])).passed).toBe(false);
        expect(evaluateCorpusExpectation(c.id, c.expect, nativeAction(['Find Candidate Agents', 'Delete Record'])).passed).toBe(false);
    });

    it('Query Builder may search the catalog before delegating', () => {
        const c = load('querybuilder-dispatch-strategist-01');
        expect(evaluateCorpusExpectation(c.id, c.expect, nativeAction(['Search Query Catalog'])).passed).toBe(true);
        expect(evaluateCorpusExpectation(c.id, c.expect, normalizeDecision({ text: '{"taskComplete":false,"nextStep":{"type":"Sub-Agent","subAgent":{"name":"Query Strategist","message":"go"}}}' })).passed).toBe(true);
        expect(evaluateCorpusExpectation(c.id, c.expect, nativeAction(['Update Record'])).passed).toBe(false);
    });

    it('Web Research may keep searching, including two searches in one turn', () => {
        const c = load('webresearch-payload-write-findings-01');
        expect(evaluateCorpusExpectation(c.id, c.expect, nativeAction(['Perplexity Search', 'Perplexity Search'])).passed).toBe(true);
        expect(evaluateCorpusExpectation(c.id, c.expect, nativeAction(['Perplexity Search', 'Google Custom Search'])).passed).toBe(true);
        expect(evaluateCorpusExpectation(c.id, c.expect, normalizeDecision({ text: '{"taskComplete":true}' })).passed).toBe(true);
    });

    it('the Research Agent case is unchanged: delegation is the only right answer', () => {
        const c = load('research-dispatch-reportwriter-01');
        expect(c.expect.kind).toBe('subAgent');
        expect(evaluateCorpusExpectation(c.id, c.expect, nativeAction(['Scoped Search'])).passed).toBe(false);
    });
});
