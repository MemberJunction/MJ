/**
 * The `decisions` condition scanner on input built to make a backtracking reader slow.
 *
 * A condition is author input, and the regular expressions this scanner replaced took seconds — or,
 * for the chain before a property read, time exponential in its length — on each of the shapes here.
 * Every case is sized so that reader would blow well past the budget, and every case also checks the
 * answer, so a fast wrong answer fails too.
 */
import { describe, it, expect } from 'vitest';
import {
    DecisionChoiceTestOf,
    DecisionReferencesIn,
    DecisionsReadAsProperty,
    DecisionValueComparisonsIn,
    RewriteDecisionReferences,
} from '../task-graph/decision-conditions';

/** Far more than a linear read of any input here needs, and far less than the old patterns took. */
const BUDGET_MS = 1000;

/** Enough repetitions that a quadratic read of them takes seconds. */
const LONG = 100_000;

function withinBudget<T>(read: () => T): T {
    const started = performance.now();
    const result = read();
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
    return result;
}

describe('the decisions scanner on pathological input', () => {
    it('reads past a long run of whitespace after the root that ends in no segment', () => {
        const scan = withinBudget(() => DecisionReferencesIn(`decisions${'\t'.repeat(LONG)}!`));
        expect(scan).toEqual({ References: [], Malformed: ['decisions'] });
    });

    it('reads past a long run of whitespace after the last segment of a reference', () => {
        const scan = withinBudget(() => DecisionReferencesIn(`decisions.triage?.[ 'intent' ]${' \t'.repeat(LONG)}&& true`));
        expect(scan.References).toEqual([{ NodeId: 'triage', QuestionKey: 'intent', Field: undefined }]);
    });

    it.each([
        ['single', `'${"\\'".repeat(LONG)}`],
        ['double', `"${'\\"'.repeat(LONG)}`],
    ])('reads past an unclosed %s-quoted string full of escaped quotes, which opens no string', (_kind, unclosed) => {
        const scan = withinBudget(() => DecisionReferencesIn(`${unclosed} && decisions.triage.intent.value`));
        expect(scan.References).toEqual([{ NodeId: 'triage', QuestionKey: 'intent', Field: 'value' }]);
    });

    it('reads past a long run of whitespace after a name that no property read follows', () => {
        const reads = withinBudget(() => DecisionsReadAsProperty(`payload${'\t'.repeat(LONG)}['decision'] && output ['decisions']`));
        expect(reads).toEqual(["output['decisions']"]);
    });

    it('does not backtrack exponentially over index segments before a property read', () => {
        // A chain from `$` fails only at ` x`; there are 2^n ways to split the whitespace before n indexes.
        const reads = withinBudget(() => DecisionsReadAsProperty(`$${'\t[0]'.repeat(40)} x.decisions`));
        expect(reads).toEqual(['x.decisions']);
    });

    it('finds many comparisons with the literal on the left without re-reading the condition for each', () => {
        const condition = `${"'a' === decisions.triage.intent.value || ".repeat(LONG / 10)}true`;
        const comparisons = withinBudget(() => DecisionValueComparisonsIn(condition));
        expect(comparisons).toHaveLength(LONG / 10);
        expect(comparisons[0]).toEqual({ NodeId: 'triage', QuestionKey: 'intent', Value: 'a' });
    });

    it('looks for a literal on the left of many references compared with nothing without re-reading the condition for each', () => {
        const condition = `${'decisions.triage.intent.value || '.repeat(LONG / 4)}true`;
        expect(withinBudget(() => DecisionValueComparisonsIn(condition))).toEqual([]);
    });

    it('refuses as a Choice test a reference cut short by a long run of whitespace', () => {
        expect(withinBudget(() => DecisionChoiceTestOf(`decisions.triage${'\t'.repeat(LONG)}=== 'billing'`))).toBeNull();
        const spaced = `decisions.triage.intent.value${' '.repeat(LONG)}===${' '.repeat(LONG)}'billing'`;
        expect(withinBudget(() => DecisionChoiceTestOf(spaced))).toEqual({ NodeId: 'triage', QuestionKey: 'intent', Values: ['billing'] });
    });

    it('rewrites step names past long runs of whitespace, and leaves a reference cut short by one alone', () => {
        const rename = (key: string): string | undefined => (key === 'triage' ? 'step-1' : undefined);
        const cutShort = `decisions.triage${'\t'.repeat(LONG)}!`;
        expect(withinBudget(() => RewriteDecisionReferences(cutShort, rename))).toEqual({ Expression: cutShort, Unknown: [] });

        const spaced = `decisions${' '.repeat(LONG)}?.triage.intent${'\t'.repeat(LONG)}&& true`;
        expect(withinBudget(() => RewriteDecisionReferences(spaced, rename))).toEqual({
            Expression: `decisions${' '.repeat(LONG)}?.['step-1'].intent${'\t'.repeat(LONG)}&& true`,
            Unknown: [],
        });
    });
});

describe('the decisions scanner reads strings as the evaluator does', () => {
    it('ignores a root inside a string that closes', () => {
        expect(DecisionReferencesIn("payload.x === 'see decisions.t.q' && decisions.u.r.value").References)
            .toEqual([{ NodeId: 'u', QuestionKey: 'r', Field: 'value' }]);
    });

    it('treats a quote whose string never closes as opening none', () => {
        expect(DecisionReferencesIn("payload.x === 'it\\'s && decisions.t.q.probability > 0.5").References)
            .toEqual([{ NodeId: 't', QuestionKey: 'q', Field: 'probability' }]);
    });

    it('ends a string unclosed at a backslash before a line break', () => {
        expect(DecisionReferencesIn("payload.x === 'a\\\n' + decisions.t.q.probability").References)
            .toEqual([{ NodeId: 't', QuestionKey: 'q', Field: 'probability' }]);
    });

    it('reports only a literal that is the whole operand, on either side', () => {
        const condition = "decisions.t.q.value === 'a' + x || (\"b\" != decisions.t.q.value) || x + 'c' == decisions.t.q.value";
        expect(DecisionValueComparisonsIn(condition)).toEqual([{ NodeId: 't', QuestionKey: 'q', Value: 'b' }]);
    });

    it('reads index and bracket segments in the chain before a property read, and not a spread', () => {
        expect(DecisionsReadAsProperty("rows[0].decisions && output?.['x'] ['decisions'] && ...decisions"))
            .toEqual(['rows[0].decisions', "output?.['x']['decisions']"]);
    });
});
