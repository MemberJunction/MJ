/**
 * Pure, stage-aware validator for `VideoGenerationSpec` (§3.2, §3.4, §10.2).
 *
 * Free of database and filesystem access so it runs identically in browser previews,
 * agent actions, MCP tools, and server-side persistence. Collects and returns all
 * validation errors in a single pass without throwing.
 *
 * Path format: dot-separated PascalCase field names with `[index]` for arrays and
 * `.<key>` for keyed maps (e.g. `Beats[2].ExitState`, `Beats[0].LayoutNotes.16:9`,
 * `Output.Videos.16:9.Format`).
 */

import {
    VIDEO_STUDIO_SPEC_VERSION,
} from './video-generation-spec.js';
import type {
    AudioCueKind,
    DefectSeverity,
    DefectStatus,
    GateStatus,
    MotionObjectClass,
    VideoAssetKind,
    VideoAssetProvenance,
    VideoCaptionMode,
    VideoDataFormatKind,
    VideoDataShape,
    VideoDataSourceKind,
    VideoFormat,
    VideoGateId,
    VideoGenerationSpec,
    VideoInteractionMode,
    VideoProductionStatus,
    VideoRenderQuality,
} from './video-generation-spec.js';

// ---------------------------------------------------------------------------
// Exhaustive Runtime Value Lists (§3.1 unions)
// ---------------------------------------------------------------------------

/**
 * Compile-time assertion that a tuple contains every member of `Union`.
 * If `Union` gains a new literal member not listed in `Tuple`, `Exclude<Union, Tuple[number]>`
 * becomes non-`never` and TypeScript reports a type error on the `_exhaustive*` check.
 */
type AssertExhaustiveTuple<Union, Tuple extends readonly Union[]> =
    [Exclude<Union, Tuple[number]>] extends [never] ? Tuple : never;

/** All valid `VideoProductionStatus` values in lifecycle order. */
export const VIDEO_PRODUCTION_STATUSES = [
    'Briefing',
    'Styled',
    'Storyboarded',
    'Approved',
    'PreProduced',
    'Composed',
    'RoughCut',
    'Reviewed',
    'Delivered',
    'Blocked',
] as const satisfies readonly VideoProductionStatus[];
const _exhaustiveStatuses: AssertExhaustiveTuple<VideoProductionStatus, typeof VIDEO_PRODUCTION_STATUSES> = VIDEO_PRODUCTION_STATUSES;

/** All valid `VideoFormat` aspect ratios. */
export const VIDEO_FORMATS = [
    '16:9',
    '9:16',
    '1:1',
] as const satisfies readonly VideoFormat[];
const _exhaustiveFormats: AssertExhaustiveTuple<VideoFormat, typeof VIDEO_FORMATS> = VIDEO_FORMATS;

/** All valid `VideoAssetKind` media categories. */
export const VIDEO_ASSET_KINDS = [
    'Logo',
    'LogoMark',
    'Font',
    'Image',
    'Screenshot',
    'Video',
    'Music',
    'SoundEffect',
    'Other',
] as const satisfies readonly VideoAssetKind[];
const _exhaustiveAssetKinds: AssertExhaustiveTuple<VideoAssetKind, typeof VIDEO_ASSET_KINDS> = VIDEO_ASSET_KINDS;

/** All valid `VideoAssetProvenance` classifications. */
export const VIDEO_ASSET_PROVENANCES = [
    'Supplied',
    'BrandKit',
    'Captured',
    'Generated',
] as const satisfies readonly VideoAssetProvenance[];
const _exhaustiveAssetProvenances: AssertExhaustiveTuple<VideoAssetProvenance, typeof VIDEO_ASSET_PROVENANCES> = VIDEO_ASSET_PROVENANCES;

/** All valid `MotionObjectClass` values. */
export const MOTION_OBJECT_CLASSES = [
    'MicroUI',
    'Panel',
    'Camera',
    'Headline',
    'Mascot',
    'DataMetric',
    'Background',
] as const satisfies readonly MotionObjectClass[];
const _exhaustiveMotionClasses: AssertExhaustiveTuple<MotionObjectClass, typeof MOTION_OBJECT_CLASSES> = MOTION_OBJECT_CLASSES;

/** All valid `VideoDataSourceKind` values. */
export const VIDEO_DATA_SOURCE_KINDS = [
    'Query',
    'View',
    'Artifact',
    'Inline',
] as const satisfies readonly VideoDataSourceKind[];
const _exhaustiveDataSourceKinds: AssertExhaustiveTuple<VideoDataSourceKind, typeof VIDEO_DATA_SOURCE_KINDS> = VIDEO_DATA_SOURCE_KINDS;

/** All valid `VideoDataShape` values. */
export const VIDEO_DATA_SHAPES = [
    'Scalar',
    'Series',
    'Table',
    'Delta',
] as const satisfies readonly VideoDataShape[];
const _exhaustiveDataShapes: AssertExhaustiveTuple<VideoDataShape, typeof VIDEO_DATA_SHAPES> = VIDEO_DATA_SHAPES;

/** All valid `VideoDataFormatKind` values. */
export const VIDEO_DATA_FORMAT_KINDS = [
    'Currency',
    'Percent',
    'Number',
    'Date',
] as const satisfies readonly VideoDataFormatKind[];
const _exhaustiveDataFormatKinds: AssertExhaustiveTuple<VideoDataFormatKind, typeof VIDEO_DATA_FORMAT_KINDS> = VIDEO_DATA_FORMAT_KINDS;

/** All valid `AudioCueKind` values. */
export const AUDIO_CUE_KINDS = [
    'Sfx',
    'MusicDuck',
    'MusicSwell',
    'Silence',
] as const satisfies readonly AudioCueKind[];
const _exhaustiveAudioCueKinds: AssertExhaustiveTuple<AudioCueKind, typeof AUDIO_CUE_KINDS> = AUDIO_CUE_KINDS;

/** All valid `VideoCaptionMode` values. */
export const VIDEO_CAPTION_MODES = [
    'None',
    'Burned',
    'Sidecar',
] as const satisfies readonly VideoCaptionMode[];
const _exhaustiveCaptionModes: AssertExhaustiveTuple<VideoCaptionMode, typeof VIDEO_CAPTION_MODES> = VIDEO_CAPTION_MODES;

/** All valid `VideoRenderQuality` tiers. */
export const VIDEO_RENDER_QUALITIES = [
    'draft',
    'standard',
    'high',
] as const satisfies readonly VideoRenderQuality[];
const _exhaustiveRenderQualities: AssertExhaustiveTuple<VideoRenderQuality, typeof VIDEO_RENDER_QUALITIES> = VIDEO_RENDER_QUALITIES;

/** All valid `VideoInteractionMode` policies. */
export const VIDEO_INTERACTION_MODES = [
    'Autonomous',
    'ApproveStoryboard',
    'ApproveStoryboardAndRoughCut',
] as const satisfies readonly VideoInteractionMode[];
const _exhaustiveInteractionModes: AssertExhaustiveTuple<VideoInteractionMode, typeof VIDEO_INTERACTION_MODES> = VIDEO_INTERACTION_MODES;

/** All valid `VideoGateId` identifiers. */
export const VIDEO_GATE_IDS = [
    'G1',
    'G2',
    'G3',
    'G4',
    'G5',
    'G6',
] as const satisfies readonly VideoGateId[];
const _exhaustiveGateIds: AssertExhaustiveTuple<VideoGateId, typeof VIDEO_GATE_IDS> = VIDEO_GATE_IDS;

/** All valid `GateStatus` values. */
export const GATE_STATUSES = [
    'Pending',
    'Passed',
    'Failed',
    'Blocked',
] as const satisfies readonly GateStatus[];
const _exhaustiveGateStatuses: AssertExhaustiveTuple<GateStatus, typeof GATE_STATUSES> = GATE_STATUSES;

/** All valid `DefectSeverity` levels. */
export const DEFECT_SEVERITIES = [
    'Blocker',
    'Major',
    'Minor',
] as const satisfies readonly DefectSeverity[];
const _exhaustiveDefectSeverities: AssertExhaustiveTuple<DefectSeverity, typeof DEFECT_SEVERITIES> = DEFECT_SEVERITIES;

/** All valid `DefectStatus` values. */
export const DEFECT_STATUSES = [
    'Open',
    'Fixed',
    'Deferred',
] as const satisfies readonly DefectStatus[];
const _exhaustiveDefectStatuses: AssertExhaustiveTuple<DefectStatus, typeof DEFECT_STATUSES> = DEFECT_STATUSES;

// Touch exhaustiveness constants so bundlers/linters never flag them as unused.
void _exhaustiveStatuses;
void _exhaustiveFormats;
void _exhaustiveAssetKinds;
void _exhaustiveAssetProvenances;
void _exhaustiveMotionClasses;
void _exhaustiveDataSourceKinds;
void _exhaustiveDataShapes;
void _exhaustiveDataFormatKinds;
void _exhaustiveAudioCueKinds;
void _exhaustiveCaptionModes;
void _exhaustiveRenderQualities;
void _exhaustiveInteractionModes;
void _exhaustiveGateIds;
void _exhaustiveGateStatuses;
void _exhaustiveDefectSeverities;
void _exhaustiveDefectStatuses;

// ---------------------------------------------------------------------------
// Stage Requirement Matrix & Constants (§3.2)
// ---------------------------------------------------------------------------

/**
 * Maximum allowed drift in seconds at beat boundaries (`0`, beat-to-beat joins,
 * and final beat `EndSeconds` vs `Film.DurationSeconds`).
 */
export const BEAT_TIMELINE_TOLERANCE_SECONDS = 0.05;

/**
 * Logical spec sections whose completeness is gated by production stage.
 */
export type VideoSpecSection =
    | 'Film'             // Core brief, formats, render config, and interaction settings
    | 'Style'            // Palette, typography, composition rule, pacing, and motion rules
    | 'Beats'            // Contiguous storyboard beats covering Film.DurationSeconds
    | 'NarrationScript'  // VoiceID, Provider, and per-beat NarrationLine script
    | 'PreProduction'    // Resolved FileID/ArtifactVersionID on assets and frozen DataSnapshot
    | 'Output';          // Delivered Output manifest with rendered videos per Deliverable format

/**
 * Declarative map from each `VideoProductionStatus` stage to the sections it requires.
 */
export const STAGE_REQUIRED_SECTIONS: Readonly<Record<VideoProductionStatus, readonly VideoSpecSection[]>> = {
    Briefing: ['Film'],
    Blocked: ['Film'],
    Styled: ['Film', 'Style'],
    Storyboarded: ['Film', 'Style', 'Beats', 'NarrationScript'],
    Approved: ['Film', 'Style', 'Beats', 'NarrationScript'],
    PreProduced: ['Film', 'Style', 'Beats', 'NarrationScript', 'PreProduction'],
    Composed: ['Film', 'Style', 'Beats', 'NarrationScript', 'PreProduction'],
    RoughCut: ['Film', 'Style', 'Beats', 'NarrationScript', 'PreProduction'],
    Reviewed: ['Film', 'Style', 'Beats', 'NarrationScript', 'PreProduction'],
    Delivered: ['Film', 'Style', 'Beats', 'NarrationScript', 'PreProduction', 'Output'],
};

// ---------------------------------------------------------------------------
// Error Codes & Result Shapes
// ---------------------------------------------------------------------------

/**
 * Machine-readable error codes emitted by `ValidateVideoGenerationSpec`.
 */
export type VideoSpecErrorCode =
    | 'InvalidSpecVersion'
    | 'InvalidEnumValue'
    | 'MissingArchetypeName'
    | 'MissingFilmField'
    | 'InvalidFilmDuration'
    | 'MissingFilmFormats'
    | 'MissingDeliverableFormats'
    | 'InvalidRenderConfig'
    | 'InvalidMaxRepairRounds'
    | 'MissingStyleSection'
    | 'MissingBeats'
    | 'MissingBeatField'
    | 'InvalidBeatTiming'
    | 'BeatsMustStartAtZero'
    | 'NonContiguousBeats'
    | 'BeatsDurationMismatch'
    | 'MissingBeatLayoutNote'
    | 'UnknownOnScreenPlaceholder'
    | 'UnboundNumericOnScreenText'
    | 'UnmetMustUseRequirement'
    | 'GeneratedAssetNotAllowedForRequirement'
    | 'MissingGeneratedAssetProvenance'
    | 'MissingApprovedAssetSourceId'
    | 'MissingGenerationPurpose'
    | 'MissingGenerationDuration'
    | 'GenerationDurationExceedsLimit'
    | 'UnresolvedReferenceKey'
    | 'MissingNarrationScript'
    | 'AudioCueOutsideTimeline'
    | 'MissingDataSnapshot'
    | 'MissingOutputManifest'
    | 'MissingOutputVideoPayload'
    | 'OutputVideoFormatKeyMismatch'
    | 'BrandKitNotFound'
    | 'BrandKitNotInScope'
    | 'ArchetypeNotFound'
    | 'InvalidFileID'
    | 'FileNotReadable'
    | 'AsyncValidationFailed';

type AsyncVideoSpecErrorCode =
    | 'BrandKitNotFound'
    | 'BrandKitNotInScope'
    | 'ArchetypeNotFound'
    | 'InvalidFileID'
    | 'FileNotReadable'
    | 'AsyncValidationFailed';

/** All pure `VideoSpecErrorCode` values for test completeness checks. */
export const VIDEO_SPEC_ERROR_CODES = [
    'InvalidSpecVersion',
    'InvalidEnumValue',
    'MissingArchetypeName',
    'MissingFilmField',
    'InvalidFilmDuration',
    'MissingFilmFormats',
    'MissingDeliverableFormats',
    'InvalidRenderConfig',
    'InvalidMaxRepairRounds',
    'MissingStyleSection',
    'MissingBeats',
    'MissingBeatField',
    'InvalidBeatTiming',
    'BeatsMustStartAtZero',
    'NonContiguousBeats',
    'BeatsDurationMismatch',
    'MissingBeatLayoutNote',
    'UnknownOnScreenPlaceholder',
    'UnboundNumericOnScreenText',
    'UnmetMustUseRequirement',
    'GeneratedAssetNotAllowedForRequirement',
    'MissingGeneratedAssetProvenance',
    'MissingApprovedAssetSourceId',
    'MissingGenerationPurpose',
    'MissingGenerationDuration',
    'GenerationDurationExceedsLimit',
    'UnresolvedReferenceKey',
    'MissingNarrationScript',
    'AudioCueOutsideTimeline',
    'MissingDataSnapshot',
    'MissingOutputManifest',
    'MissingOutputVideoPayload',
    'OutputVideoFormatKeyMismatch',
] as const satisfies readonly VideoSpecErrorCode[];
const _exhaustiveErrorCodes: AssertExhaustiveTuple<
    Exclude<VideoSpecErrorCode, AsyncVideoSpecErrorCode>,
    typeof VIDEO_SPEC_ERROR_CODES
> = VIDEO_SPEC_ERROR_CODES;
void _exhaustiveErrorCodes;

/**
 * Single validation failure reported by `ValidateVideoGenerationSpec`.
 */
export interface VideoSpecValidationError {
    /** Machine-readable error code. */
    Code: VideoSpecErrorCode;
    /** Dot/bracket path to the offending field (e.g., `Beats[2].ExitState`). */
    Path: string;
    /** Plain-English explanation of what failed and how to fix it. */
    Message: string;
}

/**
 * Result returned by `ValidateVideoGenerationSpec`.
 */
export interface VideoSpecValidationResult {
    /** True when `Errors` is empty. */
    Valid: boolean;
    /** All validation failures collected across the spec. */
    Errors: VideoSpecValidationError[];
}

/**
 * Optional caller-provided constraints for `ValidateVideoGenerationSpec`.
 */
export interface VideoSpecValidationOptions {
    /**
     * Maximum allowed `DurationSeconds` on an `Assets.Generate` video request.
     * Passed by the caller from the target model's metadata (`MaxGeneratedVideoSeconds`).
     */
    MaxGeneratedVideoSeconds?: number;
    /**
     * Additional valid asset keys from the active `MJ: Brand Kit Assets` catalog that
     * `Assets.Generate.ReferenceKeys` or `Keyframes` may reference alongside `Assets.Approved`.
     */
    BrandKitAssetKeys?: readonly string[];
}

// ---------------------------------------------------------------------------
// Numeric Token Detection (§3.2, §10.2, reused by VS-RND-5)
// ---------------------------------------------------------------------------

const WRAPPING_PUNCTUATION_REGEX = /^[([{'"`“”‘’]+|[)\]}'"`“”‘’.,;:!?]+$/g;
const FISCAL_QUARTER_REGEX = /^Q[1-4]$/i;
const CALENDAR_YEAR_REGEX = /^(19\d\d|20\d\d)$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SLASH_IDIOM_REGEX = /^\d+\/\d+(\/\d+)?$/;
const ORDINAL_OR_RANK_REGEX = /^(#\d+|\d+(st|nd|rd|th)|v\d+(\.\d+)*)$/i;
const NUMERIC_LITERAL_REGEX =
    /^[+\-\u2212]?[$€£¥]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[KMBTx%]|[mM]s|s)?$/i;
const CURRENCY_PREFIX_NUMERIC_REGEX =
    /^[$€£¥][+\-\u2212]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?[KMBT%]?$/i;
const GLOBAL_NUMERIC_RUN_REGEX =
    /\d{4}-\d{2}-\d{2}|\d+\/\d+(?:\/\d+)?|[qQ][1-4]\b|v\d+(?:\.\d+)*|#\d+|\d+(?:st|nd|rd|th)\b|(?:[+\-\u2212]?[$€£¥]|[$€£¥][+\-\u2212]?|[+\-\u2212](?=\d))?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[KMBTx%]|[mM]s\b|s\b)?/g;
const ON_SCREEN_PLACEHOLDER_REGEX = /\{([^{}]+)\}/g;

/**
 * Determines whether a whitespace-delimited token represents a quantitative numeric,
 * percentage, or currency claim that must be backed by a `VideoDataBinding` (§3.2, §10.2).
 *
 * Classification rules (reused by VS-RND-5's DOM literal scanner):
 * - **Counts as numeric (`true`):**
 *   - Currency values with optional magnitude suffixes: `$1.2M`, `$14.2M`, `€400`, `£99.5K`
 *   - Percentages (unsigned or signed): `12%`, `+28%`, `-3.5%`, `−4.5%`
 *   - Grouped or decimal numbers (unsigned or signed with `-`, `+`, or Unicode minus `U+2212` `−`):
 *     `3,400`, `−4.5`, `-4.5`, `+28`, `14.2`, `42`, `2.5x`
 * - **Excluded as non-metric identifiers (`false`):**
 *   - Fiscal quarter labels: `Q1`, `Q2`, `Q3`, `Q4`
 *   - Standalone 4-digit calendar years (`1900`–`2099`) and ISO dates (`2026`, `2026-10-15`)
 *   - Slash idioms / ratios: `24/7`, `365/24/7`, `16:9`
 *   - Ordinal / rank / version badges: `#1`, `1st`, `2nd`, `3rd`, `4th`, `v1.0`
 */
export function IsNumericLiteralToken(rawToken: string): boolean {
    const cleaned = rawToken.trim().replace(WRAPPING_PUNCTUATION_REGEX, '');
    if (!cleaned) {
        return false;
    }
    if (
        FISCAL_QUARTER_REGEX.test(cleaned) ||
        CALENDAR_YEAR_REGEX.test(cleaned) ||
        ISO_DATE_REGEX.test(cleaned) ||
        SLASH_IDIOM_REGEX.test(cleaned) ||
        ORDINAL_OR_RANK_REGEX.test(cleaned)
    ) {
        return false;
    }
    return NUMERIC_LITERAL_REGEX.test(cleaned) || CURRENCY_PREFIX_NUMERIC_REGEX.test(cleaned);
}

const ASCII_LETTER_REGEX = /[A-Za-z]/;
const PERCENT_OR_CURRENCY_REGEX = /[%$€£¥]/;

/**
 * Extracts all numeric, percentage, or currency runs from `text` using a global scan
 * (including numbers attached directly to text such as `28%YoY`, `$14.2M/qtr`, `up28%`,
 * `1.2M→3.4M`, `5k users`, `100GB storage`), skipping alphanumeric names (`B2B`, `COVID-19`,
 * `Web3`, `MP4`, `H2O`) where a non-percentage/non-currency match is glued to a letter
 * (or a letter followed by `-`) on its left, and filters them with `IsNumericLiteralToken`
 * to exclude quarters, years, ISO dates, ratios, and ordinals/versions.
 */
export function ExtractNumericLiteralTokens(text: string): string[] {
    if (typeof text !== 'string' || !text.trim()) {
        return [];
    }
    const tokens: string[] = [];
    for (const match of text.matchAll(GLOBAL_NUMERIC_RUN_REGEX)) {
        const candidate = match[0];
        const startIndex = match.index ?? 0;

        const isGluedLeft =
            (startIndex > 0 && ASCII_LETTER_REGEX.test(text[startIndex - 1])) ||
            (startIndex > 1 && text[startIndex - 1] === '-' && ASCII_LETTER_REGEX.test(text[startIndex - 2]));

        if (isGluedLeft && !PERCENT_OR_CURRENCY_REGEX.test(candidate)) {
            continue;
        }
        if (IsNumericLiteralToken(candidate)) {
            tokens.push(candidate);
        }
    }
    return tokens;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Pure, stage-aware validator for `VideoGenerationSpec`.
 *
 * Collects and returns every structural, stage-completeness, cross-reference,
 * and facts-vs-choices error in a single pass without throwing.
 */
export function ValidateVideoGenerationSpec(
    spec: VideoGenerationSpec,
    stage: VideoProductionStatus = spec?.Status,
    options?: VideoSpecValidationOptions,
): VideoSpecValidationResult {
    const safeSpec = (spec ?? {}) as VideoGenerationSpec;
    const errors: VideoSpecValidationError[] = [];

    const effectiveStage = isMemberOf(stage, VIDEO_PRODUCTION_STATUSES) ? stage : 'Briefing';
    const requiredSections = new Set<VideoSpecSection>(STAGE_REQUIRED_SECTIONS[effectiveStage]);

    const approvedAssetKeys = new Set<string>(
        asArray<VideoGenerationSpec['Assets']['Approved'][number]>(safeSpec.Assets?.Approved)
            .map((a) => a?.Key)
            .filter((k): k is string => typeof k === 'string' && Boolean(k.trim())),
    );
    const referenceableAssetKeys = new Set<string>(approvedAssetKeys);
    for (const bkKey of asArray<string>(options?.BrandKitAssetKeys)) {
        if (typeof bkKey === 'string' && bkKey.trim()) {
            referenceableAssetKeys.add(bkKey);
        }
    }
    const dataBindingKeys = new Set<string>(
        asArray<VideoGenerationSpec['DataBindings'][number]>(safeSpec.DataBindings)
            .map((b) => b?.Key)
            .filter((k): k is string => typeof k === 'string' && Boolean(k.trim())),
    );
    const beatKeys = new Set<string>(
        asArray<VideoGenerationSpec['Beats'][number]>(safeSpec.Beats)
            .map((b) => b?.Key)
            .filter((k): k is string => typeof k === 'string' && Boolean(k.trim())),
    );
    const narrationLineKeys = new Set<string>(
        asArray<NonNullable<VideoGenerationSpec['Audio']['Narration']>['Script'][number]>(
            safeSpec.Audio?.Narration?.Script,
        )
            .map((n) => n?.Key)
            .filter((k): k is string => typeof k === 'string' && Boolean(k.trim())),
    );

    validateHeaderAndTopLevelEnums(safeSpec, stage, errors);
    validateFilmAndDeliverables(safeSpec, errors);
    validateAssetsAndGeneration(
        safeSpec,
        stage,
        requiredSections,
        approvedAssetKeys,
        referenceableAssetKeys,
        options,
        errors,
    );
    validateStyleSection(safeSpec, requiredSections, approvedAssetKeys, errors);
    validateBeatsSection(
        safeSpec,
        requiredSections,
        approvedAssetKeys,
        dataBindingKeys,
        narrationLineKeys,
        errors,
    );
    validateDataSection(safeSpec, requiredSections, errors);
    validateAudioSection(safeSpec, requiredSections, approvedAssetKeys, beatKeys, errors);
    validateRenderAndInteraction(safeSpec, errors);
    validateReviewSection(safeSpec, errors);
    validateOutputSection(safeSpec, requiredSections, errors);

    return {
        Valid: errors.length === 0,
        Errors: errors,
    };
}

// ---------------------------------------------------------------------------
// Internal Section Checkers
// ---------------------------------------------------------------------------

function isMemberOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
    return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function pushEnumError(
    errors: VideoSpecValidationError[],
    path: string,
    actual: unknown,
    allowed: readonly string[],
): void {
    errors.push({
        Code: 'InvalidEnumValue',
        Path: path,
        Message: `Invalid value "${String(actual)}" at ${path}. Expected one of: ${allowed.join(', ')}.`,
    });
}

function validateHeaderAndTopLevelEnums(
    spec: VideoGenerationSpec,
    stage: VideoProductionStatus,
    errors: VideoSpecValidationError[],
): void {
    if (spec.SpecVersion !== VIDEO_STUDIO_SPEC_VERSION) {
        errors.push({
            Code: 'InvalidSpecVersion',
            Path: 'SpecVersion',
            Message: `SpecVersion must be "${VIDEO_STUDIO_SPEC_VERSION}".`,
        });
    }
    if (!isMemberOf(spec.Status, VIDEO_PRODUCTION_STATUSES)) {
        pushEnumError(errors, 'Status', spec.Status, VIDEO_PRODUCTION_STATUSES);
    }
    if (!isMemberOf(stage, VIDEO_PRODUCTION_STATUSES)) {
        pushEnumError(errors, 'Stage', stage, VIDEO_PRODUCTION_STATUSES);
    }
    if (!spec.Archetype?.Name?.trim()) {
        errors.push({
            Code: 'MissingArchetypeName',
            Path: 'Archetype.Name',
            Message: 'Archetype.Name is required.',
        });
    }
}

function validateFilmAndDeliverables(
    spec: VideoGenerationSpec,
    errors: VideoSpecValidationError[],
): void {
    if (!spec.Film?.OneSentence?.trim()) {
        errors.push({
            Code: 'MissingFilmField',
            Path: 'Film.OneSentence',
            Message: 'Film.OneSentence is required.',
        });
    }
    if (!spec.Film?.Audience?.trim()) {
        errors.push({
            Code: 'MissingFilmField',
            Path: 'Film.Audience',
            Message: 'Film.Audience is required.',
        });
    }
    if (!spec.Film?.Purpose?.trim()) {
        errors.push({
            Code: 'MissingFilmField',
            Path: 'Film.Purpose',
            Message: 'Film.Purpose is required.',
        });
    }
    if (typeof spec.Film?.DurationSeconds !== 'number' || !Number.isFinite(spec.Film.DurationSeconds) || spec.Film.DurationSeconds <= 0) {
        errors.push({
            Code: 'InvalidFilmDuration',
            Path: 'Film.DurationSeconds',
            Message: 'Film.DurationSeconds must be a finite number greater than 0.',
        });
    }
    const filmFormats = asArray<VideoFormat>(spec.Film?.Formats);
    if (!filmFormats.length) {
        errors.push({
            Code: 'MissingFilmFormats',
            Path: 'Film.Formats',
            Message: 'Film.Formats must list at least one target aspect ratio.',
        });
    } else {
        filmFormats.forEach((fmt, idx) => {
            if (!isMemberOf(fmt, VIDEO_FORMATS)) {
                pushEnumError(errors, `Film.Formats[${idx}]`, fmt, VIDEO_FORMATS);
            }
        });
    }

    const deliverableFormats = asArray<VideoFormat>(spec.Deliverables?.Formats);
    if (!deliverableFormats.length) {
        errors.push({
            Code: 'MissingDeliverableFormats',
            Path: 'Deliverables.Formats',
            Message: 'Deliverables.Formats must list at least one format to deliver.',
        });
    } else {
        deliverableFormats.forEach((fmt, idx) => {
            if (!isMemberOf(fmt, VIDEO_FORMATS)) {
                pushEnumError(errors, `Deliverables.Formats[${idx}]`, fmt, VIDEO_FORMATS);
            }
        });
    }
}

function validateAssetsAndGeneration(
    spec: VideoGenerationSpec,
    stage: VideoProductionStatus,
    requiredSections: ReadonlySet<VideoSpecSection>,
    approvedAssetKeys: ReadonlySet<string>,
    referenceableAssetKeys: ReadonlySet<string>,
    options: VideoSpecValidationOptions | undefined,
    errors: VideoSpecValidationError[],
): void {
    const approvedAssets = asArray<VideoGenerationSpec['Assets']['Approved'][number]>(spec.Assets?.Approved);
    const approvedByKey = new Map(
        approvedAssets.filter((a) => Boolean(a)).map((asset) => [asset.Key, asset]),
    );
    const requiresPreProduction = requiredSections.has('PreProduction');

    approvedAssets.forEach((asset, idx) => {
        if (!asset) {
            return;
        }
        if (!isMemberOf(asset.Kind, VIDEO_ASSET_KINDS)) {
            pushEnumError(errors, `Assets.Approved[${idx}].Kind`, asset.Kind, VIDEO_ASSET_KINDS);
        }
        if (!isMemberOf(asset.Provenance, VIDEO_ASSET_PROVENANCES)) {
            pushEnumError(errors, `Assets.Approved[${idx}].Provenance`, asset.Provenance, VIDEO_ASSET_PROVENANCES);
        }
        if (asset.Provenance === 'Generated') {
            if (
                !asset.Generation ||
                !asset.Generation.ModelID?.trim() ||
                !asset.Generation.PromptRunID?.trim() ||
                !asset.Generation.Prompt?.trim()
            ) {
                errors.push({
                    Code: 'MissingGeneratedAssetProvenance',
                    Path: `Assets.Approved[${idx}].Generation`,
                    Message: `Generated asset "${asset.Key}" must include Generation metadata with ModelID, PromptRunID, and Prompt.`,
                });
            }
        } else if (requiresPreProduction && !asset.FileID?.trim() && !asset.ArtifactVersionID?.trim()) {
            errors.push({
                Code: 'MissingApprovedAssetSourceId',
                Path: `Assets.Approved[${idx}]`,
                Message: `Approved non-generated asset "${asset.Key}" must have a FileID or ArtifactVersionID from PreProduced onward.`,
            });
        }
    });

    const isBlocked = spec.Status === 'Blocked' || stage === 'Blocked';
    asArray<VideoGenerationSpec['Assets']['Required'][number]>(spec.Assets?.Required).forEach((req, idx) => {
        if (!req) {
            return;
        }
        if (!isMemberOf(req.Kind, VIDEO_ASSET_KINDS)) {
            pushEnumError(errors, `Assets.Required[${idx}].Kind`, req.Kind, VIDEO_ASSET_KINDS);
        }
        if (req.SatisfiedByAssetKey !== undefined && !approvedAssetKeys.has(req.SatisfiedByAssetKey)) {
            errors.push({
                Code: 'UnresolvedReferenceKey',
                Path: `Assets.Required[${idx}].SatisfiedByAssetKey`,
                Message: `SatisfiedByAssetKey "${req.SatisfiedByAssetKey}" does not exist in Assets.Approved.`,
            });
        }
        const lookupKey = req.SatisfiedByAssetKey ?? req.Key;
        const matchedAsset = approvedByKey.get(lookupKey);
        if (!matchedAsset) {
            if (req.MustUse && !isBlocked) {
                errors.push({
                    Code: 'UnmetMustUseRequirement',
                    Path: `Assets.Required[${idx}]`,
                    Message: `MustUse asset requirement "${req.Key}" is not satisfied by Assets.Approved and Status is not "Blocked".`,
                });
            }
        } else if (matchedAsset.Provenance === 'Generated' && req.AllowGenerated !== true) {
            errors.push({
                Code: 'GeneratedAssetNotAllowedForRequirement',
                Path: `Assets.Required[${idx}]`,
                Message: `Asset requirement "${req.Key}" cannot be satisfied by Generated asset "${matchedAsset.Key}" unless AllowGenerated is true.`,
            });
        }
    });

    asArray<VideoGenerationSpec['Assets']['Generate'][number]>(spec.Assets?.Generate).forEach((genReq, idx) => {
        if (!genReq) {
            return;
        }
        if (genReq.Kind !== 'Image' && genReq.Kind !== 'Video') {
            pushEnumError(errors, `Assets.Generate[${idx}].Kind`, genReq.Kind, ['Image', 'Video']);
        }
        if (genReq.Format !== undefined && !isMemberOf(genReq.Format, VIDEO_FORMATS)) {
            pushEnumError(errors, `Assets.Generate[${idx}].Format`, genReq.Format, VIDEO_FORMATS);
        }
        if (!genReq.Purpose?.trim() || !genReq.Prompt?.trim()) {
            errors.push({
                Code: 'MissingGenerationPurpose',
                Path: !genReq.Purpose?.trim()
                    ? `Assets.Generate[${idx}].Purpose`
                    : `Assets.Generate[${idx}].Prompt`,
                Message: `Generation request "${genReq.Key}" must specify both Purpose and Prompt.`,
            });
        }
        if (genReq.Kind === 'Video' && genReq.DurationSeconds === undefined) {
            errors.push({
                Code: 'MissingGenerationDuration',
                Path: `Assets.Generate[${idx}].DurationSeconds`,
                Message: `Video generation request "${genReq.Key}" must specify DurationSeconds.`,
            });
        } else if (genReq.DurationSeconds !== undefined) {
            const maxSeconds = options?.MaxGeneratedVideoSeconds;
            if (
                typeof genReq.DurationSeconds !== 'number' ||
                !Number.isFinite(genReq.DurationSeconds) ||
                genReq.DurationSeconds <= 0 ||
                (maxSeconds !== undefined && genReq.DurationSeconds > maxSeconds)
            ) {
                errors.push({
                    Code: 'GenerationDurationExceedsLimit',
                    Path: `Assets.Generate[${idx}].DurationSeconds`,
                    Message:
                        maxSeconds !== undefined
                            ? `Generation request "${genReq.Key}" duration (${genReq.DurationSeconds}s) must be > 0 and <= ${maxSeconds}s.`
                            : `Generation request "${genReq.Key}" duration (${genReq.DurationSeconds}s) must be > 0.`,
                });
            }
        }
        asArray<string>(genReq.ReferenceKeys).forEach((refKey, refIdx) => {
            if (!referenceableAssetKeys.has(refKey)) {
                errors.push({
                    Code: 'UnresolvedReferenceKey',
                    Path: `Assets.Generate[${idx}].ReferenceKeys[${refIdx}]`,
                    Message: `Generation reference key "${refKey}" does not resolve to an approved or brand-kit asset.`,
                });
            }
        });
        asArray<NonNullable<typeof genReq.Keyframes>[number]>(genReq.Keyframes).forEach((kf, kfIdx) => {
            if (kf && !referenceableAssetKeys.has(kf.AssetKey)) {
                errors.push({
                    Code: 'UnresolvedReferenceKey',
                    Path: `Assets.Generate[${idx}].Keyframes[${kfIdx}].AssetKey`,
                    Message: `Keyframe AssetKey "${kf.AssetKey}" does not resolve to an approved or brand-kit asset.`,
                });
            }
        });
    });
}

function validateStyleSection(
    spec: VideoGenerationSpec,
    requiredSections: ReadonlySet<VideoSpecSection>,
    approvedAssetKeys: ReadonlySet<string>,
    errors: VideoSpecValidationError[],
): void {
    const requiresStyle = requiredSections.has('Style');
    const palette = asArray<VideoGenerationSpec['Style']['Palette'][number]>(spec.Style?.Palette);
    const typography = asArray<VideoGenerationSpec['Style']['Typography'][number]>(spec.Style?.Typography);
    const motionRules = asArray<VideoGenerationSpec['Style']['MotionRules'][number]>(spec.Style?.MotionRules);

    if (requiresStyle) {
        if (!palette.length) {
            errors.push({
                Code: 'MissingStyleSection',
                Path: 'Style.Palette',
                Message: 'Style.Palette must define at least one ColorToken from Styled onward.',
            });
        }
        if (!typography.length) {
            errors.push({
                Code: 'MissingStyleSection',
                Path: 'Style.Typography',
                Message: 'Style.Typography must define at least one TypeSpec from Styled onward.',
            });
        }
        if (!spec.Style?.Composition?.trim()) {
            errors.push({
                Code: 'MissingStyleSection',
                Path: 'Style.Composition',
                Message: 'Style.Composition is required from Styled onward.',
            });
        }
        if (
            !spec.Style?.Pacing ||
            !(spec.Style.Pacing.AvgSecondsBetweenChanges > 0) ||
            !spec.Style.Pacing.HoldRules?.trim()
        ) {
            errors.push({
                Code: 'MissingStyleSection',
                Path: 'Style.Pacing',
                Message: 'Style.Pacing requires AvgSecondsBetweenChanges > 0 and non-empty HoldRules from Styled onward.',
            });
        }
        if (!motionRules.length) {
            errors.push({
                Code: 'MissingStyleSection',
                Path: 'Style.MotionRules',
                Message: 'Style.MotionRules must define at least one MotionRule from Styled onward.',
            });
        }
    }

    typography.forEach((typeSpec, idx) => {
        if (typeSpec?.FontAssetKey !== undefined && !approvedAssetKeys.has(typeSpec.FontAssetKey)) {
            errors.push({
                Code: 'UnresolvedReferenceKey',
                Path: `Style.Typography[${idx}].FontAssetKey`,
                Message: `TypeSpec FontAssetKey "${typeSpec.FontAssetKey}" does not exist in Assets.Approved.`,
            });
        }
    });

    motionRules.forEach((rule, idx) => {
        if (rule && !isMemberOf(rule.ObjectClass, MOTION_OBJECT_CLASSES)) {
            pushEnumError(errors, `Style.MotionRules[${idx}].ObjectClass`, rule.ObjectClass, MOTION_OBJECT_CLASSES);
        }
    });
}

function validateBeatsSection(
    spec: VideoGenerationSpec,
    requiredSections: ReadonlySet<VideoSpecSection>,
    approvedAssetKeys: ReadonlySet<string>,
    dataBindingKeys: ReadonlySet<string>,
    narrationLineKeys: ReadonlySet<string>,
    errors: VideoSpecValidationError[],
): void {
    const beats = asArray<VideoGenerationSpec['Beats'][number]>(spec.Beats);
    if (requiredSections.has('Beats') && beats.length === 0) {
        errors.push({
            Code: 'MissingBeats',
            Path: 'Beats',
            Message: 'Beats must contain at least one storyboard beat from Storyboarded onward.',
        });
        return;
    }
    if (beats.length === 0) {
        return;
    }

    const firstStart = beats[0]?.StartSeconds;
    if (
        typeof firstStart === 'number' &&
        Number.isFinite(firstStart) &&
        Math.abs(firstStart) > BEAT_TIMELINE_TOLERANCE_SECONDS
    ) {
        errors.push({
            Code: 'BeatsMustStartAtZero',
            Path: 'Beats[0].StartSeconds',
            Message: `First beat must start at 0s (within ±${BEAT_TIMELINE_TOLERANCE_SECONDS}s), got ${firstStart}s.`,
        });
    }

    const deliverableFormats = asArray<VideoFormat>(spec.Deliverables?.Formats).filter((f): f is VideoFormat =>
        isMemberOf(f, VIDEO_FORMATS),
    );

    beats.forEach((beat, idx) => {
        validateSingleBeat(
            beat ?? ({} as VideoGenerationSpec['Beats'][number]),
            idx,
            idx > 0 ? beats[idx - 1] : undefined,
            deliverableFormats,
            approvedAssetKeys,
            dataBindingKeys,
            narrationLineKeys,
            errors,
        );
    });

    const lastIdx = beats.length - 1;
    const lastBeat = beats[lastIdx];
    const lastEnd = lastBeat?.EndSeconds;
    if (
        typeof spec.Film?.DurationSeconds === 'number' &&
        Number.isFinite(spec.Film.DurationSeconds) &&
        spec.Film.DurationSeconds > 0 &&
        typeof lastEnd === 'number' &&
        Number.isFinite(lastEnd) &&
        Math.abs(lastEnd - spec.Film.DurationSeconds) > BEAT_TIMELINE_TOLERANCE_SECONDS
    ) {
        errors.push({
            Code: 'BeatsDurationMismatch',
            Path: `Beats[${lastIdx}].EndSeconds`,
            Message: `Final beat ends at ${lastEnd}s, which differs from Film.DurationSeconds (${spec.Film.DurationSeconds}s) by more than ±${BEAT_TIMELINE_TOLERANCE_SECONDS}s.`,
        });
    }
}

function validateSingleBeat(
    beat: VideoGenerationSpec['Beats'][number],
    idx: number,
    prevBeat: VideoGenerationSpec['Beats'][number] | undefined,
    deliverableFormats: readonly VideoFormat[],
    approvedAssetKeys: ReadonlySet<string>,
    dataBindingKeys: ReadonlySet<string>,
    narrationLineKeys: ReadonlySet<string>,
    errors: VideoSpecValidationError[],
): void {
    const requiredTextFields: Array<['Key' | 'Label' | 'EntryState' | 'ExitState' | 'Purpose', string]> = [
        ['Key', beat.Key],
        ['Label', beat.Label],
        ['EntryState', beat.EntryState],
        ['ExitState', beat.ExitState],
        ['Purpose', beat.Purpose],
    ];
    for (const [fieldName, value] of requiredTextFields) {
        if (!value?.trim()) {
            errors.push({
                Code: 'MissingBeatField',
                Path: `Beats[${idx}].${fieldName}`,
                Message: `Beats[${idx}].${fieldName} is required.`,
            });
        }
    }

    const startFinite = typeof beat.StartSeconds === 'number' && Number.isFinite(beat.StartSeconds);
    const endFinite = typeof beat.EndSeconds === 'number' && Number.isFinite(beat.EndSeconds);
    if (!startFinite) {
        errors.push({
            Code: 'InvalidBeatTiming',
            Path: `Beats[${idx}].StartSeconds`,
            Message: `Beats[${idx}].StartSeconds must be a finite number.`,
        });
    }
    if (!endFinite) {
        errors.push({
            Code: 'InvalidBeatTiming',
            Path: `Beats[${idx}].EndSeconds`,
            Message: `Beats[${idx}].EndSeconds must be a finite number.`,
        });
    }
    if (startFinite && endFinite && beat.EndSeconds <= beat.StartSeconds) {
        errors.push({
            Code: 'InvalidBeatTiming',
            Path: `Beats[${idx}].EndSeconds`,
            Message: `Beats[${idx}].EndSeconds (${beat.EndSeconds}s) must be greater than StartSeconds (${beat.StartSeconds}s).`,
        });
    }

    const prevEndFinite = typeof prevBeat?.EndSeconds === 'number' && Number.isFinite(prevBeat.EndSeconds);
    if (
        prevBeat &&
        startFinite &&
        prevEndFinite &&
        Math.abs(beat.StartSeconds - prevBeat.EndSeconds) > BEAT_TIMELINE_TOLERANCE_SECONDS
    ) {
        errors.push({
            Code: 'NonContiguousBeats',
            Path: `Beats[${idx}].StartSeconds`,
            Message: `Beats[${idx}] starts at ${beat.StartSeconds}s, leaving a gap or overlap after Beats[${idx - 1}] ending at ${prevBeat.EndSeconds}s.`,
        });
    }

    for (const fmt of deliverableFormats) {
        if (!beat.LayoutNotes?.[fmt]?.trim()) {
            errors.push({
                Code: 'MissingBeatLayoutNote',
                Path: `Beats[${idx}].LayoutNotes.${fmt}`,
                Message: `Beats[${idx}] is missing LayoutNotes for deliverable format "${fmt}".`,
            });
        }
    }

    const beatDataRefs = asArray<string>(beat.DataRefs);
    const beatDataRefSet = new Set<string>(beatDataRefs);

    asArray<string>(beat.OnScreenText).forEach((textLine, textIdx) => {
        if (typeof textLine !== 'string') {
            return;
        }
        const unknownPlaceholders: string[] = [];
        for (const match of textLine.matchAll(ON_SCREEN_PLACEHOLDER_REGEX)) {
            const placeholderKey = match[1].trim();
            if (!placeholderKey || !beatDataRefSet.has(placeholderKey)) {
                unknownPlaceholders.push(placeholderKey || '{}');
            }
        }
        if (unknownPlaceholders.length > 0) {
            errors.push({
                Code: 'UnknownOnScreenPlaceholder',
                Path: `Beats[${idx}].OnScreenText[${textIdx}]`,
                Message: `On-screen text "${textLine}" references placeholder(s) (${unknownPlaceholders.map((p) => `{${p}}`).join(', ')}) not listed in Beats[${idx}].DataRefs.`,
            });
        }

        const strippedText = textLine.replace(ON_SCREEN_PLACEHOLDER_REGEX, ' ');
        const numericTokens = ExtractNumericLiteralTokens(strippedText);
        if (numericTokens.length > 0) {
            errors.push({
                Code: 'UnboundNumericOnScreenText',
                Path: `Beats[${idx}].OnScreenText[${textIdx}]`,
                Message: `On-screen text "${textLine}" contains unbound numeric literal(s) (${numericTokens.join(', ')}); bound values must use {BindingKey} placeholders listed in Beats[${idx}].DataRefs.`,
            });
        }
    });

    asArray<string>(beat.AssetRefs).forEach((assetKey, refIdx) => {
        if (!approvedAssetKeys.has(assetKey)) {
            errors.push({
                Code: 'UnresolvedReferenceKey',
                Path: `Beats[${idx}].AssetRefs[${refIdx}]`,
                Message: `Beat AssetRef "${assetKey}" does not exist in Assets.Approved.`,
            });
        }
    });

    beatDataRefs.forEach((dataKey, refIdx) => {
        if (!dataBindingKeys.has(dataKey)) {
            errors.push({
                Code: 'UnresolvedReferenceKey',
                Path: `Beats[${idx}].DataRefs[${refIdx}]`,
                Message: `Beat DataRef "${dataKey}" does not exist in DataBindings.`,
            });
        }
    });

    if (beat.NarrationKey !== undefined && !narrationLineKeys.has(beat.NarrationKey)) {
        errors.push({
            Code: 'UnresolvedReferenceKey',
            Path: `Beats[${idx}].NarrationKey`,
            Message: `Beat NarrationKey "${beat.NarrationKey}" does not exist in Audio.Narration.Script.`,
        });
    }
}

function validateDataSection(
    spec: VideoGenerationSpec,
    requiredSections: ReadonlySet<VideoSpecSection>,
    errors: VideoSpecValidationError[],
): void {
    const bindings = asArray<VideoGenerationSpec['DataBindings'][number]>(spec.DataBindings);
    bindings.forEach((binding, idx) => {
        if (!binding) {
            return;
        }
        if (!isMemberOf(binding.Source?.Kind, VIDEO_DATA_SOURCE_KINDS)) {
            pushEnumError(errors, `DataBindings[${idx}].Source.Kind`, binding.Source?.Kind, VIDEO_DATA_SOURCE_KINDS);
        }
        if (!isMemberOf(binding.Shape, VIDEO_DATA_SHAPES)) {
            pushEnumError(errors, `DataBindings[${idx}].Shape`, binding.Shape, VIDEO_DATA_SHAPES);
        }
        if (binding.Format !== undefined && !isMemberOf(binding.Format.Kind, VIDEO_DATA_FORMAT_KINDS)) {
            pushEnumError(errors, `DataBindings[${idx}].Format.Kind`, binding.Format.Kind, VIDEO_DATA_FORMAT_KINDS);
        }
        asArray<NonNullable<typeof binding.Columns>[number]>(binding.Columns).forEach((col, colIdx) => {
            if (col?.Format !== undefined && !isMemberOf(col.Format.Kind, VIDEO_DATA_FORMAT_KINDS)) {
                pushEnumError(
                    errors,
                    `DataBindings[${idx}].Columns[${colIdx}].Format.Kind`,
                    col.Format.Kind,
                    VIDEO_DATA_FORMAT_KINDS,
                );
            }
        });
    });

    if (
        requiredSections.has('PreProduction') &&
        bindings.length > 0 &&
        (!spec.DataSnapshot ||
            !spec.DataSnapshot.AsOf?.trim() ||
            (!spec.DataSnapshot.FileID?.trim() && !spec.DataSnapshot.Inline))
    ) {
        errors.push({
            Code: 'MissingDataSnapshot',
            Path: 'DataSnapshot',
            Message: 'DataSnapshot with AsOf and either FileID or Inline data is required from PreProduced onward when DataBindings are present.',
        });
    }
}

function validateAudioSection(
    spec: VideoGenerationSpec,
    requiredSections: ReadonlySet<VideoSpecSection>,
    approvedAssetKeys: ReadonlySet<string>,
    beatKeys: ReadonlySet<string>,
    errors: VideoSpecValidationError[],
): void {
    if (!isMemberOf(spec.Audio?.Captions, VIDEO_CAPTION_MODES)) {
        pushEnumError(errors, 'Audio.Captions', spec.Audio?.Captions, VIDEO_CAPTION_MODES);
    }

    const scriptLines = asArray<NonNullable<VideoGenerationSpec['Audio']['Narration']>['Script'][number]>(
        spec.Audio?.Narration?.Script,
    );
    if (requiredSections.has('NarrationScript')) {
        const narration = spec.Audio?.Narration;
        if (
            !narration ||
            !narration.VoiceID?.trim() ||
            !narration.Provider?.trim() ||
            !scriptLines.length
        ) {
            errors.push({
                Code: 'MissingNarrationScript',
                Path: 'Audio.Narration',
                Message: 'Audio.Narration with VoiceID, Provider, and non-empty Script is required from Storyboarded onward.',
            });
        }
    }

    if (beatKeys.size > 0) {
        scriptLines.forEach((line, idx) => {
            if (line && !beatKeys.has(line.BeatKey)) {
                errors.push({
                    Code: 'UnresolvedReferenceKey',
                    Path: `Audio.Narration.Script[${idx}].BeatKey`,
                    Message: `NarrationLine BeatKey "${line.BeatKey}" does not exist in Beats.`,
                });
            }
        });
    }

    if (spec.Audio?.Music?.AssetKey !== undefined && !approvedAssetKeys.has(spec.Audio.Music.AssetKey)) {
        errors.push({
            Code: 'UnresolvedReferenceKey',
            Path: 'Audio.Music.AssetKey',
            Message: `Audio.Music.AssetKey "${spec.Audio.Music.AssetKey}" does not exist in Assets.Approved.`,
        });
    }

    const duration = spec.Film?.DurationSeconds;
    const hasValidDuration = typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
    asArray<VideoGenerationSpec['Audio']['Cues'][number]>(spec.Audio?.Cues).forEach((cue, idx) => {
        if (!cue) {
            return;
        }
        if (!isMemberOf(cue.Kind, AUDIO_CUE_KINDS)) {
            pushEnumError(errors, `Audio.Cues[${idx}].Kind`, cue.Kind, AUDIO_CUE_KINDS);
        }
        const cueTimeFinite = typeof cue.TimestampSeconds === 'number' && Number.isFinite(cue.TimestampSeconds);
        if (
            !cueTimeFinite ||
            cue.TimestampSeconds < 0 ||
            (hasValidDuration && cue.TimestampSeconds > duration)
        ) {
            errors.push({
                Code: 'AudioCueOutsideTimeline',
                Path: `Audio.Cues[${idx}].TimestampSeconds`,
                Message: `Audio cue "${cue.Key}" timestamp (${cue.TimestampSeconds}s) falls outside the film timeline [0, ${duration}].`,
            });
        }
        if (cue.AssetKey !== undefined && !approvedAssetKeys.has(cue.AssetKey)) {
            errors.push({
                Code: 'UnresolvedReferenceKey',
                Path: `Audio.Cues[${idx}].AssetKey`,
                Message: `Audio cue AssetKey "${cue.AssetKey}" does not exist in Assets.Approved.`,
            });
        }
        if (beatKeys.size > 0 && cue.BeatKey !== undefined && !beatKeys.has(cue.BeatKey)) {
            errors.push({
                Code: 'UnresolvedReferenceKey',
                Path: `Audio.Cues[${idx}].BeatKey`,
                Message: `Audio cue BeatKey "${cue.BeatKey}" does not exist in Beats.`,
            });
        }
    });
}

function validateRenderAndInteraction(
    spec: VideoGenerationSpec,
    errors: VideoSpecValidationError[],
): void {
    if (
        spec.Render?.Renderer !== 'HyperFrames' ||
        !spec.Render?.RendererVersion?.trim() ||
        !(spec.Render?.Fps > 0)
    ) {
        const path =
            spec.Render?.Renderer !== 'HyperFrames'
                ? 'Render.Renderer'
                : !spec.Render?.RendererVersion?.trim()
                  ? 'Render.RendererVersion'
                  : 'Render.Fps';
        errors.push({
            Code: 'InvalidRenderConfig',
            Path: path,
            Message: 'Render requires Renderer="HyperFrames", non-empty RendererVersion, and Fps > 0.',
        });
    }
    if (!isMemberOf(spec.Render?.Quality, VIDEO_RENDER_QUALITIES)) {
        pushEnumError(errors, 'Render.Quality', spec.Render?.Quality, VIDEO_RENDER_QUALITIES);
    }
    if (!isMemberOf(spec.Interaction?.Mode, VIDEO_INTERACTION_MODES)) {
        pushEnumError(errors, 'Interaction.Mode', spec.Interaction?.Mode, VIDEO_INTERACTION_MODES);
    }
    if (
        typeof spec.Interaction?.MaxRepairRounds !== 'number' ||
        !Number.isFinite(spec.Interaction.MaxRepairRounds) ||
        spec.Interaction.MaxRepairRounds < 0
    ) {
        errors.push({
            Code: 'InvalidMaxRepairRounds',
            Path: 'Interaction.MaxRepairRounds',
            Message: 'Interaction.MaxRepairRounds must be a non-negative number.',
        });
    }
}

function validateReviewSection(
    spec: VideoGenerationSpec,
    errors: VideoSpecValidationError[],
): void {
    asArray<VideoGenerationSpec['Review']['Gates'][number]>(spec.Review?.Gates).forEach((gate, idx) => {
        if (!gate) {
            return;
        }
        if (!isMemberOf(gate.Gate, VIDEO_GATE_IDS)) {
            pushEnumError(errors, `Review.Gates[${idx}].Gate`, gate.Gate, VIDEO_GATE_IDS);
        }
        if (!isMemberOf(gate.Status, GATE_STATUSES)) {
            pushEnumError(errors, `Review.Gates[${idx}].Status`, gate.Status, GATE_STATUSES);
        }
    });

    asArray<VideoGenerationSpec['Review']['Rounds'][number]>(spec.Review?.Rounds).forEach((round, rIdx) => {
        asArray<VideoGenerationSpec['Review']['Rounds'][number]['Defects'][number]>(round?.Defects).forEach(
            (defect, dIdx) => {
                if (!defect) {
                    return;
                }
                if (defect.Format !== undefined && !isMemberOf(defect.Format, VIDEO_FORMATS)) {
                    pushEnumError(errors, `Review.Rounds[${rIdx}].Defects[${dIdx}].Format`, defect.Format, VIDEO_FORMATS);
                }
                if (!isMemberOf(defect.Severity, DEFECT_SEVERITIES)) {
                    pushEnumError(errors, `Review.Rounds[${rIdx}].Defects[${dIdx}].Severity`, defect.Severity, DEFECT_SEVERITIES);
                }
                if (!isMemberOf(defect.Status, DEFECT_STATUSES)) {
                    pushEnumError(errors, `Review.Rounds[${rIdx}].Defects[${dIdx}].Status`, defect.Status, DEFECT_STATUSES);
                }
            },
        );
    });
}

function validateOutputSection(
    spec: VideoGenerationSpec,
    requiredSections: ReadonlySet<VideoSpecSection>,
    errors: VideoSpecValidationError[],
): void {
    const requiresOutput = requiredSections.has('Output');
    if (requiresOutput && !spec.Output) {
        errors.push({
            Code: 'MissingOutputManifest',
            Path: 'Output',
            Message: 'Output manifest is required when stage is "Delivered".',
        });
        return;
    }
    if (!spec.Output) {
        return;
    }

    if (requiresOutput) {
        const deliverableFormats = asArray<VideoFormat>(spec.Deliverables?.Formats).filter((f): f is VideoFormat =>
            isMemberOf(f, VIDEO_FORMATS),
        );
        for (const fmt of deliverableFormats) {
            if (!spec.Output.Videos?.[fmt]) {
                errors.push({
                    Code: 'MissingOutputManifest',
                    Path: `Output.Videos.${fmt}`,
                    Message: `Delivered Output.Videos is missing rendered deliverable for format "${fmt}".`,
                });
            }
        }
    }

    for (const [mapKey, entry] of Object.entries(spec.Output.Videos ?? {})) {
        if (!entry) {
            continue;
        }
        if (!entry.FileID?.trim() && !entry.InlineBase64?.trim()) {
            errors.push({
                Code: 'MissingOutputVideoPayload',
                Path: `Output.Videos.${mapKey}`,
                Message: `Output.Videos.${mapKey} must have either FileID or InlineBase64.`,
            });
        }
        if (entry.Format !== mapKey) {
            errors.push({
                Code: 'OutputVideoFormatKeyMismatch',
                Path: `Output.Videos.${mapKey}.Format`,
                Message: `Output.Videos.${mapKey}.Format ("${entry.Format}") must equal its map key "${mapKey}".`,
            });
        }
    }
}

