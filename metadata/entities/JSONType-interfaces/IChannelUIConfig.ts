/**
 * Channel-definition-level presentation/chrome config.
 *
 * Stored as a JSON object in the `UIConfig` column of the `MJ: AI Agent Channels` entity.
 * CodeGen emits a strongly-typed `UIConfigObject` accessor on `AIAgentChannelEntity`
 * that returns `IChannelUIConfig | null`.
 *
 * Distinct from the channel's `ConfigSchema` column, which validates the *per-session*
 * `AIAgentSessionChannel.Config` state-of-record. This bag is the channel-definition's
 * own UI chrome, read in-memory by the host when rendering channel tabs and placing the
 * channel's surface. Extensible with no DB change — add future chrome fields here.
 */
export interface IChannelUIConfig {
    /** Human label for the tab/chrome. Null → fall back to the channel's Name. */
    DisplayName?: string | null;
    /** Optional group for clustering channels in the UI. Null → ungrouped. */
    GroupName?: string | null;
    /** Chrome accent. Prefer a semantic design-token name (e.g. "--mj-brand-primary"); hex allowed but discouraged. */
    Color?: string | null;
    /** Font Awesome class, e.g. "fa-solid fa-satellite-dish". */
    Icon?: string | null;
    /** Display order within a group/list. */
    SortOrder?: number | null;
    /**
     * Where the channel's surface shows when a call starts: "stage" fills the call, "pip" floats in a
     * picture-in-picture box over it, "tab" sits on its tab in the side panel, "hidden" shows nowhere until
     * the user moves it. Null → "tab". The user's own move wins over this, when AllowedPlacements allows it.
     */
    Placement?: 'stage' | 'pip' | 'tab' | 'hidden' | null;
    /**
     * Where the user may move the channel's surface. Null or empty → anywhere. A Placement missing from
     * this list is replaced by the first placement listed here.
     */
    AllowedPlacements?: Array<'stage' | 'pip' | 'tab' | 'hidden'> | null;
}
