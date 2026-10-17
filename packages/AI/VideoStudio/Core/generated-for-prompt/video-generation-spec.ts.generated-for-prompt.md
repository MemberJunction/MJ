```ts
type VideoProductionStatus =
    | 'Briefing'  // Director is capturing the film brief, audience, required assets, and data bindings
    | 'Styled'  // Art Director has produced the style guide from brand kit and reference analysis
    | 'Storyboarded'  // Storyboard has defined contiguous beats, narration script, cues, and layout notes
    | 'Approved'  // Storyboard and plan have passed Gate G2 (autonomous or human/parent approved)
    | 'PreProduced'  // Pre-Production has frozen data snapshots, synthesized narration timings, and staged/generated assets
    | 'Composed'  // Motion Engineer has authored lint-clean compositions for each target format
    | 'RoughCut'  // Render has produced rough-cut videos, representative stills, and contact sheets
    | 'Reviewed'  // Critic has evaluated rendered frames against the rubric and repair loops have converged
    | 'Delivered'  // All gates G1-G6 have passed and final deliverables are packaged in Output
    | 'Blocked';  // Production cannot proceed without a missing MustUse fact or policy resolution

type VideoFormat =
    | '16:9'  // Landscape widescreen composition (e.g., 1920x1080 desktop or presentation)
    | '9:16'  // Vertical portrait composition (e.g., 1080x1920 mobile or social short)
    | '1:1';  // Square composition (e.g., 1080x1080 social feed post)

interface VideoArchetypeRef {
    ArchetypeID?: string;  // Optional `MJ: Video Archetypes` entity ID when bound to a stored archetype row.
    Name: string;  // Human-readable archetype name (e.g., 'KPI Briefing', 'Topic Explainer').
}

interface VideoFilmBrief {
    OneSentence: string;  // Single sentence stating what the viewer must remember after watching.
    Audience: string;  // Target audience and their context for watching this film.
    Purpose: string;  // Why this film exists and the outcome or decision it is meant to drive.
    DurationSeconds: number;  // Target total runtime of the film in seconds.
    Formats: VideoFormat[];  // Target aspect ratios to compose and deliver (each is a separate composition).
    Language?: string;  // Optional BCP-47 language tag for narration, captions, and on-screen copy (defaults to 'en-US').
}

type VideoAssetKind =
    | 'Logo'  // Primary or secondary brand logo
    | 'LogoMark'  // Standalone icon or logomark
    | 'Font'  // Bundled typeface file (WOFF2/TTF/OTF)
    | 'Image'  // Still image, photo, or illustration
    | 'Screenshot'  // Authentic product UI or web page capture
    | 'Video'  // Video clip or B-roll footage
    | 'Music'  // Background music track with license coverage
    | 'SoundEffect'  // Short audio cue or UI sound effect
    | 'Other';  // Other supplemental production asset

type VideoAssetProvenance =
    | 'Supplied'  // Provided directly by the user or caller for this production (fact)
    | 'BrandKit'  // Pulled from the active MJ: Brand Kit Assets catalog (fact)
    | 'Captured'  // Captured deterministically such as a Playwright screenshot of an approved URL (fact)
    | 'Generated';  // Synthesized by an AI image/video generator in Pre-Production (choice, never fact)

interface VideoAssetGenerationMetadata {
    ModelID: string;  // `MJ: AI Models` ID used to generate this asset.
    PromptRunID: string;  // `MJ: AI Prompt Runs` ID recording the execution, usage, and cost.
    Prompt: string;  // Exact prompt text submitted to the image or video generator.
    Seed?: number;  // Optional deterministic seed used by the generator.
    ReferenceKeys: string[];  // Keys of approved or brand-kit assets passed as visual references.
    DurationSeconds?: number;  // Duration in seconds when the generated asset is a video clip.
    Cost?: number;  // Recorded generation cost in USD from the prompt run.
    C2PA?: boolean;  // Whether the provider returned C2PA content credentials on the stored file.
}

interface VideoAsset {
    Key: string;  // Unique logical key referenced by beats, compositions, or generation requests.
    Kind: VideoAssetKind;  // Media category of the asset.
    FileID?: string;  // `MJ: Files` ID where the binary is stored in MJStorage.
    ArtifactVersionID?: string;  // Optional `MJ: Artifact Versions` ID when sourced from an artifact.
    Source: string;  // Human-readable origin description or approved source URL/filename.
    Provenance: VideoAssetProvenance;  // How the asset entered the production (facts vs generated choices).
    Usage: string;  // Guidance on how and where this asset may be used in the film.
    MustUse: boolean;  // Whether the production must include this asset before delivery.
    Generation?: VideoAssetGenerationMetadata;  // Provenance and spend metadata populated when `Provenance` is `'Generated'`.
    StagedPath?: string;  // Relative bundle path populated by Pre-Production when staged for rendering.
}

interface VideoAssetRequirement {
    Key: string;  // Logical key of the required asset (matched against `Assets.Approved[i].Key`).
    Kind: VideoAssetKind;  // Expected media category for the required asset.
    Description: string;  // What asset is needed and what fact or visual role it fulfills.
    MustUse: boolean;  // When true, an unmet requirement sets `Status` to `'Blocked'` so the agent asks rather than invents.
    AllowGenerated?: boolean;  // Defaults to false; only when true may a `Generated` asset satisfy this requirement (§3.4).
    SatisfiedByAssetKey?: string;  // Key in `Assets.Approved` that satisfies this requirement once resolved.
}

interface VideoGenerationKeyframe {
    Seconds: number;  // Timestamp offset in seconds within the generated video clip.
    AssetKey: string;  // Key of an approved or brand-kit image asset anchoring this keyframe.
}

type VideoGenerationRequestStatus =
    | 'Pending'  // Queued for screening and synthesis in Pre-Production (default when absent)
    | 'Generated'  // Synthesized, stored in MJStorage, and added to Assets.Approved with Generation provenance
    | 'Blocked';  // Refused by pre-call policy/budget/integrity screen or failed during runner execution

interface VideoAssetGenerationRequest {
    Key: string;  // Target asset key that will be added to `Assets.Approved` once generated.
    Kind: 'Image' | 'Video';  // Whether to generate a still image or a video clip.
    Prompt: string;  // Descriptive generation prompt (screened against `NeverInvent` and brand-kit `GenerationPolicy`).
    Purpose: string;  // Narrative or atmospheric reason this generated asset is needed.
    Format?: VideoFormat;  // Target aspect ratio for the generated asset.
    DurationSeconds?: number;  // Requested clip duration in seconds (required when `Kind` is `'Video'`).
    ReferenceKeys: string[];  // Keys of approved or brand-kit reference assets to guide style or subject.
    Keyframes?: VideoGenerationKeyframe[];  // Optional keyframe image anchors for video generation.
    WantAudio?: boolean;  // Defaults to false (clip audio muted); set true to preserve ambient generator audio.
    Status?: VideoGenerationRequestStatus;  // Lifecycle status set by Pre-Production; absent means `'Pending'`.
    BlockedReason?: string;  // Reason code and explanation when `Status` is `'Blocked'` (`'<Code>: <Reason>'`).
    RegenerationCount?: number;  // Number of times this request has been reset for regeneration after a Critic defect.
}

interface VideoAssetsSpec {
    Approved: VideoAsset[];  // Approved, brand-kit, captured, or generated assets available to compositions.
    Required: VideoAssetRequirement[];  // Asset requirements identified by the Director from the brief.
    Generate?: VideoAssetGenerationRequest[];  // Optional requests for Pre-Production to synthesize illustrative images or clips.
    NeverInvent: string[];  // Facts and subjects the model must never fabricate (e.g., 'product UI', 'logo', 'metrics').
}

interface ColorToken {
    Name: string;  // Semantic token name (e.g., 'background.primary', 'text.primary', 'accent.positive').
    Value: string;  // Concrete CSS color value (e.g., '#0F172A', 'rgb(15, 23, 42)'), never an adjective.
    Usage: string;  // When and where this color token is applied in compositions.
}

interface TypeSpec {
    Role: string;  // Typographic role (e.g., 'Headline', 'Subhead', 'Body', 'MetricValue', 'Caption').
    FontFamily: string;  // Exact font family name matching a bundled brand-kit font asset.
    FontAssetKey?: string;  // Optional key in `Assets.Approved` for the bundled font file.
    Weight: number | string;  // Font weight (e.g., 700, 500, '600').
    SizeByFormat: Partial<Record<VideoFormat, string>>;  // CSS font size per target aspect ratio (e.g., `{ '16:9': '64px', '9:16': '52px' }`).
    LineHeight?: string;  // Optional CSS line-height value (e.g., '1.15').
    LetterSpacing?: string;  // Optional CSS letter-spacing value (e.g., '-0.02em').
}

type MotionObjectClass =
    | 'MicroUI'  // Small UI controls, cursors, badges, and toggles
    | 'Panel'  // Cards, containers, charts, and split-screen panels
    | 'Camera'  // Viewport pan, zoom, and depth shifts
    | 'Headline'  // Primary display typography and callouts
    | 'Mascot'  // Character, avatar, or illustrative focal element
    | 'DataMetric'  // Animated counters, KPI tiles, and data marks
    | 'Background';  // Ambient backdrops and texture layers

interface MotionRule {
    ObjectClass: MotionObjectClass;  // Category of visual element governed by this motion rule.
    Easing: string;  // CSS or cubic-bezier easing curve (e.g., 'cubic-bezier(0.22, 1, 0.36, 1)').
    DurationMs: number;  // Standard transition duration in milliseconds for this object class.
    Notes: string;  // Specific choreography constraints (e.g., entrance direction, stagger, settle behavior).
}

interface ReferenceAnalysis {
    SourceKey: string;  // Asset key or reference identifier inspected by the Art Director.
    PaletteLearned: string;  // Color relationships and contrast strategy observed in the reference.
    TypographyLearned: string;  // Hierarchy, scale, and weight treatment observed in the reference.
    CompositionLearned: string;  // Focal point placement, framing, and negative-space lessons.
    PacingLearned: string;  // Rhythm, cut density, and hold timing observed in the reference.
    MotionLearned: string;  // Easing weight, choreography, and camera movement lessons.
    TextureLearned?: string;  // Optional surface grain, lighting, or material treatment notes.
    DoNotCopy: string[];  // Explicit elements from the reference that must not be imitated or copied.
}

interface VideoPacing {
    AvgSecondsBetweenChanges: number;  // Target average interval in seconds between visual state changes.
    HoldRules: string;  // Rules governing minimum hold times on key numbers, headlines, and end cards.
    MinBeatDurationSeconds?: number;  // Optional minimum duration in seconds allowed for any single beat.
    MaxBeatDurationSeconds?: number;  // Optional maximum duration in seconds allowed for any single beat.
}

interface VideoStyleGuide {
    Palette: ColorToken[];  // Concrete color tokens governing backgrounds, text, accents, and data series.
    Typography: TypeSpec[];  // Typographic scale and bundled font assignments per text role.
    Composition: string;  // Primary visual hierarchy rule stating where the viewer's eye goes first.
    Pacing: VideoPacing;  // Cut cadence and hold rules for the production.
    MotionRules: MotionRule[];  // Per-object-class choreography and easing rules.
    Texture?: string;  // Optional surface treatment (grain, elevation shadows, border treatments).
    Keep: string[];  // Positive stylistic commitments to maintain across every beat.
    Avoid: string[];  // Explicit anti-patterns banned from compositions (e.g., 'centered text on gradient').
    References: ReferenceAnalysis[];  // Structured takeaways and `DoNotCopy` lists from inspected reference media.
}

interface VideoBeat {
    Key: string;  // Unique identifier for the beat (e.g., 'beat-1-hook'), referenced by narration and defects.
    Label: string;  // Narrative role label (e.g., 'Hook', 'Problem', 'Reveal', 'Proof', 'Close').
    StartSeconds: number;  // Beat start timestamp in seconds on the master timeline.
    EndSeconds: number;  // Beat end timestamp in seconds on the master timeline.
    EntryState: string;  // Visual or UI state at the start of the beat.
    ExitState: string;  // Visual or UI state reached by the end of the beat.
    Purpose: string;  // Why this shot exists and what change in viewer understanding it achieves.
    OnScreenText: string[];  // Exact strings displayed on screen during this beat. Bound values must appear as `{BindingKey}`
    DataRefs: string[];  // Keys in `DataBindings` whose values are rendered during this beat.
    AssetRefs: string[];  // Keys in `Assets.Approved` displayed or heard during this beat.
    NarrationKey?: string;  // Optional key linking this beat to its `NarrationLine` in `Audio.Narration.Script`.
    LayoutNotes: Partial<Record<VideoFormat, string>>;  // Per-format layout rules (must include every format listed in `Deliverables.Formats`).
}

type VideoDataSourceKind =
    | 'Query'  // Saved MJ Query executed via RunQuery with optional Parameters
    | 'View'  // MJ Entity view executed via RunView with EntityName and ExtraFilter
    | 'Artifact'  // Existing MJ Artifact Version referenced by ArtifactVersionID
    | 'Inline';  // Caller-supplied structured data already present in DataSnapshot.Inline

interface VideoDataSource {
    Kind: VideoDataSourceKind;  // Mechanism used by Pre-Production to resolve this binding.
    QueryID?: string;  // `MJ: Queries` ID when `Kind` is `'Query'`.
    Parameters?: Record<string, unknown>;  // Open key-value parameter map passed to a parameterized query (`Kind: 'Query'`).
    EntityName?: string;  // MemberJunction entity name when `Kind` is `'View'`.
    ExtraFilter?: string;  // SQL filter clause when `Kind` is `'View'`.
    Fields?: string[];  // Explicit field projection list for `'View'` queries to minimize payload size.
    ArtifactVersionID?: string;  // `MJ: Artifact Versions` ID when `Kind` is `'Artifact'`.
}

type VideoDataShape =
    | 'Scalar'  // Single numeric, string, or date value (e.g., total revenue MTD)
    | 'Series'  // Ordered time-series or categorical array for bar/line/area/sparkline charts
    | 'Table'  // Multi-column tabular rows for ranked lists or table reveals
    | 'Delta';  // Current value paired with comparison baseline and percentage/absolute change

type VideoDataFormatKind =
    | 'Currency'  // Monetary value formatted with currency symbol or ISO code
    | 'Percent'  // Percentage value formatted with % suffix
    | 'Number'  // Plain or abbreviated numeric value
    | 'Date';  // ISO date or human-readable date label

interface VideoDataFormat {
    Kind: VideoDataFormatKind;  // Display formatting style for values resolved from this binding.
    Currency?: string;  // ISO 4217 currency code (e.g., 'USD', 'EUR') when `Kind` is `'Currency'`.
    Decimals?: number;  // Number of fractional digits to display.
}

interface VideoTableColumn {
    Header: string;  // Column header text matching the selected table field or display column.
    Format?: VideoDataFormat;  // Optional display formatting rules for numeric or date cells in this column.
}

interface VideoDataBinding {
    Key: string;  // Unique binding key (e.g., 'kpi.revenue.mtd') referenced by `Beat.DataRefs` and compositions.
    Source: VideoDataSource;  // Authoritative query, view, artifact, or inline source definition.
    Shape: VideoDataShape;  // Structural shape of the resolved dataset.
    Format?: VideoDataFormat;  // Optional display formatting rules for numbers, currencies, percentages, or dates.
    Columns?: VideoTableColumn[];  // Optional ordered per-column headers and display formats when `Shape` is `'Table'`.
    Label?: string;  // Human-readable metric label for charts, callouts, and data tabs.
}

interface VideoDataSnapshot {
    FileID?: string;  // `MJ: Files` ID storing the frozen JSON snapshot when too large for inline embedding.
    Inline?: Record<string, unknown>;  // Open map from `VideoDataBinding.Key` to frozen resolved values when stored inline.
    AsOf: string;  // ISO-8601 timestamp recording when the snapshot was captured (shown on provenance end card).
    Sources: string[];  // Human-readable provenance descriptors or IDs for every data source executed.
}

interface NarrationWordTiming {
    Word: string;  // Spoken word token aligned from TTS timestamps.
    StartSeconds: number;  // Word start time in seconds on the master timeline.
    EndSeconds: number;  // Word end time in seconds on the master timeline.
}

interface NarrationLine {
    Key: string;  // Unique narration line identifier (referenced by `VideoBeat.NarrationKey`).
    BeatKey: string;  // `VideoBeat.Key` that this narration line drives.
    Text: string;  // Spoken script text for this beat.
    AudioFileID?: string;  // `MJ: Files` ID of the synthesized TTS clip uploaded by Pre-Production.
    StagedPath?: string;  // Relative bundle path of the staged audio clip during rendering.
    StartSeconds?: number;  // Resolved start time in seconds on the master timeline after synthesis.
    DurationSeconds?: number;  // Measured clip duration in seconds used to fit the beat's length.
    WordTimings?: NarrationWordTiming[];  // Optional word-level alignment timings driving captions and audio cues.
}

interface VideoNarrationSpec {
    VoiceID: string;  // Provider voice identifier (from brand kit `IBrandVoice` or brief override).
    Provider: string;  // TTS provider name (e.g., 'ElevenLabs', 'OpenAI').
    Script: NarrationLine[];  // Ordered narration lines, typically one per beat.
}

interface VideoMusicSpec {
    AssetKey: string;  // Key in `Assets.Approved` pointing to a licensed music track.
    BeatGrid?: number[];  // Optional array of musical beat timestamps in seconds for cut and cue alignment.
    GainDb?: number;  // Optional mix level in dB under narration (e.g., -18).
}

type AudioCueKind =
    | 'Sfx'  // Discrete sound effect asset triggered at TimestampSeconds
    | 'MusicDuck'  // Duck background music under narration or emphasis
    | 'MusicSwell'  // Swell background music during transitions or closing beat
    | 'Silence';  // Intentional breath or pause on the audio timeline

interface AudioCue {
    Key: string;  // Unique identifier for the audio cue.
    TimestampSeconds: number;  // Exact trigger timestamp in seconds on the master timeline (`0` to `DurationSeconds`).
    Kind: AudioCueKind;  // Type of audio event or mix change.
    AssetKey?: string;  // Optional key in `Assets.Approved` when `Kind` is `'Sfx'`.
    BeatKey?: string;  // Optional `VideoBeat.Key` associated with this cue for sync review.
    Notes?: string;  // Mix or sync intent notes for the critic's "close your eyes" check.
}

type VideoCaptionMode =
    | 'None'  // No captions rendered or exported
    | 'Burned'  // Captions rendered directly into the composition picture
    | 'Sidecar';  // Captions exported as a separate WebVTT/SRT file in Output

interface VideoAudioSpec {
    Narration?: VideoNarrationSpec;  // Optional voiceover narration configuration and per-beat script.
    Music?: VideoMusicSpec;  // Optional licensed background music track and beat grid.
    Cues: AudioCue[];  // Timestamped sound effects and mix cues on the shared picture timeline.
    Captions: VideoCaptionMode;  // Caption delivery mode ('None', 'Burned', or 'Sidecar').
}

type VideoRenderQuality =
    | 'draft'  // Fast iteration tier (lower resolution/bitrate, 24 fps default)
    | 'standard'  // Production standard tier (Full HD, 30 fps)
    | 'high';  // Broadcast/master tier (QHD/UHD, 30 fps, highest bitrate)

interface VideoRenderConfig {
    Renderer: 'HyperFrames';  // Underlying composition rendering engine identifier.
    RendererVersion: string;  // Exact pinned `@hyperframes/producer` version used for the render.
    Fps: number;  // Frame rate in frames per second (e.g., 24 or 30).
    Seed: number;  // Deterministic PRNG seed injected into the composition runtime.
    Quality: VideoRenderQuality;  // Encoding and resolution quality tier ('draft', 'standard', or 'high').
}

type VideoInteractionMode =
    | 'Autonomous'  // Proceed through all stages without pausing for approval unless Blocked
    | 'ApproveStoryboard'  // Pause at Gate G2 for storyboard approval before Pre-Production spend
    | 'ApproveStoryboardAndRoughCut';  // Pause at Gate G2 (storyboard) and Gate G4 (rough cut) before final delivery

interface VideoInteractionSpec {
    Mode: VideoInteractionMode;  // Approval checkpoint policy for this production run.
    MaxRepairRounds: number;  // Hard cap on critic-driven repair iterations (from preset power level, §9).
}

interface VideoDeliverablesSpec {
    Formats: VideoFormat[];  // Aspect ratio compositions that must be rendered and packaged for delivery.
    Poster: boolean;  // Whether to capture and store a poster still frame.
    ContactSheets: boolean;  // Whether to build and store tiled contact sheets per format.
    Source: boolean;  // Whether to archive the composition HTML/CSS/JS source bundle in `Output`.
    Captions: boolean;  // Whether to produce a caption file when narration is present.
}

type VideoGateId =
    | 'G1'  // Facts gate: brief complete, MustUse assets resolved, data bindings resolvable
    | 'G2'  // Plan gate: spec validates at Storyboarded, style guide and shot list complete, plan approved
    | 'G3'  // Stills gate: representative stills captured per beat/format and pass deterministic checks
    | 'G4'  // Rough cut gate: full render and contact sheets exist and initial critic round completed
    | 'G5'  // Repair gate: top defects fixed and re-verified or MaxRepairRounds exhausted with notes
    | 'G6';  // Deliver gate: every format rendered, poster, captions, audio verified, artifact packaged

type GateStatus =
    | 'Pending'  // Gate has not yet been evaluated
    | 'Passed'  // Gate requirements verified with recorded evidence
    | 'Failed'  // Gate check failed and requires repair or retry
    | 'Blocked';  // Gate is awaiting external human/parent input or missing fact

interface GateRecord {
    Gate: VideoGateId;  // Identifier of the production gate ('G1' through 'G6').
    Status: GateStatus;  // Current verification state of the gate.
    EvidenceRefs: string[];  // File IDs, step IDs, or check identifiers proving the gate outcome.
    Timestamp: string;  // ISO-8601 timestamp when the gate was last evaluated.
    Notes?: string;  // Optional diagnostic or blocker summary when status is not `'Passed'`.
}

type DefectSeverity =
    | 'Blocker'  // Must be repaired before delivery (e.g., data mismatch, unreadable text, missing asset)
    | 'Major'  // Significant visual, pacing, or sync defect targeted in repair rounds
    | 'Minor';  // Polish issue noted for human review if repair rounds are exhausted

type DefectStatus =
    | 'Open'  // Identified by deterministic checks or Critic and awaiting repair
    | 'Fixed'  // Repaired by Motion Engineer and verified in a subsequent still/render pass
    | 'Deferred';  // Unresolved after MaxRepairRounds and disclosed in HumanReviewNotes

interface VideoDefect {
    Key?: string;  // Optional stable defect identifier across repair rounds.
    Format?: VideoFormat;  // Aspect ratio composition where the defect was observed.
    Timestamp: number;  // Timestamp in seconds where the defect appears in the rendered video.
    Beat: string;  // `VideoBeat.Key` containing the defect.
    Criterion?: string;  // Optional rubric criterion name (e.g., 'data_fidelity', 'readability', 'sound_sync').
    Severity: DefectSeverity;  // Impact level of the defect ('Blocker', 'Major', or 'Minor').
    Evidence: string;  // What the Critic or deterministic check observed in the rendered frame.
    Fix: string;  // Specific, local adjustment instructed for the Motion Engineer.
    Status: DefectStatus;  // Resolution state of the defect ('Open', 'Fixed', or 'Deferred').
    AssetKey?: string;  // Key in `Assets.Approved` when the defect is about one asset (for example a garbled generated clip).
}

interface CriticRound {
    Round: number;  // 1-based critic evaluation round index.
    Timestamp: string;  // ISO-8601 timestamp when this critic round completed.
    ContactSheetFileIDs?: Partial<Record<VideoFormat, string[]>>;  // Contact sheet `MJ: Files` IDs inspected in this round, keyed by format.
    Defects: VideoDefect[];  // Ranked defects identified in this round (up to top 3 for vision critic).
    Summary?: string;  // Overall assessment summary from the Critic for this round.
}

interface RubricCriterionScore {
    Criterion: string;  // Rubric criterion identifier (e.g., 'hook', 'readability', 'data_fidelity',...
    Score: number;  // Numeric score awarded for this criterion.
    MaxScore: number;  // Maximum possible score for this criterion.
    Passed: boolean;  // Whether the criterion met the minimum passing threshold.
    Notes?: string;  // Brief evidence-based rationale for the score.
}

interface RubricScoreSummary {
    RubricID?: string;  // Optional `MJ: AI Rubrics` entity ID for the `Video Production Quality` rubric.
    OverallScore: number;  // Aggregate score across all evaluated criteria.
    MaxScore: number;  // Maximum possible aggregate score.
    Passed: boolean;  // Whether the production met the rubric's overall passing threshold.
    Criteria: RubricCriterionScore[];  // Per-criterion score breakdown.
}

interface VideoReviewRecord {
    Gates: GateRecord[];  // Status and evidence records for gates 'G1' through 'G6'.
    Rounds: CriticRound[];  // Chronological history of critic evaluation and repair rounds.
    Scores?: RubricScoreSummary;  // Latest rubric evaluation scores from the Critic.
    HumanReviewNotes?: string;  // Summary of deferred defects, inline storage warnings, and generated-asset disclosures.
}

interface VideoRenderedFormatOutput {
    Format: VideoFormat;  // Aspect ratio of this rendered deliverable.
    FileID?: string;  // `MJ: Files` ID of the rendered MP4 in MJStorage (preferred storage-first path).
    InlineBase64?: string;  // Base64 fallback payload only when below inline threshold and no storage account resolves.
    MimeType: string;  // Media MIME type (e.g., 'video/mp4').
    Width: number;  // Pixel width of the rendered video (e.g., 1920).
    Height: number;  // Pixel height of the rendered video (e.g., 1080).
    DurationSeconds: number;  // Measured duration of the rendered video in seconds.
    FileSizeBytes: number;  // Size of the rendered MP4 in bytes.
}

interface VideoCompositionSource {
    Format: VideoFormat;  // Aspect ratio this composition renders.
    EntryFile: string;  // Entry HTML/JS filename within the composition bundle (e.g., 'index.html').
    Files: Record<string, string>;  // Map of relative file paths to UTF-8 text source contents (HTML, CSS, JS).
    AssetKeys: string[];  // Keys in `Assets.Approved` referenced by this composition.
}

interface VideoRenderMetadataSummary {
    Renderer: 'HyperFrames';  // Renderer engine used ('HyperFrames').
    RendererVersion: string;  // Exact `@hyperframes/producer` version string reported by the worker.
    Seed: number;  // Deterministic seed used during rendering.
    Fps: number;  // Frame rate in frames per second used during rendering.
    DurationByFormat: Partial<Record<VideoFormat, number>>;  // Rendered duration in seconds per delivered format.
    RenderedAt: string;  // ISO-8601 timestamp when the final render completed.
}

interface VideoGeneratedAssetProvenanceItem {
    AssetKey: string;  // Key of the generated asset in `Assets.Approved`.
    Kind: 'Image' | 'Video';  // Whether the generated asset is a still image or video clip.
    ModelID: string;  // `MJ: AI Models` ID that produced the asset.
    PromptRunID: string;  // `MJ: AI Prompt Runs` ID recording the generation run and cost.
    DurationSeconds?: number;  // Generated clip duration in seconds (for video assets).
    Cost?: number;  // Generation cost in USD recorded on the prompt run.
    C2PA: boolean;  // Whether provider C2PA content credentials are preserved on the stored file.
}

interface VideoGenerationProvenanceSummary {
    Assets: VideoGeneratedAssetProvenanceItem[];  // Per-asset provenance and spend entries for all generated assets.
    TotalVideoSeconds: number;  // Total duration in seconds across all generated video clips.
    TotalCost: number;  // Total spend in USD across all generated assets in this production.
}

interface VideoProductionManifest {
    Videos: Partial<Record<VideoFormat, VideoRenderedFormatOutput>>;  // Per-format rendered MP4 deliverables keyed by `VideoFormat`.
    PosterFileID?: string;  // `MJ: Files` ID for the captured poster still frame (PNG/JPEG).
    ContactSheetFileIDs?: Partial<Record<VideoFormat, string[]>>;  // Tiled contact-sheet `MJ: Files` IDs per format.
    CaptionsFileID?: string;  // `MJ: Files` ID for the sidecar WebVTT/SRT captions file when requested.
    Source?: Partial<Record<VideoFormat, VideoCompositionSource>>;  // Per-format composition source files and asset references.
    RenderMetadata: VideoRenderMetadataSummary;  // Renderer version, seed, frame rate, and measured durations.
    GenerationProvenance?: VideoGenerationProvenanceSummary;  // Provenance, total seconds, C2PA flags, and spend for generated assets.
    CriticRounds?: number;  // Total number of critic evaluation rounds executed before delivery.
}

interface VideoGenerationSpec {
    SpecVersion: '1.0';  // Schema version of the `VideoGenerationSpec` contract.
    Status: VideoProductionStatus;  // Current lifecycle stage of the production.
    Archetype: VideoArchetypeRef;  // Archetype template governing beat structure and pacing defaults.
    BrandKitID?: string;  // Optional `MJ: Brand Kits` entity ID supplying palette, typography, voice, and policy.
    CompanyID?: string;  // Optional `MJ: Companies` entity ID scoping brand kit, data bindings, and provenance.
    Film: VideoFilmBrief;  // Core editorial brief (one-sentence takeaway, audience, purpose, runtime, formats).
    Assets: VideoAssetsSpec;  // Approved assets, required asset slots, generation requests, and `NeverInvent` rules.
    Style: VideoStyleGuide;  // Art Director's concrete visual and motion style guide.
    Beats: VideoBeat[];  // Contiguous narrative beats spanning the film timeline.
    StateList?: string[];  // Optional ordered UI state progression (e.g., `['SEARCH', 'RESULT', 'DETAIL', 'ACTION']`).
    DataBindings: VideoDataBinding[];  // Authoritative data bindings backing every on-screen number, percent, currency, or chart.
    DataSnapshot?: VideoDataSnapshot;  // Frozen data snapshot captured by Pre-Production as `contextUser`.
    Audio: VideoAudioSpec;  // Voiceover narration, licensed music, timestamped sound cues, and caption mode.
    Render: VideoRenderConfig;  // Deterministic renderer configuration (HyperFrames version, frame rate, seed, quality).
    Interaction: VideoInteractionSpec;  // Human/caller approval checkpoint mode and repair round cap.
    Deliverables: VideoDeliverablesSpec;  // Target formats and deliverable flags (poster, contact sheets, source bundle, captions).
    Review: VideoReviewRecord;  // Evidence-based review record (gates G1–G6, critic rounds, rubric scores, human notes).
    Output?: VideoProductionManifest;  // Packaged output manifest populated when deliverables are rendered and stored.
}
```
