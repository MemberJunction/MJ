/**
 * @fileoverview Deterministic pre-call screen and prompt composer for illustrative asset
 * generation in Video Studio Pre-Production (`VS-GEN-6`, Plan §3.4, §13.3).
 *
 * Evaluates eight policy, integrity, footage-cap, spend-cap, and storage checks in strict
 * priority order before any image or video model is invoked.
 *
 * @module @memberjunction/video-studio
 */

import { ModelUsage } from '@memberjunction/ai';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIImageGenerationRunner, AIVideoRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import { UUIDsEqual } from '@memberjunction/global';
import type {
    VideoAssetGenerationRequest,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import type { VideoStudioSettings } from '../settings.js';
import type { ResolvedGenerationPolicy } from './generation-policy.js';

// ponytail: a keyword screen over-blocks, a blocked request costs a question and never a fake, and the critic's integrity criterion is the backstop.

/**
 * Reason codes returned by {@link ScreenGenerationRequest} when a generation request is blocked.
 */
export type GenerationBlockCode =
    | 'GenerationDisabled'
    | 'FillsFactRequirement'
    | 'NeverInventMatch'
    | 'PolicySubjectMatch'
    | 'SyntheticPersonDisallowed'
    | 'ExceedsGeneratedVideoSecondsCap'
    | 'SpendCapReached'
    | 'NoStorage';

/**
 * Ordered list of all 8 generation block codes evaluated by {@link ScreenGenerationRequest}.
 */
export const GENERATION_BLOCK_CODES: ReadonlyArray<GenerationBlockCode> = Object.freeze([
    'GenerationDisabled',
    'FillsFactRequirement',
    'NeverInventMatch',
    'PolicySubjectMatch',
    'SyntheticPersonDisallowed',
    'ExceedsGeneratedVideoSecondsCap',
    'SpendCapReached',
    'NoStorage',
]);

/**
 * Result of screening a single {@link VideoAssetGenerationRequest} before calling a generator.
 */
export interface GenerationScreenResult {
    Allowed: boolean;
    Code?: GenerationBlockCode;
    Reason?: string;
}

/**
 * Stop words dropped when matching `NeverInvent` and `AvoidSubjects` entries (`VS-GEN-6`).
 */
export const SCREEN_RULE_STOP_WORDS: ReadonlySet<string> = new Set<string>([
    'a',
    'an',
    'the',
    'of',
    'and',
    'or',
    'for',
    'our',
    'any',
    'all',
    'real',
    'actual',
    'in',
    'on',
    'to',
    'their',
    'live',
]);

/**
 * Person-depiction terms blocked when `policy.AllowSyntheticPeople` is `false` (`VS-GEN-6`, §3.4, D20).
 */
export const PERSON_TERMS: ReadonlyArray<string> = Object.freeze([
    'person',
    'people',
    'man',
    'men',
    'woman',
    'women',
    'child',
    'children',
    'kid',
    'boy',
    'girl',
    'crowd',
    'face',
    'portrait',
    'employee',
    'customer',
    'member',
    'volunteer',
    'speaker',
    'executive',
    'ceo',
    'doctor',
    'nurse',
    'patient',
    'student',
    'teacher',
    'family',
    'audience',
    'worker',
    'team',
    'human',
    'headshot',
    'presenter',
    'host',
    'founder',
    'client',
    'attendee',
]);

/**
 * Alias for {@link PERSON_TERMS}.
 */
export const SYNTHETIC_PERSON_TERMS: ReadonlyArray<string> = PERSON_TERMS;

function tokenizeWords(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 0);
}

/**
 * Whole-word comparison allowing a trailing `'s'` on either side (`VS-GEN-6`).
 */
function wordsMatchWithOptionalTrailingS(wordA: string, wordB: string): boolean {
    if (wordA === wordB) {
        return true;
    }
    if (`${wordA}s` === wordB || `${wordB}s` === wordA) {
        return true;
    }
    return false;
}

/**
 * Match rule (`VS-GEN-6`):
 * Lower-case both sides; drop the stopwords `a an the of and or for our any all real actual`;
 * an entry matches when any remaining word of 3 or more letters appears in the prompt as a
 * whole word, allowing a trailing `s` on either side.
 */
export function MatchesScreenEntry(promptText: string, rawEntry: string): boolean {
    const trimmed = (rawEntry ?? '').trim();
    if (!trimmed) {
        return false;
    }
    const entryWords = tokenizeWords(trimmed).filter(
        (word) => word.length >= 3 && !SCREEN_RULE_STOP_WORDS.has(word),
    );
    if (entryWords.length === 0) {
        return false;
    }
    const promptWords = tokenizeWords(promptText ?? '');
    if (promptWords.length === 0) {
        return false;
    }
    return entryWords.some((entryWord) =>
        promptWords.some((promptWord) => wordsMatchWithOptionalTrailingS(entryWord, promptWord)),
    );
}

/**
 * Sums the `DurationSeconds` of already-generated video assets in `spec.Assets.Approved`.
 */
export function SumAlreadyGeneratedVideoSeconds(spec: Partial<VideoGenerationSpec>): number {
    const approved = Array.isArray(spec.Assets?.Approved) ? spec.Assets.Approved : [];
    let total = 0;
    for (const asset of approved) {
        if (!asset || asset.Provenance !== 'Generated' || asset.Kind !== 'Video') {
            continue;
        }
        const legacyDuration = (asset as { DurationSeconds?: number }).DurationSeconds;
        const duration =
            typeof asset.Generation?.DurationSeconds === 'number'
                ? asset.Generation.DurationSeconds
                : legacyDuration;
        if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
            total += duration;
        }
    }
    return total;
}

/**
 * Default duration in seconds assumed for a generated video clip when
 * `request.DurationSeconds` is omitted (`VS-GEN-6`).
 */
export const DEFAULT_GENERATED_VIDEO_DURATION_SECONDS = 5;

/**
 * Synchronous pricing helper over already-loaded `AIEngine.Instance` metadata.
 * Resolves the carrier prompt (`AIVideoRunner.GENERATIVE_PROMPT_NAME` or
 * `AIImageGenerationRunner.DEFAULT_PROMPT_NAME`) and prices every Active/Preview bound
 * `PromptModel` via `AIEngineBase.Instance.CalculateModelCost`, returning the highest
 * candidate cost (`VS-GEN-6`).
 */
export function EstimateLoadedGenerationCallCost(
    kind: 'Image' | 'Video',
    durationSeconds: number,
): number {
    const promptName =
        kind === 'Video'
            ? AIVideoRunner.GENERATIVE_PROMPT_NAME
            : AIImageGenerationRunner.DEFAULT_PROMPT_NAME;

    const promptEntity = AIEngine.Instance.Prompts.find(
        (p) => (p.Name ?? '').trim().toLowerCase() === promptName.toLowerCase(),
    );
    if (!promptEntity) {
        throw new Error(
            `Carrier prompt "${promptName}" not found in AIEngine.Instance.Prompts for ${kind} generation; refusing to run with an unknown cost.`,
        );
    }

    const boundPromptModels = AIEngine.Instance.PromptModels.filter(
        (pm) =>
            UUIDsEqual(pm.PromptID, promptEntity.ID) &&
            (pm.Status === 'Active' || pm.Status === 'Preview'),
    );
    if (boundPromptModels.length === 0) {
        throw new Error(
            `Carrier prompt "${promptName}" has no Active or Preview PromptModels bound in MJ: AI Prompt Models; refusing to run with an unknown cost.`,
        );
    }

    const usage =
        kind === 'Video'
            ? ModelUsage.ForMedia('Seconds', 0, durationSeconds)
            : ModelUsage.ForMedia('Images', 0, 1);

    let highestCost = -1;
    for (const pm of boundPromptModels) {
        const modelId = pm.ModelID;
        const vendorId = pm.VendorID?.trim();
        if (!modelId || !vendorId) {
            throw new Error(
                `PromptModel "${pm.ID}" on carrier prompt "${promptName}" is missing ModelID or VendorID; refusing to run with an unknown cost.`,
            );
        }

        const priced = AIEngineBase.Instance.CalculateModelCost(modelId, vendorId, usage);
        if (!priced || !Number.isFinite(priced.cost) || priced.cost < 0) {
            throw new Error(
                `No active price row found for bound PromptModel candidate (ModelID="${modelId}", VendorID="${vendorId}") on carrier prompt "${promptName}"; refusing to run with an unknown cost.`,
            );
        }

        if (priced.cost > highestCost) {
            highestCost = priced.cost;
        }
    }

    return highestCost;
}

/**
 * Sums recorded `Generation.Cost` across all generated assets in `spec.Assets.Approved`.
 * When a `Provenance: 'Generated'` asset in `Approved` has no recorded `Generation.Cost`,
 * re-estimates its cost from its `Kind` and `DurationSeconds` via
 * {@link EstimateLoadedGenerationCallCost} without mutating `Generation.Cost` (`VS-GEN-6`).
 */
export function SumRecordedGenerationCost(spec: Partial<VideoGenerationSpec>): number {
    const approved = Array.isArray(spec.Assets?.Approved) ? spec.Assets.Approved : [];
    let total = 0;
    for (const asset of approved) {
        if (!asset) {
            continue;
        }
        const cost = asset.Generation?.Cost;
        if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
            total += cost;
            continue;
        }
        if (asset.Provenance === 'Generated' && (asset.Kind === 'Image' || asset.Kind === 'Video')) {
            const legacyDuration = (asset as { DurationSeconds?: number }).DurationSeconds;
            const rawDuration =
                typeof asset.Generation?.DurationSeconds === 'number'
                    ? asset.Generation.DurationSeconds
                    : legacyDuration;
            const durationSeconds =
                asset.Kind === 'Video'
                    ? typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0
                        ? rawDuration
                        : DEFAULT_GENERATED_VIDEO_DURATION_SECONDS
                    : 1;
            total += EstimateLoadedGenerationCallCost(asset.Kind, durationSeconds);
        }
    }
    const requests = Array.isArray(spec.Assets?.Generate) ? spec.Assets.Generate : [];
    for (const request of requests) {
        if (!request) {
            continue;
        }
        const cost = request.Cost;
        if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
            total += cost;
        }
    }
    return total;
}

/**
 * Resolves the effective duration in seconds for a video generation request,
 * defaulting to {@link DEFAULT_GENERATED_VIDEO_DURATION_SECONDS} (`5`) when
 * `DurationSeconds` is omitted or non-positive (`VS-GEN-6`).
 */
export function ResolveRequestedVideoSeconds(
    request: Pick<VideoAssetGenerationRequest, 'DurationSeconds'>,
): number {
    return typeof request.DurationSeconds === 'number' &&
        Number.isFinite(request.DurationSeconds) &&
        request.DurationSeconds > 0
        ? request.DurationSeconds
        : DEFAULT_GENERATED_VIDEO_DURATION_SECONDS;
}

function sumPriorPassVideoSeconds(
    request: VideoAssetGenerationRequest,
    spec: Partial<VideoGenerationSpec>,
): number {
    const requests = Array.isArray(spec.Assets?.Generate) ? spec.Assets.Generate : [];
    let total = 0;
    for (const candidate of requests) {
        if (!candidate) {
            continue;
        }
        if (candidate === request || candidate.Key === request.Key) {
            break;
        }
        if (candidate.Status === 'Generated' || candidate.Status === 'Blocked') {
            continue;
        }
        if (candidate.Kind === 'Video') {
            total += ResolveRequestedVideoSeconds(candidate);
        }
    }
    return total;
}

/**
 * Screens an illustrative asset generation request against brand policy, `Assets.Required`,
 * `Assets.NeverInvent`, synthetic-person guardrails, the generated-video footage cap,
 * per-run generation spend cap, and storage availability (`VS-GEN-6`).
 *
 * Evaluates the eight checks in strict priority order and stops at the first failure.
 */
export function ScreenGenerationRequest(
    request: VideoAssetGenerationRequest,
    spec: Partial<VideoGenerationSpec>,
    policy: Partial<ResolvedGenerationPolicy> &
        Pick<
            ResolvedGenerationPolicy,
            'AllowGeneratedImages' | 'AllowGeneratedVideo' | 'AllowSyntheticPeople' | 'AvoidSubjects'
        >,
    settings: Pick<VideoStudioSettings, 'MaxGeneratedVideoSeconds'>,
    spendSoFar: number = SumRecordedGenerationCost(spec),
    hasStorage: boolean = true,
    priorPassVideoSeconds?: number,
): GenerationScreenResult {
    // 1. GenerationDisabled
    if (request.Kind === 'Image' && !policy.AllowGeneratedImages) {
        return {
            Allowed: false,
            Code: 'GenerationDisabled',
            Reason: `Image generation is disabled by the brand kit GenerationPolicy (AllowGeneratedImages=false) for request "${request.Key}".`,
        };
    }
    if (request.Kind === 'Video' && !policy.AllowGeneratedVideo) {
        return {
            Allowed: false,
            Code: 'GenerationDisabled',
            Reason: `Video generation is disabled by the brand kit GenerationPolicy (AllowGeneratedVideo=false) for request "${request.Key}".`,
        };
    }

    // 2. FillsFactRequirement
    const requestKey = (request.Key ?? '').trim();
    const requiredAssets = Array.isArray(spec.Assets?.Required) ? spec.Assets.Required : [];
    for (const req of requiredAssets) {
        if (!req) {
            continue;
        }
        const matchesKey = (req.Key ?? '').trim() === requestKey;
        const matchesSatisfiedBy =
            typeof req.SatisfiedByAssetKey === 'string' &&
            req.SatisfiedByAssetKey.trim() === requestKey;
        if ((matchesKey || matchesSatisfiedBy) && req.AllowGenerated !== true) {
            return {
                Allowed: false,
                Code: 'FillsFactRequirement',
                Reason: `Generation request "${request.Key}" targets required asset "${req.Key}" whose AllowGenerated is not true.`,
            };
        }
    }

    const promptText = request.Prompt ?? '';
    const promptWords = tokenizeWords(promptText);

    // 3. NeverInventMatch
    const neverInventList = [
        ...(Array.isArray(policy.NeverInvent) ? policy.NeverInvent : []),
        ...(Array.isArray(spec.Assets?.NeverInvent) ? spec.Assets.NeverInvent : []),
    ];
    for (const rule of neverInventList) {
        if (typeof rule === 'string' && MatchesScreenEntry(promptText, rule)) {
            return {
                Allowed: false,
                Code: 'NeverInventMatch',
                Reason: `Generation request "${request.Key}" matches NeverInvent guardrail "${rule}".`,
            };
        }
    }

    // 4. PolicySubjectMatch
    const avoidSubjects = Array.isArray(policy.AvoidSubjects) ? policy.AvoidSubjects : [];
    for (const subject of avoidSubjects) {
        if (typeof subject === 'string' && MatchesScreenEntry(promptText, subject)) {
            return {
                Allowed: false,
                Code: 'PolicySubjectMatch',
                Reason: `Generation request "${request.Key}" matches brand policy AvoidSubjects entry "${subject}".`,
            };
        }
    }

    // 5. SyntheticPersonDisallowed
    if (!policy.AllowSyntheticPeople) {
        const matchedPersonTerm = PERSON_TERMS.find((personTerm) =>
            promptWords.some((promptWord) => wordsMatchWithOptionalTrailingS(personTerm, promptWord)),
        );
        if (matchedPersonTerm) {
            return {
                Allowed: false,
                Code: 'SyntheticPersonDisallowed',
                Reason: `Generation request "${request.Key}" mentions synthetic person term "${matchedPersonTerm}" while AllowSyntheticPeople is false.`,
            };
        }
    }

    // 6. ExceedsGeneratedVideoSecondsCap
    if (request.Kind === 'Video') {
        const alreadyGeneratedSeconds = SumAlreadyGeneratedVideoSeconds(spec);
        const batchPriorSeconds =
            typeof priorPassVideoSeconds === 'number'
                ? priorPassVideoSeconds
                : sumPriorPassVideoSeconds(request, spec);
        const requestedSeconds = ResolveRequestedVideoSeconds(request);
        const projectedSeconds = alreadyGeneratedSeconds + batchPriorSeconds + requestedSeconds;
        if (projectedSeconds > settings.MaxGeneratedVideoSeconds) {
            return {
                Allowed: false,
                Code: 'ExceedsGeneratedVideoSecondsCap',
                Reason: `Generation request "${request.Key}" (${requestedSeconds}s) plus ${alreadyGeneratedSeconds + batchPriorSeconds}s generated/queued (${projectedSeconds}s total) exceeds MaxGeneratedVideoSeconds (${settings.MaxGeneratedVideoSeconds}s).`,
            };
        }
    }

    // 7. SpendCapReached
    if (
        typeof policy.MaxGenerationCostPerRun === 'number' &&
        Number.isFinite(policy.MaxGenerationCostPerRun) &&
        spendSoFar >= policy.MaxGenerationCostPerRun
    ) {
        return {
            Allowed: false,
            Code: 'SpendCapReached',
            Reason: `Generation spend so far ($${spendSoFar.toFixed(2)}) has reached or exceeded MaxGenerationCostPerRun ($${policy.MaxGenerationCostPerRun.toFixed(2)}).`,
        };
    }

    // 8. NoStorage
    if (!hasStorage) {
        return {
            Allowed: false,
            Code: 'NoStorage',
            Reason: `Cannot generate asset "${request.Key}": no storage account is configured for Pre-Production.`,
        };
    }

    return { Allowed: true };
}

/**
 * Composes the final prompt string sent to `AIImageGenerationRunner` or `AIVideoRunner` (`VS-GEN-6`):
 * `request.Prompt` plus `" Style: " + policy.StylePrompt` when `policy.StylePrompt` is set.
 * The exact text returned is stored in `Generation.Prompt`.
 */
export function ComposeGenerationPrompt(
    request: Pick<VideoAssetGenerationRequest, 'Kind' | 'Prompt'>,
    policy: Pick<ResolvedGenerationPolicy, 'StylePrompt'>,
): string {
    const basePrompt = request.Prompt ?? '';
    const stylePrompt = (policy.StylePrompt ?? '').trim();
    if (stylePrompt.length > 0) {
        return `${basePrompt} Style: ${stylePrompt}`;
    }
    return basePrompt;
}
