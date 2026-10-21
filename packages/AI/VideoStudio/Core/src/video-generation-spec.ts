/**
 * Canonical `VideoGenerationSpec` production contract and all sub-types (§3.1, §3.4, §10.1, §11.1, §13.3).
 *
 * This file is processed by `generate-prompt-types.mjs` (VS-SPEC-3) to produce
 * `video-generation-spec.ts.generated-for-prompt.md` for `{@include}` in agent prompts.
 * All union types are written out as explicit literal members so prompt type references
 * remain self-contained for LLMs.
 */

// ---------------------------------------------------------------------------
// Core Status & Format Unions
// ---------------------------------------------------------------------------

/**
 * Canonical schema version for `VideoGenerationSpec` documents.
 */
export const VIDEO_STUDIO_SPEC_VERSION = '1.0' as const;

/**
 * Lifecycle stage of a Video Studio production from initial briefing through final delivery.
 */
export type VideoProductionStatus =
    | 'Briefing'      // Director is capturing the film brief, audience, required assets, and data bindings
    | 'Styled'        // Art Director has produced the style guide from brand kit and reference analysis
    | 'Storyboarded'  // Storyboard has defined contiguous beats, narration script, cues, and layout notes
    | 'Approved'      // Storyboard and plan have passed Gate G2 (autonomous or human/parent approved)
    | 'PreProduced'   // Pre-Production has frozen data snapshots, synthesized narration timings, and staged/generated assets
    | 'Composed'      // Motion Engineer has authored lint-clean compositions for each target format
    | 'RoughCut'      // Render has produced rough-cut videos, representative stills, and contact sheets
    | 'Reviewed'      // Critic has evaluated rendered frames against the rubric and repair loops have converged
    | 'Delivered'     // All gates G1-G6 have passed and final deliverables are packaged in Output
    | 'Blocked';      // Production cannot proceed without a missing MustUse fact or policy resolution

/**
 * Supported aspect ratios; each format is authored and rendered as its own composition (§7.5).
 */
export type VideoFormat =
    | '16:9'  // Landscape widescreen composition (e.g., 1920x1080 desktop or presentation)
    | '9:16'  // Vertical portrait composition (e.g., 1080x1920 mobile or social short)
    | '1:1';  // Square composition (e.g., 1080x1080 social feed post)

/**
 * Reference to the `MJ: Video Archetypes` template governing structure and pacing defaults.
 */
export interface VideoArchetypeRef {
    /** Optional `MJ: Video Archetypes` entity ID when bound to a stored archetype row. */
    ArchetypeID?: string;
    /** Human-readable archetype name (e.g., 'KPI Briefing', 'Topic Explainer'). */
    Name: string;
}

/**
 * Core editorial brief defining what the film communicates, to whom, and at what runtime.
 */
export interface VideoFilmBrief {
    /** Single sentence stating what the viewer must remember after watching. */
    OneSentence: string;
    /** Target audience and their context for watching this film. */
    Audience: string;
    /** Why this film exists and the outcome or decision it is meant to drive. */
    Purpose: string;
    /** Target total runtime of the film in seconds. */
    DurationSeconds: number;
    /** Target aspect ratios to compose and deliver (each is a separate composition). */
    Formats: VideoFormat[];
    /** Optional BCP-47 language tag for narration, captions, and on-screen copy (defaults to 'en-US'). */
    Language?: string;
}

// ---------------------------------------------------------------------------
// Assets & Generative Media (§3.1, §3.4, §13.3)
// ---------------------------------------------------------------------------

/**
 * Media category of a production or brand-kit asset (aligned with `MJ: Brand Kit Assets.AssetType`).
 */
export type VideoAssetKind =
    | 'Logo'          // Primary or secondary brand logo
    | 'LogoMark'      // Standalone icon or logomark
    | 'Font'          // Bundled typeface file (WOFF2/TTF/OTF)
    | 'Image'         // Still image, photo, or illustration
    | 'Screenshot'    // Authentic product UI or web page capture
    | 'Video'         // Video clip or B-roll footage
    | 'Music'         // Background music track with license coverage
    | 'SoundEffect'   // Short audio cue or UI sound effect
    | 'Other';        // Other supplemental production asset

/**
 * Provenance classification enforcing the facts-vs-choices boundary (§3.4).
 */
export type VideoAssetProvenance =
    | 'Supplied'   // Provided directly by the user or caller for this production (fact)
    | 'BrandKit'   // Pulled from the active MJ: Brand Kit Assets catalog (fact)
    | 'Captured'   // Captured deterministically such as a Playwright screenshot of an approved URL (fact)
    | 'Generated'; // Synthesized by an AI image/video generator in Pre-Production (choice, never fact)

/**
 * Provenance, model, reference, and cost record attached to a `Generated` asset (§13.3).
 */
export interface VideoAssetGenerationMetadata {
    /** `MJ: AI Models` ID used to generate this asset. */
    ModelID: string;
    /** `MJ: AI Prompt Runs` ID recording the execution, usage, and cost. */
    PromptRunID: string;
    /** Exact prompt text submitted to the image or video generator. */
    Prompt: string;
    /** Optional deterministic seed used by the generator. */
    Seed?: number;
    /** Keys of approved or brand-kit assets passed as visual references. */
    ReferenceKeys: string[];
    /** Duration in seconds when the generated asset is a video clip. */
    DurationSeconds?: number;
    /** Recorded generation cost in USD from the prompt run. */
    Cost?: number;
    /** Whether the provider returned C2PA content credentials on the stored file. */
    C2PA?: boolean;
}

/**
 * Approved, brand-kit, captured, or generated asset available to compositions.
 */
export interface VideoAsset {
    /** Unique logical key referenced by beats, compositions, or generation requests. */
    Key: string;
    /** Media category of the asset. */
    Kind: VideoAssetKind;
    /** `MJ: Files` ID where the binary is stored in MJStorage. */
    FileID?: string;
    /** Optional `MJ: Artifact Versions` ID when sourced from an artifact. */
    ArtifactVersionID?: string;
    /** Human-readable origin description or approved source URL/filename. */
    Source: string;
    /** How the asset entered the production (facts vs generated choices). */
    Provenance: VideoAssetProvenance;
    /** Guidance on how and where this asset may be used in the film. */
    Usage: string;
    /** Whether the production must include this asset before delivery. */
    MustUse: boolean;
    /** Provenance and spend metadata populated when `Provenance` is `'Generated'`. */
    Generation?: VideoAssetGenerationMetadata;
    /** Relative bundle path populated by Pre-Production when staged for rendering. */
    StagedPath?: string;
}

/**
 * Asset requirement identified from the brief; unmet `MustUse` requirements block production (§3.2, §3.4).
 */
export interface VideoAssetRequirement {
    /** Logical key of the required asset (matched against `Assets.Approved[i].Key`). */
    Key: string;
    /** Expected media category for the required asset. */
    Kind: VideoAssetKind;
    /** What asset is needed and what fact or visual role it fulfills. */
    Description: string;
    /** When true, an unmet requirement sets `Status` to `'Blocked'` so the agent asks rather than invents. */
    MustUse: boolean;
    /** Defaults to false; only when true may a `Generated` asset satisfy this requirement (§3.4). */
    AllowGenerated?: boolean;
    /** Key in `Assets.Approved` that satisfies this requirement once resolved. */
    SatisfiedByAssetKey?: string;
}

/**
 * Timestamped image anchor passed to a video generator to constrain start/mid/end frames (§13.3).
 */
export interface VideoGenerationKeyframe {
    /** Timestamp offset in seconds within the generated video clip. */
    Seconds: number;
    /** Key of an approved or brand-kit image asset anchoring this keyframe. */
    AssetKey: string;
}

/**
 * Lifecycle status of an illustrative asset generation request in `Assets.Generate` (§13.3).
 */
export type VideoGenerationRequestStatus =
    | 'Pending'   // Queued for screening and synthesis in Pre-Production (default when absent)
    | 'Generated' // Synthesized, stored in MJStorage, and added to Assets.Approved with Generation provenance
    | 'Blocked';  // Refused by pre-call policy/budget/integrity screen or failed during runner execution

/**
 * Request for Pre-Production to synthesize an illustrative image or video clip (§13.3).
 */
export interface VideoAssetGenerationRequest {
    /** Target asset key that will be added to `Assets.Approved` once generated. */
    Key: string;
    /** Whether to generate a still image or a video clip. */
    Kind: 'Image' | 'Video';
    /** Descriptive generation prompt (screened against `NeverInvent` and brand-kit `GenerationPolicy`). */
    Prompt: string;
    /** Narrative or atmospheric reason this generated asset is needed. */
    Purpose: string;
    /** Target aspect ratio for the generated asset. */
    Format?: VideoFormat;
    /** Requested clip duration in seconds (required when `Kind` is `'Video'`). */
    DurationSeconds?: number;
    /** Keys of approved or brand-kit reference assets to guide style or subject. */
    ReferenceKeys: string[];
    /** Optional keyframe image anchors for video generation. */
    Keyframes?: VideoGenerationKeyframe[];
    /** Defaults to false (clip audio muted); set true to preserve ambient generator audio. */
    WantAudio?: boolean;
    /** Lifecycle status set by Pre-Production; absent means `'Pending'`. */
    Status?: VideoGenerationRequestStatus;
    /** Reason code and explanation when `Status` is `'Blocked'` (`'<Code>: <Reason>'`). */
    BlockedReason?: string;
    /** Spend in USD incurred by failed or blocked runner invocations on this request. */
    Cost?: number;
    /** Number of times this request has been reset for regeneration after a Critic defect. */
    RegenerationCount?: number;
}

/**
 * Complete asset inventory, requirements, generation requests, and fabrication guardrails.
 */
export interface VideoAssetsSpec {
    /** Approved, brand-kit, captured, or generated assets available to compositions. */
    Approved: VideoAsset[];
    /** Asset requirements identified by the Director from the brief. */
    Required: VideoAssetRequirement[];
    /** Optional requests for Pre-Production to synthesize illustrative images or clips. */
    Generate?: VideoAssetGenerationRequest[];
    /** Facts and subjects the model must never fabricate (e.g., 'product UI', 'logo', 'metrics'). */
    NeverInvent: string[];
}

// ---------------------------------------------------------------------------
// Style Guide & Reference Analysis (§3.1, §13.2)
// ---------------------------------------------------------------------------

/**
 * Named color token with a concrete CSS color value and explicit usage rule.
 */
export interface ColorToken {
    /** Semantic token name (e.g., 'background.primary', 'text.primary', 'accent.positive'). */
    Name: string;
    /** Concrete CSS color value (e.g., '#0F172A', 'rgb(15, 23, 42)'), never an adjective. */
    Value: string;
    /** When and where this color token is applied in compositions. */
    Usage: string;
}

/**
 * Typographic specification binding a text role to a bundled font and per-format scale.
 */
export interface TypeSpec {
    /** Typographic role (e.g., 'Headline', 'Subhead', 'Body', 'MetricValue', 'Caption'). */
    Role: string;
    /** Exact font family name matching a bundled brand-kit font asset. */
    FontFamily: string;
    /** Optional key in `Assets.Approved` for the bundled font file. */
    FontAssetKey?: string;
    /** Font weight (e.g., 700, 500, '600'). */
    Weight: number | string;
    /** CSS font size per target aspect ratio (e.g., `{ '16:9': '64px', '9:16': '52px' }`). */
    SizeByFormat: Partial<Record<VideoFormat, string>>;
    /** Optional CSS line-height value (e.g., '1.15'). */
    LineHeight?: string;
    /** Optional CSS letter-spacing value (e.g., '-0.02em'). */
    LetterSpacing?: string;
}

/**
 * Object classes governed by distinct motion and easing rules in compositions.
 */
export type MotionObjectClass =
    | 'MicroUI'     // Small UI controls, cursors, badges, and toggles
    | 'Panel'       // Cards, containers, charts, and split-screen panels
    | 'Camera'      // Viewport pan, zoom, and depth shifts
    | 'Headline'    // Primary display typography and callouts
    | 'Mascot'      // Character, avatar, or illustrative focal element
    | 'DataMetric'  // Animated counters, KPI tiles, and data marks
    | 'Background'; // Ambient backdrops and texture layers

/**
 * Choreography and easing specification for a specific `MotionObjectClass`.
 */
export interface MotionRule {
    /** Category of visual element governed by this motion rule. */
    ObjectClass: MotionObjectClass;
    /** CSS or cubic-bezier easing curve (e.g., 'cubic-bezier(0.22, 1, 0.36, 1)'). */
    Easing: string;
    /** Standard transition duration in milliseconds for this object class. */
    DurationMs: number;
    /** Specific choreography constraints (e.g., entrance direction, stagger, settle behavior). */
    Notes: string;
}

/**
 * Structured design lessons and explicit anti-copy rules extracted from a reference image or video (§13.2).
 */
export interface ReferenceAnalysis {
    /** Asset key or reference identifier inspected by the Art Director. */
    SourceKey: string;
    /** Color relationships and contrast strategy observed in the reference. */
    PaletteLearned: string;
    /** Hierarchy, scale, and weight treatment observed in the reference. */
    TypographyLearned: string;
    /** Focal point placement, framing, and negative-space lessons. */
    CompositionLearned: string;
    /** Rhythm, cut density, and hold timing observed in the reference. */
    PacingLearned: string;
    /** Easing weight, choreography, and camera movement lessons. */
    MotionLearned: string;
    /** Optional surface grain, lighting, or material treatment notes. */
    TextureLearned?: string;
    /** Explicit elements from the reference that must not be imitated or copied. */
    DoNotCopy: string[];
}

/**
 * Cut cadence and hold rules governing how quickly visual states change in a film (§3.1, §4.3).
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
 * Art Director's concrete visual and motion style guide for the production.
 */
export interface VideoStyleGuide {
    /** Concrete color tokens governing backgrounds, text, accents, and data series. */
    Palette: ColorToken[];
    /** Typographic scale and bundled font assignments per text role. */
    Typography: TypeSpec[];
    /** Primary visual hierarchy rule stating where the viewer's eye goes first. */
    Composition: string;
    /** Cut cadence and hold rules for the production. */
    Pacing: VideoPacing;
    /** Per-object-class choreography and easing rules. */
    MotionRules: MotionRule[];
    /** Optional surface treatment (grain, elevation shadows, border treatments). */
    Texture?: string;
    /** Positive stylistic commitments to maintain across every beat. */
    Keep: string[];
    /** Explicit anti-patterns banned from compositions (e.g., 'centered text on gradient'). */
    Avoid: string[];
    /** Structured takeaways and `DoNotCopy` lists from inspected reference media. */
    References: ReferenceAnalysis[];
}

// ---------------------------------------------------------------------------
// Storyboard Beats (§3.1, §3.2)
// ---------------------------------------------------------------------------

/**
 * Single contiguous narrative beat on the production timeline.
 */
export interface VideoBeat {
    /** Unique identifier for the beat (e.g., 'beat-1-hook'), referenced by narration and defects. */
    Key: string;
    /** Narrative role label (e.g., 'Hook', 'Problem', 'Reveal', 'Proof', 'Close'). */
    Label: string;
    /** Beat start timestamp in seconds on the master timeline. */
    StartSeconds: number;
    /** Beat end timestamp in seconds on the master timeline. */
    EndSeconds: number;
    /** Visual or UI state at the start of the beat. */
    EntryState: string;
    /** Visual or UI state reached by the end of the beat. */
    ExitState: string;
    /** Why this shot exists and what change in viewer understanding it achieves. */
    Purpose: string;
    /**
     * Exact strings displayed on screen during this beat. Bound values must appear as `{BindingKey}`
     * placeholders referencing keys in `DataRefs`; any remaining numeric literal is rejected as unbound.
     */
    OnScreenText: string[];
    /** Keys in `DataBindings` whose values are rendered during this beat. */
    DataRefs: string[];
    /** Keys in `Assets.Approved` displayed or heard during this beat. */
    AssetRefs: string[];
    /** Optional key linking this beat to its `NarrationLine` in `Audio.Narration.Script`. */
    NarrationKey?: string;
    /** Per-format layout rules (must include every format listed in `Deliverables.Formats`). */
    LayoutNotes: Partial<Record<VideoFormat, string>>;
}

// ---------------------------------------------------------------------------
// Data Bindings & Snapshot (§10.1, §10.2)
// ---------------------------------------------------------------------------

/**
 * Mechanism used by Pre-Production to resolve a `VideoDataBinding` as `contextUser`.
 */
export type VideoDataSourceKind =
    | 'Query'     // Saved MJ Query executed via RunQuery with optional Parameters
    | 'View'      // MJ Entity view executed via RunView with EntityName and ExtraFilter
    | 'Artifact'  // Existing MJ Artifact Version referenced by ArtifactVersionID
    | 'Inline';   // Caller-supplied structured data already present in DataSnapshot.Inline

/**
 * Authoritative query, view, artifact, or inline data source definition (§10.1).
 */
export interface VideoDataSource {
    /** Mechanism used by Pre-Production to resolve this binding. */
    Kind: VideoDataSourceKind;
    /** `MJ: Queries` ID when `Kind` is `'Query'`. */
    QueryID?: string;
    /** Open key-value parameter map passed to a parameterized query (`Kind: 'Query'`). */
    Parameters?: Record<string, unknown>;
    /** MemberJunction entity name when `Kind` is `'View'`. */
    EntityName?: string;
    /** SQL filter clause when `Kind` is `'View'`. */
    ExtraFilter?: string;
    /** Explicit field projection list for `'View'` queries to minimize payload size. */
    Fields?: string[];
    /** `MJ: Artifact Versions` ID when `Kind` is `'Artifact'`. */
    ArtifactVersionID?: string;
}

/**
 * Structural shape of the dataset resolved from a `VideoDataBinding`.
 */
export type VideoDataShape =
    | 'Scalar'  // Single numeric, string, or date value (e.g., total revenue MTD)
    | 'Series'  // Ordered time-series or categorical array for bar/line/area/sparkline charts
    | 'Table'   // Multi-column tabular rows for ranked lists or table reveals
    | 'Delta';  // Current value paired with comparison baseline and percentage/absolute change

/**
 * Display formatting category for bound values shown on screen.
 */
export type VideoDataFormatKind =
    | 'Currency'  // Monetary value formatted with currency symbol or ISO code
    | 'Percent'   // Percentage value formatted with % suffix
    | 'Number'    // Plain or abbreviated numeric value
    | 'Date';     // ISO date or human-readable date label

/**
 * Display formatting rules for numbers, currencies, percentages, or dates.
 */
export interface VideoDataFormat {
    /** Display formatting style for values resolved from this binding. */
    Kind: VideoDataFormatKind;
    /** ISO 4217 currency code (e.g., 'USD', 'EUR') when `Kind` is `'Currency'`. */
    Currency?: string;
    /** Number of fractional digits to display. */
    Decimals?: number;
}

/**
 * Column header and optional cell display format for a `'Table'` data binding (§10.1).
 */
export interface VideoTableColumn {
    /** Column header text matching the selected table field or display column. */
    Header: string;
    /** Optional display formatting rules for numeric or date cells in this column. */
    Format?: VideoDataFormat;
}

/**
 * Named binding connecting an on-screen number or chart to an authoritative data source (§10.1).
 */
export interface VideoDataBinding {
    /** Unique binding key (e.g., 'kpi.revenue.mtd') referenced by `Beat.DataRefs` and compositions. */
    Key: string;
    /** Authoritative query, view, artifact, or inline source definition. */
    Source: VideoDataSource;
    /** Structural shape of the resolved dataset. */
    Shape: VideoDataShape;
    /** Optional display formatting rules for numbers, currencies, percentages, or dates. */
    Format?: VideoDataFormat;
    /** Optional ordered per-column headers and display formats when `Shape` is `'Table'`. */
    Columns?: VideoTableColumn[];
    /** Human-readable metric label for charts, callouts, and data tabs. */
    Label?: string;
}

/**
 * Frozen data snapshot captured by Pre-Production as `contextUser` (§10.2).
 */
export interface VideoDataSnapshot {
    /** `MJ: Files` ID storing the frozen JSON snapshot when too large for inline embedding. */
    FileID?: string;
    /** Open map from `VideoDataBinding.Key` to frozen resolved values when stored inline. */
    Inline?: Record<string, unknown>;
    /** ISO-8601 timestamp recording when the snapshot was captured (shown on provenance end card). */
    AsOf: string;
    /** Human-readable provenance descriptors or IDs for every data source executed. */
    Sources: string[];
}

// ---------------------------------------------------------------------------
// Audio, Narration & Cues (§3.1, §8)
// ---------------------------------------------------------------------------

/**
 * Word-level alignment timing derived from TTS timestamps for captions and cue sync (§8).
 */
export interface NarrationWordTiming {
    /** Spoken word token aligned from TTS timestamps. */
    Word: string;
    /** Word start time in seconds on the master timeline. */
    StartSeconds: number;
    /** Word end time in seconds on the master timeline. */
    EndSeconds: number;
}

/**
 * Single spoken narration line synthesized for a specific beat (§8).
 */
export interface NarrationLine {
    /** Unique narration line identifier (referenced by `VideoBeat.NarrationKey`). */
    Key: string;
    /** `VideoBeat.Key` that this narration line drives. */
    BeatKey: string;
    /** Spoken script text for this beat. */
    Text: string;
    /** `MJ: Files` ID of the synthesized TTS clip uploaded by Pre-Production. */
    AudioFileID?: string;
    /** Relative bundle path of the staged audio clip during rendering. */
    StagedPath?: string;
    /** Resolved start time in seconds on the master timeline after synthesis. */
    StartSeconds?: number;
    /** Measured clip duration in seconds used to fit the beat's length. */
    DurationSeconds?: number;
    /** Optional word-level alignment timings driving captions and audio cues. */
    WordTimings?: NarrationWordTiming[];
}

/**
 * Voiceover narration configuration and per-beat script.
 */
export interface VideoNarrationSpec {
    /** Provider voice identifier (from brand kit `IBrandVoice` or brief override). */
    VoiceID: string;
    /** TTS provider name (e.g., 'ElevenLabs', 'OpenAI'). */
    Provider: string;
    /** Ordered narration lines, typically one per beat. */
    Script: NarrationLine[];
}

/**
 * Licensed background music configuration and optional beat grid (§8).
 */
export interface VideoMusicSpec {
    /** Key in `Assets.Approved` pointing to a licensed music track. */
    AssetKey: string;
    /** Optional array of musical beat timestamps in seconds for cut and cue alignment. */
    BeatGrid?: number[];
    /** Optional mix level in dB under narration (e.g., -18). */
    GainDb?: number;
}

/**
 * Category of timestamped audio event on the master timeline.
 */
export type AudioCueKind =
    | 'Sfx'         // Discrete sound effect asset triggered at TimestampSeconds
    | 'MusicDuck'   // Duck background music under narration or emphasis
    | 'MusicSwell'  // Swell background music during transitions or closing beat
    | 'Silence';    // Intentional breath or pause on the audio timeline

/**
 * Timestamped sound effect or mix event on the same timeline as the picture (§8).
 */
export interface AudioCue {
    /** Unique identifier for the audio cue. */
    Key: string;
    /** Exact trigger timestamp in seconds on the master timeline (`0` to `DurationSeconds`). */
    TimestampSeconds: number;
    /** Type of audio event or mix change. */
    Kind: AudioCueKind;
    /** Optional key in `Assets.Approved` when `Kind` is `'Sfx'`. */
    AssetKey?: string;
    /** Optional `VideoBeat.Key` associated with this cue for sync review. */
    BeatKey?: string;
    /** Mix or sync intent notes for the critic's "close your eyes" check. */
    Notes?: string;
}

/**
 * Caption delivery mode for spoken narration.
 */
export type VideoCaptionMode =
    | 'None'     // No captions rendered or exported
    | 'Burned'   // Captions rendered directly into the composition picture
    | 'Sidecar'; // Captions exported as a separate WebVTT/SRT file in Output

/**
 * Complete audio specification sharing the master timeline with the picture.
 */
export interface VideoAudioSpec {
    /** Optional voiceover narration configuration and per-beat script. */
    Narration?: VideoNarrationSpec;
    /** Optional licensed background music track and beat grid. */
    Music?: VideoMusicSpec;
    /** Timestamped sound effects and mix cues on the shared picture timeline. */
    Cues: AudioCue[];
    /** Caption delivery mode ('None', 'Burned', or 'Sidecar'). */
    Captions: VideoCaptionMode;
}

// ---------------------------------------------------------------------------
// Render, Interaction & Deliverables (§3.1, §5.2, §6.4, §7)
// ---------------------------------------------------------------------------

/**
 * Vendor-neutral rendering and generation quality tier mapped from power level presets (§5.2).
 */
export type VideoRenderQuality =
    | 'draft'     // Fast iteration tier (lower resolution/bitrate, 24 fps default)
    | 'standard'  // Production standard tier (Full HD, 30 fps)
    | 'high';     // Broadcast/master tier (QHD/UHD, 30 fps, highest bitrate)

/**
 * Deterministic renderer configuration for the production (§7.4).
 */
export interface VideoRenderConfig {
    /** Underlying composition rendering engine identifier. */
    Renderer: 'HyperFrames';
    /** Exact pinned `@hyperframes/producer` version used for the render. */
    RendererVersion: string;
    /** Frame rate in frames per second (e.g., 24 or 30). */
    Fps: number;
    /** Deterministic PRNG seed injected into the composition runtime. */
    Seed: number;
    /** Encoding and resolution quality tier ('draft', 'standard', or 'high'). */
    Quality: VideoRenderQuality;
}

/**
 * Human/caller approval checkpoint mode across the production pipeline (§5.4, §6).
 */
export type VideoInteractionMode =
    | 'Autonomous'                    // Proceed through all stages without pausing for approval unless Blocked
    | 'ApproveStoryboard'             // Pause at Gate G2 for storyboard approval before Pre-Production spend
    | 'ApproveStoryboardAndRoughCut'; // Pause at Gate G2 (storyboard) and Gate G4 (rough cut) before final delivery

/**
 * Interaction and repair loop bounds for the production run.
 */
export interface VideoInteractionSpec {
    /** Approval checkpoint policy for this production run. */
    Mode: VideoInteractionMode;
    /** Hard cap on critic-driven repair iterations (from preset power level, §9). */
    MaxRepairRounds: number;
}

/**
 * Deliverables requested from the production run.
 */
export interface VideoDeliverablesSpec {
    /** Aspect ratio compositions that must be rendered and packaged for delivery. */
    Formats: VideoFormat[];
    /** Whether to capture and store a poster still frame. */
    Poster: boolean;
    /** Whether to build and store tiled contact sheets per format. */
    ContactSheets: boolean;
    /** Whether to archive the composition HTML/CSS/JS source bundle in `Output`. */
    Source: boolean;
    /** Whether to produce a caption file when narration is present. */
    Captions: boolean;
}

// ---------------------------------------------------------------------------
// Review Gates, Critic Rounds & Rubric Scores (§3.1, §5.4, §9)
// ---------------------------------------------------------------------------

/**
 * Production quality gates enforced by `VideoStudioAgent` (§5.4).
 */
export type VideoGateId =
    | 'G1'  // Facts gate: brief complete, MustUse assets resolved, data bindings resolvable
    | 'G2'  // Plan gate: spec validates at Storyboarded, style guide and shot list complete, plan approved
    | 'G3'  // Stills gate: representative stills captured per beat/format and pass deterministic checks
    | 'G4'  // Rough cut gate: full render and contact sheets exist and initial critic round completed
    | 'G5'  // Repair gate: top defects fixed and re-verified or MaxRepairRounds exhausted with notes
    | 'G6'; // Deliver gate: every format rendered, poster, captions, audio verified, artifact packaged

/**
 * Verification status of a production gate.
 */
export type GateStatus =
    | 'Pending'  // Gate has not yet been evaluated
    | 'Passed'   // Gate requirements verified with recorded evidence
    | 'Failed'   // Gate check failed and requires repair or retry
    | 'Blocked'; // Gate is awaiting external human/parent input or missing fact

/**
 * Evidence record for a single production gate (`G1`–`G6`).
 */
export interface GateRecord {
    /** Identifier of the production gate ('G1' through 'G6'). */
    Gate: VideoGateId;
    /** Current verification state of the gate. */
    Status: GateStatus;
    /** File IDs, step IDs, or check identifiers proving the gate outcome. */
    EvidenceRefs: string[];
    /** ISO-8601 timestamp when the gate was last evaluated. */
    Timestamp: string;
    /** Optional diagnostic or blocker summary when status is not `'Passed'`. */
    Notes?: string;
}

/**
 * Impact level of a defect identified by deterministic checks or the Vision Critic.
 */
export type DefectSeverity =
    | 'Blocker'  // Must be repaired before delivery (e.g., data mismatch, unreadable text, missing asset)
    | 'Major'    // Significant visual, pacing, or sync defect targeted in repair rounds
    | 'Minor';   // Polish issue noted for human review if repair rounds are exhausted

/**
 * Resolution status of a defect across repair rounds.
 */
export type DefectStatus =
    | 'Open'      // Identified by deterministic checks or Critic and awaiting repair
    | 'Fixed'     // Repaired by Motion Engineer and verified in a subsequent still/render pass
    | 'Deferred'; // Unresolved after MaxRepairRounds and disclosed in HumanReviewNotes

/**
 * Concrete defect observed in rendered frames with timestamp, beat, evidence, and local fix (§9).
 */
export interface VideoDefect {
    /** Optional stable defect identifier across repair rounds. */
    Key?: string;
    /** Aspect ratio composition where the defect was observed. */
    Format?: VideoFormat;
    /** Timestamp in seconds where the defect appears in the rendered video. */
    Timestamp: number;
    /** `VideoBeat.Key` containing the defect. */
    Beat: string;
    /** Optional rubric criterion name (e.g., 'data_fidelity', 'readability', 'sound_sync'). */
    Criterion?: string;
    /** Impact level of the defect ('Blocker', 'Major', or 'Minor'). */
    Severity: DefectSeverity;
    /** What the Critic or deterministic check observed in the rendered frame. */
    Evidence: string;
    /** Specific, local adjustment instructed for the Motion Engineer. */
    Fix: string;
    /** Resolution state of the defect ('Open', 'Fixed', or 'Deferred'). */
    Status: DefectStatus;
    /** Key in `Assets.Approved` when the defect is about one asset (for example a garbled generated clip). */
    AssetKey?: string;
}

/**
 * Single critic evaluation round over rendered contact sheets and timeline (§9).
 */
export interface CriticRound {
    /** 1-based critic evaluation round index. */
    Round: number;
    /** ISO-8601 timestamp when this critic round completed. */
    Timestamp: string;
    /** Contact sheet `MJ: Files` IDs inspected in this round, keyed by format. */
    ContactSheetFileIDs?: Partial<Record<VideoFormat, string[]>>;
    /** Ranked defects identified in this round (up to top 3 for vision critic). */
    Defects: VideoDefect[];
    /** Overall assessment summary from the Critic for this round. */
    Summary?: string;
}

/**
 * Score and rationale for a single criterion in the `Video Production Quality` rubric (§9).
 */
export interface RubricCriterionScore {
    /** Rubric criterion identifier (e.g., 'hook', 'readability', 'data_fidelity', 'generated_asset_integrity'). */
    Criterion: string;
    /** Numeric score awarded for this criterion. */
    Score: number;
    /** Maximum possible score for this criterion. */
    MaxScore: number;
    /** Whether the criterion met the minimum passing threshold. */
    Passed: boolean;
    /** Brief evidence-based rationale for the score. */
    Notes?: string;
}

/**
 * Aggregate rubric evaluation summary for the production (§9).
 */
export interface RubricScoreSummary {
    /** Optional `MJ: AI Rubrics` entity ID for the `Video Production Quality` rubric. */
    RubricID?: string;
    /** Aggregate score across all evaluated criteria. */
    OverallScore: number;
    /** Maximum possible aggregate score. */
    MaxScore: number;
    /** Whether the production met the rubric's overall passing threshold. */
    Passed: boolean;
    /** Per-criterion score breakdown. */
    Criteria: RubricCriterionScore[];
}

/**
 * Complete review record containing gate evidence, critic rounds, rubric scores, and human notes.
 */
export interface VideoReviewRecord {
    /** Status and evidence records for gates 'G1' through 'G6'. */
    Gates: GateRecord[];
    /** Chronological history of critic evaluation and repair rounds. */
    Rounds: CriticRound[];
    /** Latest rubric evaluation scores from the Critic. */
    Scores?: RubricScoreSummary;
    /** Summary of deferred defects, inline storage warnings, and generated-asset disclosures. */
    HumanReviewNotes?: string;
}

// ---------------------------------------------------------------------------
// Production Manifest (`Output`, §11.1)
// ---------------------------------------------------------------------------

/**
 * Delivered MP4 file reference and technical metadata for a single `VideoFormat`.
 */
export interface VideoRenderedFormatOutput {
    /** Aspect ratio of this rendered deliverable. */
    Format: VideoFormat;
    /** `MJ: Files` ID of the rendered MP4 in MJStorage (preferred storage-first path). */
    FileID?: string;
    /** Base64 fallback payload only when below inline threshold and no storage account resolves. */
    InlineBase64?: string;
    /** Media MIME type (e.g., 'video/mp4'). */
    MimeType: string;
    /** Pixel width of the rendered video (e.g., 1920). */
    Width: number;
    /** Pixel height of the rendered video (e.g., 1080). */
    Height: number;
    /** Measured duration of the rendered video in seconds. */
    DurationSeconds: number;
    /** Size of the rendered MP4 in bytes. */
    FileSizeBytes: number;
}

/**
 * Archived composition source files and asset references for a single `VideoFormat` (§11.1).
 */
export interface VideoCompositionSource {
    /** Aspect ratio this composition renders. */
    Format: VideoFormat;
    /** Entry HTML/JS filename within the composition bundle (e.g., 'index.html'). */
    EntryFile: string;
    /** Map of relative file paths to UTF-8 text source contents (HTML, CSS, JS). */
    Files: Record<string, string>;
    /** Keys in `Assets.Approved` referenced by this composition. */
    AssetKeys: string[];
}

/**
 * Render execution metadata recorded in the production manifest (§11.1).
 */
export interface VideoRenderMetadataSummary {
    /** Renderer engine used ('HyperFrames'). */
    Renderer: 'HyperFrames';
    /** Exact `@hyperframes/producer` version string reported by the worker. */
    RendererVersion: string;
    /** Deterministic seed used during rendering. */
    Seed: number;
    /** Frame rate in frames per second used during rendering. */
    Fps: number;
    /** Rendered duration in seconds per delivered format. */
    DurationByFormat: Partial<Record<VideoFormat, number>>;
    /** ISO-8601 timestamp when the final render completed. */
    RenderedAt: string;
}

/**
 * Per-asset generation provenance and spend entry in the production manifest (§11.1, §13.3).
 */
export interface VideoGeneratedAssetProvenanceItem {
    /** Key of the generated asset in `Assets.Approved`. */
    AssetKey: string;
    /** Whether the generated asset is a still image or video clip. */
    Kind: 'Image' | 'Video';
    /** `MJ: AI Models` ID that produced the asset. */
    ModelID: string;
    /** `MJ: AI Prompt Runs` ID recording the generation run and cost. */
    PromptRunID: string;
    /** Generated clip duration in seconds (for video assets). */
    DurationSeconds?: number;
    /** Generation cost in USD recorded on the prompt run. */
    Cost?: number;
    /** Whether provider C2PA content credentials are preserved on the stored file. */
    C2PA: boolean;
}

/**
 * Aggregate provenance and spend summary for all AI-generated assets in the production (§11.1).
 */
export interface VideoGenerationProvenanceSummary {
    /** Per-asset provenance and spend entries for all generated assets. */
    Assets: VideoGeneratedAssetProvenanceItem[];
    /** Total duration in seconds across all generated video clips. */
    TotalVideoSeconds: number;
    /** Total spend in USD across all generated assets in this production. */
    TotalCost: number;
}

/**
 * Packaged deliverables, source bundle, render metadata, and provenance manifest (§11.1).
 */
export interface VideoProductionManifest {
    /** Per-format rendered MP4 deliverables keyed by `VideoFormat`. */
    Videos: Partial<Record<VideoFormat, VideoRenderedFormatOutput>>;
    /** `MJ: Files` ID for the captured poster still frame (PNG/JPEG). */
    PosterFileID?: string;
    /** Tiled contact-sheet `MJ: Files` IDs per format. */
    ContactSheetFileIDs?: Partial<Record<VideoFormat, string[]>>;
    /** `MJ: Files` ID for the sidecar WebVTT/SRT captions file when requested. */
    CaptionsFileID?: string;
    /** Per-format composition source files and asset references. */
    Source?: Partial<Record<VideoFormat, VideoCompositionSource>>;
    /** Renderer version, seed, frame rate, and measured durations. */
    RenderMetadata: VideoRenderMetadataSummary;
    /** Provenance, total seconds, C2PA flags, and spend for generated assets. */
    GenerationProvenance?: VideoGenerationProvenanceSummary;
    /** Total number of critic evaluation rounds executed before delivery. */
    CriticRounds?: number;
}

// ---------------------------------------------------------------------------
// Root Specification (`VideoGenerationSpec`, §3.1)
// ---------------------------------------------------------------------------

/**
 * Canonical production specification serving as both the Video Studio agent payload
 * and the `Video Production` artifact content (§3.1).
 */
export interface VideoGenerationSpec {
    /** Schema version of the `VideoGenerationSpec` contract. */
    SpecVersion: '1.0';
    /** Current lifecycle stage of the production. */
    Status: VideoProductionStatus;
    /** Archetype template governing beat structure and pacing defaults. */
    Archetype: VideoArchetypeRef;
    /** Optional `MJ: Brand Kits` entity ID supplying palette, typography, voice, and policy. */
    BrandKitID?: string;
    /** Optional `MJ: Companies` entity ID scoping brand kit, data bindings, and provenance. */
    CompanyID?: string;
    /** Core editorial brief (one-sentence takeaway, audience, purpose, runtime, formats). */
    Film: VideoFilmBrief;
    /** Approved assets, required asset slots, generation requests, and `NeverInvent` rules. */
    Assets: VideoAssetsSpec;
    /** Art Director's concrete visual and motion style guide. */
    Style: VideoStyleGuide;
    /** Contiguous narrative beats spanning the film timeline. */
    Beats: VideoBeat[];
    /** Optional ordered UI state progression (e.g., `['SEARCH', 'RESULT', 'DETAIL', 'ACTION']`). */
    StateList?: string[];
    /** Authoritative data bindings backing every on-screen number, percent, currency, or chart. */
    DataBindings: VideoDataBinding[];
    /** Frozen data snapshot captured by Pre-Production as `contextUser`. */
    DataSnapshot?: VideoDataSnapshot;
    /** Voiceover narration, licensed music, timestamped sound cues, and caption mode. */
    Audio: VideoAudioSpec;
    /** Deterministic renderer configuration (HyperFrames version, frame rate, seed, quality). */
    Render: VideoRenderConfig;
    /** Human/caller approval checkpoint mode and repair round cap. */
    Interaction: VideoInteractionSpec;
    /** Target formats and deliverable flags (poster, contact sheets, source bundle, captions). */
    Deliverables: VideoDeliverablesSpec;
    /** Evidence-based review record (gates G1–G6, critic rounds, rubric scores, human notes). */
    Review: VideoReviewRecord;
    /** Packaged output manifest populated when deliverables are rendered and stored. */
    Output?: VideoProductionManifest;
}
