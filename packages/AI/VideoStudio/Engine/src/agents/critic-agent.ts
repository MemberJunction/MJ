import { BaseAgent } from '@memberjunction/ai-agents';
import type { ChatMessage, ChatMessageContentBlock } from '@memberjunction/ai';
import type {
    AgentConfiguration,
    BaseAgentNextStep,
    ExecuteAgentParams,
} from '@memberjunction/ai-core-plus';
import type { IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    RubricEngineBase,
    RubricScoring,
    type AgentRubricRecord,
    type CachedPublishedVersion,
    type RubricAnswer,
    type RubricNodeSnapshot,
    type RubricScaleLevelSnapshot,
    type RubricScaleSnapshot,
    type RubricVersionSnapshot,
} from '@memberjunction/rubrics-base';
import type {
    CriticRound,
    DefectSeverity,
    RubricCriterionScore,
    RubricScoreSummary,
    VideoDefect,
    VideoFormat,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';

import { LoadDataSnapshotValues } from '../data/data-snapshot.js';
import { ResolveDeliverableFormats } from '../render/bundle.js';
import {
    BuildBeatsTable,
    BuildBoundValuesTable,
    BuildRubricCriteriaText,
    BuildTimelineTable,
    PickSheetsForCall,
} from '../review/critic-input.js';
import { ReadStoredFile } from '../storage.js';
import { VideoStudioAgentBase } from './video-studio-agent-base.js';
import { ResolveVideoStudioSettings } from './video-studio-agent.js';

/**
 * Error message returned when the `Video Production Quality` rubric is not linked to the parent agent
 * or has no published version.
 */
export const MISSING_CRITIC_RUBRIC_ERROR_MESSAGE =
    'Video Production Quality rubric is not linked or not published';

const CRITIC_PROMPT_NAME = 'Video Studio - Critic';
const MAX_DEFECTS_PER_FORMAT = 3;

const DEFAULT_THREE_LEVEL_SCALE_ID = '96B4F43A-2E7B-4BC7-8D9D-59C217F0E93B';
const DEFAULT_THREE_LEVEL_SCALE: RubricScaleSnapshot = {
    id: DEFAULT_THREE_LEVEL_SCALE_ID,
    name: 'Three-Level Production Quality (Miss / Partial / Meets)',
    scaleType: 'Levels',
    higherIsBetter: true,
    levels: [
        {
            id: 'B1F561DF-5C22-4DE2-A532-D1B2A1CA0E0A',
            label: 'Miss',
            value: 0,
            normalizedValue: 0,
            sequence: 1,
        },
        {
            id: 'A3C58D64-D5EB-4F4B-B21B-74351908DBAC',
            label: 'Partial',
            value: 1,
            normalizedValue: 0.5,
            sequence: 2,
        },
        {
            id: 'E11F5B7E-9A5C-4D30-BF94-C5B0E9A84457',
            label: 'Meets',
            value: 2,
            normalizedValue: 1,
            sequence: 3,
        },
    ],
};

const SEVERITY_ORDER: Record<DefectSeverity, number> = {
    Blocker: 0,
    Major: 1,
    Minor: 2,
};

/**
 * Per-criterion score entry accepted from the `Video Studio - Critic` prompt output.
 */
export interface CriticPromptCriterionScore {
    Criterion?: string;
    Key?: string;
    Level?: 'Meets' | 'Partial' | 'Miss' | 'NotApplicable' | string;
    NotApplicable?: boolean;
    Score?: number;
    MaxScore?: number;
    Passed?: boolean;
    Notes?: string;
    Rationale?: string;
}

/**
 * Structured output returned by a single per-format execution of the `Video Studio - Critic` prompt.
 */
export interface CriticPromptOutput {
    Defects?: Array<{
        Timestamp?: number;
        Beat?: string;
        Criterion?: string;
        Severity?: DefectSeverity | string;
        Evidence?: string;
        Fix?: string;
        AssetKey?: string;
    }>;
    Scores?: {
        OverallScore?: number;
        MaxScore?: number;
        Passed?: boolean;
        Criteria?: CriticPromptCriterionScore[];
    };
    Summary?: string;
}

/**
 * Deterministic code-driven sub-agent (`DriverClass = 'VideoStudioCriticAgent'`) that implements the
 * `Video Studio - Critic` stage.
 *
 * Evaluates rendered contact sheets per deliverable format against the published `Video Production Quality`
 * rubric linked to the parent `Video Studio` agent, updates defect history across rounds, and aggregates
 * worst-case per-criterion scores across formats using `RubricScoring.Compute`.
 */
@RegisterClass(BaseAgent, 'VideoStudioCriticAgent')
export class VideoStudioCriticAgent extends VideoStudioAgentBase {
    protected override async executeAgentInternal<P = unknown>(
        params: ExecuteAgentParams,
        _config: AgentConfiguration,
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        const incomingPayload = (params.payload ?? {}) as Partial<VideoGenerationSpec>;

        // 1. Load rubric criteria from parent agent's Evaluation rubric link
        const rubricVersion = await this.resolvePublishedEvaluationRubric(params);
        if (!rubricVersion || rubricVersion.nodes.length === 0) {
            return this.buildFailedOutcome(params, MISSING_CRITIC_RUBRIC_ERROR_MESSAGE);
        }

        const rubricCriteria = BuildRubricCriteriaText(rubricVersion);
        if (!rubricCriteria.trim()) {
            return this.buildFailedOutcome(params, MISSING_CRITIC_RUBRIC_ERROR_MESSAGE);
        }

        // 2. Load data snapshot values and build tables
        const snapshot = await this.loadSnapshotValues(incomingPayload, params);
        const beatsTable = BuildBeatsTable(incomingPayload);
        const timelineTable = BuildTimelineTable(incomingPayload);
        const boundValues = BuildBoundValuesTable(incomingPayload, snapshot);

        const existingRounds: CriticRound[] = Array.isArray(incomingPayload.Review?.Rounds)
            ? incomingPayload.Review!.Rounds.map((r) => ({
                  ...r,
                  Defects: Array.isArray(r.Defects) ? r.Defects.map((d) => ({ ...d })) : [],
                  ...(r.ContactSheetFileIDs ? { ContactSheetFileIDs: { ...r.ContactSheetFileIDs } } : {}),
              }))
            : [];

        const roundNumber = existingRounds.length + 1;
        const configId =
            params.configurationId ??
            ((this.AgentRun as { ConfigurationID?: string | null } | null)?.ConfigurationID ?? null);
        const settings = ResolveVideoStudioSettings(configId);
        const maxRounds = settings.MaxRepairRounds + 1;
        const formats = ResolveDeliverableFormats(incomingPayload);
        const approvedAssetKeys = new Set(
            (incomingPayload.Assets?.Approved ?? [])
                .map((asset) => asset?.Key)
                .filter((key): key is string => typeof key === 'string' && key.trim().length > 0),
        );

        const roundContactSheets: Partial<Record<VideoFormat, string[]>> = {};
        const roundDefects: VideoDefect[] = [];
        const formatSummaries: string[] = [];
        const formatScores: Array<NonNullable<CriticPromptOutput['Scores']>> = [];

        // 3. Run one critic prompt pass per deliverable format
        for (const format of formats) {
            const allSheetIds = incomingPayload.Output?.ContactSheetFileIDs?.[format] ?? [];
            const pickedSheetIds = PickSheetsForCall(allSheetIds);
            roundContactSheets[format] = [...pickedSheetIds];

            const contentBlocks: ChatMessageContentBlock[] = [
                {
                    type: 'text',
                    content: `Format: ${format} | Critic round: ${roundNumber}`,
                },
            ];

            for (const fileId of pickedSheetIds) {
                const bytes = await ReadStoredFile(
                    fileId,
                    params.contextUser,
                    this.ProviderToUse as IMetadataProvider | undefined,
                );
                const base64 = Buffer.from(bytes).toString('base64');
                contentBlocks.push({
                    type: 'image_url',
                    content: `data:image/png;base64,${base64}`,
                    mimeType: 'image/png',
                });
            }

            const messages: ChatMessage[] = [
                {
                    role: 'user',
                    content: contentBlocks,
                },
            ];

            const promptData: Record<string, unknown> = {
                format,
                beatsTable,
                timelineTable,
                boundValues,
                rubricCriteria,
                round: roundNumber,
                maxRounds,
            };

            const outcome = await this.RunStudioPrompt<CriticPromptOutput>(
                params,
                CRITIC_PROMPT_NAME,
                `Critic ${format} round ${roundNumber}`,
                promptData,
                messages,
            );

            if (outcome.ErrorMessage || !outcome.Result) {
                return this.buildFailedOutcome(
                    params,
                    outcome.ErrorMessage ?? `Critic prompt failed for format ${format}.`,
                );
            }

            const formatDefects = this.normalizeFormatDefects(
                outcome.Result.Defects ?? [],
                roundNumber,
                format,
                approvedAssetKeys,
            );
            roundDefects.push(...formatDefects);

            const summaryText = (outcome.Result.Summary ?? '').trim();
            if (summaryText.length > 0) {
                formatSummaries.push(
                    formats.length > 1 ? `[${format}] ${summaryText}` : summaryText,
                );
            }

            if (outcome.Result.Scores) {
                formatScores.push(outcome.Result.Scores);
            }
        }

        // 4. Build the new CriticRound
        const newRound: CriticRound = {
            Round: roundNumber,
            Timestamp: new Date().toISOString(),
            ContactSheetFileIDs: roundContactSheets,
            Defects: roundDefects,
            Summary: formatSummaries.join(' ') || `Round ${roundNumber} completed.`,
        };

        // 5. Update defect history on earlier rounds
        for (const earlierRound of existingRounds) {
            for (const earlierDefect of earlierRound.Defects ?? []) {
                if (earlierDefect.Status !== 'Open') {
                    continue;
                }
                const stillReported = roundDefects.some((current) =>
                    this.isSameDefect(earlierDefect, current),
                );
                if (!stillReported) {
                    earlierDefect.Status = 'Fixed';
                }
            }
        }

        const updatedRounds = [...existingRounds, newRound];

        // 6. Score against published rubric version via RubricScoring.Compute
        const aggregatedScores = this.aggregateScores(rubricVersion, formatScores);

        // 7. Return Success with Review.Rounds and Review.Scores only
        const newPayload = {
            ...incomingPayload,
            Review: {
                ...(incomingPayload.Review ?? { Gates: [] }),
                Rounds: updatedRounds,
                Scores: aggregatedScores,
            },
        } as unknown as P;

        return {
            finalStep: {
                step: 'Success',
                terminate: true,
                previousPayload: params.payload as P,
                newPayload,
            },
            stepCount: 1,
        };
    }

    private async loadSnapshotValues(
        spec: Partial<VideoGenerationSpec>,
        params: ExecuteAgentParams,
    ): Promise<Record<string, unknown>> {
        if (!spec.DataSnapshot || (spec.DataSnapshot.Inline === undefined && !spec.DataSnapshot.FileID)) {
            return {};
        }
        return LoadDataSnapshotValues(spec.DataSnapshot, {
            ContextUser: params.contextUser!,
            Provider: this.ProviderToUse as IMetadataProvider | undefined,
        });
    }

    private async resolvePublishedEvaluationRubric(
        params: ExecuteAgentParams,
    ): Promise<CachedPublishedVersion | null> {
        const engine = RubricEngineBase.Instance;
        await engine.Config(
            false,
            params.contextUser,
            this.ProviderToUse as IMetadataProvider | undefined,
        );

        const parentAgentId = params.agent.ParentID;
        if (!parentAgentId) {
            return null;
        }

        const links: AgentRubricRecord[] = engine.GetAgentRubrics(parentAgentId);
        const evaluationLinks = links
            .filter((link) => link.status === 'Active' && link.purpose === 'Evaluation')
            .sort((a, b) => {
                if (Boolean(a.isDefault) !== Boolean(b.isDefault)) {
                    return a.isDefault ? -1 : 1;
                }
                return (b.priority ?? 0) - (a.priority ?? 0);
            });

        for (const link of evaluationLinks) {
            const version = engine.GetLatestPublishedVersion(link.rubricId);
            if (version) {
                return version;
            }
        }

        return null;
    }

    private normalizeFormatDefects(
        rawDefects: NonNullable<CriticPromptOutput['Defects']>,
        roundNumber: number,
        format: VideoFormat,
        approvedAssetKeys: Set<string>,
    ): VideoDefect[] {
        if (!Array.isArray(rawDefects) || rawDefects.length === 0) {
            return [];
        }

        // Stable sort by severity: Blocker, Major, Minor (preserving model order within a severity)
        const indexed = rawDefects
            .filter((d) => Boolean(d))
            .map((defect, index) => ({ defect, index }));

        indexed.sort((a, b) => {
            const sevA = SEVERITY_ORDER[this.normalizeSeverity(a.defect.Severity)];
            const sevB = SEVERITY_ORDER[this.normalizeSeverity(b.defect.Severity)];
            if (sevA !== sevB) {
                return sevA - sevB;
            }
            return a.index - b.index;
        });

        const topDefects = indexed.slice(0, MAX_DEFECTS_PER_FORMAT);
        return topDefects.map(({ defect }, idx) => {
            const normalized: VideoDefect = {
                Key: `r${roundNumber}-${format}-${idx + 1}`,
                Format: format,
                Timestamp: typeof defect.Timestamp === 'number' ? defect.Timestamp : 0,
                Beat: typeof defect.Beat === 'string' && defect.Beat.trim() ? defect.Beat.trim() : 'unknown',
                ...(typeof defect.Criterion === 'string' && defect.Criterion.trim()
                    ? { Criterion: defect.Criterion.trim() }
                    : {}),
                Severity: this.normalizeSeverity(defect.Severity),
                Evidence: typeof defect.Evidence === 'string' ? defect.Evidence : '',
                Fix: typeof defect.Fix === 'string' ? defect.Fix : '',
                Status: 'Open',
            };

            if (
                typeof defect.AssetKey === 'string' &&
                defect.AssetKey.trim().length > 0 &&
                approvedAssetKeys.has(defect.AssetKey.trim())
            ) {
                normalized.AssetKey = defect.AssetKey.trim();
            }

            return normalized;
        });
    }

    private normalizeSeverity(severity: unknown): DefectSeverity {
        const normalized = typeof severity === 'string' ? severity.trim().toLowerCase() : '';
        if (normalized === 'blocker') {
            return 'Blocker';
        }
        if (normalized === 'major') {
            return 'Major';
        }
        if (normalized === 'minor') {
            return 'Minor';
        }
        return 'Major';
    }

    private isSameDefect(earlier: VideoDefect, current: VideoDefect): boolean {
        const fmtA = earlier.Format ?? '';
        const fmtB = current.Format ?? '';
        const beatA = earlier.Beat ?? '';
        const beatB = current.Beat ?? '';
        const critA = earlier.Criterion ?? '';
        const critB = current.Criterion ?? '';
        return fmtA === fmtB && beatA === beatB && critA === critB;
    }

    private aggregateScores(
        rawVersion: CachedPublishedVersion,
        formatScores: Array<NonNullable<CriticPromptOutput['Scores']>>,
    ): RubricScoreSummary {
        const snapshot = this.normalizeRubricVersionSnapshot(rawVersion);
        if (formatScores.length === 0) {
            const emptyScored = RubricScoring.Compute({ version: snapshot, answers: [] });
            return {
                RubricID: snapshot.rubricId,
                OverallScore: emptyScored.normalizedScore ?? 0,
                MaxScore: 1,
                Passed: emptyScored.passed === true,
                Criteria: [],
            };
        }

        const leafNodes = snapshot.nodes.filter((n) => n.nodeType === 'Criterion');
        const perCriterionEntries = new Map<string, CriticPromptCriterionScore[]>();

        for (const scoreBlock of formatScores) {
            for (const c of scoreBlock.Criteria ?? []) {
                if (!c) {
                    continue;
                }
                const rawKey = (c.Criterion ?? c.Key ?? '').trim();
                if (!rawKey) {
                    continue;
                }
                const matchedNode = leafNodes.find(
                    (n) =>
                        n.key.toLowerCase() === rawKey.toLowerCase() ||
                        n.id.toLowerCase() === rawKey.toLowerCase() ||
                        n.name.toLowerCase() === rawKey.toLowerCase(),
                );
                const canonicalKey = matchedNode ? matchedNode.key : rawKey;
                const list = perCriterionEntries.get(canonicalKey) ?? [];
                list.push(c);
                perCriterionEntries.set(canonicalKey, list);
            }
        }

        const answers: RubricAnswer[] = [];
        const notesByNodeId = new Map<string, string>();

        for (const node of leafNodes) {
            const entries = perCriterionEntries.get(node.key) ?? [];
            if (entries.length === 0) {
                continue;
            }
            const scale =
                snapshot.scales.find((s) => s.id === node.scaleId) ??
                snapshot.scales[0] ??
                DEFAULT_THREE_LEVEL_SCALE;
            const effectiveNaPolicy = node.notApplicablePolicy ?? snapshot.notApplicablePolicy;

            let worstLevel: RubricScaleLevelSnapshot | null = null;
            let sawNotApplicable = false;
            const notes: string[] = [];

            for (const entry of entries) {
                const noteText = (entry.Notes ?? entry.Rationale ?? '').trim();
                if (noteText) {
                    notes.push(noteText);
                }
                const resolved = this.resolveCriterionEntryLevel(
                    entry,
                    scale,
                    effectiveNaPolicy !== 'NotAllowed',
                );
                if (resolved.isNotApplicable) {
                    sawNotApplicable = true;
                    continue;
                }
                if (resolved.level) {
                    if (
                        !worstLevel ||
                        resolved.level.normalizedValue < worstLevel.normalizedValue
                    ) {
                        worstLevel = resolved.level;
                    }
                }
            }

            const combinedNotes = notes.join(' | ');
            if (combinedNotes) {
                notesByNodeId.set(node.id, combinedNotes);
            }

            if (worstLevel) {
                answers.push({
                    criterionId: node.id,
                    scaleLevelId: worstLevel.id,
                    rawValue: worstLevel.value,
                    ...(combinedNotes ? { rationale: combinedNotes } : {}),
                    ...(node.evidenceRequired
                        ? { evidence: combinedNotes || worstLevel.label }
                        : {}),
                });
            } else if (sawNotApplicable) {
                answers.push({
                    criterionId: node.id,
                    isNotApplicable: true,
                    ...(combinedNotes ? { rationale: combinedNotes } : {}),
                });
            }
        }

        const scored = RubricScoring.Compute({ version: snapshot, answers });
        const scoredNodeById = new Map(scored.nodes.map((sn) => [sn.id, sn]));

        const criteria: RubricCriterionScore[] = [];
        for (const node of leafNodes) {
            if (!perCriterionEntries.has(node.key)) {
                continue;
            }
            const sn = scoredNodeById.get(node.id);
            const normalizedScore = sn?.normalizedScore ?? 0;
            const minPassScore = node.isGate
                ? (node.gateMinimumScore ?? 0.6)
                : (snapshot.passThreshold ?? 0.7);
            const passed = sn
                ? !sn.gateFailed &&
                  (sn.isNotApplicable || (sn.normalizedScore !== null && normalizedScore >= minPassScore))
                : false;
            const criterionScore: RubricCriterionScore = {
                Criterion: node.key,
                Score: normalizedScore,
                MaxScore: 1,
                Passed: passed,
            };
            const combinedNotes = notesByNodeId.get(node.id);
            if (combinedNotes) {
                criterionScore.Notes = combinedNotes;
            }
            criteria.push(criterionScore);
        }

        return {
            RubricID: snapshot.rubricId,
            OverallScore: scored.normalizedScore ?? 0,
            MaxScore: 1,
            Passed: scored.passed === true,
            Criteria: criteria,
        };
    }

    private resolveCriterionEntryLevel(
        entry: CriticPromptCriterionScore,
        scale: RubricScaleSnapshot,
        allowNotApplicable: boolean,
    ): { isNotApplicable: boolean; level: RubricScaleLevelSnapshot | null } {
        const rawLevel = typeof entry.Level === 'string' ? entry.Level.trim().toLowerCase() : '';
        if (
            entry.NotApplicable === true ||
            rawLevel === 'notapplicable' ||
            rawLevel === 'not_applicable' ||
            rawLevel === 'n/a'
        ) {
            if (allowNotApplicable) {
                return { isNotApplicable: true, level: null };
            }
            const lowest = [...scale.levels].sort((a, b) => a.normalizedValue - b.normalizedValue)[0] ?? null;
            return { isNotApplicable: false, level: lowest };
        }

        if (rawLevel.length > 0) {
            const matched = scale.levels.find(
                (lvl) =>
                    lvl.label.trim().toLowerCase() === rawLevel ||
                    lvl.id.trim().toLowerCase() === rawLevel,
            );
            if (matched) {
                return { isNotApplicable: false, level: matched };
            }
        }

        if (typeof entry.Score === 'number' && !Number.isNaN(entry.Score)) {
            const max =
                typeof entry.MaxScore === 'number' && entry.MaxScore > 0
                    ? entry.MaxScore
                    : entry.Score > 1
                      ? 100
                      : 1;
            const norm = Math.max(0, Math.min(1, entry.Score / max));
            const sorted = [...scale.levels].sort((a, b) => a.normalizedValue - b.normalizedValue);
            if (sorted.length === 0) {
                return { isNotApplicable: false, level: null };
            }
            let closest = sorted[0];
            for (const candidate of sorted) {
                if (
                    Math.abs(candidate.normalizedValue - norm) <
                    Math.abs(closest.normalizedValue - norm)
                ) {
                    closest = candidate;
                }
            }
            if (entry.Passed === false && closest.normalizedValue >= 1 && sorted.length > 1) {
                closest = sorted[sorted.length - 2];
            }
            return { isNotApplicable: false, level: closest };
        }

        return { isNotApplicable: false, level: null };
    }

    private normalizeRubricVersionSnapshot(raw: CachedPublishedVersion): RubricVersionSnapshot {
        const scales: RubricScaleSnapshot[] =
            Array.isArray(raw.scales) && raw.scales.length > 0
                ? raw.scales
                : [DEFAULT_THREE_LEVEL_SCALE];
        const defaultScaleId = scales[0].id;
        const nodeIds = new Set(raw.nodes.map((n) => n.id));

        const legacyThresholdScore = (raw as { passThresholdScore?: number }).passThresholdScore;
        const rawThreshold =
            typeof raw.passThreshold === 'number'
                ? raw.passThreshold
                : typeof legacyThresholdScore === 'number'
                  ? legacyThresholdScore
                  : 0.7;
        const passThreshold = rawThreshold > 1 ? rawThreshold / 100 : rawThreshold;

        const nodes: RubricNodeSnapshot[] = raw.nodes.map((node) => {
            const hasValidParent =
                typeof node.parentId === 'string' &&
                node.parentId.length > 0 &&
                nodeIds.has(node.parentId);
            const scaleId =
                node.nodeType === 'Criterion'
                    ? node.scaleId && scales.some((s) => s.id === node.scaleId)
                        ? node.scaleId
                        : defaultScaleId
                    : (node.scaleId ?? null);
            const isGate = Boolean(node.isGate);
            const gateMinimumScore = isGate
                ? typeof node.gateMinimumScore === 'number'
                    ? node.gateMinimumScore
                    : 0.6
                : (node.gateMinimumScore ?? null);

            return {
                ...node,
                parentId: hasValidParent ? node.parentId : null,
                scaleId,
                weight: typeof node.weight === 'number' ? node.weight : 1,
                isAdvisory: Boolean(node.isAdvisory),
                isGate,
                gateMinimumScore,
                evidenceRequired: Boolean(node.evidenceRequired),
                rationaleRequired: Boolean(node.rationaleRequired),
                sequence: typeof node.sequence === 'number' ? node.sequence : 1,
            };
        });

        return {
            id: raw.id ?? 'rubric-version-1',
            rubricId: raw.rubricId,
            majorVersion: raw.majorVersion ?? 1,
            minorVersion: raw.minorVersion ?? 0,
            patchVersion: raw.patchVersion ?? 0,
            instructions: raw.instructions ?? null,
            passThreshold,
            minimumCompleteness:
                typeof raw.minimumCompleteness === 'number' ? raw.minimumCompleteness : 1,
            notApplicablePolicy: raw.notApplicablePolicy ?? 'ExcludeAndRedistribute',
            scoreDisplayMin: typeof raw.scoreDisplayMin === 'number' ? raw.scoreDisplayMin : 0,
            scoreDisplayMax: typeof raw.scoreDisplayMax === 'number' ? raw.scoreDisplayMax : 1,
            nodes,
            scales,
            bands: Array.isArray(raw.bands) ? raw.bands : [],
        };
    }

    private buildFailedOutcome<P>(
        params: ExecuteAgentParams,
        errorMessage: string,
    ): { finalStep: BaseAgentNextStep<P>; stepCount: number } {
        if (this.AgentRun) {
            this.AgentRun.ErrorMessage = errorMessage;
        }
        return {
            finalStep: {
                step: 'Failed',
                terminate: true,
                errorMessage,
                previousPayload: params.payload as P,
                newPayload: params.payload as P,
            },
            stepCount: 1,
        };
    }
}

/**
 * Tree-shaking guard to ensure `VideoStudioCriticAgent` is registered with `MJGlobal`.
 */
export function LoadVideoStudioCriticAgent(): void {
    if (false as boolean) {
        const _keep: unknown = [VideoStudioCriticAgent];
    }
}
