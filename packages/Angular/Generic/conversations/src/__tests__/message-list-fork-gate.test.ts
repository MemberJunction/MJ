import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MessageListComponent } from '../lib/components/message/message-list.component';

function entry(id: string) {
    return { kind: 'component' as const, ref: { instance: { message: { ID: id }, CanFork: true }, changeDetectorRef: { markForCheck: vi.fn() } } };
}

describe('MessageListComponent.CanFork', () => {
    it('pushes the value into the items on screen and marks them for check', () => {
        const a = entry('A');
        const list = Object.create(MessageListComponent.prototype) as MessageListComponent;
        (list as unknown as Record<string, unknown>)['_renderedMessages'] = new Map<string, unknown>([['A', a], ['X', { kind: 'embedded', ref: {} }]]);

        list.CanFork = false;
        expect(a.ref.instance.CanFork).toBe(false);
        list.CanFork = true;
        expect(a.ref.instance.CanFork).toBe(true);
        expect(a.ref.changeDetectorRef.markForCheck).toHaveBeenCalledTimes(2);
    });

    it('is true until a host sets it', () => {
        expect((Object.create(MessageListComponent.prototype) as MessageListComponent).CanFork).toBe(true);
    });
});
