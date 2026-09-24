/**
 * Pins which dashboards a drop moves: the loaded dashboards whose IDs were dragged, in the
 * browser's own `Dashboards` order, matched case-insensitively (SQL Server returns upper-case
 * UUIDs, PostgreSQL lower-case; see guides/UUID_COMPARISON_GUIDE.md).
 *
 * The drop handlers used to run a nested `UUIDsEqual` scan (dashboards × dragged IDs). They now
 * each build a normalized ID Set once; these specs hold the emitted `DashboardMove` steady across that.
 *
 * Constructed directly: the constructor takes only a change detector, and the behaviour under
 * test is what one handler emits.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { DashboardBrowserComponent, type DashboardMoveEvent } from './dashboard-browser.component';

/** The handlers under test only ever call markForCheck; the double is checked against the members it claims. */
const cdrStub = { detectChanges: () => undefined, markForCheck: () => undefined } satisfies Pick<ChangeDetectorRef, 'detectChanges' | 'markForCheck'> as unknown as ChangeDetectorRef;

const SALES = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OPS = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const HR = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TARGET = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

/** Only ID and Name are read by the handlers under test. */
const dashboard = (id: string, name: string): MJDashboardEntity => ({ ID: id, Name: name }) as unknown as MJDashboardEntity;

/** A drop event whose dataTransfer carries the browser's own drag payload. */
function dropEvent(ids: string[]): DragEvent {
    const payload = JSON.stringify({ type: 'dashboards', ids });
    return {
        preventDefault: () => undefined,
        dataTransfer: { getData: (format: string) => (format === 'application/json' ? payload : '') },
    } as unknown as DragEvent;
}

describe('DashboardBrowserComponent drops', () => {
    let browser: DashboardBrowserComponent;
    let moves: DashboardMoveEvent[];

    beforeEach(() => {
        browser = new DashboardBrowserComponent(cdrStub);
        browser.AllowDragDrop = true;
        browser.Dashboards = [dashboard(SALES, 'Sales'), dashboard(OPS, 'Ops'), dashboard(HR, 'HR')];
        moves = [];
        browser.DashboardMove.subscribe((m) => moves.push(m));
    });

    describe('OnDropOnCategory', () => {
        it('moves exactly the dragged dashboards, in Dashboards order, matching IDs case-insensitively', () => {
            browser.OnDropOnCategory(TARGET, dropEvent([HR.toUpperCase(), SALES]));
            expect(moves).toHaveLength(1);
            expect(moves[0].Dashboards.map((d) => d.Name)).toEqual(['Sales', 'HR']);
            expect(moves[0].TargetCategoryId).toBe(TARGET);
        });

        it('emits nothing when no dragged ID is a loaded dashboard', () => {
            browser.OnDropOnCategory(TARGET, dropEvent(['eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee']));
            expect(moves).toEqual([]);
        });
    });

    describe('OnBreadcrumbDrop', () => {
        it('moves exactly the dropped dashboards, in Dashboards order, to the target category', () => {
            browser.OnBreadcrumbDrop({ TargetCategoryId: null, DashboardIds: [OPS.toUpperCase(), 'not-loaded', SALES] });
            expect(moves).toHaveLength(1);
            expect(moves[0].Dashboards.map((d) => d.Name)).toEqual(['Sales', 'Ops']);
            expect(moves[0].TargetCategoryId).toBeNull();
        });

        it('emits nothing for an empty drop', () => {
            browser.OnBreadcrumbDrop({ TargetCategoryId: TARGET, DashboardIds: [] });
            expect(moves).toEqual([]);
        });
    });
});
