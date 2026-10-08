import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { MJButtonDirective, MJClickableDirective, MJEmptyStateComponent, MJFilterChipComponent } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, Query, QueryAll } from '@memberjunction/ng-test-utils';
import type { ForkSummary } from '@memberjunction/core-entities';
import { ForksPopoverComponent } from './forks-popover.component';

/** DOM spec for <mj-conversation-forks-popover>: rows, nesting, the two filters, selection and close. */
const NOW = Date.now();
function summary(id: string, over: Partial<ForkSummary>): ForkSummary {
    return {
        Branch: { ID: id, ConversationID: 'c1', ParentBranchID: over.ParentBranchID ?? null, ForkFromSequence: 2 },
        Kind: 'Fork', DisplayName: id, MessageCount: 1, Participants: [], AuthorUserIDs: [], LastActivityAt: new Date(NOW - 60000),
        LastMessagePreview: null, LastMessageAuthorName: null, PlacementDetailID: 'd', AnchorDetailID: 'd', AnchorAuthorName: null,
        AnchorAt: null, StartedByUserID: 'u-other', StartedByName: 'Jordan', ParentBranchID: null,
        ...over,
    };
}
const T1 = summary('T1', { DisplayName: 'Pricing without a free tier', AnchorAuthorName: 'Sage', MessageCount: 4, LastActivityAt: new Date(NOW - 6 * 60000), LastMessagePreview: 'Here is a side-by-side comparison.', LastMessageAuthorName: 'Sage' });
const F1 = summary('F1', { DisplayName: 'Annual plans only', Kind: 'Fork', ParentBranchID: 'T1', StartedByName: 'Priya', MessageCount: 2, LastActivityAt: new Date(NOW - 12 * 60000) });
const E1 = summary('E1', { DisplayName: "Maya's edited version", Kind: 'Edit', StartedByUserID: 'u-me', StartedByName: 'Maya', LastActivityAt: new Date(NOW - 20 * 60000) });

function render(summaries: ForkSummary[]) {
    return RenderComponentFixture(ForksPopoverComponent, {
        imports: [CommonModule, MJButtonDirective, MJClickableDirective, MJEmptyStateComponent, MJFilterChipComponent],
        declarations: [ForksPopoverComponent],
        inputs: { Summaries: summaries, CurrentUserID: 'u-me' },
    });
}

function names(f: ReturnType<typeof render>): string[] {
    return QueryAll(f, '.forks-popover-row .forks-popover-name').map(e => e.textContent?.trim() ?? '');
}

describe('ForksPopoverComponent (DOM)', () => {
    it('lists every fork, newest first, with a nested fork indented under its parent', () => {
        const f = render([E1, F1, T1]);
        expect(names(f)).toEqual(['Pricing without a free tier', 'Annual plans only', "Maya's edited version"]);
        expect(QueryAll(f, '.forks-popover-row')[1].classList.contains('nested')).toBe(true);
    });

    it('shows the preview and the origin line of a row', () => {
        const first = QueryAll(render([T1]), '.forks-popover-row')[0];
        expect(first.querySelector('.forks-popover-preview')?.textContent?.trim()).toBe('Sage: Here is a side-by-side comparison.');
        expect(first.querySelector('.forks-popover-meta')?.textContent?.trim()).toBe("Forked by Jordan · 4 messages · 6 min ago");
    });

    it("filters to the forks the person started or wrote in with Mine", () => {
        const f = render([E1, F1, T1]);
        (QueryAll(f, '.forks-popover-filters button')[1] as HTMLButtonElement).click();
        f.detectChanges();
        expect(names(f)).toEqual(["Maya's edited version"]);
    });

    it('makes the filters toggle buttons that show which one is on', () => {
        const f = render([E1, F1, T1]);
        const pressed = () => QueryAll(f, '.forks-popover-filters button').map(b => b.getAttribute('aria-pressed'));
        expect(pressed()).toEqual(['true', 'false']);
        expect(Query(f, '[role="tablist"], [role="tab"]')).toBeNull();

        (QueryAll(f, '.forks-popover-filters button')[1] as HTMLButtonElement).click();
        f.detectChanges();
        expect(pressed()).toEqual(['false', 'true']);
    });

    it('emits the fork of a clicked row, and Closed from the close button', () => {
        const f = render([E1, F1, T1]);
        const selected: string[] = [];
        f.componentInstance.ForkSelected.subscribe((id: string) => selected.push(id));
        const closed = vi.fn();
        f.componentInstance.Closed.subscribe(closed);

        (QueryAll(f, '.forks-popover-row')[1] as HTMLElement).click();
        (Query(f, '.forks-popover-close') as HTMLButtonElement).click();

        expect(selected).toEqual(['F1']);
        expect(closed).toHaveBeenCalledOnce();
    });

    it('shows an empty state when no fork matches', () => {
        const empty = Query(render([]), 'mj-empty-state');
        expect(empty).not.toBeNull();
        expect(empty?.textContent).toContain('No forks yet');
    });

    it('names the list Forks, with the filters All and Mine, and an empty Mine list says so', () => {
        const f = render([F1]);
        expect(Query(f, '.forks-popover-title')?.textContent?.trim()).toBe('Forks');
        expect(QueryAll(f, '.forks-popover-filters button').map(b => b.textContent?.trim())).toEqual(['All', 'Mine']);
        expect(Query(f, '.forks-popover-filters')?.getAttribute('aria-label')).toBe('Filter forks');

        (QueryAll(f, '.forks-popover-filters button')[1] as HTMLButtonElement).click();
        f.detectChanges();
        expect(Query(f, 'mj-empty-state')?.textContent).toContain('No forks you started or wrote in');
    });

    it('makes each row a named button reachable with the keyboard', () => {
        const f = render([T1]);
        const selected: string[] = [];
        f.componentInstance.ForkSelected.subscribe((id: string) => selected.push(id));
        const row = QueryAll(f, '.forks-popover-row')[0] as HTMLElement;

        expect(row.getAttribute('role')).toBe('button');
        expect(row.getAttribute('tabindex')).toBe('0');
        expect(row.getAttribute('aria-label')).toBe("Open fork Pricing without a free tier, Forked by Jordan · 4 messages · 6 min ago");
        row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(selected).toEqual(['T1']);
    });

    it('takes focus when it opens, and emits Closed on Escape without passing Escape to the page', () => {
        const f = render([T1]);
        const panel = Query(f, '.forks-popover') as HTMLElement;
        expect(document.activeElement).toBe(panel);
        const closed = vi.fn();
        f.componentInstance.Closed.subscribe(closed);
        const pageKeydown = vi.fn();
        document.addEventListener('keydown', pageKeydown);
        try {
            (QueryAll(f, '.forks-popover-row')[0] as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        } finally {
            document.removeEventListener('keydown', pageKeydown);
        }

        expect(closed).toHaveBeenCalledOnce();
        expect(pageKeydown).not.toHaveBeenCalled();
    });

    it('is a dialog with the id the opener points at', () => {
        const f = RenderComponentFixture(ForksPopoverComponent, {
            imports: [CommonModule, MJButtonDirective, MJClickableDirective, MJEmptyStateComponent, MJFilterChipComponent],
            declarations: [ForksPopoverComponent],
            inputs: { Summaries: [T1], CurrentUserID: 'u-me', PanelID: 'forks-popover-7' },
        });
        const panel = Query(f, '.forks-popover') as HTMLElement;
        expect(panel.getAttribute('role')).toBe('dialog');
        expect(panel.id).toBe('forks-popover-7');
        expect(panel.getAttribute('aria-label')).toBe('Forks in this conversation');
    });
});
