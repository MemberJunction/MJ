import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { ConversationEngine, type ConversationBranchRow, type ForkSummary } from '@memberjunction/core-entities';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

describe('ConversationChatAreaComponent forks list', () => {
    function chatArea() {
        const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
        const openFork = vi.fn(async () => true);
        Object.assign(component as unknown as Record<string, unknown>, { ShowForksPopover: false, OpenFork: openFork });
        return { component, openFork };
    }

    /** A stand-in for the header Forks button. */
    function withForksButton(component: ConversationChatAreaComponent, isConnected = true) {
        const focus = vi.fn();
        Object.assign(component as unknown as Record<string, unknown>, { forksButton: { nativeElement: { focus, isConnected } } });
        return focus;
    }

    it('toggles the popover', () => {
        const { component } = chatArea();
        component.ToggleForksPopover();
        expect(component.ShowForksPopover).toBe(true);
        component.ToggleForksPopover();
        expect(component.ShowForksPopover).toBe(false);
    });

    it('closes the popover and opens the chosen fork', () => {
        const { component, openFork } = chatArea();
        component.ShowForksPopover = true;
        component.OnForkSelectedFromList('T1');
        expect(component.ShowForksPopover).toBe(false);
        expect(openFork).toHaveBeenCalledWith('T1');
    });

    it('returns focus to the Forks button when the popover closes', () => {
        const { component } = chatArea();
        const focus = withForksButton(component);
        component.ShowForksPopover = true;
        component.CloseForksPopover();
        expect(component.ShowForksPopover).toBe(false);
        expect(focus).toHaveBeenCalledOnce();

        component.ShowForksPopover = true;
        component.OnForkSelectedFromList('T1');
        expect(focus).toHaveBeenCalledTimes(2);
    });

    it('does not focus a Forks button that is no longer on the page', () => {
        const { component } = chatArea();
        const focus = withForksButton(component, false);
        component.ShowForksPopover = true;
        component.CloseForksPopover();
        expect(component.ShowForksPopover).toBe(false);
        expect(focus).not.toHaveBeenCalled();
    });

    it('keeps the forks list and the pinned messages panel from being open together', async () => {
        const { component } = chatArea();
        Object.assign(component as unknown as Record<string, unknown>, { ShowPinsPanel: true, pinsHydrated: true, cdr: { detectChanges: vi.fn() } });

        component.ToggleForksPopover();
        expect(component.ShowForksPopover).toBe(true);
        expect(component.ShowPinsPanel).toBe(false);

        await component.TogglePinsPanel();
        expect(component.ShowPinsPanel).toBe(true);
        expect(component.ShowForksPopover).toBe(false);
    });

    it('closes the popover when the conversation has no forks any more', async () => {
        const { component } = chatArea();
        const open = component as unknown as Record<string, unknown>;
        Object.assign(open, {
            ShowForksPopover: true,
            ForkSummaries: [{ Branch: { ID: 'T1' } } as unknown as ForkSummary],
            forkSummaryReadSequence: 0,
            forkSummaryShownSequence: 0,
            isActiveConversationLoad: () => true,
            Provider: { Name: 'test-provider' },
            CurrentUser: { ID: 'USER-1' },
            cdr: { markForCheck: vi.fn() },
        });
        const spy = vi.spyOn(ConversationEngine, 'LoadForkSummaries').mockResolvedValue([]);
        try {
            const row: ConversationBranchRow = { ID: 'T1', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2 };
            await (open['loadForkSummaries'] as (c: string, b: ConversationBranchRow[], t: number) => Promise<void>).call(component, 'CONV-1', [row], 1);
        } finally {
            spy.mockRestore();
        }

        expect(component.ForkSummaries).toEqual([]);
        expect(component.ShowForksPopover).toBe(false);
    });
});
