/**
 * corpus-lint.test.ts — every shipped corpus case must load, on every PR.
 *
 * A corpus case is only useful if it can score. A typo'd matcher name, an unescaped regex, an
 * expectation kind that does not exist — each of these produces a case that *looks* fine in review
 * and then contributes a failure, or worse a silent zero, to a live run that costs real tokens.
 * The loader validates; this makes sure the loader is actually pointed at every file, for free,
 * before anyone spends anything.
 *
 * What this deliberately does NOT check is whether the agent and action names in a case exist in
 * the catalog. That needs a database and belongs in the deterministic integration tier (T5) — but
 * it is the other half of corpus lint and should not be skipped there.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ParseCorpusCase } from '../eval/corpus';

// src/__tests__/ → repo root is 5 levels up (Engine → TestingFramework → packages → root).
const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../../metadata-optional/prompt-eval-corpus/cases');

const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.json'));

describe('prompt-eval corpus', () => {
    it('is at the size the plan calls for (~40-60 cases)', () => {
        // A floor and a ceiling: too few and the rates are noise, too many and an on-demand
        // live run stops being affordable at N=20 per cell.
        expect(files.length).toBeGreaterThanOrEqual(40);
        expect(files.length).toBeLessThanOrEqual(70);
    });

    it('spreads across agents rather than over-fitting to one prompt', () => {
        const agents = new Set(files.map((f) =>
            (JSON.parse(readFileSync(join(CORPUS_DIR, f), 'utf8')) as { agent: string }).agent));
        expect(agents.size).toBeGreaterThanOrEqual(8);
    });

    it.each(files)('%s parses and validates', (file) => {
        const parsed = ParseCorpusCase(JSON.parse(readFileSync(join(CORPUS_DIR, file), 'utf8')) as unknown);
        // The filename IS the id, so a case can be found from a result row without a lookup.
        expect(`${parsed.id}.json`).toBe(file);
        expect(parsed.description.length).toBeGreaterThan(20);
    });

    it('has unique ids', () => {
        const ids = files.map((f) => ParseCorpusCase(JSON.parse(readFileSync(join(CORPUS_DIR, f), 'utf8')) as unknown).id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('never encodes the wire format into an expectation — the §1 rule', () => {
        // A case that mentions nextStep or toolCalls has picked an encoding, and stops being
        // comparable across arms. This is the single rule the corpus cannot break.
        for (const file of files) {
            const raw = readFileSync(join(CORPUS_DIR, file), 'utf8');
            const expectBlock = JSON.stringify((JSON.parse(raw) as { expect: unknown }).expect);
            for (const forbidden of ['nextStep', 'toolCalls', 'tool_calls', 'payloadChangeRequest']) {
                expect(expectBlock, `${file} expectation references the wire format '${forbidden}'`).not.toContain(forbidden);
            }
        }
    });

    it('covers the categories the baseline needs to be meaningful', () => {
        const tags = new Set(files.flatMap((f) =>
            (JSON.parse(readFileSync(join(CORPUS_DIR, f), 'utf8')) as { tags?: string[] }).tags ?? []));
        // Not exhaustive coverage — a floor, so the corpus cannot silently narrow to one shape.
        // Every category the plan's §4.3 table names. A corpus missing one of these cannot
        // support the claim the baseline is meant to make.
        for (const required of [
            'first-step-action', 'mid-loop-action', 'error-recovery', 'disambiguation',
            'parallel-actions', 'sub-agent-dispatch', 'terminal-synthesis', 'clarify',
            'payload-change', 'forced-control-flow', 'adversarial-exemplar'
        ]) {
            expect(tags, `corpus has no case tagged '${required}'`).toContain(required);
        }
    });
});
