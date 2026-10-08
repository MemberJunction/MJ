import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MessageItemComponent } from '../lib/components/message/message-item.component';

type Opts = { role?: string; status?: string; userId?: string | null; currentUserId?: string | null; readOnly?: boolean; processing?: boolean; editing?: boolean; allowEdit?: boolean; canFork?: boolean };

function createItem(opts: Opts = {}) {
    const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    const open = component as unknown as Record<string, unknown>;
    const forks: MJConversationDetailEntity[] = [];
    const message = { ID: 'MSG-1', Role: opts.role ?? 'User', Status: opts.status ?? 'Complete', UserID: opts.userId === undefined ? 'USER-1' : opts.userId };
    const currentUserId = opts.currentUserId === undefined ? 'USER-1' : opts.currentUserId;
    Object.assign(open, {
        message,
        CurrentUser: currentUserId === null ? undefined : { ID: currentUserId },
        ReadOnly: opts.readOnly ?? false,
        IsProcessing: opts.processing ?? false,
        IsEditing: opts.editing ?? false,
        AllowMessageEdit: opts.allowEdit ?? true,
        CanFork: opts.canFork,
        ForkRequested: { emit: (m: MJConversationDetailEntity) => forks.push(m) },
    });
    return { component, message, forks };
}

describe('MessageItemComponent fork actions', () => {
    it('offers Fork from here on a finished user message the person wrote, to a person who may write', () => {
        expect(createItem().component.CanStartFork).toBe(true);
    });

    it('does not offer Fork from here on an agent answer (Regenerate covers it)', () => {
        expect(createItem({ role: 'AI' }).component.CanStartFork).toBe(false);
        expect(createItem({ role: 'AI' }).component.CanRegenerate).toBe(true);
    });

    it("does not offer Fork from here on another person's message, a message with no author, or with no current user", () => {
        expect(createItem({ userId: 'USER-2' }).component.CanStartFork).toBe(false);
        expect(createItem({ userId: 'user-1' }).component.CanStartFork).toBe(true);
        expect(createItem({ userId: null }).component.CanStartFork).toBe(false);
        expect(createItem({ currentUserId: null }).component.CanStartFork).toBe(false);
    });

    it('does not offer Fork from here while read-only, processing, editing, or on an unfinished message', () => {
        expect(createItem({ readOnly: true }).component.CanStartFork).toBe(false);
        expect(createItem({ processing: true }).component.CanStartFork).toBe(false);
        expect(createItem({ editing: true }).component.CanStartFork).toBe(false);
        expect(createItem({ status: 'In-Progress' }).component.CanStartFork).toBe(false);
        expect(createItem({ status: 'Error' }).component.CanStartFork).toBe(false);
    });

    it('emits the message for Fork from here and stops the click', () => {
        const h = createItem();
        const event = { stopPropagation: vi.fn() } as unknown as Event;
        h.component.OnForkClick(event);
        expect(h.forks).toEqual([h.message]);
        expect(event.stopPropagation).toHaveBeenCalledOnce();
    });

    it('emits nothing when Fork from here is not offered', () => {
        const h = createItem({ readOnly: true });
        const event = { stopPropagation: vi.fn() } as unknown as Event;
        h.component.OnForkClick(event);
        expect(h.forks).toHaveLength(0);
    });

    it('has no Reply in thread action', () => {
        expect('OnReplyInThreadClick' in MessageItemComponent.prototype).toBe(false);
        expect('ReplyInThreadRequested' in createItem().component).toBe(false);
    });

    it('offers Edit only to the author of a finished user message who may write', () => {
        expect(createItem().component.CanEdit).toBe(true);
        expect(createItem({ userId: 'USER-2' }).component.CanEdit).toBe(false);
        expect(createItem({ role: 'AI' }).component.CanEdit).toBe(false);
        expect(createItem({ readOnly: true }).component.CanEdit).toBe(false);
        expect(createItem({ allowEdit: false }).component.CanEdit).toBe(false);
        expect(createItem({ status: 'In-Progress' }).component.CanEdit).toBe(false);
        expect(createItem({ editing: true }).component.CanEdit).toBe(false);
    });

    it('offers no Edit on a message with no author or when there is no current user', () => {
        expect(createItem({ userId: null }).component.CanEdit).toBe(false);
        expect(createItem({ currentUserId: null }).component.CanEdit).toBe(false);
        expect(createItem({ userId: null, currentUserId: null }).component.CanEdit).toBe(false);
    });

    it('offers no fork action when the person may not fork; Edit and Regenerate then work in place', () => {
        expect(createItem({ canFork: false }).component.CanStartFork).toBe(false);
        expect(createItem({ canFork: false }).component.CanEdit).toBe(true);
        expect(createItem({ canFork: false, role: 'AI' }).component.CanRegenerate).toBe(false);
        const latestAnswer = createItem({ canFork: false, role: 'AI' });
        (latestAnswer.component as unknown as Record<string, unknown>)['InPlaceRole'] = 'Answer';
        expect(latestAnswer.component.CanRegenerate).toBe(true);
        expect(createItem({ role: 'AI' }).component.CanRegenerate).toBe(true);
    });
});
