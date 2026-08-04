/**
 * @fileoverview Tests for ConversationBridge. Ported from the original
 * `conversation-bridge.service.test.ts` in `@memberjunction/ng-conversations` — the source
 * was already framework-agnostic, the port just adjusts the class name.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
    ConversationBridge,
    type ConversationSwitchEvent,
    type ConversationDeepLink,
} from '../bridge/ConversationBridge';

describe('ConversationBridge', () => {
    let bridge: ConversationBridge;

    beforeEach(() => {
        bridge = new ConversationBridge();
    });

    describe('ActiveConversationID$', () => {
        it('starts with null', () => {
            expect(bridge.ActiveConversationID$.value).toBeNull();
        });

        it('updates when set from overlay', () => {
            bridge.SetActiveFromOverlay('conv-123');
            expect(bridge.ActiveConversationID$.value).toBe('conv-123');
        });

        it('updates when set from workspace', () => {
            bridge.SetActiveFromWorkspace('conv-456');
            expect(bridge.ActiveConversationID$.value).toBe('conv-456');
        });

        it('allows clearing active conversation', () => {
            bridge.SetActiveFromOverlay('conv-123');
            bridge.SetActiveFromOverlay(null);
            expect(bridge.ActiveConversationID$.value).toBeNull();
        });
    });

    describe('SwitchToWorkspace', () => {
        it('emits switch event with correct source and target', () => {
            const events: ConversationSwitchEvent[] = [];
            bridge.SwitchEvent$.subscribe((e) => events.push(e));

            bridge.SwitchToWorkspace('conv-123');

            expect(events).toHaveLength(1);
            expect(events[0].ConversationID).toBe('conv-123');
            expect(events[0].Source).toBe('overlay');
            expect(events[0].Target).toBe('workspace');
        });
    });

    describe('SwitchToOverlay', () => {
        it('emits switch event with correct source and target', () => {
            const events: ConversationSwitchEvent[] = [];
            bridge.SwitchEvent$.subscribe((e) => events.push(e));

            bridge.SwitchToOverlay('conv-456');

            expect(events).toHaveLength(1);
            expect(events[0].Source).toBe('workspace');
            expect(events[0].Target).toBe('overlay');
        });
    });

    describe('NavigateToConversation', () => {
        it('sets active conversation and emits deep link', () => {
            const deepLinks: ConversationDeepLink[] = [];
            bridge.DeepLinkRequest$.subscribe((dl) => deepLinks.push(dl));

            bridge.NavigateToConversation({
                ConversationID: 'conv-789',
                OpenIn: 'workspace',
            });

            expect(bridge.ActiveConversationID$.value).toBe('conv-789');
            expect(deepLinks).toHaveLength(1);
            expect(deepLinks[0].OpenIn).toBe('workspace');
        });

        it('supports optional message ID', () => {
            const deepLinks: ConversationDeepLink[] = [];
            bridge.DeepLinkRequest$.subscribe((dl) => deepLinks.push(dl));

            bridge.NavigateToConversation({
                ConversationID: 'conv-789',
                MessageID: 'msg-42',
            });

            expect(deepLinks[0].MessageID).toBe('msg-42');
        });
    });

    describe('OverlayActive$ and WorkspaceActive$', () => {
        it('tracks overlay state', () => {
            bridge.NotifyOverlayActive(true);
            expect(bridge.OverlayActive$.value).toBe(true);

            bridge.NotifyOverlayActive(false);
            expect(bridge.OverlayActive$.value).toBe(false);
        });

        it('tracks workspace state', () => {
            bridge.NotifyWorkspaceActive(true);
            expect(bridge.WorkspaceActive$.value).toBe(true);
        });
    });

    describe('ShouldResumeInOverlay', () => {
        it('returns true when workspace is inactive and conversation exists', () => {
            bridge.NotifyWorkspaceActive(false);
            bridge.SetActiveFromOverlay('conv-123');
            expect(bridge.ShouldResumeInOverlay()).toBe(true);
        });

        it('returns false when workspace is active', () => {
            bridge.NotifyWorkspaceActive(true);
            bridge.SetActiveFromOverlay('conv-123');
            expect(bridge.ShouldResumeInOverlay()).toBe(false);
        });

        it('returns false when no active conversation', () => {
            bridge.NotifyWorkspaceActive(false);
            expect(bridge.ShouldResumeInOverlay()).toBe(false);
        });
    });

    describe('ExpandOverlayRequested$', () => {
        it('emits when RequestExpandOverlay is called', () => {
            let count = 0;
            bridge.ExpandOverlayRequested$.subscribe(() => count++);

            bridge.RequestExpandOverlay();
            bridge.RequestExpandOverlay();

            expect(count).toBe(2);
        });
    });
});
