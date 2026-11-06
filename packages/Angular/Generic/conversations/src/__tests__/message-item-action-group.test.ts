import '@angular/compiler';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi } from 'vitest';
import { MessageItemComponent } from '../lib/components/message/message-item.component';

type Opts = {
    role?: 'User' | 'AI';
    status?: string;
    userId?: string;
    last?: boolean;
    latest?: boolean;
    canFork?: boolean;
    inPlaceRole?: 'User' | 'Answer' | null;
    rail?: 'Inherited' | 'Own' | null;
    readOnly?: boolean;
    processing?: boolean;
    editing?: boolean;
    editElsewhere?: boolean;
    pendingReplace?: boolean;
};

/** A message row built off the prototype, with the state the action getters read. */
function createItem(opts: Opts = {}): MessageItemComponent {
    const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        message: { ID: 'MSG-1', Role: opts.role ?? 'User', Status: opts.status ?? 'Complete', UserID: opts.userId ?? 'USER-1' },
        CurrentUser: { ID: 'USER-1' },
        Conversation: { UserID: 'USER-1' },
        ReadOnly: opts.readOnly ?? false,
        IsProcessing: opts.processing ?? false,
        IsEditing: opts.editing ?? false,
        AllowMessageEdit: true,
        CanFork: opts.canFork,
        InPlaceRole: opts.inPlaceRole ?? null,
        ForkRail: opts.rail ?? null,
        IsLastMessage: opts.last ?? false,
        IsLatestTurn: opts.latest ?? false,
        EditOpenElsewhere: opts.editElsewhere ?? false,
        PendingReplace: opts.pendingReplace ?? false,
        cdRef: { detectChanges: vi.fn() },
    });
    return component;
}

/** The members of a row's action group, in order. */
function members(item: MessageItemComponent): string[] {
    if (!item.ShowsActionGroup) {
        return [];
    }
    const list: string[] = [];
    if (item.CanEdit) list.push('Edit');
    if (item.CanStartFork) list.push('Fork');
    if (item.ShowsHeaderRegenerate) list.push('Regenerate');
    return list;
}

const html = readFileSync(resolve(__dirname, '../lib/components/message/message-item.component.html'), 'utf8');
const css = readFileSync(resolve(__dirname, '../lib/components/message/message-item.component.css'), 'utf8');

describe('MessageItemComponent action group', () => {
    it('offers Edit then Fork from here on the person\'s own user message', () => {
        expect(members(createItem())).toEqual(['Edit', 'Fork']);
    });

    it("offers nothing on another person's message", () => {
        expect(members(createItem({ userId: 'USER-2' }))).toEqual([]);
    });

    it('offers Regenerate on an older answer, and leaves the last answer\'s Regenerate to its footer', () => {
        const older = createItem({ role: 'AI' });
        expect(members(older)).toEqual(['Regenerate']);
        expect(older.ShowsFooterRegenerate).toBe(false);

        const last = createItem({ role: 'AI', last: true });
        expect(members(last)).toEqual([]);
        expect(last.ShowsFooterRegenerate).toBe(true);
    });

    it('with forking off, keeps Edit, drops Fork from here and the older answers\' Regenerate, and keeps the latest answer\'s footer Regenerate', () => {
        expect(members(createItem({ canFork: false }))).toEqual(['Edit']);
        expect(members(createItem({ role: 'AI', canFork: false }))).toEqual([]);
        const latest = createItem({ role: 'AI', canFork: false, inPlaceRole: 'Answer', last: true });
        expect(latest.ShowsFooterRegenerate).toBe(true);
        expect(latest.RegenerateTitle).toBe('Regenerate');
    });

    it('on an inherited row of a fork view, offers Fork from here and Regenerate, never Edit', () => {
        expect(members(createItem({ rail: 'Inherited' }))).toEqual(['Fork']);
        expect(members(createItem({ role: 'AI', rail: 'Inherited' }))).toEqual(['Regenerate']);
    });

    it('shows no group while read-only, processing or editing, and none on a busy or failed row', () => {
        expect(createItem({ readOnly: true }).ShowsActionGroup).toBe(false);
        expect(createItem({ processing: true }).ShowsActionGroup).toBe(false);
        expect(createItem({ editing: true }).ShowsActionGroup).toBe(false);
        expect(createItem({ role: 'AI', status: 'In-Progress' }).ShowsActionGroup).toBe(false);
        expect(createItem({ role: 'AI', status: 'Error' }).ShowsActionGroup).toBe(false);
    });

    it('keeps Regenerate in the footer of a failed last answer, so it can be retried', () => {
        expect(createItem({ role: 'AI', status: 'Error', last: true }).ShowsFooterRegenerate).toBe(true);
    });
});

describe('MessageItemComponent footer and pending replace', () => {
    it('hides the last message\'s footer while it or another row is edited', () => {
        expect(createItem({ role: 'AI', last: true }).ShowsFooter).toBe(true);
        expect(createItem({ role: 'AI', last: true, editElsewhere: true }).ShowsFooter).toBe(false);
        expect(createItem({ role: 'AI', last: true, editing: true }).ShowsFooter).toBe(false);
        expect(createItem({ role: 'AI' }).ShowsFooter).toBe(false);
    });

    it('marks the answer a "Save and resend" will replace with the pending-replace class', () => {
        const build = (item: MessageItemComponent): string =>
            (item as unknown as { buildMessageClasses: () => string }).buildMessageClasses();
        expect(build(createItem({ role: 'AI', pendingReplace: true })).split(' ')).toContain('pending-replace');
        expect(build(createItem({ role: 'AI' })).split(' ')).not.toContain('pending-replace');
    });

    it('tells the list when its editor opens and closes', async () => {
        vi.stubGlobal('document', { querySelector: () => null });
        const item = createItem();
        const events: boolean[] = [];
        Object.assign(item as unknown as Record<string, unknown>, {
            message: { ID: 'MSG-1', Role: 'User', Status: 'Complete', UserID: 'USER-1', Message: 'hi' },
            EditingChanged: { emit: (open: boolean) => events.push(open) },
        });
        item.StartEditing();
        await Promise.resolve();
        item.CancelEditing();
        item.CancelEditing();
        expect(events).toEqual([true, false]);
        vi.unstubAllGlobals();
    });
});

describe('MessageItemComponent action template', () => {
    it('has no floating action card and no hover-only pencil', () => {
        expect(html).not.toMatch(/class="message-actions"/);
        expect(html).not.toContain('message-edit-icon');
        expect(css).not.toMatch(/\.message-actions\s*\{/);
        expect(css).not.toContain('message-edit-icon');
    });

    it('styles the actions like the gear, and labels Edit and Fork from here only on the latest turn', () => {
        for (const action of ['edit', 'fork', 'regenerate']) {
            expect(html).toMatch(new RegExp(`<button type="button" class="message-header-action message-action-${action}"`));
        }
        const group = html.slice(html.indexOf('class="message-action-group"'), html.indexOf('class="agent-run-icon"'));
        expect(group).not.toContain('mjButton');
        expect(group.match(/@if \(IsLatestTurn\)/g)?.length).toBe(2);
        expect(css).toMatch(/\.agent-run-icon,\s*\.message-header-action\s*\{/);
        expect(html).toContain('class="message-action-group" [class.labeled]="IsLatestTurn"');
        expect(css).toMatch(/\.message-action-group\.labeled\s*\{\s*gap: var\(--mj-space-4\);/);
    });

    it('puts the action group before the gear in the header row', () => {
        const group = html.indexOf('class="message-action-group"');
        expect(group).toBeGreaterThan(html.indexOf('class="time-pill"'));
        expect(group).toBeLessThan(html.indexOf('class="agent-run-icon"'));
    });

    it('orders the footer Delete, Regenerate, Rate response, Pin', () => {
        const footer = html.slice(html.indexOf('class="message-footer"'), html.indexOf('Agent details content section'));
        const order = ['inline-delete', 'regenerate-btn', 'mj-conversation-message-rating', 'pin-btn'].map(token => footer.indexOf(token));
        expect(order.every(i => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it('shows the editor note on the button row', () => {
        const actions = html.slice(html.indexOf('class="edit-actions"'), html.indexOf('class="edit-hint"'));
        expect(actions).toContain('{{ EditNote }}');
        expect(actions).toContain('EditSaveIcon');
    });
});
