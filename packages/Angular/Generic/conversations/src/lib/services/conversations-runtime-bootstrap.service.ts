/**
 * @fileoverview Wires the framework-agnostic `@memberjunction/conversations-runtime`
 * to the Angular host's UI services at module bootstrap.
 *
 * The runtime knows nothing about Angular — it surfaces user-facing messages
 * through `INotificationAdapter` and clears running tasks through
 * `IActiveTaskTracker`. This service implements both adapters using MJ's
 * Angular notification + active-task services and registers them on the runtime
 * at first injection.
 *
 * Each Angular DI shim service (ConversationAgentService, ConversationStreamingService,
 * etc.) takes `ConversationsRuntimeBootstrap` as a constructor dependency so the
 * adapters are guaranteed registered before any shim method is called. Because
 * the bootstrap is `providedIn: 'root'`, the registration happens exactly once
 * per app, on the first injection of any shim.
 */

import { Injectable } from '@angular/core';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
import { MJNotificationService } from '@memberjunction/ng-notifications';

import { ActiveTasksService } from './active-tasks.service';
import { VoiceSessionService } from './voice-session.service';
import { VoiceSessionsAdapter } from './voice-sessions-adapter';

/**
 * Document-level `--mj-chat-*` design tokens. Each token defaults to a
 * semantic `--mj-*` token from MJ's design system so the chat surface
 * adapts to light/dark mode automatically. Consumers override these (in
 * their own `:root {}` or a scoped selector) to theme the chat without
 * touching MJ's underlying semantic tokens.
 *
 * Injected at runtime via `<style>` rather than carried via Angular
 * `styleUrls` because Angular's emulated view encapsulation rewrites
 * `:root {}` selectors into `[_ngcontent-…]:root {}` — which never matches
 * `<html>` at runtime — even though Angular's docs claim `:root` is
 * preserved. Runtime injection sidesteps encapsulation entirely and works
 * uniformly across every chat surface (overlay, embed, full-page) and
 * every host (MJExplorer, custom apps).
 */
const CHAT_TOKENS_CSS = `
:root {
    /* ===== Bubbles ===== */
    --mj-chat-bubble-user-bg: var(--mj-brand-primary);
    --mj-chat-bubble-user-text: var(--mj-text-inverse);
    --mj-chat-bubble-agent-bg: var(--mj-bg-surface-card);
    --mj-chat-bubble-agent-text: var(--mj-text-primary);

    /* ===== Composer ===== */
    --mj-chat-composer-bg: var(--mj-bg-surface);
    --mj-chat-composer-border: var(--mj-border-default);

    /* ===== Character / persona ===== */
    --mj-chat-character-accent: var(--mj-brand-primary);
    --mj-chat-presence-pulse-color: var(--mj-brand-primary);

    /* ===== Voice state (PR #2787 — bridged to VoiceSessionService) ===== */
    --mj-chat-voice-listening: var(--mj-status-info);
    --mj-chat-voice-thinking: var(--mj-status-warning);
    --mj-chat-voice-speaking: var(--mj-brand-primary);
}
`.trim();

/** Marker on the <style> element so we don't double-inject if the bootstrap is constructed more than once. */
const CHAT_TOKENS_STYLE_ID = 'mj-chat-tokens';

@Injectable({ providedIn: 'root' })
export class ConversationsRuntimeBootstrap {
    constructor(activeTasks: ActiveTasksService, voice: VoiceSessionService) {
        const runtime = ConversationsRuntime.Instance;

        // INotificationAdapter — bridge to MJNotificationService.CreateSimpleNotification.
        // Our NotificationLevel ('info' | 'success' | 'warning' | 'error') maps directly
        // to MJNotificationService's style values, so no translation is needed.
        runtime.UseNotificationAdapter({
            Notify: (level, message, ttlMs) => {
                MJNotificationService.Instance?.CreateSimpleNotification(
                    message,
                    level,
                    ttlMs ?? 5_000
                );
            },
        });

        // IActiveTaskTracker — bridge to ActiveTasksService.removeByAgentRunId.
        runtime.UseActiveTaskTracker({
            RemoveByAgentRunId: (agentRunId) => activeTasks.removeByAgentRunId(agentRunId),
        });

        // ISessionsAdapter — bridge VoiceSessionService's lifecycle observables
        // (SessionStarted$ / ActiveChannels$ / SessionEnded$) into the runtime's
        // framework-agnostic SessionsObserver. See VoiceSessionsAdapter docs for
        // the why-an-adapter design rationale.
        runtime.UseSessionsAdapter(new VoiceSessionsAdapter(voice));

        // Inject the chat-token CSS into the document <head> exactly once.
        // Guarded against SSR (no `document` global) and double-injection.
        this.injectChatTokens();
    }

    private injectChatTokens(): void {
        if (typeof document === 'undefined') return;
        if (document.getElementById(CHAT_TOKENS_STYLE_ID)) return;

        const styleEl = document.createElement('style');
        styleEl.id = CHAT_TOKENS_STYLE_ID;
        styleEl.textContent = CHAT_TOKENS_CSS;
        document.head.appendChild(styleEl);
    }
}
