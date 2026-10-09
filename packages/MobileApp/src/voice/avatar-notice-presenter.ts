import type { RealtimeAvatarNotice } from '@memberjunction/realtime-runtime';

/**
 * @fileoverview When the voice screen shows the "Audio only" notice, and for how long.
 *
 * The realtime runtime decides WHETHER a call has an avatar notice and why (`AvatarNotice$`); this
 * class decides how the screen presents it: once per call, until the user dismisses it or ten
 * seconds pass, the same rules the web call overlay follows. It is free of any React Native import
 * so the rules can be tested without a renderer, which this package keeps out of its test setup.
 */

/**
 * The part of an rxjs `Observable` the presenter uses; the runtime's `AvatarNotice$` satisfies it.
 * Structural rather than imported: this app does not depend on rxjs.
 */
export interface AvatarNoticeSource {
    // case-violation-ok-legacy-back-compat: mirrors rxjs's Subscribable so any rxjs Observable satisfies it unchanged
    subscribe(next: (notice: RealtimeAvatarNotice | null) => void): { unsubscribe(): void };
}

/** How long the notice stays up when nobody dismisses it, in milliseconds. */
export const AVATAR_NOTICE_HIDE_AFTER_MS = 10_000;

/**
 * Shows one call's avatar notice at most once.
 *
 * Create one per call and dispose of it when the call ends: a new call gets a new presenter, which is
 * what makes the notice once-per-call rather than once-per-screen.
 */
export class AvatarNoticePresenter {
    private readonly subscription: { unsubscribe(): void };
    private visible: RealtimeAvatarNotice | null = null;
    private shown = false;
    private hideTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * @param source The runtime's notice stream for this call (`AvatarNotice$`).
     * @param onChange Called with the notice when it appears and with `null` when it goes.
     * @param hideAfterMs How long an undismissed notice stays up.
     */
    constructor(
        source: AvatarNoticeSource,
        private readonly onChange: (notice: RealtimeAvatarNotice | null) => void,
        private readonly hideAfterMs: number = AVATAR_NOTICE_HIDE_AFTER_MS,
    ) {
        this.subscription = source.subscribe((notice) => this.offer(notice));
    }

    /** The notice on screen now, or `null`. */
    public get Current(): RealtimeAvatarNotice | null {
        return this.visible;
    }

    /** Hides the notice for the rest of the call (the user tapped ✕). */
    public Dismiss(): void {
        this.hide();
    }

    /** Stops listening and takes down a notice still showing: the call has ended. */
    public Dispose(): void {
        this.subscription.unsubscribe();
        this.hide();
    }

    private offer(notice: RealtimeAvatarNotice | null): void {
        if (!notice) {
            // The runtime clears its notice when the session ends.
            this.hide();
            return;
        }
        if (this.shown) {
            // Once per call: a dismissed or expired notice does not come back, nor does a second one.
            return;
        }
        this.shown = true;
        this.visible = notice;
        this.onChange(notice);
        this.hideTimer = setTimeout(() => this.hide(), this.hideAfterMs);
    }

    private hide(): void {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
        if (this.visible) {
            this.visible = null;
            this.onChange(null);
        }
    }
}
