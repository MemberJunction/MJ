/**
 * @fileoverview Before/After cancelable event argument classes for the composer.
 *
 * The cancelable BASE lives in `@memberjunction/global` as {@link CancelableEventArgs} — the
 * pattern is framework-agnostic and shared, so this package inherits it rather than declaring
 * another copy. Only composer-specific args belong here.
 *
 * Contract (see `guides/UI_LAYERING_GUIDE.md` section 6): an action a host might veto ships as a
 * `Before*` / `After*` pair. A listener flips `Cancel = true`, the component checks
 * `if (args.Cancel) return;` and does NOT emit the matching `After*`.
 *
 * @module @memberjunction/ng-composer
 */

import { CancelableEventArgs } from '@memberjunction/global';

/**
 * Fired BEFORE the composer opens the skill-command dropdown from its Skills button.
 *
 * Cancel to block it — for example a host that gates skills by entitlement and would rather show
 * its own explanation than an empty list, or one that surfaces skills in its own surface entirely.
 * Canceling suppresses the trigger; the composer does not open, and `afterSkillsOpened` is not
 * emitted.
 */
export class BeforeSkillsOpenedEventArgs extends CancelableEventArgs {}
