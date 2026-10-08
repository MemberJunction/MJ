import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MessageListComponent } from '../lib/components/message/message-list.component';

function entry(id: string) {
    return { kind: 'component' as const, ref: { instance: { message: { ID: id }, ForkRail: null as string | null, ForkMarkerText: null as string | null }, changeDetectorRef: { markForCheck: vi.fn() } } };
}

describe('MessageListComponent.ForkLayout', () => {
    it('stamps rails and the fork marker on the rendered items, and clears them for Main', () => {
        const inherited = entry('D3');
        const own = entry('A');
        const list = Object.create(MessageListComponent.prototype) as MessageListComponent;
        (list as unknown as Record<string, unknown>)['_renderedMessages'] = new Map<string, unknown>([['D3', inherited], ['A', own]]);

        list.ForkLayout = { InheritedIDs: new Set(['d3']), MarkerDetailID: 'D3', MarkerText: 'marker' };
        expect(inherited.ref.instance).toMatchObject({ ForkRail: 'Inherited', ForkMarkerText: 'marker' });
        expect(own.ref.instance).toMatchObject({ ForkRail: 'Own', ForkMarkerText: null });

        list.ForkLayout = null;
        expect(inherited.ref.instance).toMatchObject({ ForkRail: null, ForkMarkerText: null });
        expect(own.ref.changeDetectorRef.markForCheck).toHaveBeenCalledTimes(2);
    });
});

describe('MessageListComponent date header in a fork view', () => {
    it('shows the date header while older rows remain above, even with few rows loaded', () => {
        const list = Object.create(MessageListComponent.prototype) as MessageListComponent;
        Object.assign(list as unknown as Record<string, unknown>, { _renderedMessages: new Map(), messages: [], syncOlderObserver: vi.fn() });
        list.ForkLayout = { InheritedIDs: new Set(['d3']), MarkerDetailID: 'D3', MarkerText: 'marker' };

        list.HasMoreAbove = true;
        expect(list.ShouldShowDateFilter).toBe(true);

        list.HasMoreAbove = false;
        expect(list.ShouldShowDateFilter).toBe(false);
    });
});
