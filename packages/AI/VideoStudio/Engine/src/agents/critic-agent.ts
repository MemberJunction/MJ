import { BaseAgent } from '@memberjunction/ai-agents';
import type { ChatMessage, ChatMessageContentBlock } from '@memberjunction/ai';
import type {
    AgentConfiguration,
    BaseAgentNextStep,
    ExecuteAgentParams,
} from '@memberjunction/ai-core-plus';
import type { IMetadataProvider } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    RubricEngineBase,
    RubricScoring,
    type AgentRubricRecord,
    type CachedPublishedVersion,
    type RubricAnswer,
    type RubricNodeSnapshot,
    type RubricScaleLevelSnapshot,
    type RubricScaleSnapshot,
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
import { ResolveGenerationPolicy } from '../generation/generation-policy.js';
import { ResolveDeliverableFormats } from '../render/bundle.js';
import {
    BuildBeatsTable,
    BuildBoundValuesTable,
    BuildGeneratedAssetsTable,
    BuildRubricCriteriaText,
    BuildTimelineTable,
    PickSheetsForCall,
    findScaleForNode,
} from '../review/critic-input.js';
import { ResolveVideoStudioSettings } from '../settings.js';
import { ReadStoredFile } from '../storage.js';
import { VideoStudioAgentBase } from './video-studio-agent-base.js';

/**
 * Error message returned when the `Video Production Quality` rubric is not linked to the parent agent
 * or has no published version.
 */
export const MISSING_CRITIC_RUBRIC_ERROR_MESSAGE =
    'Video Production Quality rubric is not linked or not published';

const CRITIC_PROMPT_NAME = 'Video Studio - Critic';
const MAX_DEFECTS_PER_FORMAT = 3;

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
        const generatedAssetsTable = BuildGeneratedAssetsTable(incomingPayload);
        const generationPolicy = ResolveGenerationPolicy(
            incomingPayload,
            incomingPayload.CompanyID ?? null,
        );

        const existingRounds: CriticRound[] = Array.isArray(incomingPayload.Review?.Rounds)
            ? incomingPayload.Review!.Rounds.map((r) => ({
                  ...r,
                  Defects: Array.isArray(r.Defects) ? r.Defects.map((d) => ({ ...d })) : [],
                  ...(r.ContactSheetFileIDs ? { ContactSheetFileIDs: { ...r.ContactSheetFileIDs } } : {}),
              }))
            : [];

        const roundNumber = existingRounds.length + 1;
        const configId = params.configurationId ?? this.AgentRun?.ConfigurationID ?? null;
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
                generatedAssetsTable,
                allowSyntheticPeople: generationPolicy.AllowSyntheticPeople,
                neverInvent: generationPolicy.NeverInvent,
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
        rubricVersion: CachedPublishedVersion,
        formatScores: Array<NonNullable<CriticPromptOutput['Scores']>>,
    ): RubricScoreSummary {
        if (formatScores.length === 0) {
            const emptyScored = RubricScoring.Compute({ version: rubricVersion, answers: [] });
            return {
                RubricID: rubricVersion.rubricId,
                OverallScore: emptyScored.normalizedScore ?? 0,
                MaxScore: 1,
                Passed: emptyScored.passed === true,
                Criteria: [],
            };
        }

        const leafNodes = rubricVersion.nodes.filter((n) => n.nodeType === 'Criterion');
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
                const matchedNode = this.findCriterionNode(leafNodes, rawKey);
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
            const scale = findScaleForNode(rubricVersion.scales, node.scaleId);
            if (!scale) {
                throw new Error(
                    `Rubric criterion "${node.key}" has no matching scale ("${String(node.scaleId)}")`,
                );
            }
            const effectiveNaPolicy = node.notApplicablePolicy ?? rubricVersion.notApplicablePolicy;

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

        const scored = RubricScoring.Compute({ version: rubricVersion, answers });
        const scoredNodeById = new Map(scored.nodes.map((sn) => [sn.id, sn]));
        const threshold = rubricVersion.passThreshold;

        const criteria: RubricCriterionScore[] = [];
        for (const node of leafNodes) {
            if (!perCriterionEntries.has(node.key)) {
                continue;
            }
            const sn = scoredNodeById.get(node.id);
            const normalizedScore = sn?.normalizedScore ?? 0;
            const passed = sn
                ? !sn.gateFailed &&
                  (sn.isNotApplicable ||
                      (sn.normalizedScore !== null &&
                          (threshold === null || normalizedScore >= threshold)))
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
            RubricID: rubricVersion.rubricId,
            OverallScore: scored.normalizedScore ?? 0,
            MaxScore: 1,
            Passed: scored.passed === true,
            Criteria: criteria,
        };
    }

    private findCriterionNode(
        leafNodes: readonly RubricNodeSnapshot[],
        rawKey: string,
    ): RubricNodeSnapshot | undefined {
        const lower = rawKey.toLowerCase();
        return leafNodes.find(
            (n) =>
                n.key.toLowerCase() === lower ||
                UUIDsEqual(n.id, rawKey) ||
                n.name.toLowerCase() === lower,
        );
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
                    UUIDsEqual(lvl.id, rawLevel),
            );
            if (matched) {
                return { isNotApplicable: false, level: matched };
            }
        }

        return { isNotApplicable: false, level: null };
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
