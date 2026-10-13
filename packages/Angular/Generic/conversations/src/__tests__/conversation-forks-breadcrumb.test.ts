import { describe, it, expect } from 'vitest';
import {
    BackLabelOf,
    BuildForkBreadcrumbs,
    ForkChainOf,
    MAIN_OPEN_VIEW,
    ParentForkIdOf,
    type ConversationOpenView,
    type ForkChainRow,
} from '../lib/utils/conversation-forks';

/** Main → A → B, and C straight under Main. */
const ROWS: ForkChainRow[] = [
    { ID: 'A', ParentBranchID: null },
    { ID: 'B', ParentBranchID: 'A' },
    { ID: 'C', ParentBranchID: null },
];
const LABELS: Record<string, string> = { A: 'Pricing ideas', B: 'Annual plans only', C: 'Other answer' };
const label = (id: string) => LABELS[id.toUpperCase()] ?? 'Fork';

const FORK_B: ConversationOpenView = { Kind: 'Fork', BranchID: 'B' };
const DRAFT_UNDER_A: ConversationOpenView = { Kind: 'DraftFork', ParentBranchID: 'A', ForkFromSequence: 12, AnchorDetailID: 'D-12', SourceDetailID: 'D-13' };

describe('ParentForkIdOf', () => {
    it("goes up to a fork's parent fork, else Main", () => {
        expect(ParentForkIdOf(FORK_B, ROWS)).toBe('A');
        expect(ParentForkIdOf({ Kind: 'Fork', BranchID: 'a' }, ROWS)).toBeNull();
        expect(ParentForkIdOf({ Kind: 'Fork', BranchID: 'UNKNOWN' }, ROWS)).toBeNull();
        expect(ParentForkIdOf(MAIN_OPEN_VIEW, ROWS)).toBeNull();
    });

    it('sends a draft back to the fork it started from, else Main', () => {
        expect(ParentForkIdOf(DRAFT_UNDER_A, ROWS)).toBe('A');
        expect(ParentForkIdOf({ ...DRAFT_UNDER_A, ParentBranchID: null }, ROWS)).toBeNull();
    });
});

describe('ForkChainOf', () => {
    it('lists the chain from the fork under Main down to the fork', () => {
        expect(ForkChainOf('B', ROWS)).toEqual(['A', 'B']);
        expect(ForkChainOf('b', ROWS)).toEqual(['A', 'b']);
        expect(ForkChainOf(null, ROWS)).toEqual([]);
    });

    it('stops at a fork whose row is not known and at a loop', () => {
        expect(ForkChainOf('B', [{ ID: 'B', ParentBranchID: 'A' }])).toEqual(['A', 'B']);
        expect(ForkChainOf('X', [{ ID: 'X', ParentBranchID: 'Y' }, { ID: 'Y', ParentBranchID: 'x' }])).toEqual(['Y', 'X']);
    });
});

describe('BuildForkBreadcrumbs', () => {
    it('shows every fork of the chain: conversation › A › B, only the last current', () => {
        expect(BuildForkBreadcrumbs(FORK_B, 'Launch plan', ROWS, label)).toEqual([
            { BranchID: null, Label: 'Launch plan', IsCurrent: false },
            { BranchID: 'A', Label: 'Pricing ideas', IsCurrent: false },
            { BranchID: 'B', Label: 'Annual plans only', IsCurrent: true },
        ]);
    });

    it('shows conversation › fork for a fork under Main', () => {
        expect(BuildForkBreadcrumbs({ Kind: 'Fork', BranchID: 'C' }, 'Launch plan', ROWS, label)).toEqual([
            { BranchID: null, Label: 'Launch plan', IsCurrent: false },
            { BranchID: 'C', Label: 'Other answer', IsCurrent: true },
        ]);
    });

    it('ends a draft under A with "New fork"', () => {
        expect(BuildForkBreadcrumbs(DRAFT_UNDER_A, 'Launch plan', ROWS, label)).toEqual([
            { BranchID: null, Label: 'Launch plan', IsCurrent: false },
            { BranchID: 'A', Label: 'Pricing ideas', IsCurrent: false },
            { BranchID: null, Label: 'New fork', IsCurrent: true },
        ]);
        expect(BuildForkBreadcrumbs({ ...DRAFT_UNDER_A, ParentBranchID: null }, 'Launch plan', ROWS, label).map(c => c.Label)).toEqual(['Launch plan', 'New fork']);
    });

    it('is empty in Main', () => {
        expect(BuildForkBreadcrumbs(MAIN_OPEN_VIEW, 'Launch plan', ROWS, label)).toEqual([]);
    });
});

describe('BackLabelOf', () => {
    it('names the parent fork, else Main', () => {
        expect(BackLabelOf('Pricing ideas')).toBe('Back to Pricing ideas');
        expect(BackLabelOf(null)).toBe('Back to Main');
    });
});
