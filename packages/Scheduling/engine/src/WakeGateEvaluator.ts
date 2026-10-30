/**
 * @fileoverview 3-Tier Wake Condition Gate for User Routines and Agent Wakes.
 *
 * Evaluates whether a due `MJ: User Routines` row should proceed to target execution
 * or skip this pass without burning expensive LLM tokens when monitored state is unchanged:
 * - **Tier 0 (Durable Entity Watermarks + MJ: Record Changes + Skip-If-Unchanged):**
 *   Polls monitored entities (`watchedEntities`) for changes since `routine.LastCheckedAt`
 *   (or `routine.LastRunAt`) via `RunView` and `MJ: Record Changes` (when `includeRecordChanges` is enabled).
 *   Supports `forceWakeAfterMinutes` heartbeat override.
 * - **Tier 1 (Deterministic Expression Gate — 0 LLM cost):**
 *   Evaluates `wakeGate.tier1Expression` via `SafeExpressionEvaluator` against the collected watermarks,
 *   `resumeState`, and routine timing context.
 * - **Tier 2 (Fast Decision Model Gate — low latency/cost):**
 *   Executes `AIDecisionRunner.ExecuteDecision` with a `Likelihood` or `Choice` question
 *   and compares the returned answer against `wakeIfAtLeast` / `wakeOnChoices`.
 * - **Tier 3 (Full AI Prompt Gate — last resort):**
 *   Executes a metadata-backed `MJ: AI Prompts` row (`wakeGate.tier3WakePromptId`) via `AIPromptRunner`.
 *
 * @module @memberjunction/scheduling-engine
 */

import { LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    MJUserRoutineEntity,
    MJUserRoutineEntity_IRoutineWakeConfiguration,
} from '@memberjunction/core-entities';
import { SafeExpressionEvaluator, SafeJSONParse } from '@memberjunction/global';
import { AIPromptParams, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIDecisionParams, AIDecisionRunner, AIPromptRunner } from '@memberjunction/ai-prompts';
import { ComputeResultHash } from './UserRoutineProcessor';

/**
 * Type of a watched entity rule derived from `MJUserRoutineEntity_IRoutineWakeConfiguration`.
 */
export type RoutineWatchedEntityRule = NonNullable<
    MJUserRoutineEntity_IRoutineWakeConfiguration['watchedEntities']
>[number];

/**
 * Type of the wakeGate block derived from `MJUserRoutineEntity_IRoutineWakeConfiguration`.
 */
export type RoutineWakeGateConfig = NonNullable<
    MJUserRoutineEntity_IRoutineWakeConfiguration['wakeGate']
>;

/**
 * Type of the Tier 2 decision configuration derived from `MJUserRoutineEntity_IRoutineWakeConfiguration`.
 */
export type RoutineTier2DecisionConfig = NonNullable<
    RoutineWakeGateConfig['tier2Decision']
>;

/**
 * Snapshot of a monitored entity's watermark collected during Tier 0 evaluation.
 */
export interface EntityWatermarkSnapshot {
    /** Monitored MJ entity name. */
    entityName: string;
    /** Number of matching records modified since the reference timestamp. */
    changedCount: number;
    /** Total matching records returned by the watermark probe. */
    totalMatchingCount: number;
    /** ISO-8601 timestamp of the newest matching record's `__mj_UpdatedAt`, or null if none. */
    maxUpdatedAt: string | null;
    /** Count of `MJ: Record Changes` rows since the reference timestamp when `includeRecordChanges` is enabled. */
    recordChangeCount: number;
    /** Up to 10 sample changed record summaries for Tier 1 / Tier 2 / Tier 3 context. */
    sampleRecords: Record<string, string | number | boolean | null>[];
}

/**
 * Full outcome of evaluating the 3-Tier Wake Gate for a routine.
 */
export interface WakeGateEvaluationResult {
    /** True when the routine should wake and execute its target; false when it should skip this sweep. */
    shouldWake: boolean;
    /** Which tier made the terminal wake/skip decision (`'None' | 'Tier0' | 'Tier1' | 'Tier2' | 'Tier3'`). */
    decidedByTier: 'None' | 'Tier0' | 'Tier1' | 'Tier2' | 'Tier3';
    /** Human-readable explanation of why the routine woke or skipped. */
    reason: string;
    /** Collected Tier 0 entity watermarks keyed by alias (or entityName when no alias is specified). */
    watermarks: Record<string, EntityWatermarkSnapshot>;
    /** SHA-256 hash of the collected watermark state for `skipIfUnchanged` comparison. */
    watermarkHash: string | null;
    /** Optional `MJ: AI Prompt Runs` ID when Tier 2 or Tier 3 executed a model call. */
    promptRunId: string | null;
}

/**
 * Optional collaborators injectable for deterministic unit testing without a live database or LLM.
 */
export interface WakeGateEvaluatorDependencies {
    /** Custom watermark collector for Tier 0 tests. */
    collectWatermark?: (
        rule: RoutineWatchedEntityRule,
        sinceDate: Date | null,
        contextUser: UserInfo
    ) => Promise<EntityWatermarkSnapshot>;
    /** Custom Tier 2 decision executor for unit tests. */
    runTier2Decision?: (
        config: RoutineTier2DecisionConfig,
        state: Record<string, object | string | number | boolean | null>,
        contextUser: UserInfo
    ) => Promise<{ shouldWake: boolean; probability?: number; selectedChoice?: string; promptRunId?: string | null }>;
    /** Custom Tier 3 prompt executor for unit tests. */
    runTier3Prompt?: (
        promptId: string,
        data: Record<string, object | string | number | boolean | null>,
        contextUser: UserInfo
    ) => Promise<{ shouldWake: boolean; reason: string; promptRunId?: string | null }>;
}

type SampleRecordRow = Record<string, string | number | boolean | Date | null | undefined>;

const DEFAULT_DECISION_PROMPT_NAME = 'Default Decision';
const DEFAULT_TIER2_THRESHOLD = 0.7;
const MAX_WATERMARK_SAMPLE_RECORDS = 10;

/**
 * Evaluates the 3-tier wake gate configured on `MJUserRoutineEntity.WakeConfigurationObject`.
 */
export class WakeGateEvaluator {
    private readonly expressionEvaluator = new SafeExpressionEvaluator();

    constructor(private readonly deps: WakeGateEvaluatorDependencies = {}) {}

    /**
     * Evaluate whether `routine` should wake on the current sweep at `now`.
     * Always fails open (`shouldWake: true`) if no `WakeConfiguration` is present.
     */
    public async Evaluate(
        routine: MJUserRoutineEntity,
        contextUser: UserInfo,
        now: Date = new Date()
    ): Promise<WakeGateEvaluationResult> {
        const config = this.resolveWakeConfiguration(routine);
        if (!config) {
            return {
                shouldWake: true,
                decidedByTier: 'None',
                reason: 'No wake configuration specified — proceeding unconditionally.',
                watermarks: {},
                watermarkHash: null,
                promptRunId: null,
            };
        }

        const sinceDate = routine.LastCheckedAt ?? routine.LastRunAt ?? null;
        const watermarks: Record<string, EntityWatermarkSnapshot> = {};
        const wakeGate = config.wakeGate;

        // ====================================================================
        // Tier 0: Durable Entity Watermarks & Skip-If-Unchanged
        // ====================================================================
        const rules = config.watchedEntities ?? [];
        for (const rule of rules) {
            const key = rule.alias && rule.alias.trim().length > 0 ? rule.alias.trim() : rule.entityName;
            const snapshot = this.deps.collectWatermark
                ? await this.deps.collectWatermark(rule, sinceDate, contextUser)
                : await this.collectEntityWatermark(rule, sinceDate, contextUser);
            watermarks[key] = snapshot;
        }

        const watermarkHash = rules.length > 0
            ? ComputeResultHash(JSON.stringify(watermarks))
            : null;

        const minutesSinceLastRun = routine.LastRunAt
            ? Math.max(0, (now.getTime() - routine.LastRunAt.getTime()) / 60_000)
            : null;
        const forceWakeReached = wakeGate?.forceWakeAfterMinutes != null &&
            wakeGate.forceWakeAfterMinutes > 0 &&
            minutesSinceLastRun != null &&
            minutesSinceLastRun >= wakeGate.forceWakeAfterMinutes;

        if (wakeGate?.skipIfUnchanged && rules.length > 0 && !forceWakeReached) {
            const totalChanges = Object.values(watermarks).reduce(
                (sum, w) => sum + w.changedCount + w.recordChangeCount,
                0
            );
            const hashUnchanged = watermarkHash != null &&
                routine.LastResultHash != null &&
                watermarkHash === routine.LastResultHash;

            if (totalChanges === 0 || hashUnchanged) {
                return {
                    shouldWake: false,
                    decidedByTier: 'Tier0',
                    reason: totalChanges === 0
                        ? 'Tier 0 watermark check: 0 monitored entity changes since last check.'
                        : 'Tier 0 watermark check: monitored state hash is unchanged.',
                    watermarks,
                    watermarkHash,
                    promptRunId: null,
                };
            }
        }

        const evaluationContext = this.buildEvaluationContext(
            routine,
            config,
            watermarks,
            sinceDate,
            now,
            forceWakeReached
        );

        // ====================================================================
        // Tier 1: Deterministic SafeExpressionEvaluator Gate (0 LLM tokens)
        // ====================================================================
        const tier1Expression = wakeGate?.tier1Expression?.trim();
        if (tier1Expression && tier1Expression.length > 0) {
            const exprResult = this.expressionEvaluator.evaluate(
                tier1Expression,
                evaluationContext
            );
            if (!exprResult.success) {
                return {
                    shouldWake: false,
                    decidedByTier: 'Tier1',
                    reason: `Tier 1 expression evaluation failed (${exprResult.error ?? 'invalid expression'}) — skipping wake.`,
                    watermarks,
                    watermarkHash,
                    promptRunId: null,
                };
            }
            if (!exprResult.value) {
                return {
                    shouldWake: false,
                    decidedByTier: 'Tier1',
                    reason: `Tier 1 expression '${tier1Expression}' evaluated to false.`,
                    watermarks,
                    watermarkHash,
                    promptRunId: null,
                };
            }
            // If neither Tier 2 nor Tier 3 is configured, Tier 1's true verdict wakes the routine.
            if (!wakeGate?.tier2Decision && !wakeGate?.tier3WakePromptId) {
                return {
                    shouldWake: true,
                    decidedByTier: 'Tier1',
                    reason: `Tier 1 expression '${tier1Expression}' evaluated to true.`,
                    watermarks,
                    watermarkHash,
                    promptRunId: null,
                };
            }
        }

        // ====================================================================
        // Tier 2: Fast Decision Model Gate (AIDecisionRunner)
        // ====================================================================
        if (wakeGate?.tier2Decision) {
            const tier2 = wakeGate.tier2Decision;
            const decisionOutcome = this.deps.runTier2Decision
                ? await this.deps.runTier2Decision(tier2, evaluationContext, contextUser)
                : await this.executeTier2Decision(tier2, evaluationContext, contextUser);

            if (!decisionOutcome.shouldWake) {
                const detail = decisionOutcome.probability != null
                    ? `likelihood ${decisionOutcome.probability.toFixed(2)}`
                    : `choice '${decisionOutcome.selectedChoice ?? 'none'}'`;
                return {
                    shouldWake: false,
                    decidedByTier: 'Tier2',
                    reason: `Tier 2 decision suppressed wake (${detail}).`,
                    watermarks,
                    watermarkHash,
                    promptRunId: decisionOutcome.promptRunId ?? null,
                };
            }

            if (!wakeGate.tier3WakePromptId) {
                const detail = decisionOutcome.probability != null
                    ? `likelihood ${decisionOutcome.probability.toFixed(2)}`
                    : `choice '${decisionOutcome.selectedChoice ?? 'wake'}'`;
                return {
                    shouldWake: true,
                    decidedByTier: 'Tier2',
                    reason: `Tier 2 decision approved wake (${detail}).`,
                    watermarks,
                    watermarkHash,
                    promptRunId: decisionOutcome.promptRunId ?? null,
                };
            }
        }

        // ====================================================================
        // Tier 3: Full AI Prompt Gate (Metadata-backed Prompt)
        // ====================================================================
        const tier3PromptId = wakeGate?.tier3WakePromptId?.trim();
        if (tier3PromptId && tier3PromptId.length > 0) {
            const promptOutcome = this.deps.runTier3Prompt
                ? await this.deps.runTier3Prompt(tier3PromptId, evaluationContext, contextUser)
                : await this.executeTier3Prompt(tier3PromptId, evaluationContext, contextUser);

            return {
                shouldWake: promptOutcome.shouldWake,
                decidedByTier: 'Tier3',
                reason: promptOutcome.reason,
                watermarks,
                watermarkHash,
                promptRunId: promptOutcome.promptRunId ?? null,
            };
        }

        return {
            shouldWake: true,
            decidedByTier: rules.length > 0 ? 'Tier0' : 'None',
            reason: rules.length > 0
                ? 'Tier 0 detected entity updates and all configured gates passed.'
                : 'Routine wake conditions satisfied.',
            watermarks,
            watermarkHash,
            promptRunId: null,
        };
    }

    /** Parse WakeConfigurationObject or fallback to parsing WakeConfiguration JSON string. */
    private resolveWakeConfiguration(routine: MJUserRoutineEntity): MJUserRoutineEntity_IRoutineWakeConfiguration | null {
        if (routine.WakeConfigurationObject) {
            return routine.WakeConfigurationObject;
        }
        if (routine.WakeConfiguration && routine.WakeConfiguration.trim().length > 0) {
            return SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(routine.WakeConfiguration);
        }
        return null;
    }

    /** Build the strongly-typed context object passed to Tier 1, Tier 2, and Tier 3 evaluators. */
    private buildEvaluationContext(
        routine: MJUserRoutineEntity,
        config: MJUserRoutineEntity_IRoutineWakeConfiguration,
        watermarks: Record<string, EntityWatermarkSnapshot>,
        sinceDate: Date | null,
        now: Date,
        forceWakeReached: boolean
    ): Record<string, object | string | number | boolean | null> {
        const minutesSinceLastRun = routine.LastRunAt
            ? Math.max(0, (now.getTime() - routine.LastRunAt.getTime()) / 60_000)
            : null;
        const minutesSinceLastCheck = sinceDate
            ? Math.max(0, (now.getTime() - sinceDate.getTime()) / 60_000)
            : null;
        const totalChangedCount = Object.values(watermarks).reduce(
            (sum, w) => sum + w.changedCount + w.recordChangeCount,
            0
        );

        return {
            routineId: routine.ID,
            routineName: routine.Name,
            routineType: routine.RoutineType,
            scheduleMode: routine.ScheduleMode,
            workstreamKey: config.workstreamKey ?? null,
            wakeReason: config.wakeReason ?? null,
            resumeState: (config.resumeState ?? {}) as Record<string, object | string | number | boolean | null>,
            watermarks,
            deltas: watermarks,
            totalChangedCount,
            minutesSinceLastRun,
            elapsedMinutes: minutesSinceLastRun ?? minutesSinceLastCheck ?? 0,
            minutesSinceLastCheck,
            isScheduledWakeTimeReached: forceWakeReached || (routine.NextRunAt != null && routine.NextRunAt.getTime() <= now.getTime()),
            nowIso: now.toISOString(),
        };
    }

    /**
     * Collect Tier 0 watermark metrics for a single monitored entity using `RunView`
     * and optionally `MJ: Record Changes`.
     */
    private async collectEntityWatermark(
        rule: RoutineWatchedEntityRule,
        sinceDate: Date | null,
        contextUser: UserInfo
    ): Promise<EntityWatermarkSnapshot> {
        const rv = new RunView(); // global-provider-ok: server-global scheduled task
        const baseFilter = rule.extraFilter?.trim() ? `(${rule.extraFilter.trim()})` : '';
        const sinceIso = sinceDate ? sinceDate.toISOString() : null;
        const deltaFilter = sinceIso
            ? (baseFilter ? `${baseFilter} AND __mj_UpdatedAt > '${sinceIso}'` : `__mj_UpdatedAt > '${sinceIso}'`)
            : baseFilter;

        let changedCount = 0;
        let totalMatchingCount = 0;
        let maxUpdatedAt: string | null = null;
        const sampleRecords: Record<string, string | number | boolean | null>[] = [];

        try {
            const [deltaResult, latestResult] = await rv.RunViews<SampleRecordRow>(
                [
                    {
                        EntityName: rule.entityName,
                        ExtraFilter: deltaFilter,
                        OrderBy: '__mj_UpdatedAt DESC',
                        MaxRows: MAX_WATERMARK_SAMPLE_RECORDS,
                        ResultType: 'simple',
                    },
                    {
                        EntityName: rule.entityName,
                        ExtraFilter: baseFilter,
                        OrderBy: '__mj_UpdatedAt DESC',
                        // 2, not 1: a MaxRows: 1 read skips the total count, and totalMatchingCount needs it
                        MaxRows: 2,
                        ResultType: 'simple',
                    },
                ],
                contextUser
            );

            if (deltaResult.Success) {
                changedCount = deltaResult.TotalRowCount ?? deltaResult.Results.length;
                for (const row of deltaResult.Results ?? []) {
                    sampleRecords.push(this.sanitizeSampleRecord(row));
                }
            }
            if (latestResult.Success) {
                totalMatchingCount = latestResult.TotalRowCount ?? latestResult.Results.length;
                const newest = latestResult.Results?.[0] ?? null;
                const rawUpdated = newest ? newest['__mj_UpdatedAt'] : null;
                if (rawUpdated instanceof Date) {
                    maxUpdatedAt = rawUpdated.toISOString();
                } else if (typeof rawUpdated === 'string' && rawUpdated.length > 0) {
                    maxUpdatedAt = new Date(rawUpdated).toISOString();
                }
            }
        } catch (error) {
            LogError(`WakeGateEvaluator: failed to query entity watermark for '${rule.entityName}': ${error instanceof Error ? error.message : String(error)}`);
        }

        let recordChangeCount = 0;
        if (rule.includeRecordChanges && sinceIso) {
            try {
                const rcFilter = `Entity='${rule.entityName.replace(/'/g, "''")}' AND ChangedAt > '${sinceIso}'`;
                const rcResult = await rv.RunView({
                    EntityName: 'MJ: Record Changes',
                    ExtraFilter: rcFilter,
                    ResultType: 'count_only',
                }, contextUser);
                if (rcResult.Success) {
                    recordChangeCount = rcResult.TotalRowCount ?? 0;
                }
            } catch (error) {
                LogError(`WakeGateEvaluator: failed to query MJ: Record Changes for '${rule.entityName}': ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return {
            entityName: rule.entityName,
            changedCount,
            totalMatchingCount,
            maxUpdatedAt,
            recordChangeCount,
            sampleRecords,
        };
    }

    /** Keep only scalar fields in sample records so Tier 2 / Tier 3 state stays compact. */
    private sanitizeSampleRecord(row: SampleRecordRow): Record<string, string | number | boolean | null> {
        const out: Record<string, string | number | boolean | null> = {};
        for (const [key, value] of Object.entries(row)) {
            if (value === null) {
                out[key] = null;
            } else if (typeof value === 'number') {
                out[key] = value;
            } else if (typeof value === 'boolean') {
                out[key] = value;
            } else if (value instanceof Date) {
                out[key] = value.toISOString();
            } else if (typeof value === 'string') {
                out[key] = value.length > 240 ? `${value.substring(0, 239)}…` : value;
            }
        }
        return out;
    }

    /** Normalize wakeIfAtLeast threshold from 0..100 or 0..1 into [0, 1]. */
    private normalizeThreshold(rawThreshold: number | undefined): number {
        if (rawThreshold == null) {
            return DEFAULT_TIER2_THRESHOLD;
        }
        return rawThreshold > 1 ? rawThreshold / 100 : rawThreshold;
    }

    /** Execute Tier 2 fast decision model via `AIDecisionRunner.ExecuteDecision`. */
    private async executeTier2Decision(
        tier2: RoutineTier2DecisionConfig,
        state: Record<string, object | string | number | boolean | null>,
        contextUser: UserInfo
    ): Promise<{ shouldWake: boolean; probability?: number; selectedChoice?: string; promptRunId?: string | null }> {
        try {
            const prompt = await this.loadPrompt(null, DEFAULT_DECISION_PROMPT_NAME, contextUser);
            if (!prompt) {
                LogError('WakeGateEvaluator: Default Decision prompt not found — failing open to wake.');
                return { shouldWake: true, probability: 1 };
            }

            const decisionParams = new AIDecisionParams();
            decisionParams.prompt = prompt;
            decisionParams.contextUser = contextUser;
            decisionParams.State = state;

            const instructions = tier2.additionalInstructions
                ? `${tier2.question}\n\n${tier2.additionalInstructions}`
                : tier2.question;

            if (tier2.type === 'Choice' && tier2.options && tier2.options.length > 0) {
                decisionParams.Questions = {
                    shouldWake: {
                        Kind: 'Choice',
                        Instructions: instructions,
                        Options: tier2.options.map((o) => ({ Value: o.key, Description: o.description })),
                    },
                };
            } else {
                decisionParams.Questions = {
                    shouldWake: {
                        Kind: 'Likelihood',
                        Instructions: instructions,
                    },
                };
            }

            const runner = new AIDecisionRunner();
            const result = await runner.ExecuteDecision(decisionParams);
            if (!result.success) {
                LogError(`WakeGateEvaluator: Tier 2 decision call failed (${result.errorMessage ?? 'unknown'}) — failing open.`);
                return {
                    shouldWake: true,
                    probability: 1,
                    promptRunId: result.promptRun?.ID ?? null,
                };
            }

            const answer = result.Answers['shouldWake'];
            if (answer && answer.Kind === 'Choice') {
                const allowed = tier2.wakeOnChoices ?? ['wake', 'yes', 'true'];
                const shouldWake = allowed.some((c) => c.toLowerCase() === answer.Value.toLowerCase());
                return {
                    shouldWake,
                    selectedChoice: answer.Value,
                    promptRunId: result.promptRun?.ID ?? null,
                };
            }

            const probability = answer && answer.Kind === 'Likelihood' ? answer.Probability : 1;
            const threshold = this.normalizeThreshold(tier2.wakeIfAtLeast);
            return {
                shouldWake: probability >= threshold,
                probability,
                promptRunId: result.promptRun?.ID ?? null,
            };
        } catch (error) {
            LogError(`WakeGateEvaluator: Tier 2 decision threw (${error instanceof Error ? error.message : String(error)}) — failing open.`);
            return { shouldWake: true, probability: 1 };
        }
    }

    /** Execute Tier 3 full prompt via `AIPromptRunner.ExecutePrompt`. */
    private async executeTier3Prompt(
        promptId: string,
        data: Record<string, object | string | number | boolean | null>,
        contextUser: UserInfo
    ): Promise<{ shouldWake: boolean; reason: string; promptRunId?: string | null }> {
        try {
            const prompt = await this.loadPrompt(promptId, null, contextUser);
            if (!prompt) {
                return { shouldWake: true, reason: `Tier 3 prompt ${promptId} not found — failing open.` };
            }

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = data;
            params.contextUser = contextUser;

            const runner = new AIPromptRunner();
            const result = await runner.ExecutePrompt(params);
            if (!result.success) {
                return {
                    shouldWake: false,
                    reason: `Tier 3 prompt failed: ${result.errorMessage ?? 'unknown error'}`,
                    promptRunId: result.promptRun?.ID ?? null,
                };
            }

            const raw = (result.rawResult ?? '').trim();
            const parsed = SafeJSONParse<{ shouldWake?: boolean; reason?: string }>(raw);
            if (parsed && typeof parsed.shouldWake === 'boolean') {
                return {
                    shouldWake: parsed.shouldWake,
                    reason: parsed.reason ?? (parsed.shouldWake ? 'Tier 3 prompt approved wake.' : 'Tier 3 prompt suppressed wake.'),
                    promptRunId: result.promptRun?.ID ?? null,
                };
            }

            const normalized = raw.toLowerCase();
            const shouldWake = normalized === 'true' || normalized === 'yes' || normalized.includes('"shouldwake":true');
            return {
                shouldWake,
                reason: `Tier 3 prompt returned: ${raw.substring(0, 200)}`,
                promptRunId: result.promptRun?.ID ?? null,
            };
        } catch (error) {
            return {
                shouldWake: false,
                reason: `Tier 3 prompt threw: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /** Resolve an `MJAIPromptEntityExtended` by ID or by Name. */
    private async loadPrompt(
        promptId: string | null,
        fallbackName: string | null,
        contextUser: UserInfo
    ): Promise<MJAIPromptEntityExtended | null> {
        const md = new Metadata(); // global-provider-ok: server-global scheduled task
        if (promptId && promptId.trim().length > 0) {
            const prompt = await md.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts', contextUser);
            if (await prompt.Load(promptId)) {
                return prompt;
            }
        }
        if (fallbackName) {
            const rv = new RunView(); // global-provider-ok: server-global scheduled task
            const res = await rv.RunView<MJAIPromptEntityExtended>({
                EntityName: 'MJ: AI Prompts',
                ExtraFilter: `Name='${fallbackName.replace(/'/g, "''")}'`,
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'entity_object',
            }, contextUser);
            if (res.Success && res.Results.length > 0) {
                return res.Results[0];
            }
        }
        return null;
    }
}
