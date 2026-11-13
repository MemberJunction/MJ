/**
 * @fileoverview Manifest V3 Content Script Runtime (`content-script.ts`) for the
 * MemberJunction Browser Extension.
 *
 * Bootstraps:
 * - {@link InPageContentScriptExecutor} (Mode 1 DOM grounding via `INTERACTIVITYPROBE`,
 *   element index/selector click/fill/scroll, and `ReresolveTarget` healing)
 * - {@link CoachMarkOverlayRenderer} (isolated Shadow-DOM Coach-Mark Spotlight ring)
 * - {@link SensitivePageGuard} (automatic password/CC/OTP masking and auth/MFA detection)
 * - SPA Navigation Watcher (`popstate` / `hashchange` / URL change notifications)
 */

import {
    BrowserClickRequest,
    BrowserCoachMarkRequest,
    BrowserFillInputRequest,
    BrowserOperationResult,
    BrowserPageStateSnapshot,
    BrowserScrollRequest,
    BrowserWaitForActionRequest,
    CoachMarkOverlayRenderer,
    InPageContentScriptExecutor,
    SensitivePageGuard,
} from '@memberjunction/browser-extension-core';

/**
 * Message envelope sent from the Extension Service Worker or Side Panel to the Content Script.
 */
export interface ContentScriptCommandMessage {
    /** Message discriminator. */
    Type:
        | 'MJ_CS_GET_PAGE_STATE'
        | 'MJ_CS_CLICK_ELEMENT'
        | 'MJ_CS_FILL_INPUT'
        | 'MJ_CS_SCROLL'
        | 'MJ_CS_HIGHLIGHT_ELEMENT'
        | 'MJ_CS_CLEAR_HIGHLIGHTS'
        | 'MJ_CS_WAIT_FOR_USER_ACTION'
        | 'MJ_CS_EXTRACT_SECRET_VALUE';
    /** Command-specific payload. */
    Payload?: Record<string, unknown>;
}

/**
 * Active Content Script runtime bound to a browser tab's `Document` and `Window`.
 */
export class ExtensionContentScriptRuntime {
    public readonly Guard: SensitivePageGuard;
    public readonly CoachMarks: CoachMarkOverlayRenderer;
    public readonly Executor: InPageContentScriptExecutor;
    private readonly doc: Document;
    private readonly win: Window;
    private lastKnownUrl = '';

    public constructor(options?: {
        Document?: Document;
        Window?: Window;
        Guard?: SensitivePageGuard;
    }) {
        this.doc = options?.Document ?? document;
        this.win = options?.Window ?? window;
        this.Guard = options?.Guard ?? new SensitivePageGuard();
        this.CoachMarks = new CoachMarkOverlayRenderer({ Document: this.doc });
        this.Executor = new InPageContentScriptExecutor({
            Document: this.doc,
            Window: this.win,
            Guard: this.Guard,
            OverlayRenderer: this.CoachMarks,
        });
    }

    /**
     * Initialize the content script on the current page:
     * - Sets `data-mj-extension-content-script="ready"` on `document.documentElement`
     * - Registers Chrome runtime message listener (`chrome.runtime.onMessage`)
     * - Registers SPA URL change observers
     */
    public Initialize(): void {
        if (this.doc.documentElement) {
            this.doc.documentElement.setAttribute('data-mj-extension-content-script', 'ready');
        }
        this.lastKnownUrl = this.win.location?.href ?? '';

        this.registerChromeMessageListener();
        this.registerNavigationObservers();
    }

    /**
     * Dispatch a command message to the underlying `InPageContentScriptExecutor`.
     */
    public async HandleCommand(
        message: ContentScriptCommandMessage
    ): Promise<
        | BrowserPageStateSnapshot
        | BrowserOperationResult<Record<string, unknown>>
        | { SecretValue: string | null }
    > {
        const payload = message.Payload ?? {};
        switch (message.Type) {
            case 'MJ_CS_GET_PAGE_STATE':
                return this.Executor.GetPageState();

            case 'MJ_CS_CLICK_ELEMENT':
                return this.Executor.ClickElement(payload as unknown as BrowserClickRequest);

            case 'MJ_CS_FILL_INPUT':
                return this.Executor.FillInput(payload as unknown as BrowserFillInputRequest);

            case 'MJ_CS_SCROLL':
                return this.Executor.Scroll(payload as unknown as BrowserScrollRequest);

            case 'MJ_CS_HIGHLIGHT_ELEMENT':
                return this.Executor.HighlightElement(payload as unknown as BrowserCoachMarkRequest);

            case 'MJ_CS_CLEAR_HIGHLIGHTS': {
                const highlightId =
                    typeof payload['HighlightId'] === 'string' ? payload['HighlightId'] : undefined;
                return this.Executor.ClearHighlights(highlightId);
            }

            case 'MJ_CS_WAIT_FOR_USER_ACTION':
                return this.Executor.WaitForUserAction(
                    payload as unknown as BrowserWaitForActionRequest
                );

            case 'MJ_CS_EXTRACT_SECRET_VALUE': {
                const selector = String(payload['Selector'] ?? '');
                const secret = await this.Executor.ExtractSecretValue(selector);
                return { SecretValue: secret };
            }
        }
    }

    private registerChromeMessageListener(): void {
        const globalObj = globalThis as Record<string, unknown>;
        const chromeObj = globalObj['chrome'] as
            | {
                  runtime?: {
                      onMessage?: {
                          addListener?: (
                              cb: (
                                  msg: ContentScriptCommandMessage,
                                  sender: unknown,
                                  sendResponse: (res: unknown) => void
                              ) => boolean | void
                          ) => void;
                      };
                  };
              }
            | undefined;

        if (!chromeObj?.runtime?.onMessage?.addListener) {
            return;
        }

        chromeObj.runtime.onMessage.addListener(
            (
                msg: ContentScriptCommandMessage,
                _sender: unknown,
                sendResponse: (res: unknown) => void
            ): boolean | void => {
                if (!msg || typeof msg.Type !== 'string' || !msg.Type.startsWith('MJ_CS_')) {
                    return undefined;
                }
                this.HandleCommand(msg)
                    .then((res) => sendResponse(res))
                    .catch((err: unknown) =>
                        sendResponse({
                            Success: false,
                            ErrorMessage: err instanceof Error ? err.message : String(err),
                        })
                    );
                return true; // keep message channel open for async response
            }
        );
    }

    private registerNavigationObservers(): void {
        const checkUrlChange = (): void => {
            const currentUrl = this.win.location?.href ?? '';
            if (currentUrl && currentUrl !== this.lastKnownUrl) {
                this.lastKnownUrl = currentUrl;
                this.notifyUrlChanged(currentUrl);
            }
        };

        this.win.addEventListener('popstate', checkUrlChange);
        this.win.addEventListener('hashchange', checkUrlChange);
    }

    private notifyUrlChanged(newUrl: string): void {
        const globalObj = globalThis as Record<string, unknown>;
        const chromeObj = globalObj['chrome'] as
            | {
                  runtime?: {
                      sendMessage?: (msg: Record<string, unknown>) => void;
                  };
              }
            | undefined;

        try {
            chromeObj?.runtime?.sendMessage?.({
                Type: 'MJ_EXT_TAB_URL_CHANGED',
                Url: newUrl,
                Title: this.doc.title,
            });
        } catch {
            // Ignore when extension context is invalidated or running outside Chrome runtime
        }
    }
}

/**
 * Bootstrap the Content Script runtime in the current window if running inside a browser document.
 */
export function BootstrapContentScript(): ExtensionContentScriptRuntime | null {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return null;
    }
    const runtime = new ExtensionContentScriptRuntime();
    runtime.Initialize();
    const winRecord = window as unknown as Record<string, unknown>;
    winRecord['__MJ_EXTENSION_CONTENT_RUNTIME__'] = runtime;
    return runtime;
}
