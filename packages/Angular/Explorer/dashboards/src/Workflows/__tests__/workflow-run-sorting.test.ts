/**
 * Ordering rules for the Workflows Runs list.
 *
 * The rule worth pinning is what happens to a run that never started: it has no start time, and
 * letting `null` compare as though it were the beginning of time puts work that did NOT happen above
 * work that did. The run tree's ORDER BY had to fix exactly this; nothing stops a second
 * implementation getting it wrong on its own.
 */
import { describe, expect, it } from 'vitest';
import { RunElapsedMs, SortWorkflowRuns, type SortableRun } from '../components/workflow-run-sorting';

function run(partial: Partial<SortableRun> & { Name: string }): SortableRun {
    return {
        Name: partial.Name,
        Status: partial.Status ?? 'Complete',
        StartedAt: partial.StartedAt ?? null,
        CompletedAt: partial.CompletedAt ?? null,
    };
}

const EARLY = new Date('2026-08-11T10:00:00Z');
const LATE = new Date('2026-08-11T12:00:00Z');
const NOW = new Date('2026-08-11T13:00:00Z').getTime();

const names = (rows: SortableRun[]): string[] => rows.map((r) => r.Name);

describe('SortWorkflowRuns', () => {
    it('orders by start time, newest first', () => {
        const rows = [run({ Name: 'early', StartedAt: EARLY }), run({ Name: 'late', StartedAt: LATE })];
        expect(names(SortWorkflowRuns(rows, 'StartedAt', true, NOW))).toEqual(['late', 'early']);
    });

    it('reverses when the direction flips', () => {
        const rows = [run({ Name: 'late', StartedAt: LATE }), run({ Name: 'early', StartedAt: EARLY })];
        expect(names(SortWorkflowRuns(rows, 'StartedAt', false, NOW))).toEqual(['early', 'late']);
    });

    it('puts a never-started run last when ascending', () => {
        const rows = [run({ Name: 'never' }), run({ Name: 'ran', StartedAt: EARLY })];
        expect(names(SortWorkflowRuns(rows, 'StartedAt', false, NOW))).toEqual(['ran', 'never']);
    });

    it('puts a never-started run last when DESCENDING too', () => {
        // Unset is the absence of a value, not a value at one end of the range — so flipping the
        // direction must not promote it to the top. This is the assertion that would have caught the
        // "missing sorts as earliest" bug.
        const rows = [run({ Name: 'never' }), run({ Name: 'ran', StartedAt: EARLY })];
        expect(names(SortWorkflowRuns(rows, 'StartedAt', true, NOW))).toEqual(['ran', 'never']);
    });

    it('breaks a tie between two unset values by name, so the order is stable', () => {
        const rows = [run({ Name: 'b' }), run({ Name: 'a' })];
        expect(names(SortWorkflowRuns(rows, 'CompletedAt', true, NOW))).toEqual(['a', 'b']);
    });

    it('orders by elapsed time, with a never-started run last', () => {
        const rows = [
            run({ Name: 'never' }),
            run({ Name: 'short', StartedAt: EARLY, CompletedAt: new Date(EARLY.getTime() + 1000) }),
            run({ Name: 'long', StartedAt: EARLY, CompletedAt: LATE }),
        ];
        expect(names(SortWorkflowRuns(rows, 'Duration', true, NOW))).toEqual(['long', 'short', 'never']);
    });

    it('sorts text with localeCompare rather than by code point', () => {
        // `'Alpha' < 'beta'` is false by code point — uppercase sorts before all lowercase — so a
        // naive comparison files every capitalised name in its own block.
        const rows = [run({ Name: 'beta' }), run({ Name: 'Alpha' })];
        expect(names(SortWorkflowRuns(rows, 'Name', false, NOW))).toEqual(['Alpha', 'beta']);
    });

    it('does not mutate the source list', () => {
        // The caller reads this from a template getter on every change-detection pass; sorting in
        // place would reorder the source underneath everything else holding it.
        const rows = [run({ Name: 'late', StartedAt: LATE }), run({ Name: 'early', StartedAt: EARLY })];
        SortWorkflowRuns(rows, 'StartedAt', false, NOW);
        expect(names(rows)).toEqual(['late', 'early']);
    });
});

describe('RunElapsedMs', () => {
    it('measures a finished run between its own timestamps', () => {
        expect(RunElapsedMs(run({ Name: 'r', StartedAt: EARLY, CompletedAt: LATE }), NOW)).toBe(7_200_000);
    });

    it('measures an unfinished run up to now, so a running workflow keeps counting', () => {
        expect(RunElapsedMs(run({ Name: 'r', StartedAt: LATE }), NOW)).toBe(3_600_000);
    });

    it('returns null — not zero — for a run that never started', () => {
        // Zero would render as an instant run. "Never started" and "took no time" are different
        // facts and must not collapse into the same cell.
        expect(RunElapsedMs(run({ Name: 'r' }), NOW)).toBeNull();
    });
});
