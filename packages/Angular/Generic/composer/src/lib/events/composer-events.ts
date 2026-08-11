/**
 * @fileoverview Before/After cancelable event argument classes for the composer.
 *
 * Follows MJ's Before/After cancelable pattern as specified in
 * `guides/UI_LAYERING_GUIDE.md` section 6, and mirrors the sibling implementations in
 * `ng-conversations`, `ng-base-forms` and `ng-trees`.
 *
 * **Contract:** an action a host might want to veto ships as a `Before*` / `After*` pair. The
 * `Before*` event carries an args object extending {@link CancellableComposerEventArgs} with a
 * `Cancel` property the listener flips. The component checks `if (args.Cancel) return;` and emits
 * the matching `After*` ONLY on the non-canceled path. Hosts rely on that, so it is a contract
 * rather than a convention.
 *
 * Declared here rather than imported from `ng-conversations` because the dependency runs the other
 * way: `ng-composer` is the generic layer and knows nothing about conversations.
 *
 * Note for listeners: `Before*` handlers must be synchronous. Angular's `EventEmitter` is
 * synchronous, which is the entire mechanism by which `Cancel` travels back — an `await` inside a
 * handler returns control before it sets the flag, and the veto is silently lost.
 *
 * @module @memberjunction/ng-composer
 */

/**
 * Base for cancelable composer events. Listeners flip `Cancel = true` to halt the default
 * behavior; the matching `After*` event will NOT fire. `CancelReason` is free-form, for telemetry
 * or for a host that wants to explain itself in the UI.
 */
export class CancellableComposerEventArgs {
    public Cancel: boolean = false;
    public CancelReason?: string;
}

/**
 * Fired BEFORE the composer opens the skill-command dropdown from its Skills button.
 *
 * Cancel to block it — for example a host that gates skills by entitlement and would rather show
 * its own explanation than an empty list, or one that surfaces skills in its own surface entirely.
 * Canceling suppresses the trigger; the composer does not open, and `afterSkillsOpened` is not
 * emitted.
 */
export class BeforeSkillsOpenedEventArgs extends CancellableComposerEventArgs {}
