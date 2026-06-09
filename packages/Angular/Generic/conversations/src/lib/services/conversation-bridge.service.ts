/**
 * @fileoverview Angular DI shim over the framework-agnostic `ConversationBridge`
 * from `@memberjunction/conversations-runtime`.
 *
 * The bridge's state (active conversation ID, overlay vs workspace activeness,
 * switch + deep-link event subjects) now lives in the runtime so it's shared
 * across all consumers — Angular widget, future React widget, server jobs.
 *
 * This service is now a thin pass-through. Existing
 * `inject(ConversationBridgeService)` call sites continue to work without
 * changes; observables (`ActiveConversationID$`, `SwitchEvent$`, etc.) are now
 * getters that return the runtime's BehaviorSubjects/Subjects, so subscribers
 * see exactly the same events as any non-Angular consumer.
 *
 * **For new code:** prefer `ConversationsRuntime.Instance.Bridge` directly.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import {
    ConversationsRuntime,
    type ConversationSwitchEvent,
    type ConversationDeepLink,
} from '@memberjunction/conversations-runtime';

import { ConversationsRuntimeBootstrap } from './conversations-runtime-bootstrap.service';

// Re-export the runtime's types so existing imports from this file continue to compile.
export type { ConversationSwitchEvent, ConversationDeepLink };

@Injectable({ providedIn: 'root' })
export class ConversationBridgeService {
    constructor(_bootstrap: ConversationsRuntimeBootstrap) {
        // Injecting the bootstrap forces adapter registration on first construction.
    }

    private get bridge() {
        return ConversationsRuntime.Instance.Bridge;
    }

    public get ActiveConversationID$(): BehaviorSubject<string | null> {
        return this.bridge.ActiveConversationID$;
    }
    public get OverlayActive$(): BehaviorSubject<boolean> {
        return this.bridge.OverlayActive$;
    }
    public get WorkspaceActive$(): BehaviorSubject<boolean> {
        return this.bridge.WorkspaceActive$;
    }
    public get SwitchEvent$(): Subject<ConversationSwitchEvent> {
        return this.bridge.SwitchEvent$;
    }
    public get DeepLinkRequest$(): Subject<ConversationDeepLink> {
        return this.bridge.DeepLinkRequest$;
    }
    public get ExpandOverlayRequested$(): Subject<void> {
        return this.bridge.ExpandOverlayRequested$;
    }

    public RequestExpandOverlay(): void {
        this.bridge.RequestExpandOverlay();
    }
    public SetActiveFromOverlay(conversationId: string | null): void {
        this.bridge.SetActiveFromOverlay(conversationId);
    }
    public SetActiveFromWorkspace(conversationId: string | null): void {
        this.bridge.SetActiveFromWorkspace(conversationId);
    }
    public SwitchToWorkspace(conversationId: string | null): void {
        this.bridge.SwitchToWorkspace(conversationId);
    }
    public SwitchToOverlay(conversationId: string | null): void {
        this.bridge.SwitchToOverlay(conversationId);
    }
    public NavigateToConversation(deepLink: ConversationDeepLink): void {
        this.bridge.NavigateToConversation(deepLink);
    }
    public NotifyOverlayActive(active: boolean): void {
        this.bridge.NotifyOverlayActive(active);
    }
    public NotifyWorkspaceActive(active: boolean): void {
        this.bridge.NotifyWorkspaceActive(active);
    }
    public ShouldResumeInOverlay(): boolean {
        return this.bridge.ShouldResumeInOverlay();
    }
}
