import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    ConversationBridgeService,
    ConversationSwitchEvent,
    ConversationDeepLink
} from '../lib/services/conversation-bridge.service';

describe('ConversationBridgeService', () => {
    let service: ConversationBridgeService;

    beforeEach(() => {
        service = new ConversationBridgeService();
    });

    describe('ActiveConversationID$', () => {
        it('should start with null', () => {
            expect(service.ActiveConversationID$.value).toBeNull();
        });

        it('should update when set from overlay', () => {
            service.SetActiveFromOverlay('conv-123');
            expect(service.ActiveConversationID$.value).toBe('conv-123');
        });

        it('should update when set from workspace', () => {
            service.SetActiveFromWorkspace('conv-456');
            expect(service.ActiveConversationID$.value).toBe('conv-456');
        });

        it('should allow clearing active conversation', () => {
            service.SetActiveFromOverlay('conv-123');
            service.SetActiveFromOverlay(null);
            expect(service.ActiveConversationID$.value).toBeNull();
        });
    });

    describe('SwitchToWorkspace', () => {
        it('should emit switch event with correct source and target', () => {
            const events: ConversationSwitchEvent[] = [];
            service.SwitchEvent$.subscribe(e => events.push(e));

            service.SwitchToWorkspace('conv-123');

            expect(events).toHaveLength(1);
            expect(events[0].ConversationID).toBe('conv-123');
            expect(events[0].Source).toBe('overlay');
            expect(events[0].Target).toBe('workspace');
        });
    });

    describe('SwitchToOverlay', () => {
        it('should emit switch event with correct source and target', () => {
            const events: ConversationSwitchEvent[] = [];
            service.SwitchEvent$.subscribe(e => events.push(e));

            service.SwitchToOverlay('conv-456');

            expect(events).toHaveLength(1);
            expect(events[0].Source).toBe('workspace');
            expect(events[0].Target).toBe('overlay');
        });
    });

    describe('NavigateToConversation', () => {
        it('should set active conversation and emit deep link', () => {
            const deepLinks: ConversationDeepLink[] = [];
            service.DeepLinkRequest$.subscribe(dl => deepLinks.push(dl));

            service.NavigateToConversation({
                ConversationID: 'conv-789',
                OpenIn: 'workspace'
            });

            expect(service.ActiveConversationID$.value).toBe('conv-789');
            expect(deepLinks).toHaveLength(1);
            expect(deepLinks[0].OpenIn).toBe('workspace');
        });

        it('should support optional message ID', () => {
            const deepLinks: ConversationDeepLink[] = [];
            service.DeepLinkRequest$.subscribe(dl => deepLinks.push(dl));

            service.NavigateToConversation({
                ConversationID: 'conv-789',
                MessageID: 'msg-42'
            });

            expect(deepLinks[0].MessageID).toBe('msg-42');
        });
    });

    describe('OverlayActive$ and WorkspaceActive$', () => {
        it('should track overlay state', () => {
            service.NotifyOverlayActive(true);
            expect(service.OverlayActive$.value).toBe(true);

            service.NotifyOverlayActive(false);
            expect(service.OverlayActive$.value).toBe(false);
        });

        it('should track workspace state', () => {
            service.NotifyWorkspaceActive(true);
            expect(service.WorkspaceActive$.value).toBe(true);
        });
    });

    describe('ShouldResumeInOverlay', () => {
        it('should return true when workspace is inactive and conversation exists', () => {
            service.NotifyWorkspaceActive(false);
            service.SetActiveFromOverlay('conv-123');
            expect(service.ShouldResumeInOverlay()).toBe(true);
        });

        it('should return false when workspace is active', () => {
            service.NotifyWorkspaceActive(true);
            service.SetActiveFromOverlay('conv-123');
            expect(service.ShouldResumeInOverlay()).toBe(false);
        });

        it('should return false when no active conversation', () => {
            service.NotifyWorkspaceActive(false);
            expect(service.ShouldResumeInOverlay()).toBe(false);
        });
    });
});
