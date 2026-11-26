/**
 * Launch and throttling policy stored on `MJ: Tours.LaunchPolicy` and `MJ: Tour Overrides.LaunchPolicy`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** Tour.LaunchPolicy / TourOverride.LaunchPolicy — controls offering, throttling, and holdouts. */
export interface ITourLaunchPolicy {
    /** Whether eligible triggers may auto-start the tour without user click (use sparingly for critical flows). */
    AutoLaunch?: boolean;
    /** Whether the tour may be proactively offered (banner/orb/beacon) rather than launch-on-demand only. */
    OfferByDefault?: boolean;
    /** Whether the tour appears in the shell Tours & Help launcher. */
    AllowLauncher?: boolean;
    /** Whether the tour is searchable in the Explorer omnibar. */
    AllowOmnibar?: boolean;
    /** Whether beacon triggers for this tour are enabled. */
    AllowBeacons?: boolean;
    /** Maximum times this tour may be offered to a single user across sessions. */
    MaxOffersPerUser?: number;
    /** Cooldown in days after a user dismisses or completes an offer. */
    CooldownDays?: number;
    /** Critical-bypass flag allowing an offer to ignore the global interruption budget. */
    BypassBudget?: boolean;
    /** Smart delay in milliseconds waiting for user inactivity before surfacing an unrequested offer. */
    SmartDelayMs?: number;
    /** Suppresses unrequested offers while any form on screen has unsaved edits (default true). */
    SuppressWhenDirtyForm?: boolean;
    /** Suppresses unrequested offers while a modal dialog is open (default true). */
    SuppressWhenDialogOpen?: boolean;
    /** Percentage (0-100) of eligible users placed into a holdout group for goal-lift measurement. */
    HoldoutPercentage?: number;
    /** Requires explicit user consent once per tour before cross-screen `Prepare` navigation runs. */
    RequireNavigationConsent?: boolean;
    /** Restricts which guide modes are permitted for this tour. */
    AllowedDirections?: Array<'Visual' | 'Chat' | 'Voice'>;
}
