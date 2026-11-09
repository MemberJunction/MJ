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
import { RealtimeSessionService } from './realtime-session.service';
import { RealtimeSessionsAdapter } from './realtime-sessions-adapter';

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

    /* ===== Voice state (PR #2787 — bridged to RealtimeSessionService) ===== */
    --mj-chat-voice-listening: var(--mj-status-info);
    --mj-chat-voice-thinking: var(--mj-status-warning);
    --mj-chat-voice-speaking: var(--mj-brand-primary);
}
`.trim();

/** Marker on the <style> element so we don't double-inject if the bootstrap is constructed more than once. */
const CHAT_TOKENS_STYLE_ID = 'mj-chat-tokens';

@Injectable({ providedIn: 'root' })
export class ConversationsRuntimeBootstrap {
    constructor(activeTasks: ActiveTasksService, voice: RealtimeSessionService) {
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

        // ISessionsAdapter — bridge RealtimeSessionService's lifecycle observables
        // (SessionStarted$ / ActiveChannels$ / SessionEnded$) into the runtime's
        // framework-agnostic SessionsObserver. See RealtimeSessionsAdapter docs for
        // the why-an-adapter design rationale.
        runtime.UseSessionsAdapter(new RealtimeSessionsAdapter(voice));

        // Inject the chat-token CSS into the document <head> exactly once.
        // Guarded against SSR (no `document` global) and double-injection.
        this.injectChatTokens();

        // Wire bidirectional session & conversation handoff with the MJ Browser Extension
        // content script via shared DOM attributes and CustomEvents on `document`.
        this.wireBrowserExtensionBridge(runtime, voice);
    }

    private wireBrowserExtensionBridge(
        runtime: ConversationsRuntime,
        voice: RealtimeSessionService
    ): void {
        if (typeof document === 'undefined') return;

        const publishSyncState = (): void => {
            const conversationId = runtime.Bridge.ActiveConversationID$.value ?? '';
            const sessionId = voice.CurrentAgentSessionId ?? '';
            document.documentElement.setAttribute('data-mj-active-conversation-id', conversationId);
            document.documentElement.setAttribute('data-mj-active-session-id', sessionId);
            document.dispatchEvent(
                new CustomEvent('mj-ext-host-sync', {
                    detail: {
                        ConversationID: conversationId || null,
                        LastSessionID: sessionId || null,
                        UpdatedAt: new Date().toISOString(),
                    },
                })
            );
        };

        runtime.Bridge.ActiveConversationID$.subscribe(() => publishSyncState());
        voice.SessionStarted$.subscribe(() => publishSyncState());
        voice.SessionEnded$.subscribe(() => publishSyncState());

        document.addEventListener('mj-ext-resume-conversation', (ev: Event) => {
            const customEv = ev as CustomEvent<{
                ConversationID?: string;
                MessageID?: string;
            }>;
            const convId = customEv.detail?.ConversationID;
            if (convId) {
                runtime.Bridge.SwitchToWorkspace(convId);
                runtime.Bridge.NavigateToConversation({
                    conversationId: convId,
                    messageId: customEv.detail?.MessageID,
                });
            }
        });

        this.registerBrowserExtensionClientTools(runtime, voice);
    }

    /**
     * Registers the 5 Browser Extension DOM & Coach-Mark client tools on both
     * `ConversationsRuntime.Instance.Tools` (text agent runs) and
     * `RealtimeSessionService.RegisterAppClientTools` (voice/realtime co-agent runs)
     * so `<mj-chat-agents-overlay>` / `<mj-conversation-chat-area>` can inspect,
     * spotlight, click, and fill elements on the active browser tab.
     */
    private registerBrowserExtensionClientTools(
        runtime: ConversationsRuntime,
        voice: RealtimeSessionService
    ): void {
        const forwardToActiveTab = (
            commandType: string,
            commandPayload: Record<string, unknown>
        ): Promise<Record<string, unknown>> => {
            return new Promise<Record<string, unknown>>((resolve) => {
                if (typeof document === 'undefined') {
                    resolve({ Success: false, ErrorMessage: 'DOM not available' });
                    return;
                }
                const requestId = `mj-ext-tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const timeout = setTimeout(() => {
                    document.removeEventListener('mj-ext-response', onResponse);
                    resolve({
                        Success: false,
                        ErrorMessage: 'Timed out waiting for MJ Browser Extension content script response.',
                    });
                }, 8_000);

                const onResponse = (ev: Event): void => {
                    const customEv = ev as CustomEvent<{
                        RequestId?: string;
                        Result?: Record<string, unknown>;
                    }>;
                    if (customEv.detail?.RequestId !== requestId) {
                        return;
                    }
                    clearTimeout(timeout);
                    document.removeEventListener('mj-ext-response', onResponse);
                    resolve(customEv.detail.Result ?? { Success: true });
                };

                document.addEventListener('mj-ext-response', onResponse);
                document.dispatchEvent(
                    new CustomEvent('mj-ext-command', {
                        detail: {
                            RequestId: requestId,
                            Type: 'MJ_EXT_FORWARD_TO_ACTIVE_TAB',
                            Payload: {
                                CommandType: commandType,
                                CommandPayload: commandPayload,
                            },
                        },
                    })
                );
            });
        };

        const toolSpecs: Array<{
            Name: string;
            Description: string;
            ParameterSchema: Record<string, unknown>;
            CommandType: string;
        }> = [
            {
                Name: 'GetActiveTabPageState',
                Description:
                    'Reads the active browser tab URL, title, hostname, OpenGraph metadata, visible text excerpt, and grounded interactive elements.',
                ParameterSchema: {
                    type: 'object',
                    properties: {},
                },
                CommandType: 'MJ_CS_GET_PAGE_STATE',
            },
            {
                Name: 'HighlightElementOnPage',
                Description:
                    'Draws a non-intrusive Shadow-DOM Coach-Mark Spotlight ring and floating instruction callout around an element on the active browser tab.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        Selector: {
                            type: 'string',
                            description: 'CSS selector or xpath=... expression of the element to highlight.',
                        },
                        Index: {
                            type: 'number',
                            description: 'Grounded interactive element index from GetActiveTabPageState.',
                        },
                        Label: {
                            type: 'string',
                            description: 'Instruction text shown in the floating Coach-Mark callout.',
                        },
                        StepBadge: {
                            type: 'string',
                            description: 'Optional step badge pill text (e.g. "Step 1 of 3").',
                        },
                    },
                    required: ['Label'],
                },
                CommandType: 'MJ_CS_HIGHLIGHT_ELEMENT',
            },
            {
                Name: 'ClearPageHighlights',
                Description: 'Clears all Coach-Mark Spotlight rings and callouts on the active browser tab.',
                ParameterSchema: {
                    type: 'object',
                    properties: {},
                },
                CommandType: 'MJ_CS_CLEAR_HIGHLIGHTS',
            },
            {
                Name: 'ClickElementOnPage',
                Description: 'Clicks a grounded interactive element on the active browser tab by Selector or Index.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        Selector: {
                            type: 'string',
                            description: 'CSS selector or xpath=... expression of the element to click.',
                        },
                        Index: {
                            type: 'number',
                            description: 'Grounded interactive element index from GetActiveTabPageState.',
                        },
                    },
                },
                CommandType: 'MJ_CS_CLICK_ELEMENT',
            },
            {
                Name: 'FillInputOnPage',
                Description: 'Fills text into an input or textarea on the active browser tab by Selector or Index.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        Selector: {
                            type: 'string',
                            description: 'CSS selector or xpath=... expression of the input element.',
                        },
                        Index: {
                            type: 'number',
                            description: 'Grounded interactive element index from GetActiveTabPageState.',
                        },
                        Value: {
                            type: 'string',
                            description: 'Text value to enter into the input.',
                        },
                        PressEnter: {
                            type: 'boolean',
                            description: 'Whether to press Enter after filling the input.',
                        },
                    },
                    required: ['Value'],
                },
                CommandType: 'MJ_CS_FILL_INPUT',
            },
        ];

        for (const spec of toolSpecs) {
            if (!runtime.Tools.GetTool(spec.Name)) {
                runtime.Tools.Register({
                    Name: spec.Name,
                    Description: spec.Description,
                    ParameterSchema: spec.ParameterSchema,
                    Handler: async (params: Record<string, unknown>) => {
                        const res = await forwardToActiveTab(spec.CommandType, params);
                        const ok = res['Success'] !== false;
                        return {
                            Success: ok,
                            Data: res,
                            ErrorMessage: ok ? undefined : String(res['ErrorMessage'] ?? 'Browser tool failed'),
                        };
                    },
                });
            }
        }

        voice.RegisterAppClientTools(
            toolSpecs.map((spec) => ({
                Name: spec.Name,
                Description: spec.Description,
                InputSchema: spec.ParameterSchema,
                Category: 'Browser Extension',
                Handler: async (params: Record<string, unknown>) =>
                    forwardToActiveTab(spec.CommandType, params),
            })),
            'browser-extension.tab'
        );
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
