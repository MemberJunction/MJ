/**
 * Archetype JSONType contracts for `MJ: Video Archetypes` (§4.3).
 *
 * `VideoBeatTemplate` is referenced by CodeGen's `JSONType` metadata on
 * `MJ: Video Archetypes.BeatTemplate`. `VideoPacing` (used by both `MJ: Video Archetypes.Pacing`
 * and `VideoStyleGuide.Pacing`) lives in `video-generation-spec.ts` so `generate-prompt-types.mjs`
 * (which inspects a single file's AST declarations without following imports) includes its
 * definition in `video-generation-spec.ts.generated-for-prompt.md`. Both files are re-exported
 * from `index.ts`.
 */

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
