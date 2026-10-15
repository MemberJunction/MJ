/**
 * Archetype JSONType contracts for `MJ: Video Archetypes` (§4.3).
 *
 * These interfaces are referenced both by `VideoGenerationSpec` and by CodeGen's
 * `JSONType` metadata on `MJ: Video Archetypes` (`BeatTemplate` and `Pacing` columns).
 */

/**
 * Cut cadence and hold rules governing how quickly visual states change in a film.
 */
export interface VideoPacing {
    /** Target average interval in seconds between visual state changes. */
    AvgSecondsBetweenChanges: number;
    /** Rules governing minimum hold times on key numbers, headlines, and end cards. */
    HoldRules: string;
    /** Optional minimum duration in seconds allowed for any single beat. */
    MinBeatDurationSeconds?: number;
    /** Optional maximum duration in seconds allowed for any single beat. */
    MaxBeatDurationSeconds?: number;
}

/**
 * Reusable beat slot definition within an `MJ: Video Archetypes` beat template (§4.3).
 */
export interface VideoBeatTemplate {
    /** Stable identifier for the beat slot (e.g., 'hook', 'problem', 'reveal', 'proof', 'close'). */
    Key: string;
    /** Narrative role label displayed in storyboards (e.g., 'Hook', 'Problem', 'Reveal', 'Proof', 'Close'). */
    Label: string;
    /** What this beat must accomplish in the narrative arc. */
    Purpose: string;
    /** Minimum duration in seconds permitted for this beat. */
    MinDurationSeconds: number;
    /** Maximum duration in seconds permitted for this beat. */
    MaxDurationSeconds: number;
    /** Suggested default duration in seconds before narration clip timing fit. */
    DefaultDurationSeconds?: number;
    /** Direction for the Storyboard and Motion Engineer on visual and audio treatment. */
    Guidance?: string;
    /** Whether this beat slot typically requires at least one bound metric or chart. */
    RequiresDataBinding?: boolean;
}
