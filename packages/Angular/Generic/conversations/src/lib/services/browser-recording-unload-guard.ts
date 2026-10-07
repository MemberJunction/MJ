/** The slice of `window` the guard needs; lets tests (and non-window hosts) supply a fake. */
export interface UnloadEventTarget {
    addEventListener(type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): void;
    removeEventListener(type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): void;
}

/**
 * Keeps the browser tab from closing silently while a call's end-of-call recording is still
 * uploading (#5195). The upload runs after the user presses End, so closing the tab in that window
 * used to lose the recording with no warning; while armed, the browser shows its native
 * "leave site?" confirmation instead.
 *
 * The handler calls `preventDefault()` AND sets `returnValue = true`. Modern browsers only need
 * `preventDefault()`, but Chromium before 119 prompts only when `returnValue` is set — and per the
 * spec an empty string means "no prompt", so it must be a truthy value. Browsers show the prompt
 * only after a user gesture on the page; pressing End always is one.
 *
 * Desktop browsers only: closing a tab from a mobile tab switcher never fires a prompt, so this
 * is a best-effort guard, not a guarantee.
 */
export class BrowserRecordingUnloadGuard {
    private armed = false;

    /** @param target `window` in a browser; `null` where there is none (SSR/tests) — arming is then a tracked no-op. */
    constructor(private readonly target: UnloadEventTarget | null) {}

    public get IsArmed(): boolean {
        return this.armed;
    }

    /** Idempotent: arming twice registers one listener, disarming when unarmed does nothing. */
    public SetArmed(armed: boolean): void {
        if (armed === this.armed) return;
        this.armed = armed;
        if (!this.target) return;
        if (armed) this.target.addEventListener('beforeunload', this.onBeforeUnload);
        else this.target.removeEventListener('beforeunload', this.onBeforeUnload);
    }

    // Arrow property so add/remove see the same function identity.
    private readonly onBeforeUnload = (event: BeforeUnloadEvent): void => {
        event.preventDefault();
        event.returnValue = true;
    };
}
