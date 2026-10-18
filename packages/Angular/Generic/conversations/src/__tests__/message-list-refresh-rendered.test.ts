/**
 * @fileoverview MessageListComponent.RefreshRenderedMessage — refreshing one rendered message
 * in place for a streamed delta, marking the item as streaming so its stylesheet can lift the
 * status-line cap, and clearing that mark once the message settles. Instantiated via the
 * prototype with a hand-built rendered-entry map.
 */
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MessageListComponent } from '../lib/components/message/message-list.component';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

interface ComponentEntry {
    kind: 'component';
    ref: {
        instance: { message: MJConversationDetailEntity | null; IsStreaming: boolean };
        changeDetectorRef: { detectChanges: ReturnType<typeof vi.fn>; destroyed: boolean };
    };
}

function detail(status = 'In-Progress'): MJConversationDetailEntity {
    return { ID: 'ai-1', Status: status, Message: 'partial' } as unknown as MJConversationDetailEntity;
}

function componentEntry(destroyed = false): ComponentEntry {
    return {
        kind: 'component',
        ref: {
            instance: { message: null, IsStreaming: false },
            changeDetectorRef: { detectChanges: vi.fn(), destroyed },
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

    it('updates the rendered component in place, marks it streaming and checks its view', () => {
        const entry = componentEntry();
        const list = buildList({ 'ai-1': entry });
        const message = detail();
        expect(list.RefreshRenderedMessage(message)).toBe(true);
        expect(entry.ref.instance.message).toBe(message);
        expect(entry.ref.instance.IsStreaming).toBe(true);
        expect(entry.ref.changeDetectorRef.detectChanges).toHaveBeenCalledTimes(1);
    });

    it('does not check a destroyed component view', () => {
        const entry = componentEntry(true);
        const list = buildList({ 'ai-1': entry });
        expect(list.RefreshRenderedMessage(detail())).toBe(true);
        expect(entry.ref.changeDetectorRef.detectChanges).not.toHaveBeenCalled();
    });

    it('updates an embedded custom-renderer view through its context', () => {
        const context: { $implicit: unknown; message: unknown } = { $implicit: null, message: null };
        const detectChanges = vi.fn();
        const list = buildList({ 'ai-1': { kind: 'embedded', ref: { context, detectChanges, destroyed: false } } });
        const message = detail();
        expect(list.RefreshRenderedMessage(message)).toBe(true);
        expect(context.$implicit).toBe(message);
        expect(context.message).toBe(message);
        expect(detectChanges).toHaveBeenCalledTimes(1);
    });

    it('does not check a destroyed embedded view', () => {
        const detectChanges = vi.fn();
        const list = buildList({ 'ai-1': { kind: 'embedded', ref: { context: {}, detectChanges, destroyed: true } } });
        expect(list.RefreshRenderedMessage(detail())).toBe(true);
        expect(detectChanges).not.toHaveBeenCalled();
    });

    it('treats a spacer standing in for an unmounted message as refreshed (nothing to paint, no fallback)', () => {
        const list = buildList({ 'ai-1': { kind: 'spacer', ref: {} } });
        expect(list.RefreshRenderedMessage(detail())).toBe(true);
    });
});
