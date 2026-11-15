/**
 * @fileoverview `LocalBrowserChannel` — MemberJunction Channels v2 Client Plugin for the
 * Local Browser Extension.
 *
 * Extends {@link BaseRealtimeChannelClient} from `@memberjunction/realtime-runtime` and registers
 * under `@RegisterClass(BaseRealtimeChannelClient, 'LocalBrowserChannel')` (matching the
 * `LocalBrowser` row in `metadata/ai-agent-channels/.ai-agent-channels.json`).
 *
 * Capabilities:
 * - **Dual-Mode / Adaptive Execution:** Drives any {@link IBrowserControlAdapter} (Mode 1
 *   `ContentScriptBrowserAdapter`, Mode 2 `ChromeDebuggerBrowserAdapter`, or Mode 3
 *   `ExtensionBrowserAdapter` `'auto'` escalation).
 * - **Channels v2 Descriptor & Verbs:** Exposes `Navigate`, `GetPageContext`, `GetPageText`,
 *   `DescribePage`, `ClickElement`, `FillInput`, `HighlightElement`, `ClearHighlights`,
 *   `WaitForUserAction`, and `RunPlaybookStep`.
 * - **Visual Perception (`'pixels'` Exposure):** Implements {@link IChannelFrameProvider} and wires
 *   {@link BaseRealtimeChannelClient.EnableVisualPerception} to `Adapter.CaptureScreenshot()` so
 *   tab screenshots flow through the session's `VideoSourceArbiter` only when `Exposure === 'pixels'`.
 * - **Three-Tier Exposure Ceiling (`none | state | pixels`):** Verbs that return page state/DOM
 *   declare `ReturnsChannelData: 'state'` so they are automatically withheld when the user sets
 *   exposure to `'none'`.
 *
 * @module @memberjunction/browser-extension-core
 */

import type { JSONObject } from '@memberjunction/ai';
import {
    REALTIME_CHANNEL_CONTRACT_VERSION,
    type RealtimeChannelActor,
    type RealtimeChannelDescriptor,
} from '@memberjunction/ai-core-plus';
import type { IChannelFrameProvider } from '@memberjunction/ai-realtime-client';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeChannelClient,
    type RealtimeChannelVerbResult,
} from '@memberjunction/realtime-runtime';
import type {
    BraidedPageContextPayload,
    BrowserCoachMarkCalloutPosition,
    BrowserPageStateSnapshot,
    BrowserPlaybookStepOutcome,
    IBrowserControlAdapter,
} from '../types/extension-types.js';

/**
 * Optional callback interface for running a playbook step from `LocalBrowserChannel`.
 */
export interface IPlaybookStepExecutor {
    ExecuteStepById(playbookId: string, stepId: string): Promise<BrowserPlaybookStepOutcome>;
}

/**
 * Full Channels v2 contract descriptor for `LocalBrowserChannel`.
 */
export const LOCAL_BROWSER_CHANNEL_DESCRIPTOR: RealtimeChannelDescriptor = {
    Key: 'LocalBrowser',
    Version: REALTIME_CHANNEL_CONTRACT_VERSION,
    DisplayName: 'Local Browser',
    Instructions:
        'A bidirectional channel connected to the user\'s active browser tab via the MemberJunction Browser Extension. ' +
        'You perceive the current URL, title, interactive DOM elements, and braided MemberJunction CRM/Open App entity context. ' +
        'Prefer HighlightElement + WaitForUserAction to coach the user through sensitive or administrative workflows, ' +
        'or use ClickElement / FillInput / Navigate when the user asks you to act directly on the page. ' +
        'Never ask the user to paste passwords, credit cards, or OAuth client secrets into chat; use guided playbook secret vault capture instead.',
    Nouns: [
        {
            Name: 'currentUrl',
            Description: 'The URL of the active browser tab.',
            Schema: { type: 'string' },
        },
        {
            Name: 'pageTitle',
            Description: 'The document title of the active browser tab.',
            Schema: { type: 'string' },
        },
        {
            Name: 'hostname',
            Description: 'Lowercase hostname of the active browser tab.',
            Schema: { type: 'string' },
        },
        {
            Name: 'interactiveElementCount',
            Description: 'Count of visible interactive elements currently indexed on the page.',
            Schema: { type: 'integer' },
        },
        {
            Name: 'activeControlBackend',
            Description: 'Active browser control backend mode (content-script or debugger-cdp).',
            Schema: { type: 'string', enum: ['content-script', 'debugger-cdp'] },
        },
        {
            Name: 'isAuthOrMfaScreen',
            Description: 'True when the active page is a login, password, SSO, or MFA prompt where autonomous clicks pause.',
            Schema: { type: 'boolean' },
        },
        {
            Name: 'braidedAnchorCount',
            Description: 'Number of MemberJunction Anchor Entities matched to the active page.',
            Schema: { type: 'integer' },
        },
        {
            Name: 'braidedFacetCount',
            Description: 'Number of cross-app Entity Facets braided onto the matched Anchor Entities.',
            Schema: { type: 'integer' },
        },
    ],
    Verbs: [
        {
            Name: 'Navigate',
            Description: 'Navigate the active browser tab to the specified URL.',
            ParametersSchema: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'Target https:// or http:// URL to open.' },
                },
                required: ['url'],
                additionalProperties: false,
            },
            InvokableBy: 'both',
        },
        {
            Name: 'GetPageContext',
            Description: 'Read the active tab URL, title, interactive DOM element summary, and braided MemberJunction entity context.',
            ParametersSchema: {
                type: 'object',
                properties: {
                    refresh: { type: 'boolean', description: 'When true, re-probes the live DOM before returning.' },
                },
                additionalProperties: false,
            },
            InvokableBy: 'agent',
            ReturnsChannelData: 'state',
        },
        {
            Name: 'GetPageText',
            Description: 'Read the sanitized visible text excerpt from the active browser tab.',
            ParametersSchema: {
                type: 'object',
                properties: {
                    maxChars: { type: 'integer', minimum: 100, maximum: 20000 },
                },
                additionalProperties: false,
            },
            InvokableBy: 'agent',
            ReturnsChannelData: 'state',
        },
        {
            Name: 'DescribePage',
            Description: 'Inspect the active browser tab and return indexed interactive elements and page structure.',
            ParametersSchema: {
                type: 'object',
                properties: {
                    focusQuery: { type: 'string', description: 'Optional filter keyword to match element labels or selectors.' },
                },
                additionalProperties: false,
            },
            InvokableBy: 'agent',
            ReturnsChannelData: 'state',
        },
        {
            Name: 'ClickElement',
            Description: 'Click an interactive element on the active page by its 1-based probe index, CSS selector, or coordinates.',
            ParametersSchema: {
                type: 'object',
                properties: {
                    index: { type: 'integer', minimum: 1 },
                    selector: { type: 'string' },
                    x: { type: 'number' },
                    y: { type: 'number' },
                    requireTrustedInput: { type: 'boolean' },
                },
                additionalProperties: false,
            },
            InvokableBy: 'both',
        },
        {
            Name: 'FillInput',
            Description: 'Fill text into an input, textarea, select, or contenteditable element by index or CSS selector.',
            ParametersSchema: {
                type: 'object',
                properties: {
                    index: { type: 'integer', minimum: 1 },
                    selector: { type: 'string' },
                    value: { type: 'string' },
                    clearFirst: { type: 'boolean' },
                    pressEnter: { type: 'boolean' },
                    requireTrustedInput: { type: 'boolean' },
                },
                required: ['value'],
                additionalProperties: false,
            },
            InvokableBy: 'both',
        },
        {
            Name: 'HighlightElement',
            Description: 'Draw a pulsing Coach-Mark Spotlight ring and instructional callout badge around a target element on the page.',
            ParametersSchema: {
                type: 'object',
                properties: {
                    index: { type: 'integer', minimum: 1 },
                    selector: { type: 'string' },
                    label: { type: 'string' },
                    stepBadge: { type: 'string' },
                    calloutPosition: { type: 'string', enum: ['top', 'bottom', 'left', 'right', 'auto'] },
                },
                required: ['label'],
                additionalProperties: false,
            },
            InvokableBy: 'both',
        },
        {
            Name: 'ClearHighlights',
            Description: 'Remove active Coach-Mark Spotlight overlays from the page.',
            ParametersSchema: {
                type: 'object',
                properties: {
                    highlightId: { type: 'string' },
                },
                additionalProperties: false,
            },
            InvokableBy: 'both',
        },
        {
            Name: 'WaitForUserAction',
            Description: 'Pause until the user clicks, types, submits, or navigates on the active page.',
            ParametersSchema: {
                type: 'object',
                properties: {
                    actionKind: { type: 'string', enum: ['click', 'input', 'submit', 'navigation'] },
                    selector: { type: 'string' },
                    urlPattern: { type: 'string' },
                    timeoutMs: { type: 'integer', minimum: 500, maximum: 300000 },
                },
                required: ['actionKind'],
                additionalProperties: false,
            },
            InvokableBy: 'both',
        },
        {
            Name: 'RunPlaybookStep',
            Description: 'Execute a registered Guided Playbook step by playbookId and stepId.',
            ParametersSchema: {
                type: 'object',
                properties: {
                    playbookId: { type: 'string' },
                    stepId: { type: 'string' },
                },
                required: ['playbookId', 'stepId'],
                additionalProperties: false,
            },
            InvokableBy: 'both',
        },
    ],
    Events: [
        {
            Name: 'tab_navigated',
            Description: 'The active browser tab navigated to a new URL.',
            PayloadSchema: {
                type: 'object',
                properties: {
                    url: { type: 'string' },
                    title: { type: 'string' },
                    hostname: { type: 'string' },
                },
            },
        },
        {
            Name: 'dom_settled',
            Description: 'The active browser tab DOM settled after navigation or mutation.',
            PayloadSchema: {
                type: 'object',
                properties: {
                    url: { type: 'string' },
                    interactiveElementCount: { type: 'integer' },
                },
            },
        },
        {
            Name: 'coach_mark_shown',
            Description: 'A Coach-Mark Spotlight ring was displayed on the page.',
            PayloadSchema: {
                type: 'object',
                properties: {
                    highlightId: { type: 'string' },
                    label: { type: 'string' },
                },
            },
        },
        {
            Name: 'user_action_completed',
            Description: 'The user completed a awaited page action.',
            PayloadSchema: {
                type: 'object',
                properties: {
                    actionKind: { type: 'string' },
                    triggeredBy: { type: 'string' },
                },
            },
        },
        {
            Name: 'braided_context_updated',
            Description: 'Multi-App Context Braiding resolved anchor entities and cross-app facets for the page.',
            PayloadSchema: {
                type: 'object',
                properties: {
                    url: { type: 'string' },
                    anchorCount: { type: 'integer' },
                    facetCount: { type: 'integer' },
                },
            },
        },
        {
            Name: 'playbook_step_completed',
            Description: 'A Guided Playbook step finished executing.',
            PayloadSchema: {
                type: 'object',
                properties: {
                    playbookId: { type: 'string' },
                    stepId: { type: 'string' },
                    success: { type: 'boolean' },
                },
            },
        },
    ],
    DisplayPolicy: 'open-on-start',
    DefaultAvailability: 'opt-in',
    MaxExposure: 'pixels',
};

/**
 * `LocalBrowserChannel` — Channels v2 Client Plugin for the MemberJunction Browser Extension.
 */
@RegisterClass(BaseRealtimeChannelClient, 'LocalBrowserChannel')
export class LocalBrowserChannel extends BaseRealtimeChannelClient implements IChannelFrameProvider {
    private adapter: IBrowserControlAdapter | null = null;
    private playbookExecutor: IPlaybookStepExecutor | null = null;
    private lastPageState: BrowserPageStateSnapshot | null = null;
    private lastBraidedContext: BraidedPageContextPayload | null = null;

    public override get ChannelName(): string {
        return 'LocalBrowser';
    }

    public override get TabTitle(): string {
        return 'Local Browser';
    }

    public override get TabIcon(): string {
        return 'fa-solid fa-compass';
    }

    public override GetDescriptor(): RealtimeChannelDescriptor {
        return LOCAL_BROWSER_CHANNEL_DESCRIPTOR;
    }

    /**
     * Attaches the browser control adapter (Mode 1, Mode 2, or Mode 3 `ExtensionBrowserAdapter`).
     */
    public SetAdapter(adapter: IBrowserControlAdapter): void {
        this.adapter = adapter;
    }

    /**
     * Returns the currently attached browser control adapter.
     */
    public GetAdapter(): IBrowserControlAdapter | null {
        return this.adapter;
    }

    /**
     * Attaches a Guided Playbook step executor for the `RunPlaybookStep` verb.
     */
    public SetPlaybookExecutor(executor: IPlaybookStepExecutor): void {
        this.playbookExecutor = executor;
    }

    /**
     * Updates the cached braided context payload and notifies the realtime session of state change.
     */
    public UpdateBraidedContext(context: BraidedPageContextPayload): void {
        this.lastBraidedContext = context;
        this.lastPageState = context.PageSnapshot;
        const totalFacets = context.Matches.reduce((sum, m) => sum + m.Facets.length, 0);
        this.EmitChannelEvent('braided_context_updated', {
            url: context.PageSnapshot.Url,
            anchorCount: context.Matches.length,
            facetCount: totalFacets,
        });
        this.RecordChange({ Author: 'system' });
    }

    /**
     * Updates the cached page snapshot and notifies the realtime session of state change & visual frame change.
     */
    public async UpdatePageSnapshot(snapshot: BrowserPageStateSnapshot, isNavigation = false): Promise<void> {
        this.lastPageState = snapshot;
        if (isNavigation) {
            this.EmitChannelEvent('tab_navigated', {
                url: snapshot.Url,
                title: snapshot.Title,
                hostname: snapshot.Hostname,
            });
        } else {
            this.EmitChannelEvent('dom_settled', {
                url: snapshot.Url,
                interactiveElementCount: snapshot.InteractiveElements.length,
            });
        }
        this.RecordChange({ Author: 'user' });
        await this.NotifyVisualChange();
    }

    protected override OnInitialize(): void {
        this.EnableVisualPerception(this);
    }

    /**
     * Produces the latest visible tab screenshot as a base64 JPEG for `ChannelInboundVideoBridge` /
     * `VideoSourceArbiter` when `Exposure === 'pixels'`.
     */
    public async GetLatestFrame(): Promise<string | null> {
        if (this.Exposure !== 'pixels' || !this.adapter) {
            return null;
        }
        const shot = await this.adapter.CaptureScreenshot();
        if (!shot.Success || !shot.Data?.Base64Jpeg) {
            return null;
        }
        return shot.Data.Base64Jpeg;
    }

    /**
     * Returns the current state snapshot matching `LOCAL_BROWSER_CHANNEL_DESCRIPTOR.Nouns`.
     */
    public override GetState(): JSONObject {
        const snap = this.lastPageState;
        const braided = this.lastBraidedContext;
        const anchorCount = braided ? braided.Matches.length : 0;
        const facetCount = braided ? braided.Matches.reduce((acc, m) => acc + m.Facets.length, 0) : 0;

        return {
            currentUrl: snap?.Url ?? '',
            pageTitle: snap?.Title ?? '',
            hostname: snap?.Hostname ?? '',
            interactiveElementCount: snap?.InteractiveElements.length ?? 0,
            activeControlBackend: snap?.ActiveBackend ?? 'content-script',
            isAuthOrMfaScreen: snap?.IsAuthOrMfaScreen ?? false,
            braidedAnchorCount: anchorCount,
            braidedFacetCount: facetCount,
        };
    }

    /**
     * Executes a Channels v2 verb on the Local Browser channel.
     */
    public override async ApplyVerb(
        verb: string,
        args: JSONObject,
        actor: RealtimeChannelActor
    ): Promise<RealtimeChannelVerbResult> {
        const declaredVerb = this.GetDescriptor().Verbs.find(
            (v) => v.Name.toLowerCase() === verb.trim().toLowerCase()
        );
        if (declaredVerb && actor === 'agent') {
            const refusal = this.RefuseVerbForExposure(declaredVerb);
            if (refusal) {
                return {
                    Success: false,
                    ErrorCode: 'exposure_restricted',
                    Error: refusal,
                };
            }
        }

        if (!this.adapter) {
            return {
                Success: false,
                ErrorCode: 'adapter_not_bound',
                Error: 'No browser control adapter is bound to LocalBrowserChannel.',
            };
        }

        switch (verb) {
            case 'Navigate':
                return this.handleNavigate(args, actor);
            case 'GetPageContext':
                return this.handleGetPageContext(args);
            case 'GetPageText':
                return this.handleGetPageText(args);
            case 'DescribePage':
                return this.handleDescribePage(args);
            case 'ClickElement':
                return this.handleClickElement(args, actor);
            case 'FillInput':
                return this.handleFillInput(args, actor);
            case 'HighlightElement':
                return this.handleHighlightElement(args);
            case 'ClearHighlights':
                return this.handleClearHighlights(args);
            case 'WaitForUserAction':
                return this.handleWaitForUserAction(args);
            case 'RunPlaybookStep':
                return this.handleRunPlaybookStep(args);
            default:
                return {
                    Success: false,
                    ErrorCode: 'unknown_verb',
                    Error: `LocalBrowserChannel does not support verb "${verb}".`,
                };
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Verb implementations
    // ──────────────────────────────────────────────────────────────────────────

    private async handleNavigate(
        args: JSONObject,
        actor: RealtimeChannelActor
    ): Promise<RealtimeChannelVerbResult> {
        const url = typeof args['url'] === 'string' ? args['url'].trim() : '';
        if (!url) {
            return {
                Success: false,
                ErrorCode: 'invalid_params',
                Error: 'Navigate requires a non-empty "url" string.',
            };
        }

        const res = await this.adapter!.Navigate(url);
        if (!res.Success) {
            return {
                Success: false,
                ErrorCode: res.ErrorCode ?? 'navigate_failed',
                Error: res.ErrorMessage ?? `Failed to navigate to "${url}".`,
            };
        }

        const pageRes = await this.adapter!.GetPageState();
        if (pageRes.Success && pageRes.Data) {
            this.lastPageState = pageRes.Data;
        }

        this.EmitChannelEvent('tab_navigated', {
            url,
            title: this.lastPageState?.Title ?? '',
            hostname: this.lastPageState?.Hostname ?? '',
        });
        this.RecordChange({ Author: actor });
        if (actor === 'agent') {
            await this.ConfirmVisualChange();
        } else {
            await this.NotifyVisualChange();
        }

        return {
            Success: true,
            Result: {
                url,
                backendUsed: res.BackendUsed,
            },
        };
    }

    private async handleGetPageContext(args: JSONObject): Promise<RealtimeChannelVerbResult> {
        const refresh = args['refresh'] !== false;
        if (refresh || !this.lastPageState) {
            const pageRes = await this.adapter!.GetPageState();
            if (!pageRes.Success || !pageRes.Data) {
                return {
                    Success: false,
                    ErrorCode: pageRes.ErrorCode ?? 'page_state_failed',
                    Error: pageRes.ErrorMessage ?? 'Failed to read page state.',
                };
            }
            this.lastPageState = pageRes.Data;
        }

        const snap = this.lastPageState;
        const braidedSummary = this.lastBraidedContext
            ? this.lastBraidedContext.Matches.map((m) => ({
                  entityName: m.Anchor.EntityName,
                  recordId: m.Anchor.RecordID,
                  recordDisplayName: m.Anchor.RecordDisplayName,
                  facets: m.Facets.map((f) => ({
                      headerTitle: f.HeaderTitle,
                      entityName: f.EntityName,
                      totalCount: f.TotalCount,
                  })),
              }))
            : [];

        return {
            Success: true,
            Result: {
                url: snap.Url,
                title: snap.Title,
                hostname: snap.Hostname,
                isAuthOrMfaScreen: snap.IsAuthOrMfaScreen,
                activeBackend: snap.ActiveBackend,
                interactiveElementCount: snap.InteractiveElements.length,
                braidedEntities: braidedSummary,
            },
        };
    }

    private async handleGetPageText(args: JSONObject): Promise<RealtimeChannelVerbResult> {
        const pageRes = await this.adapter!.GetPageState();
        if (!pageRes.Success || !pageRes.Data) {
            return {
                Success: false,
                ErrorCode: pageRes.ErrorCode ?? 'page_text_failed',
                Error: pageRes.ErrorMessage ?? 'Failed to read page text.',
            };
        }
        this.lastPageState = pageRes.Data;
        const maxChars = typeof args['maxChars'] === 'number' ? Math.max(100, args['maxChars']) : 8000;
        const text = pageRes.Data.VisibleTextExcerpt.slice(0, maxChars);

        return {
            Success: true,
            Result: {
                url: pageRes.Data.Url,
                title: pageRes.Data.Title,
                text,
            },
        };
    }

    private async handleDescribePage(args: JSONObject): Promise<RealtimeChannelVerbResult> {
        const pageRes = await this.adapter!.GetPageState();
        if (!pageRes.Success || !pageRes.Data) {
            return {
                Success: false,
                ErrorCode: pageRes.ErrorCode ?? 'describe_page_failed',
                Error: pageRes.ErrorMessage ?? 'Failed to describe page.',
            };
        }
        this.lastPageState = pageRes.Data;

        const focusQuery = typeof args['focusQuery'] === 'string' ? args['focusQuery'].trim().toLowerCase() : '';
        const elements = pageRes.Data.InteractiveElements.filter((el) => {
            if (!focusQuery) {
                return true;
            }
            return (
                el.Name.toLowerCase().includes(focusQuery) ||
                el.Selector.toLowerCase().includes(focusQuery) ||
                el.Role.toLowerCase().includes(focusQuery)
            );
        }).map((el) => ({
            index: el.Index,
            role: el.Role,
            text: el.Name,
            selector: el.Selector,
            scope: el.Scope ?? null,
            disabled: el.Disabled,
        }));

        return {
            Success: true,
            Result: {
                url: pageRes.Data.Url,
                title: pageRes.Data.Title,
                isAuthOrMfaScreen: pageRes.Data.IsAuthOrMfaScreen,
                elementCount: elements.length,
                elements,
            },
        };
    }

    private async handleClickElement(
        args: JSONObject,
        actor: RealtimeChannelActor
    ): Promise<RealtimeChannelVerbResult> {
        if (this.lastPageState?.IsAuthOrMfaScreen && actor === 'agent') {
            return {
                Success: false,
                ErrorCode: 'auth_screen_paused',
                Error: 'Autonomous clicks are paused on login/MFA screens. Use HighlightElement and WaitForUserAction instead.',
            };
        }

        const res = await this.adapter!.ClickElement({
            Index: typeof args['index'] === 'number' ? args['index'] : undefined,
            Selector: typeof args['selector'] === 'string' ? args['selector'] : undefined,
            X: typeof args['x'] === 'number' ? args['x'] : undefined,
            Y: typeof args['y'] === 'number' ? args['y'] : undefined,
            RequireTrustedInput: args['requireTrustedInput'] === true,
        });

        if (!res.Success) {
            return {
                Success: false,
                ErrorCode: res.ErrorCode ?? 'click_failed',
                Error: res.ErrorMessage ?? 'ClickElement failed.',
            };
        }

        this.RecordChange({ Author: actor });
        if (actor === 'agent') {
            await this.ConfirmVisualChange();
        } else {
            await this.NotifyVisualChange();
        }

        return {
            Success: true,
            Result: {
                clickedIndex: res.Data?.ClickedIndex ?? null,
                selector: res.Data?.Selector ?? null,
                healed: res.Data?.Healed ?? false,
                backendUsed: res.BackendUsed,
                escalatedToDebugger: res.EscalatedToDebugger,
            },
        };
    }

    private async handleFillInput(
        args: JSONObject,
        actor: RealtimeChannelActor
    ): Promise<RealtimeChannelVerbResult> {
        if (this.lastPageState?.IsAuthOrMfaScreen && actor === 'agent') {
            return {
                Success: false,
                ErrorCode: 'auth_screen_paused',
                Error: 'Autonomous input is paused on login/MFA screens. Use HighlightElement and WaitForUserAction instead.',
            };
        }

        const value = typeof args['value'] === 'string' ? args['value'] : '';
        const res = await this.adapter!.FillInput({
            Index: typeof args['index'] === 'number' ? args['index'] : undefined,
            Selector: typeof args['selector'] === 'string' ? args['selector'] : undefined,
            Value: value,
            ClearFirst: typeof args['clearFirst'] === 'boolean' ? args['clearFirst'] : true,
            PressEnter: args['pressEnter'] === true,
            RequireTrustedInput: args['requireTrustedInput'] === true,
        });

        if (!res.Success) {
            return {
                Success: false,
                ErrorCode: res.ErrorCode ?? 'fill_failed',
                Error: res.ErrorMessage ?? 'FillInput failed.',
            };
        }

        this.RecordChange({ Author: actor });
        if (actor === 'agent') {
            await this.ConfirmVisualChange();
        } else {
            await this.NotifyVisualChange();
        }

        return {
            Success: true,
            Result: {
                filledIndex: res.Data?.FilledIndex ?? null,
                selector: res.Data?.Selector ?? null,
                healed: res.Data?.Healed ?? false,
                backendUsed: res.BackendUsed,
                escalatedToDebugger: res.EscalatedToDebugger,
            },
        };
    }

    private async handleHighlightElement(args: JSONObject): Promise<RealtimeChannelVerbResult> {
        const label = typeof args['label'] === 'string' ? args['label'] : '';
        const calloutPos = (typeof args['calloutPosition'] === 'string'
            ? args['calloutPosition']
            : 'auto') as BrowserCoachMarkCalloutPosition;

        const res = await this.adapter!.HighlightElement({
            Index: typeof args['index'] === 'number' ? args['index'] : undefined,
            Selector: typeof args['selector'] === 'string' ? args['selector'] : undefined,
            Label: label,
            StepBadge: typeof args['stepBadge'] === 'string' ? args['stepBadge'] : undefined,
            CalloutPosition: calloutPos,
        });

        if (!res.Success || !res.Data) {
            return {
                Success: false,
                ErrorCode: res.ErrorCode ?? 'highlight_failed',
                Error: res.ErrorMessage ?? 'HighlightElement failed.',
            };
        }

        this.EmitChannelEvent('coach_mark_shown', {
            highlightId: res.Data.HighlightId,
            label,
        });

        return {
            Success: true,
            Result: {
                highlightId: res.Data.HighlightId,
            },
        };
    }

    private async handleClearHighlights(args: JSONObject): Promise<RealtimeChannelVerbResult> {
        const highlightId = typeof args['highlightId'] === 'string' ? args['highlightId'] : undefined;
        const res = await this.adapter!.ClearHighlights(highlightId);
        if (!res.Success) {
            return {
                Success: false,
                ErrorCode: res.ErrorCode ?? 'clear_highlights_failed',
                Error: res.ErrorMessage ?? 'ClearHighlights failed.',
            };
        }
        return {
            Success: true,
            Result: {
                clearedCount: res.Data?.ClearedCount ?? 0,
            },
        };
    }

    private async handleWaitForUserAction(args: JSONObject): Promise<RealtimeChannelVerbResult> {
        const actionKind = (typeof args['actionKind'] === 'string' ? args['actionKind'] : 'click') as
            | 'click'
            | 'input'
            | 'submit'
            | 'navigation';

        const res = await this.adapter!.WaitForUserAction({
            ActionKind: actionKind,
            Selector: typeof args['selector'] === 'string' ? args['selector'] : undefined,
            UrlPattern: typeof args['urlPattern'] === 'string' ? args['urlPattern'] : undefined,
            TimeoutMs: typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : undefined,
        });

        if (!res.Success || !res.Data) {
            return {
                Success: false,
                ErrorCode: res.ErrorCode ?? 'wait_timeout',
                Error: res.ErrorMessage ?? 'WaitForUserAction timed out.',
            };
        }

        this.EmitChannelEvent('user_action_completed', {
            actionKind,
            triggeredBy: res.Data.TriggeredBy,
        });
        this.RecordChange({ Author: 'user' });
        await this.NotifyVisualChange();

        return {
            Success: true,
            Result: {
                completed: res.Data.Completed,
                triggeredBy: res.Data.TriggeredBy,
            },
        };
    }

    private async handleRunPlaybookStep(args: JSONObject): Promise<RealtimeChannelVerbResult> {
        if (!this.playbookExecutor) {
            return {
                Success: false,
                ErrorCode: 'playbook_executor_not_bound',
                Error: 'No GuidedPlaybookRunner is attached to LocalBrowserChannel.',
            };
        }

        const playbookId = typeof args['playbookId'] === 'string' ? args['playbookId'] : '';
        const stepId = typeof args['stepId'] === 'string' ? args['stepId'] : '';

        const outcome = await this.playbookExecutor.ExecuteStepById(playbookId, stepId);
        this.EmitChannelEvent('playbook_step_completed', {
            playbookId,
            stepId,
            success: outcome.Success,
        });

        if (!outcome.Success) {
            return {
                Success: false,
                ErrorCode: 'playbook_step_failed',
                Error: outcome.ErrorMessage ?? `Playbook step "${stepId}" failed.`,
            };
        }

        return {
            Success: true,
            Result: {
                stepId: outcome.StepId,
                kind: outcome.Kind,
                backendUsed: outcome.BackendUsed,
                escalatedToDebugger: outcome.EscalatedToDebugger,
                healedSelector: outcome.HealedSelector ?? null,
                vaultedFieldName: outcome.VaultedFieldName ?? null,
            },
        };
    }
}

/**
 * Prevents tree-shaking of {@link LocalBrowserChannel}'s `@RegisterClass` decorator.
 * Call once from host startup code.
 */
export function LoadLocalBrowserChannel(): void {
    // Static reference keeping @RegisterClass(BaseRealtimeChannelClient, 'LocalBrowserChannel') alive
}
