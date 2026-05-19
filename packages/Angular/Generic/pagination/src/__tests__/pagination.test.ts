import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * We test PaginationComponent as a plain TypeScript class.
 * Angular decorators are no-ops at test time; we only exercise the pure logic.
 */

// Minimal stub so the @Component / @Input / @Output decorators don't explode at import time.
vi.mock('@angular/core', () => ({
    Component: () => () => {},
    Input: () => () => {},
    Output: () => () => {},
    EventEmitter: class<T = unknown> {
        private listeners: ((value: T) => void)[] = [];
        emit(value: T): void {
            for (const fn of this.listeners) fn(value);
        }
        subscribe(fn: (value: T) => void): { unsubscribe: () => void } {
            this.listeners.push(fn);
            return { unsubscribe: () => { this.listeners = this.listeners.filter(l => l !== fn); } };
        }
    },
}));
vi.mock('@angular/common', () => ({ CommonModule: {} }));

import { PaginationComponent, PageChangeEvent } from '../lib/pagination.component';

function createComponent(overrides: Partial<Pick<PaginationComponent, 'TotalRowCount' | 'PageNumber' | 'PageSize' | 'IsLoading'>> = {}): PaginationComponent {
    const c = new PaginationComponent();
    if (overrides.TotalRowCount !== undefined) c.TotalRowCount = overrides.TotalRowCount;
    if (overrides.PageNumber !== undefined) c.PageNumber = overrides.PageNumber;
    if (overrides.PageSize !== undefined) c.PageSize = overrides.PageSize;
    if (overrides.IsLoading !== undefined) c.IsLoading = overrides.IsLoading;
    return c;
}

describe('PaginationComponent', () => {
    // ------------------------------------------------------------------ TotalPages
    describe('TotalPages', () => {
        it('returns 0 when TotalRowCount is 0', () => {
            const c = createComponent({ TotalRowCount: 0, PageSize: 10 });
            expect(c.TotalPages).toBe(0);
        });

        it('returns 0 when TotalRowCount is negative', () => {
            const c = createComponent({ TotalRowCount: -5, PageSize: 10 });
            expect(c.TotalPages).toBe(0);
        });

        it('returns 0 when PageSize is 0', () => {
            const c = createComponent({ TotalRowCount: 50, PageSize: 0 });
            expect(c.TotalPages).toBe(0);
        });

        it('returns 0 when PageSize is negative', () => {
            const c = createComponent({ TotalRowCount: 50, PageSize: -1 });
            expect(c.TotalPages).toBe(0);
        });

        it('returns 1 when rows fit exactly in one page', () => {
            const c = createComponent({ TotalRowCount: 10, PageSize: 10 });
            expect(c.TotalPages).toBe(1);
        });

        it('rounds up for partial last page', () => {
            const c = createComponent({ TotalRowCount: 11, PageSize: 10 });
            expect(c.TotalPages).toBe(2);
        });

        it('handles large datasets', () => {
            const c = createComponent({ TotalRowCount: 1_000_000, PageSize: 100 });
            expect(c.TotalPages).toBe(10_000);
        });

        it('handles PageSize=1', () => {
            const c = createComponent({ TotalRowCount: 5, PageSize: 1 });
            expect(c.TotalPages).toBe(5);
        });

        it('handles single row with default PageSize', () => {
            const c = createComponent({ TotalRowCount: 1 });
            expect(c.TotalPages).toBe(1);
        });
    });

    // ---------------------------------------------------------- DisplayFrom / DisplayTo
    describe('DisplayFrom', () => {
        it('returns 0 when TotalRowCount is 0', () => {
            const c = createComponent({ TotalRowCount: 0 });
            expect(c.DisplayFrom).toBe(0);
        });

        it('returns 1 on the first page', () => {
            const c = createComponent({ TotalRowCount: 50, PageNumber: 1, PageSize: 10 });
            expect(c.DisplayFrom).toBe(1);
        });

        it('returns correct start for second page', () => {
            const c = createComponent({ TotalRowCount: 50, PageNumber: 2, PageSize: 10 });
            expect(c.DisplayFrom).toBe(11);
        });

        it('returns correct start for last page', () => {
            const c = createComponent({ TotalRowCount: 25, PageNumber: 3, PageSize: 10 });
            expect(c.DisplayFrom).toBe(21);
        });
    });

    describe('DisplayTo', () => {
        it('returns 0 when TotalRowCount is 0', () => {
            const c = createComponent({ TotalRowCount: 0, PageSize: 10 });
            expect(c.DisplayTo).toBe(0);
        });

        it('caps at TotalRowCount on last partial page', () => {
            const c = createComponent({ TotalRowCount: 25, PageNumber: 3, PageSize: 10 });
            expect(c.DisplayTo).toBe(25);
        });

        it('equals PageSize * PageNumber on a full page', () => {
            const c = createComponent({ TotalRowCount: 50, PageNumber: 2, PageSize: 10 });
            expect(c.DisplayTo).toBe(20);
        });

        it('equals TotalRowCount on single-page dataset', () => {
            const c = createComponent({ TotalRowCount: 7, PageNumber: 1, PageSize: 10 });
            expect(c.DisplayTo).toBe(7);
        });
    });

    // -------------------------------------------------------- CanGoBack / CanGoForward
    describe('CanGoBack', () => {
        it('returns false on first page', () => {
            const c = createComponent({ TotalRowCount: 50, PageNumber: 1 });
            expect(c.CanGoBack).toBe(false);
        });

        it('returns true on page > 1', () => {
            const c = createComponent({ TotalRowCount: 50, PageNumber: 2, PageSize: 10 });
            expect(c.CanGoBack).toBe(true);
        });

        it('returns false when IsLoading even on page > 1', () => {
            const c = createComponent({ TotalRowCount: 50, PageNumber: 2, PageSize: 10, IsLoading: true });
            expect(c.CanGoBack).toBe(false);
        });
    });

    describe('CanGoForward', () => {
        it('returns false on last page', () => {
            const c = createComponent({ TotalRowCount: 20, PageNumber: 2, PageSize: 10 });
            expect(c.CanGoForward).toBe(false);
        });

        it('returns true when not on last page', () => {
            const c = createComponent({ TotalRowCount: 30, PageNumber: 2, PageSize: 10 });
            expect(c.CanGoForward).toBe(true);
        });

        it('returns false when IsLoading even if not on last page', () => {
            const c = createComponent({ TotalRowCount: 30, PageNumber: 1, PageSize: 10, IsLoading: true });
            expect(c.CanGoForward).toBe(false);
        });

        it('returns false when TotalRowCount is 0', () => {
            const c = createComponent({ TotalRowCount: 0, PageNumber: 1, PageSize: 10 });
            expect(c.CanGoForward).toBe(false);
        });

        it('returns false on single-page dataset', () => {
            const c = createComponent({ TotalRowCount: 5, PageNumber: 1, PageSize: 10 });
            expect(c.CanGoForward).toBe(false);
        });
    });

    // ----------------------------------------------------------------- Navigation
    describe('Navigation methods', () => {
        let comp: PaginationComponent;
        let emitted: PageChangeEvent[];

        beforeEach(() => {
            comp = createComponent({ TotalRowCount: 50, PageNumber: 3, PageSize: 10 });
            emitted = [];
            comp.PageChange.subscribe((e: PageChangeEvent) => emitted.push(e));
        });

        describe('GoToFirst', () => {
            it('emits page 1 when CanGoBack is true', () => {
                comp.GoToFirst();
                expect(emitted).toHaveLength(1);
                expect(emitted[0]).toEqual({ PageNumber: 1, PageSize: 10, StartRow: 0 });
            });

            it('does nothing on page 1', () => {
                comp.PageNumber = 1;
                comp.GoToFirst();
                expect(emitted).toHaveLength(0);
            });
        });

        describe('GoToPrevious', () => {
            it('emits previous page', () => {
                comp.GoToPrevious();
                expect(emitted).toHaveLength(1);
                expect(emitted[0]).toEqual({ PageNumber: 2, PageSize: 10, StartRow: 10 });
            });

            it('does nothing on page 1', () => {
                comp.PageNumber = 1;
                comp.GoToPrevious();
                expect(emitted).toHaveLength(0);
            });
        });

        describe('GoToNext', () => {
            it('emits next page', () => {
                comp.GoToNext();
                expect(emitted).toHaveLength(1);
                expect(emitted[0]).toEqual({ PageNumber: 4, PageSize: 10, StartRow: 30 });
            });

            it('does nothing on last page', () => {
                comp.PageNumber = 5; // last page of 50/10
                comp.GoToNext();
                expect(emitted).toHaveLength(0);
            });
        });

        describe('GoToLast', () => {
            it('emits last page', () => {
                comp.GoToLast();
                expect(emitted).toHaveLength(1);
                expect(emitted[0]).toEqual({ PageNumber: 5, PageSize: 10, StartRow: 40 });
            });

            it('does nothing when already on last page', () => {
                comp.PageNumber = 5;
                comp.GoToLast();
                expect(emitted).toHaveLength(0);
            });
        });
    });

    // ------------------------------------------------------------ PageChangeEvent shape
    describe('PageChangeEvent', () => {
        it('StartRow is always (PageNumber - 1) * PageSize', () => {
            const comp = createComponent({ TotalRowCount: 500, PageNumber: 1, PageSize: 25 });
            const events: PageChangeEvent[] = [];
            comp.PageChange.subscribe((e: PageChangeEvent) => events.push(e));

            comp.GoToNext(); // page 2
            expect(events[0].StartRow).toBe(25);

            comp.PageNumber = 10;
            comp.GoToNext(); // page 11
            expect(events[1].StartRow).toBe(250);
        });

        it('carries the current PageSize', () => {
            const comp = createComponent({ TotalRowCount: 100, PageNumber: 1, PageSize: 42 });
            const events: PageChangeEvent[] = [];
            comp.PageChange.subscribe((e: PageChangeEvent) => events.push(e));

            comp.GoToNext();
            expect(events[0].PageSize).toBe(42);
        });
    });

    // ----------------------------------------------------------------- Edge cases
    describe('Edge cases', () => {
        it('does not emit when IsLoading blocks all navigation', () => {
            const comp = createComponent({ TotalRowCount: 100, PageNumber: 3, PageSize: 10, IsLoading: true });
            const events: PageChangeEvent[] = [];
            comp.PageChange.subscribe((e: PageChangeEvent) => events.push(e));

            comp.GoToFirst();
            comp.GoToPrevious();
            comp.GoToNext();
            comp.GoToLast();
            expect(events).toHaveLength(0);
        });

        it('handles PageSize=1 navigation correctly', () => {
            const comp = createComponent({ TotalRowCount: 3, PageNumber: 2, PageSize: 1 });
            expect(comp.TotalPages).toBe(3);
            expect(comp.DisplayFrom).toBe(2);
            expect(comp.DisplayTo).toBe(2);
            expect(comp.CanGoBack).toBe(true);
            expect(comp.CanGoForward).toBe(true);
        });

        it('works with very large PageSize', () => {
            const comp = createComponent({ TotalRowCount: 5, PageNumber: 1, PageSize: 10000 });
            expect(comp.TotalPages).toBe(1);
            expect(comp.DisplayFrom).toBe(1);
            expect(comp.DisplayTo).toBe(5);
            expect(comp.CanGoForward).toBe(false);
        });
    });
});
