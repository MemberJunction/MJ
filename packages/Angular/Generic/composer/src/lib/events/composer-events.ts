/**
 * @fileoverview Before/After cancelable event argument classes for the composer.
 *
 * Contract (see `guides/UI_LAYERING_GUIDE.md` section 6): an action a host might veto ships as a
 * `Before*` / `After*` pair. The `Before*` event carries args extending
 * {@link CancellableComposerEventArgs}; a listener flips `Cancel = true`, the component checks
 * `if (args.Cancel) return;` and does NOT emit the matching `After*`. Hosts rely on that, so it is
 * a contract rather than a convention.
 *
 * The base is PER-DOMAIN by design, not shared. The same guide's naming table specifies
 * `Cancellable<Domain>EventArgs` for exactly this class, which is why `ng-base-forms`,
 * `ng-conversations`, `ng-trees`, `ng-entity-viewer` and a dozen others each declare their own
 * rather than inheriting one. A shared base would also be the wrong dependency edge here:
 * `ng-composer` is the generic layer and cannot import from `ng-conversations`.
 *
 * Note for listeners: `Before*` handlers must be SYNCHRONOUS. Angular's `EventEmitter` dispatches
 * synchronously, which is the entire mechanism by which `Cancel` travels back to the component. An
 * `await` inside a handler returns control before the flag is set, and the veto is silently lost.
 *
 * @module @memberjunction/ng-composer
 */

/**
 * Base for the composer's cancelable events. Listeners flip `Cancel = true` to halt the default
 * behavior; the matching `After*` event will not fire. `CancelReason` is free-form, for telemetry
 * or for a host that wants to explain itself in the UI.
 */
export class CancellableComposerEventArgs {
    public Cancel: boolean = false;
    public CancelReason?: string;
}

/**
 * Fired BEFORE the composer opens the skill-command dropdown from its Skills button.
 *
 * Cancel to block it, for example a host that gates skills by entitlement and would rather show its
 * own explanation than an empty list, or one that surfaces skills elsewhere entirely. Canceling
 * suppresses the trigger; the composer does not open, and `AfterSkillsOpened` is not emitted.
 */
export class BeforeSkillsOpenedEventArgs extends CancellableComposerEventArgs {}
