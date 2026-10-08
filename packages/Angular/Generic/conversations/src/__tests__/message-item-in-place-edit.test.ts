import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MessageItemComponent } from '../lib/components/message/message-item.component';

type Opts = { role?: 'User' | 'AI'; canFork?: boolean; inPlaceRole?: 'User' | 'Answer' | null; rail?: 'Inherited' | 'Own' | null; saved?: boolean; editing?: boolean };

function createItem(opts: Opts = {}) {
    const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    const open = component as unknown as Record<string, unknown>;
    const events: string[] = [];
    const message = {
        ID: 'MSG-1', Role: opts.role ?? 'User', Status: 'Complete', UserID: 'USER-1', Message: 'old text',
        Save: vi.fn(async () => { events.push('save'); return opts.saved ?? true; }),
    };
    Object.assign(open, {
        message,
        CurrentUser: { ID: 'USER-1' },
        ReadOnly: false,
        IsProcessing: false,
        IsEditing: opts.editing ?? true,
        AllowMessageEdit: true,
        CanFork: opts.canFork,
        InPlaceRole: opts.inPlaceRole ?? null,
        ForkRail: opts.rail ?? null,
        EditedText: 'new text',
        originalText: 'old text',
        cdRef: { detectChanges: vi.fn() },
        EditResendRequested: { emit: (e: { NewText: string }) => events.push(`fork:${e.NewText}`) },
        MessageEdited: { emit: () => events.push('edited') },
        ResendInPlaceRequested: { emit: () => events.push('resend') },
    });
    return { component, message, events, open };
}

describe('MessageItemComponent in-place edit', () => {
    let notify: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        notify = vi.fn();
        vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('chooses the edit mode, label and hint from CanFork, the latest-turn role and the rail', () => {
        const fork = createItem().component;
        expect([fork.EditMode, fork.EditSaveLabel, fork.EditHint]).toEqual(['Fork', 'Save as fork', 'Press Enter to save as a fork, Shift+Enter for a new line, Escape to cancel']);
        const resend = createItem({ canFork: false, inPlaceRole: 'User' }).component;
        expect([resend.EditMode, resend.EditSaveLabel, resend.EditHint]).toEqual(['Resend', 'Save and resend', 'Press Enter to save and resend, Shift+Enter for a new line, Escape to cancel']);
        const save = createItem({ canFork: false }).component;
        expect([save.EditMode, save.EditSaveLabel, save.EditHint]).toEqual(['Save', 'Save', 'Press Enter to save, Shift+Enter for a new line, Escape to cancel']);
    });

    it('offers Edit on own rows with forking off, and none on an inherited row', () => {
        expect(createItem({ canFork: false, editing: false }).component.CanEdit).toBe(true);
        const inherited = createItem({ canFork: false, rail: 'Inherited', editing: false }).component;
        expect(inherited.EditMode).toBeNull();
        expect(inherited.CanEdit).toBe(false);
    });

    it('offers Regenerate with forking off only on the latest answer, with its title', () => {
        expect(createItem({ role: 'AI', canFork: false, editing: false }).component.CanRegenerate).toBe(false);
        const answer = createItem({ role: 'AI', canFork: false, inPlaceRole: 'Answer', editing: false }).component;
        expect(answer.CanRegenerate).toBe(true);
        expect(answer.RegenerateTitle).toBe('Regenerate');
        expect(createItem({ role: 'AI', editing: false }).component.RegenerateTitle).toBe('Regenerate as a fork');
    });

    it('hands a fork edit to the host without saving the row', async () => {
        const h = createItem();
        await h.component.SaveEdit();
        expect(h.events).toEqual(['fork:new text']);
        expect(h.message.Message).toBe('old text');
    });

    it('saves the text in place for Save, and emits nothing more', async () => {
        const h = createItem({ canFork: false });
        await h.component.SaveEdit();
        expect(h.message.Message).toBe('new text');
        expect(h.events).toEqual(['save', 'edited']);
        expect(h.component.IsEditing).toBe(false);
    });

    it('saves the text, then asks the host to rerun the turn, for Save and resend', async () => {
        const h = createItem({ canFork: false, inPlaceRole: 'User' });
        await h.component.SaveEdit();
        expect(h.events).toEqual(['save', 'edited', 'resend']);
    });

    it('keeps the editor open and the old text when the save fails', async () => {
        const h = createItem({ canFork: false, inPlaceRole: 'User', saved: false });
        await h.component.SaveEdit();
        expect(h.message.Message).toBe('old text');
        expect(h.component.IsEditing).toBe(true);
        expect(h.events).toEqual(['save']);
        expect(notify).toHaveBeenCalledWith('Could not save the message', 'error', 3000);
    });
});
