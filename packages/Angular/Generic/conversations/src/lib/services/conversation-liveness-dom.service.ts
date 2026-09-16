import { Injectable, OnDestroy } from '@angular/core';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';

/**
 * Translates browser events into liveness signals for the framework-agnostic
 * `ConversationLiveness` supervisor in `@memberjunction/conversations-runtime` (MJ #4222).
 *
 * WHY THE SPLIT. The supervisor lives at L0 because that package already depends on
 * `@memberjunction/graphql-dataprovider` and has no Angular dependency — and because the
 * obvious alternative is closed to us: Explorer's `ServerConnectivityService` does almost
 * exactly this, but `@memberjunction/ng-conversations` declares `"mjUILayer": "widgets"`, and
 * `packages/Standards/src/checks/ui-layers.ts` forbids that layer from importing any
 * `ng-explorer*` package at severity `error`. L0 cannot own the DOM half either: the runtime is
 * documented as Node-consumable, so `document` and `window` may not exist there. Hence this thin
 * Angular-side adapter, which is the only piece that touches the DOM.
 *
 * WHAT THE SIGNALS MEAN. Neither event proves anything is reachable — `navigator.onLine` reads
 * true behind a captive portal or a dead VPN, and a tab regaining focus says nothing about the
 * server. They are prompts to re-check, and the supervisor coalesces them with the transport-level
 * signals before anyone acts.
 *
 * Root-provided so one instance serves every chat area; several open conversations must not each
 * raise their own reconciliation for the same lid-open.
 */
@Injectable({ providedIn: 'root' })
export class ConversationLivenessDomService implements OnDestroy {
    /**
     * Stored bound references — `removeEventListener` only detaches a listener when handed the
     * same function object `addEventListener` received. Matches the pattern already used for the
     * resize handlers in `conversation-chat-area.component.ts` and in
     * `packages/Angular/Generic/shared/src/lib/theme.service.ts`.
     */
    private boundVisibilityHandler: (() => void) | null = null;
    private boundOnlineHandler: (() => void) | null = null;
    private started = false;

    /** Begin translating DOM events into liveness signals. Idempotent. */
    public Start(): void {
        if (this.started || typeof document === 'undefined' || typeof window === 'undefined') {
            return;
        }

        this.boundVisibilityHandler = () => {
            // Only the hidden → visible edge matters. A tab going away needs no reconciliation,
            // and signalling on both edges would double every recovery.
            if (!document.hidden) {
                ConversationsRuntime.Instance.Liveness.NotifyTabVisible();
            }
        };
        this.boundOnlineHandler = () => ConversationsRuntime.Instance.Liveness.NotifyBrowserOnline();

        document.addEventListener('visibilitychange', this.boundVisibilityHandler);
        window.addEventListener('online', this.boundOnlineHandler);
        this.started = true;
    }

    /** Detach both listeners. Safe to call when never started. */
    public Stop(): void {
        if (this.boundVisibilityHandler && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
            this.boundVisibilityHandler = null;
        }
        if (this.boundOnlineHandler && typeof window !== 'undefined') {
            window.removeEventListener('online', this.boundOnlineHandler);
            this.boundOnlineHandler = null;
        }
        this.started = false;
    }

    public ngOnDestroy(): void {
        this.Stop();
    }
}
