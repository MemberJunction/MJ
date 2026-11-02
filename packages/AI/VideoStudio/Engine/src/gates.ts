/**
 * @fileoverview Pure deterministic gate evaluator, status derivation, stage prerequisite checks,
 * stale-evidence clearing, and approval helpers for `VideoStudioAgent` (Plan §3.2, §6.2, VS-AGT-2).
 *
 * Free of database and filesystem I/O so it can be unit-tested in isolation and called
 * deterministically at every step of the `VideoStudioAgent` loop.
 *
 * @module @memberjunction/video-studio
 */

import { ConversationUtility, type FormResponseContent, GetValueFromPath } from '@memberjunction/ai-core-plus';
import { RubricEngineBase } from '@memberjunction/rubrics-base';
import {
    ValidateVideoGenerationSpec,
    VIDEO_STUDIO_SPEC_VERSION,
    type GateRecord,
    type RubricCriterionScore,
    type VideoAsset,
    type VideoAssetGenerationRequest,
    type VideoFormat,
    type VideoGateId,
    type VideoGenerationSpec,
    type VideoProductionStatus,
} from '@memberjunction/video-studio-core';
import { ResolveDeliverableFormats } from './render/bundle.js';
import type { VideoStudioSettings } from './settings.js';

/**
 * Context passed to `EvaluateGates`.
 */
export interface GateEvaluationContext {
    Settings: VideoStudioSettings;
    Now?: string;
    BrandKitInScope?: boolean;
    EffectiveInteractionMode?: VideoGenerationSpec['Interaction']['Mode'];
    InitialRoundCount?: number;
}

const CANONICAL_STAGE_SUFFIXES = [
    'Director',
    'Art Director',
    'Storyboard',
    'Pre-Production',
    'Motion Engineer',
    'Render',
    'Critic',
] as const;

function normalizeStageName(stageName: string): string {
    const stripped = (stageName ?? '')
        .trim()
        .replace(/^video\s+studio\s*-\s*/i, '')
        .trim();
    const lower = stripped.toLowerCase();
    for (const canonical of CANONICAL_STAGE_SUFFIXES) {
        if (lower === canonical.toLowerCase()) {
            return canonical;
        }
    }
    return stripped;
}

function findExistingGate(
    gates: ReadonlyArray<GateRecord> | undefined,
    gateId: VideoGateId,
): GateRecord | undefined {
    if (!Array.isArray(gates)) {
        return undefined;
    }
    return gates.find((g) => g && g.Gate === gateId);
}

function evaluateGateG1(
    spec: Partial<VideoGenerationSpec>,
    ctx: GateEvaluationContext,
    now: string,
): GateRecord {
    const failedBriefReasons: string[] = [];
    const blockedReasons: string[] = [];

    if (!spec.Film?.OneSentence?.trim()) {
        failedBriefReasons.push('Film.OneSentence is missing');
    }
    if (!spec.Film?.Audience?.trim()) {
        failedBriefReasons.push('Film.Audience is missing');
    }
    if (
        typeof spec.Film?.DurationSeconds !== 'number' ||
        !Number.isFinite(spec.Film.DurationSeconds) ||
        spec.Film.DurationSeconds <= 0
    ) {
        failedBriefReasons.push('Film.DurationSeconds must be > 0');
    }
    const formats = ResolveDeliverableFormats(spec, []);
    if (formats.length === 0) {
        failedBriefReasons.push('Film.Formats / Deliverables.Formats must be non-empty');
    }

    if (ctx.BrandKitInScope === false) {
        blockedReasons.push('BrandKitID is not in scope for the production CompanyID');
    }

    const effectiveMode = ctx.EffectiveInteractionMode ?? spec.Interaction?.Mode ?? 'Autonomous';

    // Run pure validator at Briefing to check MustUse requirements
    const specForBriefing: VideoGenerationSpec = {
        SpecVersion: VIDEO_STUDIO_SPEC_VERSION,
        Status: 'Briefing',
        Archetype: spec.Archetype ?? { Name: 'Topic Explainer' },
        Film: {
            OneSentence: spec.Film?.OneSentence ?? 'placeholder',
            Audience: spec.Film?.Audience ?? 'placeholder',
            Purpose: spec.Film?.Purpose ?? 'placeholder',
            DurationSeconds: spec.Film?.DurationSeconds && spec.Film.DurationSeconds > 0 ? spec.Film.DurationSeconds : 10,
            Formats: formats.length > 0 ? formats : ['16:9'],
        },
        Assets: {
            Approved: spec.Assets?.Approved ?? [],
            Required: spec.Assets?.Required ?? [],
            Generate: spec.Assets?.Generate,
            NeverInvent: spec.Assets?.NeverInvent ?? [],
        },
        Style: spec.Style ?? {
            Palette: [],
            Typography: [],
            Composition: '',
            Pacing: { AvgSecondsBetweenChanges: 5, HoldRules: '' },
            MotionRules: [],
            Keep: [],
            Avoid: [],
            References: [],
        },
        Beats: spec.Beats ?? [],
        DataBindings: spec.DataBindings ?? [],
        Audio: spec.Audio ?? { Cues: [], Captions: 'None' },
        Render: {
            Renderer: 'HyperFrames',
            RendererVersion: spec.Render?.RendererVersion?.trim() || '0.0.0',
            Fps: spec.Render?.Fps && spec.Render.Fps > 0 ? spec.Render.Fps : ctx.Settings.Fps,
            Seed: spec.Render?.Seed ?? 1,
            Quality: spec.Render?.Quality ?? ctx.Settings.RenderQuality,
        },
        Interaction: {
            Mode: effectiveMode,
            MaxRepairRounds: ctx.Settings.MaxRepairRounds,
        },
        Deliverables: {
            Formats: formats.length > 0 ? formats : ['16:9'],
            Poster: spec.Deliverables?.Poster ?? true,
            ContactSheets: spec.Deliverables?.ContactSheets ?? true,
            Source: spec.Deliverables?.Source ?? true,
            Captions: spec.Deliverables?.Captions ?? true,
        },
        Review: { Gates: [], Rounds: [] },
    };

    const briefingValidation = ValidateVideoGenerationSpec(specForBriefing, 'Briefing', {
        MaxGeneratedVideoSeconds: ctx.Settings.MaxGeneratedVideoSeconds,
    });
    for (const err of briefingValidation.Errors) {
        if (err.Code === 'UnmetMustUseRequirement' || err.Code === 'GeneratedAssetNotAllowedForRequirement') {
            blockedReasons.push(`${err.Code} (${err.Path}): ${err.Message}`);
        }
    }

    // Check each DataBinding's shape and Inline presence
    const bindings = Array.isArray(spec.DataBindings) ? spec.DataBindings : [];
    for (let i = 0; i < bindings.length; i++) {
        const b = bindings[i];
        if (!b || !b.Key?.trim()) {
            blockedReasons.push(`DataBindings[${i}].Key is missing`);
            continue;
        }
        const kind = b.Source?.Kind;
        if (kind === 'Query') {
            if (!b.Source?.QueryID?.trim()) {
                blockedReasons.push(`DataBindings[${i}] ("${b.Key}") has Source.Kind="Query" without Source.QueryID`);
            }
        } else if (kind === 'View') {
            const hasEntity = Boolean(b.Source?.EntityName?.trim());
            const hasFields =
                Array.isArray(b.Source?.Fields) &&
                b.Source.Fields.length > 0 &&
                b.Source.Fields.every((f) => typeof f === 'string' && f.trim().length > 0);
            if (!hasEntity || !hasFields) {
                blockedReasons.push(
                    `DataBindings[${i}] ("${b.Key}") has Source.Kind="View" without non-empty Source.EntityName and Source.Fields`,
                );
            }
        } else if (kind === 'Artifact') {
            if (!b.Source?.ArtifactVersionID?.trim()) {
                blockedReasons.push(
                    `DataBindings[${i}] ("${b.Key}") has Source.Kind="Artifact" without Source.ArtifactVersionID`,
                );
            }
        } else if (kind === 'Inline') {
            const inlineObj = spec.DataSnapshot?.Inline;
            const hasDirectKey =
                inlineObj !== undefined &&
                inlineObj !== null &&
                Object.prototype.hasOwnProperty.call(inlineObj, b.Key) &&
                inlineObj[b.Key] !== undefined;
            const hasPathKey =
                inlineObj !== undefined &&
                inlineObj !== null &&
                GetValueFromPath(inlineObj as Record<string, unknown>, b.Key) !== undefined;
            if (!hasDirectKey && !hasPathKey) {
                blockedReasons.push(
                    `DataBindings[${i}] ("${b.Key}") has Source.Kind="Inline" but "${b.Key}" is missing from DataSnapshot.Inline`,
                );
            }
        } else {
            blockedReasons.push(`DataBindings[${i}] ("${b.Key}") has invalid Source.Kind "${String(kind)}"`);
        }
    }

    if (blockedReasons.length > 0) {
        return {
            Gate: 'G1',
            Status: 'Blocked',
            EvidenceRefs: [],
            Timestamp: now,
            Notes: blockedReasons.join('; '),
        };
    }

    if (failedBriefReasons.length > 0) {
        return {
            Gate: 'G1',
            Status: 'Failed',
            EvidenceRefs: [],
            Timestamp: now,
            Notes: failedBriefReasons.join('; '),
        };
    }

    return {
        Gate: 'G1',
        Status: 'Passed',
        EvidenceRefs: ['brief-verified'],
        Timestamp: now,
    };
}

function evaluateGateG2(
    spec: Partial<VideoGenerationSpec>,
    ctx: GateEvaluationContext,
    existingG2: GateRecord | undefined,
    now: string,
): GateRecord {
    const formats = ResolveDeliverableFormats(spec, []);
    const normalizedRender =
        spec.Render && spec.Render.Renderer === 'HyperFrames' && spec.Render.RendererVersion === ''
            ? { ...spec.Render, RendererVersion: '0.0.0' }
            : spec.Render;
    const normalizedDeliverables =
        spec.Deliverables?.Formats?.length
            ? spec.Deliverables
            : formats.length > 0
              ? {
                    Formats: formats,
                    Poster: spec.Deliverables?.Poster ?? true,
                    ContactSheets: spec.Deliverables?.ContactSheets ?? true,
                    Source: spec.Deliverables?.Source ?? true,
                    Captions: spec.Deliverables?.Captions ?? true,
                }
              : spec.Deliverables;

    const effectiveMode = ctx.EffectiveInteractionMode ?? spec.Interaction?.Mode ?? 'Autonomous';
    const normalizedInteraction = {
        Mode: effectiveMode,
        MaxRepairRounds: ctx.Settings.MaxRepairRounds,
    };

    const candidateSpec = {
        ...spec,
        Status: 'Storyboarded',
        Interaction: normalizedInteraction,
        ...(normalizedRender ? { Render: normalizedRender } : {}),
        ...(normalizedDeliverables ? { Deliverables: normalizedDeliverables } : {}),
    } as VideoGenerationSpec;

    const storyboardValidation = ValidateVideoGenerationSpec(candidateSpec, 'Storyboarded', {
        MaxGeneratedVideoSeconds: ctx.Settings.MaxGeneratedVideoSeconds,
    });

    if (storyboardValidation.Errors.length > 0) {
        return {
            Gate: 'G2',
            Status: 'Failed',
            EvidenceRefs: [],
            Timestamp: now,
            Notes: storyboardValidation.Errors.map((e) => `${e.Code} (${e.Path}): ${e.Message}`).join('; '),
        };
    }

    const isApproved = effectiveMode === 'Autonomous' || existingG2?.Notes === 'Approved';
    if (isApproved) {
        return {
            Gate: 'G2',
            Status: 'Passed',
            EvidenceRefs: existingG2?.EvidenceRefs?.length ? [...existingG2.EvidenceRefs] : ['storyboard-validated'],
            Timestamp: existingG2?.Timestamp || now,
            ...(existingG2?.Notes === 'Approved' ? { Notes: 'Approved' } : {}),
        };
    }

    return {
        Gate: 'G2',
        Status: 'Pending',
        EvidenceRefs: [],
        Timestamp: now,
        Notes: 'AwaitingApproval',
    };
}

function evaluateGateG3(
    spec: Partial<VideoGenerationSpec>,
    existingG3: GateRecord | undefined,
    now: string,
): GateRecord {
    const formats = ResolveDeliverableFormats(spec, []);
    const hasContactSheetsForAllFormats =
        formats.length > 0 &&
        formats.every((fmt) => {
            const ids = spec.Output?.ContactSheetFileIDs?.[fmt];
            return Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === 'string' && id.trim().length > 0);
        });

    if (hasContactSheetsForAllFormats && existingG3) {
        return {
            Gate: 'G3',
            Status: existingG3.Status,
            EvidenceRefs: [...(existingG3.EvidenceRefs ?? [])],
            Timestamp: existingG3.Timestamp || now,
            ...(existingG3.Notes !== undefined ? { Notes: existingG3.Notes } : {}),
        };
    }

    return {
        Gate: 'G3',
        Status: 'Pending',
        EvidenceRefs: [],
        Timestamp: now,
        Notes: 'Contact sheets not yet rendered for all deliverable formats.',
    };
}

function hasRenderedVideosForAllFormats(spec: Partial<VideoGenerationSpec>, formats: readonly VideoFormat[]): boolean {
    return (
        formats.length > 0 &&
        formats.every((fmt) => {
            const video = spec.Output?.Videos?.[fmt];
            return Boolean(video && (video.FileID?.trim() || video.InlineBase64?.trim()));
        })
    );
}

function hasCriticRoundOnOrAfterRender(spec: Partial<VideoGenerationSpec>): boolean {
    const renderedAt = spec.Output?.RenderMetadata?.RenderedAt;
    const renderedAtMs = typeof renderedAt === 'string' && renderedAt.trim() ? Date.parse(renderedAt) : NaN;
    if (!Number.isFinite(renderedAtMs)) {
        return false;
    }
    const rounds = Array.isArray(spec.Review?.Rounds) ? spec.Review.Rounds : [];
    return rounds.some((r) => {
        const roundMs = typeof r?.Timestamp === 'string' && r.Timestamp.trim() ? Date.parse(r.Timestamp) : NaN;
        return Number.isFinite(roundMs) && roundMs >= renderedAtMs;
    });
}

function evaluateGateG4(
    spec: Partial<VideoGenerationSpec>,
    ctx: GateEvaluationContext,
    existingG4: GateRecord | undefined,
    now: string,
): GateRecord {
    const formats = ResolveDeliverableFormats(spec, []);
    const hasVideos = hasRenderedVideosForAllFormats(spec, formats);
    const hasCurrentRound = hasCriticRoundOnOrAfterRender(spec);

    if (!hasVideos || !hasCurrentRound) {
        const missing: string[] = [];
        if (!hasVideos) {
            missing.push('Output.Videos missing for one or more deliverable formats');
        }
        if (!hasCurrentRound) {
            missing.push('no Review.Rounds entry with Timestamp >= Output.RenderMetadata.RenderedAt');
        }
        return {
            Gate: 'G4',
            Status: 'Failed',
            EvidenceRefs: [],
            Timestamp: now,
            Notes: missing.join('; '),
        };
    }

    const effectiveMode = ctx.EffectiveInteractionMode ?? spec.Interaction?.Mode ?? 'Autonomous';
    if (effectiveMode === 'ApproveStoryboardAndRoughCut' && existingG4?.Notes !== 'Approved') {
        return {
            Gate: 'G4',
            Status: 'Pending',
            EvidenceRefs: [],
            Timestamp: now,
            Notes: 'AwaitingApproval',
        };
    }

    return {
        Gate: 'G4',
        Status: 'Passed',
        EvidenceRefs: existingG4?.EvidenceRefs?.length
            ? [...existingG4.EvidenceRefs]
            : formats.map((f) => spec.Output?.Videos?.[f]?.FileID ?? f),
        Timestamp: existingG4?.Timestamp || now,
        ...(existingG4?.Notes === 'Approved' ? { Notes: 'Approved' } : {}),
    };
}

/**
 * Rubric criterion key for generated-asset honesty and disclosure (`D20`).
 * Open defects on this criterion never defer at repair-budget exhaustion.
 */
export const GENERATED_ASSET_INTEGRITY_CRITERION_KEY =
    'generated-assets-are-honest-and-disclosed' as const;

function getCurrentRunRoundCount(
    spec: Partial<VideoGenerationSpec>,
    initialRoundCount = 0,
): number {
    const rounds = Array.isArray(spec.Review?.Rounds) ? spec.Review.Rounds : [];
    const offset = Math.max(0, Math.min(initialRoundCount, rounds.length));
    return rounds.length - offset;
}

function findFailedGateCriteria(spec: Partial<VideoGenerationSpec>): RubricCriterionScore[] {
    const criteria = spec.Review?.Scores?.Criteria;
    if (!Array.isArray(criteria) || criteria.length === 0) {
        return [];
    }
    const gateKeys = new Set<string>([GENERATED_ASSET_INTEGRITY_CRITERION_KEY]);
    const rubricId = spec.Review?.Scores?.RubricID;
    if (rubricId) {
        const published = RubricEngineBase.Instance.GetLatestPublishedVersion(rubricId);
        if (published && Array.isArray(published.nodes)) {
            for (const node of published.nodes) {
                if (node?.nodeType === 'Criterion' && node.isGate && node.key) {
                    gateKeys.add(node.key.trim().toLowerCase());
                }
            }
        }
    }
    return criteria.filter(
        (c): c is RubricCriterionScore =>
            Boolean(c) &&
            c.Passed === false &&
            typeof c.Criterion === 'string' &&
            gateKeys.has(c.Criterion.trim().toLowerCase()),
    );
}

/**
 * Checks whether a post-render Critic round produced a terminal G5 failure — either an open
 * `generated-assets-are-honest-and-disclosed` defect at the repair cap, or a rubric gate
 * criterion (`IsGate = true` / `generated-assets-are-honest-and-disclosed`) scored below its
 * gate minimum when no repairable blocking defects remain or the repair budget is reached.
 *
 * Returns `null` when there is no Critic round on or after `Output.RenderMetadata.RenderedAt`
 * (so a stale pre-render Critic round never triggers a terminal failure), or when G5 is
 * passing / still has repair rounds available.
 */
export function FindIntegrityOrGateCriterionFailure(
    spec: Partial<VideoGenerationSpec>,
    ctx: GateEvaluationContext,
): string | null {
    if (!hasCriticRoundOnOrAfterRender(spec)) {
        return null;
    }

    const rounds = spec.Review?.Rounds ?? [];
    const newestRound = rounds[rounds.length - 1];
    const openIntegrityDefects = (newestRound?.Defects ?? []).filter(
        (d) =>
            d &&
            d.Status === 'Open' &&
            d.Criterion === GENERATED_ASSET_INTEGRITY_CRITERION_KEY,
    );
    const openBlockingDefects = (newestRound?.Defects ?? []).filter(
        (d) =>
            d &&
            d.Status === 'Open' &&
            (d.Severity === 'Blocker' ||
                d.Severity === 'Major' ||
                d.Criterion === GENERATED_ASSET_INTEGRITY_CRITERION_KEY),
    );
    const failedGateCriteria = findFailedGateCriteria(spec);
    const currentRunRounds = getCurrentRunRoundCount(spec, ctx.InitialRoundCount);
    const repairBudgetReached =
        currentRunRounds > 0 && currentRunRounds - 1 >= ctx.Settings.MaxRepairRounds;

    if (openIntegrityDefects.length > 0 && repairBudgetReached) {
        const firstIntegrity = openIntegrityDefects[0];
        const key = firstIntegrity?.AssetKey || firstIntegrity?.Beat || 'unknown';
        return `Generated asset ${key} failed the integrity check: ${firstIntegrity?.Evidence ?? ''}`;
    }

    if ((openBlockingDefects.length === 0 || repairBudgetReached) && failedGateCriteria.length > 0) {
        const failedIntegrity = failedGateCriteria.find(
            (c) => c.Criterion.trim().toLowerCase() === GENERATED_ASSET_INTEGRITY_CRITERION_KEY,
        );
        if (failedIntegrity) {
            return `Generated-asset integrity criterion failed: ${failedIntegrity.Notes || 'criterion scored below gate threshold'}`;
        }
        const firstFailedGate = failedGateCriteria[0];
        return `Gate criterion "${firstFailedGate.Criterion}" failed (${firstFailedGate.Notes || `score ${firstFailedGate.Score}/${firstFailedGate.MaxScore}`}).`;
    }

    return null;
}

function evaluateGateG5(
    spec: Partial<VideoGenerationSpec>,
    ctx: GateEvaluationContext,
    now: string,
): GateRecord {
    if (!hasCriticRoundOnOrAfterRender(spec)) {
        return {
            Gate: 'G5',
            Status: 'Failed',
            EvidenceRefs: [],
            Timestamp: now,
            Notes: 'No Review.Rounds entry with Timestamp >= Output.RenderMetadata.RenderedAt.',
        };
    }

    const terminalFailure = FindIntegrityOrGateCriterionFailure(spec, ctx);
    if (terminalFailure) {
        return {
            Gate: 'G5',
            Status: 'Failed',
            EvidenceRefs: [],
            Timestamp: now,
            Notes: terminalFailure,
        };
    }

    const rounds = spec.Review?.Rounds ?? [];
    const newestRound = rounds[rounds.length - 1];
    const openIntegrityDefects = (newestRound?.Defects ?? []).filter(
        (d) =>
            d &&
            d.Status === 'Open' &&
            d.Criterion === GENERATED_ASSET_INTEGRITY_CRITERION_KEY,
    );
    const openBlockingDefects = (newestRound?.Defects ?? []).filter(
        (d) =>
            d &&
            d.Status === 'Open' &&
            (d.Severity === 'Blocker' ||
                d.Severity === 'Major' ||
                d.Criterion === GENERATED_ASSET_INTEGRITY_CRITERION_KEY),
    );
    const currentRunRounds = getCurrentRunRoundCount(spec, ctx.InitialRoundCount);
    const repairBudgetReached =
        currentRunRounds > 0 && currentRunRounds - 1 >= ctx.Settings.MaxRepairRounds;

    if (openBlockingDefects.length === 0 || (repairBudgetReached && openIntegrityDefects.length === 0)) {
        return {
            Gate: 'G5',
            Status: 'Passed',
            EvidenceRefs: [`round-${newestRound?.Round ?? rounds.length}`],
            Timestamp: now,
            ...(openBlockingDefects.length > 0
                ? {
                      Notes: `Repair budget reached (${currentRunRounds - 1}/${ctx.Settings.MaxRepairRounds}); ${openBlockingDefects.length} open Major/Blocker defect(s) deferred to HumanReviewNotes.`,
                  }
                : {}),
        };
    }

    return {
        Gate: 'G5',
        Status: 'Failed',
        EvidenceRefs: [],
        Timestamp: now,
        Notes: `Critic round ${newestRound?.Round ?? rounds.length} has ${openBlockingDefects.length} open Major/Blocker defect(s).`,
    };
}

function evaluateGateG6(
    spec: Partial<VideoGenerationSpec>,
    now: string,
): GateRecord {
    const formats = ResolveDeliverableFormats(spec, []);
    const missing: string[] = [];

    if (!hasRenderedVideosForAllFormats(spec, formats)) {
        missing.push('Output.Videos missing for one or more deliverable formats');
    }
    if (spec.Deliverables?.Poster && !spec.Output?.PosterFileID?.trim()) {
        missing.push('Output.PosterFileID is required when Deliverables.Poster is true');
    }
    const narrationEnabled = spec.Audio?.Narration?.Enabled !== false;
    const scriptLines =
        narrationEnabled && Array.isArray(spec.Audio?.Narration?.Script)
            ? spec.Audio.Narration.Script
            : [];
    if (spec.Audio?.Captions === 'Sidecar' && scriptLines.length > 0 && !spec.Output?.CaptionsFileID?.trim()) {
        missing.push('Output.CaptionsFileID is required when Audio.Captions is "Sidecar" with narration');
    }
    if (narrationEnabled && scriptLines.some((line) => !line?.AudioFileID?.trim())) {
        missing.push('One or more Audio.Narration.Script lines are missing AudioFileID');
    }
    if (!spec.Output?.RenderMetadata || !spec.Output.RenderMetadata.RenderedAt?.trim()) {
        missing.push('Output.RenderMetadata is missing');
    }

    if (missing.length > 0) {
        return {
            Gate: 'G6',
            Status: 'Failed',
            EvidenceRefs: [],
            Timestamp: now,
            Notes: missing.join('; '),
        };
    }

    return {
        Gate: 'G6',
        Status: 'Passed',
        EvidenceRefs: formats.map((f) => spec.Output?.Videos?.[f]?.FileID ?? f),
        Timestamp: now,
    };
}

/**
 * Deterministically evaluates all six production gates (`G1`–`G6`) from the current spec evidence.
 *
 * Reads from `spec.Review?.Gates` ONLY the `G2`/`G4` approval notes (`Notes === 'Approved'`)
 * and `Render`'s `G3` record; every other gate record is recomputed from scratch.
 */
export function EvaluateGates(
    spec: Partial<VideoGenerationSpec>,
    ctx: GateEvaluationContext,
): GateRecord[] {
    const safeSpec = spec ?? {};
    const now = ctx.Now ?? new Date().toISOString();
    const existingGates = safeSpec.Review?.Gates;

    const existingG2 = findExistingGate(existingGates, 'G2');
    const existingG3 = findExistingGate(existingGates, 'G3');
    const existingG4 = findExistingGate(existingGates, 'G4');

    const g1 = evaluateGateG1(safeSpec, ctx, now);
    const g2 = evaluateGateG2(safeSpec, ctx, existingG2, now);
    const g3 = evaluateGateG3(safeSpec, existingG3, now);
    const g4 = evaluateGateG4(safeSpec, ctx, existingG4, now);
    const g5 = evaluateGateG5(safeSpec, ctx, now);
    const g6 = evaluateGateG6(safeSpec, now);

    return [g1, g2, g3, g4, g5, g6];
}

/**
 * Derives the current `VideoProductionStatus` from `spec` and evaluated `gates`.
 *
 * Returns `'Blocked'` when `G1` is `'Blocked'`; otherwise returns the furthest reached stage in
 * `Briefing -> Styled -> Storyboarded -> Approved -> PreProduced -> Composed -> RoughCut -> Reviewed`.
 * Never returns `'Delivered'` (only `validateSuccessNextStep` sets `'Delivered'`).
 */
export function DeriveStatus(
    spec: Partial<VideoGenerationSpec>,
    gates: ReadonlyArray<GateRecord>,
): VideoProductionStatus {
    const safeSpec = spec ?? {};
    const g1 = findExistingGate(gates, 'G1');
    if (g1?.Status === 'Blocked') {
        return 'Blocked';
    }

    const generateRequests = Array.isArray(safeSpec.Assets?.Generate) ? safeSpec.Assets.Generate : [];
    if (generateRequests.some((r) => r?.Status === 'Blocked')) {
        return 'Blocked';
    }

    const isStyled = Boolean(
        safeSpec.Style &&
            Array.isArray(safeSpec.Style.Palette) &&
            safeSpec.Style.Palette.length > 0 &&
            Array.isArray(safeSpec.Style.Typography) &&
            safeSpec.Style.Typography.length > 0 &&
            safeSpec.Style.Composition?.trim() &&
            safeSpec.Style.Pacing &&
            Array.isArray(safeSpec.Style.MotionRules) &&
            safeSpec.Style.MotionRules.length > 0,
    );
    if (!isStyled) {
        return 'Briefing';
    }

    const isStoryboarded = Array.isArray(safeSpec.Beats) && safeSpec.Beats.length > 0;
    if (!isStoryboarded) {
        return 'Styled';
    }

    const g2 = findExistingGate(gates, 'G2');
    if (g2?.Status !== 'Passed') {
        return 'Storyboarded';
    }

    const bindings = Array.isArray(safeSpec.DataBindings) ? safeSpec.DataBindings : [];
    const hasDataSnapshotIfNeeded =
        bindings.length === 0 ||
        Boolean(
            safeSpec.DataSnapshot &&
                safeSpec.DataSnapshot.AsOf?.trim() &&
                (safeSpec.DataSnapshot.FileID?.trim() || safeSpec.DataSnapshot.Inline),
        );

    const narrationEnabled = safeSpec.Audio?.Narration?.Enabled !== false;
    const scriptLines = Array.isArray(safeSpec.Audio?.Narration?.Script)
        ? safeSpec.Audio.Narration.Script
        : [];
    const hasNarrationAudioIfNeeded =
        !narrationEnabled ||
        (scriptLines.length > 0 && scriptLines.every((l) => Boolean(l?.AudioFileID?.trim())));

    const approvedAssets = Array.isArray(safeSpec.Assets?.Approved) ? safeSpec.Assets.Approved : [];
    const hasApprovedAssetIds = approvedAssets.every((a) => Boolean(a?.FileID?.trim() || a?.ArtifactVersionID?.trim()));
    const allGeneratedRequestsDone =
        generateRequests.length === 0 ||
        generateRequests.every((r) => isGenerateRequestSatisfied(r, approvedAssets));

    const isPreProduced =
        hasDataSnapshotIfNeeded &&
        hasNarrationAudioIfNeeded &&
        hasApprovedAssetIds &&
        allGeneratedRequestsDone;
    if (!isPreProduced) {
        return 'Approved';
    }

    const formats = ResolveDeliverableFormats(safeSpec, []);
    const isComposed =
        formats.length > 0 &&
        formats.every((fmt) => hasCompositionFiles(safeSpec.Output?.Source?.[fmt]));
    if (!isComposed) {
        return 'PreProduced';
    }

    const g3 = findExistingGate(gates, 'G3');
    const isRoughCut = g3?.Status === 'Passed' && hasRenderedVideosForAllFormats(safeSpec, formats);
    if (!isRoughCut) {
        return 'Composed';
    }

    if (!hasCriticRoundOnOrAfterRender(safeSpec)) {
        return 'RoughCut';
    }

    return 'Reviewed';
}

function isGenerateRequestSatisfied(
    req: VideoAssetGenerationRequest | undefined | null,
    approvedAssets: ReadonlyArray<VideoAsset>,
): boolean {
    if (!req) {
        return true;
    }
    if (req.Status === 'Blocked' || req.Status === 'Pending') {
        return false;
    }
    if (req.Status === 'Generated') {
        return true;
    }
    return approvedAssets.some(
        (a) => a?.Key === req.Key && Boolean(a?.FileID?.trim() || a?.ArtifactVersionID?.trim()),
    );
}

function hasCompositionFiles(src: { Files?: unknown } | undefined | null): boolean {
    if (!src || src.Files === undefined || src.Files === null) {
        return false;
    }
    if (Array.isArray(src.Files)) {
        return src.Files.length > 0;
    }
    if (typeof src.Files === 'object') {
        return Object.keys(src.Files).length > 0;
    }
    return false;
}

/**
 * Checks whether a stage sub-agent (`stageName`) may run given the current `spec`, `gates`, and `settings`.
 * Returns `null` when allowed, or a descriptive refusal string naming the blocking gate when refused.
 */
export function CheckStagePrerequisite(
    stageName: string,
    spec: Partial<VideoGenerationSpec>,
    gates: ReadonlyArray<GateRecord>,
    settings: VideoStudioSettings,
    initialRoundCount = 0,
): string | null {
    const safeSpec = spec ?? {};
    const stage = normalizeStageName(stageName);
    const g1 = findExistingGate(gates, 'G1');
    const g2 = findExistingGate(gates, 'G2');
    const g3 = findExistingGate(gates, 'G3');

    if (stage === 'Director') {
        return null;
    }

    if (stage === 'Art Director' || stage === 'Storyboard') {
        const hasBriefFields =
            Boolean(safeSpec.Film?.OneSentence?.trim()) &&
            Boolean(safeSpec.Film?.Audience?.trim()) &&
            typeof safeSpec.Film?.DurationSeconds === 'number' &&
            Number.isFinite(safeSpec.Film.DurationSeconds) &&
            safeSpec.Film.DurationSeconds > 0 &&
            ResolveDeliverableFormats(safeSpec, []).length > 0;

        if (!hasBriefFields || g1?.Status !== 'Passed') {
            return `G1 (Facts): ${g1?.Notes || 'brief fields (OneSentence, Audience, DurationSeconds, Formats) must be valid before running ' + stage}`;
        }
        return null;
    }

    if (stage === 'Pre-Production') {
        if (g1?.Status !== 'Passed') {
            return `G1 (Facts): ${g1?.Notes || 'facts gate has not passed yet'}`;
        }
        if (g2?.Status !== 'Passed') {
            return `G2 (Plan): ${g2?.Notes === 'AwaitingApproval' ? 'storyboard not approved yet' : g2?.Notes || 'storyboard not approved yet'}`;
        }
        return null;
    }

    if (stage === 'Motion Engineer') {
        if (g1?.Status !== 'Passed') {
            return `G1 (Facts): ${g1?.Notes || 'facts gate has not passed yet'}`;
        }
        if (g2?.Status !== 'Passed') {
            return `G2 (Plan): ${g2?.Notes === 'AwaitingApproval' ? 'storyboard not approved yet' : g2?.Notes || 'storyboard not approved yet'}`;
        }

        const rounds = Array.isArray(safeSpec.Review?.Rounds) ? safeSpec.Review.Rounds : [];
        const currentRunRounds = getCurrentRunRoundCount(safeSpec, initialRoundCount);
        if (currentRunRounds > 0 && currentRunRounds - 1 >= settings.MaxRepairRounds) {
            return `G5 (Repair): maximum repair rounds (${settings.MaxRepairRounds}) reached after Critic round ${rounds.length}; deliver with HumanReviewNotes instead of repairing again`;
        }

        const derived = DeriveStatus(safeSpec, gates);
        const allowedStatuses: readonly VideoProductionStatus[] = [
            'PreProduced',
            'Composed',
            'RoughCut',
            'Reviewed',
            'Delivered',
        ];
        if (!allowedStatuses.includes(derived)) {
            const generateRequests = Array.isArray(safeSpec.Assets?.Generate) ? safeSpec.Assets.Generate : [];
            const blockedRequests = generateRequests.filter((r) => r?.Status === 'Blocked');
            if (blockedRequests.length > 0) {
                const summary = blockedRequests
                    .map((r) => `${r.Key} (${r.BlockedReason || 'Blocked'})`)
                    .join('; ');
                return `G2 (Plan): Pre-Production blocked on generated asset request(s): ${summary}`;
            }
            const approvedAssets = Array.isArray(safeSpec.Assets?.Approved) ? safeSpec.Assets.Approved : [];
            const ungeneratedRequests = generateRequests.filter(
                (r) => !isGenerateRequestSatisfied(r, approvedAssets),
            );
            if (ungeneratedRequests.length > 0) {
                const summary = ungeneratedRequests
                    .map((r) => `${r.Key} (${r.Status ?? 'Pending'})`)
                    .join('; ');
                return `G2 (Plan): Pre-Production must complete generated asset request(s) [${summary}] (status is "${derived}", need "PreProduced") before running Motion Engineer`;
            }
            return `G2 (Plan): Pre-Production must complete (status is "${derived}", need "PreProduced") before running Motion Engineer`;
        }
        return null;
    }

    if (stage === 'Render') {
        if (g1?.Status !== 'Passed') {
            return `G1 (Facts): ${g1?.Notes || 'facts gate has not passed yet'}`;
        }
        if (g2?.Status !== 'Passed') {
            return `G2 (Plan): ${g2?.Notes || 'storyboard not approved yet'}`;
        }
        const formats = ResolveDeliverableFormats(safeSpec, []);
        const missingFormats = formats.filter((fmt) => !hasCompositionFiles(safeSpec.Output?.Source?.[fmt]));
        if (formats.length === 0 || missingFormats.length > 0) {
            return `G3 (Stills): Output.Source is missing composition files for format(s): ${missingFormats.join(', ') || 'none'}`;
        }
        return null;
    }

    if (stage === 'Critic') {
        const formats = ResolveDeliverableFormats(safeSpec, []);
        if (g3?.Status !== 'Passed') {
            return `G3 (Stills): ${g3?.Notes || 'still-frame gate G3 must pass before running Critic'}`;
        }
        if (!hasRenderedVideosForAllFormats(safeSpec, formats)) {
            return 'G4 (Rough Cut): Output.Videos must be present for all deliverable formats before running Critic';
        }
        return null;
    }

    return null;
}

function clearRenderEvidenceOnSpec(spec: Partial<VideoGenerationSpec>): void {
    if (spec.Output) {
        delete spec.Output.Videos;
        delete spec.Output.ContactSheetFileIDs;
        delete spec.Output.PosterFileID;
        delete spec.Output.RenderMetadata;
    }
    if (Array.isArray(spec.Review?.Gates)) {
        spec.Review.Gates = spec.Review.Gates.filter((g) => g && g.Gate !== 'G3' && g.Gate !== 'G4');
    }
}

/**
 * Clears downstream approvals, compositions, and/or render evidence invalidated when an earlier
 * stage re-runs. Mutates `spec` in place and returns it.
 */
export function ClearStaleEvidence<T extends Partial<VideoGenerationSpec>>(
    stageName: string,
    spec: T,
): T {
    if (!spec) {
        return spec;
    }
    const stage = normalizeStageName(stageName);

    if (stage === 'Director' || stage === 'Art Director' || stage === 'Storyboard') {
        if (Array.isArray(spec.Review?.Gates)) {
            spec.Review.Gates = spec.Review.Gates.filter(
                (g) => g && g.Gate !== 'G2' && g.Gate !== 'G3' && g.Gate !== 'G4',
            );
        }
        if (spec.Output) {
            delete spec.Output.Source;
        }
        clearRenderEvidenceOnSpec(spec);
        return spec;
    }

    if (stage === 'Pre-Production' || stage === 'Motion Engineer') {
        clearRenderEvidenceOnSpec(spec);
        return spec;
    }

    return spec;
}

/**
 * Parses a human approval/rejection reply for `G2` or `G4`.
 *
 * 1. Checks if the trimmed first line is `'Approved.'` or `'Rejected.'` (matching `VS-UX-2`'s
 *    `submitPlanReview` leading prefix).
 * 2. When the first line does not decide, inspects `@form:` / `@{"_mode":"form",...}` tokens via
 *    `ConversationUtility.ParseSpecialContent(text)` for a `decision` field (`'approve'` or `'reject'`).
 * 3. Otherwise strips special-content tokens and an optional leading `'Approved.'` prefix, returns
 *    `null` on empty text, `'Approve'` when the trimmed remainder starts with `'approve'`
 *    (case-insensitive), and `'Reject'` otherwise.
 */
export function ReadApprovalDecision(text: string | null | undefined): 'Approve' | 'Reject' | null {
    if (typeof text !== 'string') {
        return null;
    }

    // 1. Check the trimmed first line first so VS-UX-2's leading 'Approved.' / 'Rejected.' line wins
    const leadingFirstLine = text.trimStart().split(/\r?\n/)[0]?.trim() ?? '';
    if (/^rejected\.$/i.test(leadingFirstLine)) {
        return 'Reject';
    }
    if (/^approved\.$/i.test(leadingFirstLine)) {
        return 'Approve';
    }

    // 2. Check @{ "_mode": "form", ... } tokens via ConversationUtility
    const tokens = ConversationUtility.ParseSpecialContent(text);
    for (const token of tokens) {
        if (token.mode === 'form' && token.content) {
            const formContent = token.content as FormResponseContent & { decision?: unknown };
            let rawDecision: unknown = formContent.decision;
            if (rawDecision === undefined && Array.isArray(formContent.fields)) {
                const decisionField = formContent.fields.find(
                    (f) => typeof f?.name === 'string' && f.name.trim().toLowerCase() === 'decision',
                );
                rawDecision = decisionField?.value;
            }
            if (typeof rawDecision === 'string' && rawDecision.trim()) {
                const normalized = rawDecision.trim().toLowerCase();
                if (normalized.startsWith('approve')) {
                    return 'Approve';
                }
                if (normalized.startsWith('reject')) {
                    return 'Reject';
                }
            }
        }
    }

    // Also support literal @form:{...} syntax if passed directly
    for (const literalForm of findLiteralFormBlocks(text)) {
        try {
            const parsed = JSON.parse(literalForm.jsonBody) as {
                decision?: unknown;
                fields?: Array<{ name?: string; value?: unknown }>;
            };
            let rawDecision = parsed.decision;
            if (rawDecision === undefined && Array.isArray(parsed.fields)) {
                rawDecision = parsed.fields.find(
                    (f) => typeof f?.name === 'string' && f.name.trim().toLowerCase() === 'decision',
                )?.value;
            }
            if (typeof rawDecision === 'string' && rawDecision.trim()) {
                const normalized = rawDecision.trim().toLowerCase();
                if (normalized.startsWith('approve')) {
                    return 'Approve';
                }
                if (normalized.startsWith('reject')) {
                    return 'Reject';
                }
            }
        } catch {
            // Fall through to next literal form or free-text parsing
        }
    }

    // 3. Strip special content tokens
    let remaining = text;
    for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i];
        remaining = remaining.slice(0, t.startIndex) + remaining.slice(t.endIndex);
    }
    remaining = stripLiteralFormBlocks(remaining).trim();
    if (!remaining) {
        return null;
    }

    const firstLine = remaining.split(/\r?\n/)[0]?.trim() ?? '';
    if (/^rejected\.$/i.test(firstLine) || /^rejected\./i.test(remaining)) {
        return 'Reject';
    }
    if (/^approved\.$/i.test(firstLine)) {
        return 'Approve';
    }

    const stripped = remaining.replace(/^approved\.\s*/i, '').trim();
    if (!stripped) {
        return 'Approve';
    }

    return /^approve/i.test(stripped) ? 'Approve' : 'Reject';
}

function toAsciiLowerCase(text: string): string {
    return text.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

function findMatchingCloseBrace(
    text: string,
    lower: string,
    openBraceIdx: number,
): { closeIdx: number; nextSearchFrom: number } {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = openBraceIdx; i < text.length; i++) {
        const ch = text[i]!;
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (i > openBraceIdx && ch === '@' && lower.startsWith('@form:', i)) {
            return { closeIdx: -1, nextSearchFrom: i };
        }
        if (ch === '"') {
            inString = true;
        } else if (ch === '{') {
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0) {
                return { closeIdx: i, nextSearchFrom: i + 1 };
            }
        }
    }
    return { closeIdx: -1, nextSearchFrom: text.length };
}

function findLiteralFormBlocks(text: string): Array<{ start: number; end: number; jsonBody: string }> {
    const blocks: Array<{ start: number; end: number; jsonBody: string }> = [];
    const lower = toAsciiLowerCase(text);
    let searchFrom = 0;
    while (searchFrom < text.length) {
        const idx = lower.indexOf('@form:', searchFrom);
        if (idx === -1) {
            break;
        }
        let braceStart = idx + 6;
        while (braceStart < text.length && /\s/.test(text[braceStart]!)) {
            braceStart++;
        }
        if (braceStart >= text.length || text[braceStart] !== '{') {
            searchFrom = braceStart;
            continue;
        }
        const { closeIdx, nextSearchFrom } = findMatchingCloseBrace(text, lower, braceStart);
        if (closeIdx === -1) {
            searchFrom = nextSearchFrom;
            continue;
        }
        blocks.push({
            start: idx,
            end: closeIdx + 1,
            jsonBody: text.slice(braceStart, closeIdx + 1),
        });
        searchFrom = nextSearchFrom;
    }
    return blocks;
}

function stripLiteralFormBlocks(text: string): string {
    const blocks = findLiteralFormBlocks(text);
    if (blocks.length === 0) {
        return text;
    }
    let out = '';
    let cursor = 0;
    for (const block of blocks) {
        out += text.slice(cursor, block.start);
        cursor = block.end;
    }
    out += text.slice(cursor);
    return out;
}

/**
 * Formats a Markdown summary of the storyboard for human approval at Gate G2 (`Plan` pause).
 * Includes `OneSentence`, `DurationSeconds`, `Formats`, a beats table, narration lines,
 * and generated-asset count and total seconds.
 */
export function DescribeStoryboardForApproval(spec: Partial<VideoGenerationSpec>): string {
    const safeSpec = spec ?? {};
    const oneSentence = safeSpec.Film?.OneSentence ?? '(not specified)';
    const duration = safeSpec.Film?.DurationSeconds ?? 0;
    const formats = ResolveDeliverableFormats(safeSpec, []);
    const beats = Array.isArray(safeSpec.Beats) ? safeSpec.Beats : [];
    const script = Array.isArray(safeSpec.Audio?.Narration?.Script) ? safeSpec.Audio.Narration.Script : [];
    const genRequests = Array.isArray(safeSpec.Assets?.Generate) ? safeSpec.Assets.Generate : [];
    const totalGenSeconds = genRequests.reduce(
        (sum, req) => sum + (req?.Kind === 'Video' && typeof req.DurationSeconds === 'number' ? req.DurationSeconds : 0),
        0,
    );

    const lines: string[] = [
        '## Storyboard Review',
        '',
        `- **Film:** ${oneSentence}`,
        `- **Duration:** ${duration}s`,
        `- **Formats:** ${formats.join(', ') || 'none'}`,
        '',
        '### Beats',
        '',
        '| Beat | Window | Label | On-Screen Text |',
        '| --- | --- | --- | --- |',
    ];

    for (const beat of beats) {
        const windowStr = `${beat.StartSeconds}s–${beat.EndSeconds}s`;
        const textStr = Array.isArray(beat.OnScreenText) ? beat.OnScreenText.join(' / ') : '';
        lines.push(`| ${beat.Key} | ${windowStr} | ${beat.Label} | ${textStr} |`);
    }

    lines.push('', '### Narration Script', '');
    if (script.length === 0) {
        lines.push('_No narration script._');
    } else {
        for (const line of script) {
            lines.push(`- **${line.Key}** (${line.BeatKey}): "${line.Text}"`);
        }
    }

    lines.push(
        '',
        '### Generated Assets',
        '',
        `- **Requests:** ${genRequests.length} (${totalGenSeconds}s total generated video)`,
    );
    for (const req of genRequests) {
        const durSuffix = req.Kind === 'Video' && req.DurationSeconds !== undefined ? ` (${req.DurationSeconds}s)` : '';
        lines.push(`  - \`${req.Key}\` [${req.Kind}${durSuffix}]: ${req.Purpose}`);
    }

    return lines.join('\n');
}

/**
 * Formats a concise human-readable progress line after a stage sub-agent completes.
 */
export function DescribeStageProgress(stageName: string, spec: Partial<VideoGenerationSpec>): string {
    const safeSpec = spec ?? {};
    const stage = normalizeStageName(stageName);
    const formats = ResolveDeliverableFormats(safeSpec, []);
    const formatCount = formats.length;
    const formatLabel = `${formatCount} ${formatCount === 1 ? 'format' : 'formats'}`;

    switch (stage) {
        case 'Director': {
            const dur = safeSpec.Film?.DurationSeconds ?? 0;
            const bindings = safeSpec.DataBindings?.length ?? 0;
            return `Brief ready: ${dur} s, ${formatLabel}, ${bindings} data ${bindings === 1 ? 'binding' : 'bindings'}`;
        }
        case 'Art Director': {
            const paletteCount = safeSpec.Style?.Palette?.length ?? 0;
            const fontCount = safeSpec.Style?.Typography?.length ?? 0;
            return `Style ready: ${paletteCount} palette tokens, ${fontCount} type specs`;
        }
        case 'Storyboard': {
            const beatCount = safeSpec.Beats?.length ?? 0;
            const dur = safeSpec.Film?.DurationSeconds ?? 0;
            return `Storyboard ready: ${beatCount} ${beatCount === 1 ? 'beat' : 'beats'}, ${dur} s, ${formatLabel}`;
        }
        case 'Pre-Production': {
            const assetCount = safeSpec.Assets?.Approved?.length ?? 0;
            const lineCount = safeSpec.Audio?.Narration?.Script?.length ?? 0;
            return `Pre-Production ready: ${assetCount} approved ${assetCount === 1 ? 'asset' : 'assets'}, ${lineCount} narration ${lineCount === 1 ? 'line' : 'lines'}`;
        }
        case 'Motion Engineer': {
            const composedCount = Object.keys(safeSpec.Output?.Source ?? {}).length;
            return `Composition ready: ${composedCount} ${composedCount === 1 ? 'format' : 'formats'} composed`;
        }
        case 'Render': {
            const renderedCount = Object.keys(safeSpec.Output?.Videos ?? {}).length;
            return `Render ready: ${renderedCount} ${renderedCount === 1 ? 'video' : 'videos'} rendered`;
        }
        case 'Critic': {
            const rounds = safeSpec.Review?.Rounds ?? [];
            const lastRound = rounds[rounds.length - 1];
            const defectCount = lastRound?.Defects?.length ?? 0;
            return `Critic review complete: round ${lastRound?.Round ?? rounds.length}, ${defectCount} ${defectCount === 1 ? 'defect' : 'defects'}`;
        }
        default:
            return `${stage || 'Stage'} complete`;
    }
}

/**
 * Pure helper that resets a `'Generated'` asset back to `'Pending'` on its matching
 * `Assets.Generate` request when `RegenerationCount < maxRegenerations`.
 *
 * Allowed only when:
 * - `spec.Assets.Approved` contains an entry with `Key === assetKey` and `Provenance === 'Generated'`, and
 * - `spec.Assets.Generate` contains a request with `Key === assetKey` whose `(RegenerationCount ?? 0) < maxRegenerations`.
 *
 * When allowed, removes the generated asset (and any `<assetKey>-still` companion generated asset)
 * from `Assets.Approved`, sets the request's `Status` to `'Pending'`, clears `BlockedReason`,
 * and increments `RegenerationCount`.
 */
export function RequestRegeneration(
    spec: Partial<VideoGenerationSpec>,
    assetKey: string,
    maxRegenerations: number,
): { Spec: Partial<VideoGenerationSpec>; Allowed: boolean } {
    const cloned: Partial<VideoGenerationSpec> = structuredClone(spec ?? {});
    const trimmedKey = typeof assetKey === 'string' ? assetKey.trim() : '';
    if (!trimmedKey || typeof maxRegenerations !== 'number' || maxRegenerations <= 0) {
        return { Spec: cloned, Allowed: false };
    }

    const approved = Array.isArray(cloned.Assets?.Approved) ? cloned.Assets.Approved : [];
    const generate = Array.isArray(cloned.Assets?.Generate) ? cloned.Assets.Generate : [];

    const approvedAsset = approved.find((a) => a?.Key === trimmedKey && a.Provenance === 'Generated');
    const request = generate.find((r) => r?.Key === trimmedKey);
    if (!approvedAsset || !request) {
        return { Spec: cloned, Allowed: false };
    }

    const currentCount = typeof request.RegenerationCount === 'number' ? request.RegenerationCount : 0;
    if (currentCount >= maxRegenerations) {
        return { Spec: cloned, Allowed: false };
    }

    const stillKey = `${trimmedKey}-still`;
    let removedCost = 0;
    for (const a of approved) {
        if (a?.Key === trimmedKey || (a?.Key === stillKey && a.Provenance === 'Generated')) {
            const c = a?.Generation?.Cost;
            if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
                removedCost += c;
            }
        }
    }
    cloned.Assets!.Approved = approved.filter(
        (a) => a?.Key !== trimmedKey && !(a?.Key === stillKey && a.Provenance === 'Generated'),
    );
    if (removedCost > 0) {
        request.Cost =
            (typeof request.Cost === 'number' && Number.isFinite(request.Cost) && request.Cost >= 0
                ? request.Cost
                : 0) + removedCost;
    }
    request.Status = 'Pending';
    delete request.BlockedReason;
    request.RegenerationCount = currentCount + 1;

    return { Spec: cloned, Allowed: true };
}

