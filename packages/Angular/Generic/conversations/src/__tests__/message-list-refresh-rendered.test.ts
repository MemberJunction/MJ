/**
 * @fileoverview MessageListComponent.RefreshRenderedMessage — refreshing one rendered message
 * in place for a streamed delta, plus the `mj-streaming` host class that lifts the item's
 * status-line height cap while streamed text is shown and comes off once the message settles.
 * Instantiated via the prototype with a hand-built rendered-entry map.
 */
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MessageListComponent } from '../lib/components/message/message-list.component';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

class FakeClassList {
    private readonly classes = new Set<string>();
    add(name: string): void { this.classes.add(name); }
    remove(name: string): void { this.classes.delete(name); }
    contains(name: string): boolean { return this.classes.has(name); }
}

interface ComponentEntry {
    kind: 'component';
    ref: {
        instance: { message: MJConversationDetailEntity | null };
        changeDetectorRef: { detectChanges: ReturnType<typeof vi.fn>; destroyed: boolean };
        location: { nativeElement: { classList: FakeClassList } };
    };
}

function detail(status = 'In-Progress'): MJConversationDetailEntity {
    return { ID: 'ai-1', Status: status, Message: 'partial' } as unknown as MJConversationDetailEntity;
}

function componentEntry(destroyed = false): ComponentEntry {
    return {
        kind: 'component',
        ref: {
            instance: { message: null },
            changeDetectorRef: { detectChanges: vi.fn(), destroyed },
            location: { nativeElement: { classList: new FakeClassList() } },
        },
    };
}

function buildList(entries: Record<string, unknown>): MessageListComponent {
    const component = Object.create(MessageListComponent.prototype) as MessageListComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        _renderedMessages: new Map(Object.entries(entries)),
    });
    return component;
}

describe('MessageListComponent.RefreshRenderedMessage', () => {
    it('returns false when the message has no rendered entry', () => {
        const list = buildList({});
        expect(list.RefreshRenderedMessage(detail())).toBe(false);
    });

    it('updates the rendered component in place, marks the host as streaming and checks its view', () => {
        const entry = componentEntry();
        const list = buildList({ 'ai-1': entry });
        const message = detail();
        expect(list.RefreshRenderedMessage(message)).toBe(true);
        expect(entry.ref.instance.message).toBe(message);
        expect(entry.ref.location.nativeElement.classList.contains('mj-streaming')).toBe(true);
        expect(entry.ref.changeDetectorRef.detectChanges).toHaveBeenCalledTimes(1);
    });

    it('does not check a destroyed view', () => {
        const entry = componentEntry(true);
        const list = buildList({ 'ai-1': entry });
        expect(list.RefreshRenderedMessage(detail())).toBe(true);
        expect(entry.ref.changeDetectorRef.detectChanges).not.toHaveBeenCalled();
    });

    it('updates an embedded custom-renderer view through its context', () => {
        const context: { $implicit: unknown; message: unknown } = { $implicit: null, message: null };
        const detectChanges = vi.fn();
        const list = buildList({ 'ai-1': { kind: 'embedded', ref: { context, detectChanges } } });
        const message = detail();
        expect(list.RefreshRenderedMessage(message)).toBe(true);
        expect(context.$implicit).toBe(message);
        expect(context.message).toBe(message);
        expect(detectChanges).toHaveBeenCalledTimes(1);
    });

    it('cannot refresh a spacer standing in for an unmounted message', () => {
        const list = buildList({ 'ai-1': { kind: 'spacer', ref: {} } });
        expect(list.RefreshRenderedMessage(detail())).toBe(false);
    });

    it('drops the streaming host class once the message has settled', () => {
        const entry = componentEntry();
        const list = buildList({ 'ai-1': entry });
        list.RefreshRenderedMessage(detail());
        const sync = (list as unknown as {
            syncStreamingHostClass(ref: ComponentEntry['ref'], message: MJConversationDetailEntity, streaming: boolean): void;
        }).syncStreamingHostClass.bind(list);
        sync(entry.ref, detail('In-Progress'), false); // a plain progress render keeps it
        expect(entry.ref.location.nativeElement.classList.contains('mj-streaming')).toBe(true);
        sync(entry.ref, detail('Complete'), false);
        expect(entry.ref.location.nativeElement.classList.contains('mj-streaming')).toBe(false);
    });
});
