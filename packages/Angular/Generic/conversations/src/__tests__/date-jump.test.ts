import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MessageListComponent } from '../lib/components/message/message-list.component';
import {
    ResolveDateJumpTarget,
    ResolveDateJumpCutoff,
    DescribeDateJumpOutcome,
    DATE_JUMP_MAX_PAGES,
    CombineDateJumpOutcome
} from '../lib/utils/date-jump';

const NOW = new Date(2026, 7, 17, 14, 30); // 2026-08-17 14:30 local

function detail(id: string, daysAgo: number, hour = 12) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), hour);
    d.setDate(d.getDate() - daysAgo);
    return { ID: id, __mj_CreatedAt: d, AgentSessionID: null } as never;
}

describe('ResolveDateJumpCutoff', () => {
    it('today is local midnight', () => {
        const c = ResolveDateJumpCutoff('today', NOW);
        expect(c.getHours()).toBe(0);
        expect(c.getDate()).toBe(NOW.getDate());
    });

    it('reaches progressively further back', () => {
        const t = ResolveDateJumpCutoff('today', NOW).getTime();
        const y = ResolveDateJumpCutoff('yesterday', NOW).getTime();
        const w = ResolveDateJumpCutoff('last-week', NOW).getTime();
        const m = ResolveDateJumpCutoff('last-month', NOW).getTime();
        expect(y).toBeLessThan(t);
        expect(w).toBeLessThan(y);
        expect(m).toBeLessThan(w);
    });
});

describe('ResolveDateJumpTarget', () => {
    it('empty input needs older and has no target', () => {
        const r = ResolveDateJumpTarget([], 'today', NOW);
        expect(r.Detail).toBeNull();
        expect(r.NeedsOlder).toBe(true);
    });

    it('picks the OLDEST message at or after the cutoff, not the newest', () => {
        const rows = [detail('old', 10), detail('first-today', 0, 9), detail('later-today', 0, 13)];
        const r = ResolveDateJumpTarget(rows, 'today', NOW);
        expect((r.Detail as unknown as { ID: string }).ID).toBe('first-today');
    });

    it('does not need older pages once a pre-cutoff message is loaded', () => {
        const rows = [detail('old', 10), detail('today', 0)];
        expect(ResolveDateJumpTarget(rows, 'today', NOW).NeedsOlder).toBe(false);
    });

    it('needs older pages when every loaded row is in-period', () => {
        const rows = [detail('a', 0, 9), detail('b', 0, 13)];
        const r = ResolveDateJumpTarget(rows, 'today', NOW);
        expect(r.Detail).not.toBeNull();
        expect(r.NeedsOlder).toBe(true);   // an earlier in-period message may sit below the window
    });

    it('no in-period message but older history loaded => settled miss, no paging', () => {
        const rows = [detail('a', 40), detail('b', 35)];
        const r = ResolveDateJumpTarget(rows, 'today', NOW);
        expect(r.Detail).toBeNull();
        expect(r.NeedsOlder).toBe(false);
    });

    it('last-week includes a 3-day-old message and excludes a 30-day-old one', () => {
        const rows = [detail('month', 30), detail('recent', 3)];
        const r = ResolveDateJumpTarget(rows, 'last-week', NOW);
        expect((r.Detail as unknown as { ID: string }).ID).toBe('recent');
    });

    it('skips rows with a missing or invalid timestamp rather than treating them as epoch', () => {
        const rows = [
            { ID: 'no-date', __mj_CreatedAt: null, AgentSessionID: null } as never,
            { ID: 'bad-date', __mj_CreatedAt: 'not-a-date', AgentSessionID: null } as never,
            detail('good', 0)
        ];
        const r = ResolveDateJumpTarget(rows, 'today', NOW);
        expect((r.Detail as unknown as { ID: string }).ID).toBe('good');
    });

    it('accepts an ISO string timestamp as well as a Date', () => {
        const iso = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 10).toISOString();
        const rows = [{ ID: 'iso', __mj_CreatedAt: iso, AgentSessionID: null } as never];
        expect(ResolveDateJumpTarget(rows, 'today', NOW).Detail).not.toBeNull();
    });
});

describe('DescribeDateJumpOutcome', () => {
    it('never returns an empty string for any outcome', () => {
        for (const o of ['reached', 'oldest', 'capped', 'empty'] as const) {
            expect(DescribeDateJumpOutcome(o, 'last-week').length).toBeGreaterThan(0);
        }
    });

    it('names the page cap so a capped jump is explainable', () => {
        expect(DescribeDateJumpOutcome('capped', 'today')).toContain(String(DATE_JUMP_MAX_PAGES));
    });
});

// ---------------------------------------------------------------------------
// Date-navigator visibility gate.
//
// The gate decides whether the jump is reachable at all, so it belongs with the jump's own
// tests. Class-level via Object.create for the same reason the windowing suite uses it: the
// logic is pure over `messages` + `HasMoreAbove`, and TestBed would buy nothing here.
// ---------------------------------------------------------------------------
describe('date navigator visibility under windowing', () => {
    function gateWith(messageCount: number, hasMoreAbove: boolean, daysSpanned = 5): boolean {
        const component = Object.create(MessageListComponent.prototype) as MessageListComponent;
        const open = component as unknown as Record<string, unknown>;
        open['_hasMoreAbove'] = hasMoreAbove;
        open['messages'] = Array.from({ length: messageCount }, (_, i) =>
            detail(`m${i}`, i % daysSpanned)
        );
        open['shouldShowDateFilter'] = false;
        (component as unknown as { updateDateFilterVisibility(): void })['updateDateFilterVisibility']();
        return component.shouldShowDateFilter;
    }

    it('shows on a short window when older history exists — the windowing case', () => {
        // The regression this guards: a long multi-week thread opens with ~10 loaded items,
        // fails the 20-message heuristic, and silently offers no date navigation.
        expect(gateWith(10, true)).toBe(true);
    });

    it('still hides for a genuinely short conversation with nothing above', () => {
        expect(gateWith(10, false)).toBe(false);
    });

    it('falls back to the 20-message heuristic when history is fully loaded', () => {
        expect(gateWith(25, false)).toBe(true);
    });

    it('hides a fully-loaded long conversation that spans too few days', () => {
        expect(gateWith(25, false, 1)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Scroll-ownership host class.
//
// Gates whether the date navigator can be CLICKED: it drops `overflow-y` on the list's own
// container so a `position: sticky` header binds to the host's real scroller instead of a
// container that never moves. Asserted on the input rather than in CSS because the risk being
// guarded is behavioral — dropping overflow for a consumer with no scrolling ancestor would
// leave the transcript unable to scroll or page.
// ---------------------------------------------------------------------------
describe('scroll-ownership host class', () => {
    function componentWithScrollRoot(root: HTMLElement | null): MessageListComponent {
        const component = Object.create(MessageListComponent.prototype) as MessageListComponent;
        (component as unknown as Record<string, unknown>)['_scrollRoot'] = root;
        return component;
    }

    it('claims host-owned scrolling when a ScrollRoot was supplied', () => {
        expect(componentWithScrollRoot({} as HTMLElement).HostSuppliesScroller).toBe(true);
    });

    it('does NOT claim it when no ScrollRoot was supplied', () => {
        // The fallback consumer: this component must keep scrolling itself, or the sentinel
        // has no root and older pages stop loading entirely.
        expect(componentWithScrollRoot(null).HostSuppliesScroller).toBe(false);
    });
});

describe('CombineDateJumpOutcome', () => {
    it('a successful scroll wins even when paging ran out of history', () => {
        // The reported bug: a conversation whose oldest message is itself in-period never
        // sees a pre-cutoff row, so the loop stops on "no more history" — and used to report
        // "no messages from yesterday" while having just scrolled to one.
        expect(CombineDateJumpOutcome('reached', false)).toBe('reached');
    });

    it('a successful scroll wins even when the page cap was hit', () => {
        expect(CombineDateJumpOutcome('reached', true)).toBe('reached');
    });

    it('reports the cap only when the scroll did not reach', () => {
        expect(CombineDateJumpOutcome('oldest', true)).toBe('capped');
    });

    it('passes a genuine miss through untouched', () => {
        expect(CombineDateJumpOutcome('oldest', false)).toBe('oldest');
        expect(CombineDateJumpOutcome('empty', false)).toBe('empty');
    });
});
