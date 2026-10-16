/**
 * @fileoverview Narration synthesis and timeline-fitting pipeline for Video Studio (§8, §5.1).
 *
 * Resolves a provider-pinned TTS model, substitutes `{BindingKey}` placeholders from
 * caller-supplied display text, synthesizes each narration line with word-level timestamps,
 * stores clips via {@link StoreFile}, fits the storyboard timeline to measured speech durations,
 * and generates WebVTT captions when enabled.
 *
 * @module @memberjunction/video-studio
 */

import { DeriveWordTimings, SpeechResult } from '@memberjunction/ai';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AITextToSpeechRunner } from '@memberjunction/ai-prompts';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    NarrationLine,
    NarrationWordTiming,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import { StoreFile } from '../storage.js';
import { BuildWebVtt } from './captions.js';
import {
    FilmDurationBounds,
    FitTimelineToNarration,
    NarrationIssue,
} from './narration-timeline.js';

/** Default output format requested from TTS drivers (128 kbps MP3 at 44.1 kHz). */
export const NARRATION_OUTPUT_FORMAT = 'mp3_44100_128';

/** Bitrate in bits per second for `mp3_44100_128` fallback duration estimation. */
const MP3_128_KBPS_BITS_PER_SECOND = 128_000;

/** Regex matching `{BindingKey}` placeholders inside narration line text. */
const NARRATION_PLACEHOLDER_REGEX = /\{([^{}]+)\}/g;

/**
 * Options for {@link RunNarrationPipeline}.
 */
export interface NarrationOptions {
    /** Authenticated user context for model configuration, prompt runner, and storage. */
    ContextUser: UserInfo;
    /** Optional scoped metadata provider forwarded to the runner and storage engine. */
    Provider?: IMetadataProvider;
    /** Optional explicit `AIModel.ID` override; when omitted, resolved from `Audio.Narration.Provider`. */
    ModelID?: string;
    /** Map of binding keys to pre-formatted display text for `{Key}` placeholder substitution. */
    BindingText?: Record<string, string>;
    /** Optional explicit `FileStorageAccount.ID` for clip and caption uploads. */
    StorageAccountID?: string;
    /** Optional film-level duration bounds from the video archetype. */
    FilmBounds?: FilmDurationBounds;
    /** Optional owning `AIAgent.ID` for prompt-run attribution. */
    AgentID?: string;
    /** Optional owning `AIAgentRun.ID` for prompt-run attribution. */
    AgentRunID?: string;
    /** Optional cancellation signal forwarded to each TTS runner invocation. */
    CancellationToken?: AbortSignal;
}

/**
 * In-memory audio clip artifact returned for a synthesized narration line.
 */
export interface NarrationClip {
    /** Key of the `NarrationLine` that produced this clip. */
    LineKey: string;
    /** MIME type of the synthesized audio (`'audio/mpeg'`). */
    MimeType: string;
    /** Raw synthesized audio bytes. */
    Data: Buffer;
    /** Uploaded `File.ID` when storage succeeded, or `undefined` when unstored. */
    FileID?: string;
    /** `AIPromptRun.ID` recorded by `AITextToSpeechRunner`, when available. */
    PromptRunID?: string;
}

/**
 * Result returned by {@link RunNarrationPipeline}.
 */
export interface NarrationResult {
    /** Deep copy of the input spec with fitted beats, narration timings, cues, and film duration. */
    Spec: VideoGenerationSpec;
    /** Synthesized audio clips in script order. */
    Clips: NarrationClip[];
    /** Generated WebVTT document when `Audio.Captions !== 'None'`. */
    CaptionsVtt?: string;
    /** Uploaded `File.ID` for `captions.vtt` when captions were generated and stored. */
    CaptionsFileID?: string;
    /** Structured errors and warnings collected during synthesis, storage, and timeline fitting. */
    Issues: NarrationIssue[];
}

interface ModelVendorLike {
    ModelID?: string;
    VendorID?: string;
    Vendor?: string;
    Status?: string;
    Type?: string;
    TypeID?: string;
}

interface ModelLike {
    ID: string;
    Name?: string;
    IsActive?: boolean;
    AIModelType?: string;
    AIModelTypeID?: string;
    PowerRank?: number | null;
    ModelVendors?: ModelVendorLike[];
}

function normalizeVendorKey(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isTtsModel(model: ModelLike, engine: AIEngineBase): boolean {
    if (typeof model.AIModelType === 'string' && model.AIModelType.trim().toLowerCase() === 'tts') {
        return true;
    }
    if (model.AIModelTypeID && Array.isArray(engine.ModelTypes)) {
        const matchedType = engine.ModelTypes.find((mt) => UUIDsEqual(mt.ID, model.AIModelTypeID));
        if (matchedType?.Name?.trim().toLowerCase() === 'tts') {
            return true;
        }
    }
    return false;
}

function isActiveInferenceVendorMatch(
    mv: ModelVendorLike,
    targetVendorKey: string,
    engine: AIEngineBase,
): boolean {
    if (mv.Status !== 'Active') {
        return false;
    }
    const canUseEngineInferenceCheck =
        typeof engine.IsInferenceProvider === 'function' &&
        Array.isArray(engine.VendorTypeDefinitions) &&
        engine.VendorTypeDefinitions.length > 0 &&
        Boolean(mv.TypeID);

    if (canUseEngineInferenceCheck) {
        if (!engine.IsInferenceProvider(mv as Parameters<AIEngineBase['IsInferenceProvider']>[0])) {
            return false;
        }
    } else if (typeof mv.Type === 'string' && mv.Type.trim().toLowerCase() !== 'inference provider') {
        return false;
    }

    let vendorName = mv.Vendor ?? '';
    if (!vendorName && mv.VendorID && Array.isArray(engine.Vendors)) {
        vendorName = engine.Vendors.find((v) => UUIDsEqual(v.ID, mv.VendorID))?.Name ?? '';
    }
    return normalizeVendorKey(vendorName) === targetVendorKey;
}

/**
 * Resolves the highest-`PowerRank` active `TTS` model with an active inference vendor matching `provider`.
 *
 * Vendor names are compared after lower-casing and stripping non-alphanumerics so `'ElevenLabs'`
 * matches metadata vendor `'Eleven Labs'`.
 */
export function ResolveNarrationModelID(provider: string): string | undefined {
    const targetVendorKey = normalizeVendorKey(provider);
    if (!targetVendorKey) {
        return undefined;
    }

    const engine = AIEngineBase.Instance;
    const models = (engine.Models ?? []) as unknown as ModelLike[];
    const allModelVendors = (engine.ModelVendors ?? []) as unknown as ModelVendorLike[];

    let bestModel: ModelLike | undefined;
    let bestRank = -Infinity;

    for (const model of models) {
        if (!model.IsActive || !isTtsModel(model, engine)) {
            continue;
        }
        const vendors =
            Array.isArray(model.ModelVendors) && model.ModelVendors.length > 0
                ? model.ModelVendors
                : allModelVendors.filter((mv) => UUIDsEqual(mv.ModelID, model.ID));

        const hasMatchingVendor = vendors.some((mv) =>
            isActiveInferenceVendorMatch(mv, targetVendorKey, engine),
        );
        if (!hasMatchingVendor) {
            continue;
        }

        const rank = typeof model.PowerRank === 'number' ? model.PowerRank : 0;
        if (rank > bestRank) {
            bestRank = rank;
            bestModel = model;
        }
    }

    return bestModel?.ID;
}

/**
 * Substitutes `{BindingKey}` placeholders in a narration line's text without mutating the line.
 */
function resolveSpokenText(
    rawText: string,
    bindingText: Record<string, string> | undefined,
): { spokenText?: string; unresolvedKeys: string[] } {
    const unresolvedKeys: string[] = [];
    NARRATION_PLACEHOLDER_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = NARRATION_PLACEHOLDER_REGEX.exec(rawText)) !== null) {
        const key = match[1].trim();
        if (!key || !bindingText || !(key in bindingText)) {
            unresolvedKeys.push(key || match[0]);
        }
    }

    if (unresolvedKeys.length > 0) {
        return { unresolvedKeys };
    }

    const spokenText = rawText.replace(NARRATION_PLACEHOLDER_REGEX, (_full, group: string) => {
        const key = group.trim();
        return bindingText?.[key] ?? '';
    });
    return { spokenText, unresolvedKeys: [] };
}

/**
 * Extracts raw audio bytes from a `SpeechResult`.
 */
function extractAudioBuffer(speechResult: SpeechResult): Buffer {
    if (Buffer.isBuffer(speechResult.data)) {
        return speechResult.data;
    }
    if (speechResult.data) {
        return Buffer.from(speechResult.data);
    }
    return Buffer.from(speechResult.content ?? '', 'base64');
}

/**
 * Computes clip duration using usage seconds > last alignment end > 128 kbps CBR byte estimate.
 */
function resolveClipDurationSeconds(
    speechResult: SpeechResult,
    wordTimings: NarrationWordTiming[],
    audioBuffer: Buffer,
): number {
    const usage = speechResult.usage;
    if (
        usage?.unitKind === 'Seconds' &&
        typeof usage.outputUnits === 'number' &&
        Number.isFinite(usage.outputUnits) &&
        usage.outputUnits > 0
    ) {
        return usage.outputUnits;
    }

    const charEnds = speechResult.Alignment?.EndSeconds;
    if (Array.isArray(charEnds) && charEnds.length > 0) {
        const lastCharEnd = charEnds[charEnds.length - 1];
        if (typeof lastCharEnd === 'number' && Number.isFinite(lastCharEnd) && lastCharEnd > 0) {
            return lastCharEnd;
        }
    }

    if (wordTimings.length > 0) {
        const lastWordEnd = wordTimings[wordTimings.length - 1].EndSeconds;
        if (Number.isFinite(lastWordEnd) && lastWordEnd > 0) {
            return lastWordEnd;
        }
    }

    // ponytail: estimate only, the ceiling is VBR or a driver that ignores output_format
    return (audioBuffer.byteLength * 8) / MP3_128_KBPS_BITS_PER_SECOND;
}

/**
 * Synthesizes a single narration line, uploads the audio clip, and populates timing metadata on `line`.
 */
async function synthesizeAndStoreLine(
    line: NarrationLine,
    spokenText: string,
    voiceId: string,
    modelId: string,
    runner: AITextToSpeechRunner,
    options: NarrationOptions,
    clips: NarrationClip[],
    issues: NarrationIssue[],
): Promise<void> {
    const runResult = await runner.RunTextToSpeech({
        text: spokenText,
        voice: voiceId,
        output_format: NARRATION_OUTPUT_FORMAT,
        IncludeTimestamps: true,
        ModelID: modelId,
        ContextUser: options.ContextUser,
        AgentID: options.AgentID,
        AgentRunID: options.AgentRunID,
        CancellationToken: options.CancellationToken,
    });

    if (!runResult.Success || !runResult.SpeechResult) {
        issues.push({
            Code: 'SynthesisFailed',
            Severity: 'Error',
            LineKey: line.Key,
            BeatKey: line.BeatKey,
            Message: runResult.ErrorMessage ?? `TTS synthesis failed for narration line "${line.Key}".`,
        });
        return;
    }

    const speechResult = runResult.SpeechResult;
    const audioBuffer = extractAudioBuffer(speechResult);
    const wordTimings: NarrationWordTiming[] = speechResult.Alignment
        ? DeriveWordTimings(speechResult.Alignment)
        : [];

    if (wordTimings.length === 0) {
        issues.push({
            Code: 'NoWordTimings',
            Severity: 'Warning',
            LineKey: line.Key,
            BeatKey: line.BeatKey,
            Message: `Narration line "${line.Key}" returned no word-level alignment timings; captions will use whole-line timing.`,
        });
    }

    const durationSeconds = resolveClipDurationSeconds(speechResult, wordTimings, audioBuffer);
    const fileId = await StoreFile({
        Content: audioBuffer,
        FileName: `narration-${line.Key}.mp3`,
        MimeType: 'audio/mpeg',
        Description: `AI-synthesized narration, AI Prompt Run ${runResult.PromptRunID ?? 'unknown'}`,
        ContextUser: options.ContextUser,
        StorageAccountID: options.StorageAccountID,
        Provider: options.Provider,
    });

    if (!fileId) {
        issues.push({
            Code: 'ClipNotStored',
            Severity: 'Warning',
            LineKey: line.Key,
            BeatKey: line.BeatKey,
            Message: `Narration clip for line "${line.Key}" could not be stored in MJ Storage; keeping bytes in memory.`,
        });
    }

    line.AudioFileID = fileId;
    line.DurationSeconds = durationSeconds;
    line.WordTimings = wordTimings.length > 0 ? wordTimings : undefined;

    clips.push({
        LineKey: line.Key,
        MimeType: 'audio/mpeg',
        Data: audioBuffer,
        FileID: fileId,
        PromptRunID: runResult.PromptRunID,
    });
}

/**
 * Resolves the TTS model ID from `options.ModelID` or `AIEngineBase` metadata for `provider`.
 */
async function resolvePinnedModelId(
    provider: string,
    options: NarrationOptions,
): Promise<string | undefined> {
    if (options.ModelID && options.ModelID.trim().length > 0) {
        return options.ModelID;
    }
    await AIEngineBase.Instance.Config(false, options.ContextUser, options.Provider);
    return ResolveNarrationModelID(provider);
}

/**
 * Runs the Video Studio narration pre-production pipeline (§8):
 * 1. Resolves a provider-pinned TTS model.
 * 2. Substitutes `{BindingKey}` placeholders per narration line.
 * 3. Synthesizes each line sequentially with timestamps and uploads clips via {@link StoreFile}.
 * 4. Re-fits storyboard beats, narration start times, shifted word timings, and audio cues.
 * 5. Builds and stores WebVTT captions when `Audio.Captions !== 'None'`.
 */
export async function RunNarrationPipeline(
    spec: VideoGenerationSpec,
    options: NarrationOptions,
): Promise<NarrationResult> {
    const specCopy = structuredClone(spec);
    const narration = specCopy.Audio?.Narration;
    if (!narration || !Array.isArray(narration.Script) || narration.Script.length === 0) {
        return {
            Spec: specCopy,
            Clips: [],
            Issues: [],
        };
    }

    const issues: NarrationIssue[] = [];
    const clips: NarrationClip[] = [];

    const modelId = await resolvePinnedModelId(narration.Provider, options);
    if (!modelId) {
        issues.push({
            Code: 'NarrationModelNotFound',
            Severity: 'Error',
            Message: `No active TTS model with an active inference vendor matching provider "${narration.Provider}" was found.`,
        });
        return {
            Spec: specCopy,
            Clips: clips,
            Issues: issues,
        };
    }

    const runner = new AITextToSpeechRunner();
    if (options.Provider) {
        runner.Provider = options.Provider;
    }

    // ponytail: one line at a time; run a small pool if narration time matters
    for (const line of narration.Script) {
        const { spokenText, unresolvedKeys } = resolveSpokenText(line.Text, options.BindingText);
        if (unresolvedKeys.length > 0 || spokenText === undefined) {
            issues.push({
                Code: 'UnresolvedPlaceholder',
                Severity: 'Error',
                LineKey: line.Key,
                BeatKey: line.BeatKey,
                Message: `Narration line "${line.Key}" has unresolved placeholder(s): ${unresolvedKeys.join(', ')}.`,
            });
            continue;
        }

        await synthesizeAndStoreLine(
            line,
            spokenText,
            narration.VoiceID,
            modelId,
            runner,
            options,
            clips,
            issues,
        );
    }

    const fitResult = FitTimelineToNarration({
        Beats: specCopy.Beats,
        Lines: narration.Script,
        Cues: specCopy.Audio.Cues,
        Pacing: specCopy.Style?.Pacing,
        FilmBounds: options.FilmBounds,
    });

    specCopy.Beats = fitResult.Beats;
    specCopy.Audio.Narration = {
        ...narration,
        Script: fitResult.Lines,
    };
    specCopy.Audio.Cues = fitResult.Cues;
    specCopy.Film.DurationSeconds = fitResult.DurationSeconds;
    issues.push(...fitResult.Issues);

    let captionsVtt: string | undefined;
    let captionsFileId: string | undefined;
    if (specCopy.Audio.Captions !== 'None') {
        captionsVtt = BuildWebVtt(fitResult.Lines);
        captionsFileId = await StoreFile({
            Content: Buffer.from(captionsVtt, 'utf8'),
            FileName: 'captions.vtt',
            MimeType: 'text/vtt',
            Description: 'AI-synthesized narration captions (WebVTT)',
            ContextUser: options.ContextUser,
            StorageAccountID: options.StorageAccountID,
            Provider: options.Provider,
        });
    }

    return {
        Spec: specCopy,
        Clips: clips,
        CaptionsVtt: captionsVtt,
        CaptionsFileID: captionsFileId,
        Issues: issues,
    };
}
