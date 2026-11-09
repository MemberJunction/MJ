import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MessageListComponent } from '../lib/components/message/message-list.component';
import type { ForkViewLayout, LatestTurn } from '../lib/utils/conversation-forks';

type Row = { message: { ID: string }; EditOpenElsewhere: boolean; PendingReplace: boolean; InPlaceRole: string | null };

/** A list built off the prototype with three rendered rows: an older answer, the latest user message U and its answer A. */
function createList(turn: LatestTurn | null) {
    const list = Object.create(MessageListComponent.prototype) as MessageListComponent;
    const open = list as unknown as Record<string, unknown>;
    const rows = new Map<string, Row>();
    const rendered = new Map<string, { kind: 'component'; ref: { instance: Row; changeDetectorRef: { markForCheck: () => void } } }>();
    for (const id of ['OLD', 'U', 'A']) {
        const row: Row = { message: { ID: id }, EditOpenElsewhere: false, PendingReplace: false, InPlaceRole: null };
        rows.set(id, row);
        rendered.set(id, { kind: 'component', ref: { instance: row, changeDetectorRef: { markForCheck: vi.fn() } } });
    }
    Object.assign(open, { _renderedMessages: rendered, _inPlaceTurn: turn, editingDetailId: null });
    const editing = (id: string, isOpen: boolean): void =>
        (open['onRowEditingChanged'] as (id: string, open: boolean) => void).call(list, id, isOpen);
    return { list, open, rows, editing };
}

describe('MessageListComponent edit state', () => {
    it('hides the other rows\' footers while a row is edited, and shows them again when it closes', () => {
        const h = createList(null);
        h.editing('U', true);
        expect([...h.rows.values()].map(r => [r.message.ID, r.EditOpenElsewhere])).toEqual([['OLD', true], ['U', false], ['A', true]]);
        h.editing('U', false);
        expect([...h.rows.values()].every(r => !r.EditOpenElsewhere)).toBe(true);
    });

    it('dims the latest answer while its user message is edited with "Save and resend"', () => {
        const h = createList({ UserDetailID: 'U', AnswerDetailID: 'A' });
        h.editing('U', true);
        expect(h.rows.get('A')?.PendingReplace).toBe(true);
        expect(h.rows.get('OLD')?.PendingReplace).toBe(false);
        h.editing('U', false);
        expect(h.rows.get('A')?.PendingReplace).toBe(false);
    });

    it('dims nothing while forking is on (no in-place turn) or while another row is edited', () => {
        const forking = createList(null);
        forking.editing('U', true);
        expect(forking.rows.get('A')?.PendingReplace).toBe(false);

        const other = createList({ UserDetailID: 'U', AnswerDetailID: 'A' });
        other.editing('OLD', true);
        expect(other.rows.get('A')?.PendingReplace).toBe(false);
    });

    it('ignores a close from a row that is not the one being edited', () => {
        const h = createList(null);
        h.editing('U', true);
        h.editing('OLD', false);
        expect(h.rows.get('A')?.EditOpenElsewhere).toBe(true);
    });
});

describe('MessageListComponent empty view marker', () => {
    function withLayout(layout: ForkViewLayout | null): MessageListComponent {
        const list = Object.create(MessageListComponent.prototype) as MessageListComponent;
        (list as unknown as Record<string, unknown>)['_forkLayout'] = layout;
        return list;
    }

    it('shows a draft\'s marker on its own when no row carries it', () => {
        const text = 'New fork · nothing is saved until you send';
        expect(withLayout({ InheritedIDs: new Set(), MarkerDetailID: null, MarkerText: text }).EmptyViewMarkerText).toBe(text);
    });

    it('shows none in Main or when the marker sits under a row', () => {
        expect(withLayout(null).EmptyViewMarkerText).toBeNull();
        expect(withLayout({ InheritedIDs: new Set(['d1']), MarkerDetailID: 'D1', MarkerText: 'marker' }).EmptyViewMarkerText).toBeNull();
    });
});
