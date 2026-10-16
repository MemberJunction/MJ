/**
 * The Computer Use readiness beacon.
 *
 * The shell is the only component that knows when the active route's resource has
 * finished loading, so it publishes that fact as `data-mj-ready="true"` on `<html>`.
 * `@memberjunction/computer-use`'s settle loop polls exactly that selector as a
 * deterministic readiness signal; without it the loop has to infer readiness from
 * two consecutive similar screenshot hashes, which fires early on an animating
 * page and late on a busy one.
 *
 * The attribute is inert — nothing in the product reads it, and no styling keys off
 * it. It exists solely so automation can stop guessing.
 */

/**
 * Publish or clear the readiness beacon.
 *
 * `root` defaults to `document.documentElement`, and the whole call is a no-op
 * where there is no DOM (server-side rendering, unit tests on the node preset),
 * so callers never have to guard.
 */
export function SetReadinessBeacon(ready: boolean, root?: HTMLElement): void {
    const el = root ?? (typeof document === 'undefined' ? undefined : document.documentElement);
    if (!el) {
        return;
    }
    if (ready) {
        el.dataset.mjReady = 'true';
    } else {
        // Removed, not set to "false": the polled selector matches on the value,
        // so a lingering attribute would mislead any profile that widens to
        // `[data-mj-ready]`.
        delete el.dataset.mjReady;
    }
}

/** @deprecated Use {@link SetReadinessBeacon}. */
export function setReadinessBeacon(ready: boolean, root?: HTMLElement): void {
    return SetReadinessBeacon(ready, root);
}
