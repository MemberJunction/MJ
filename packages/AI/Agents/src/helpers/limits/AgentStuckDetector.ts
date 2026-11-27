/**
 * @fileoverview Semantic stuck-run detector (`Slice s12 / A7b`) composing alongside
 * {@link DeterministicProgressDetector} inside {@link AgentLimitsHelper}.
 *
 * Detects two failure modes missed by generic error circuit breakers:
 * 1. **Canonical Repeated Tool-Call Breaker:** identical tool/action calls (same normalized name
 *    and canonical key-sorted JSON arguments) repeated `>= IdenticalToolCallThreshold` times
 *    within a sliding window of `WindowSize` calls — first injects a targeted course-correction
 *    directive, then escalates to non-destructive pause (`StuckToolCallLoop`) if ignored.
 * 2. **Read-Without-Act Spiral Detector:** `>= ReadOnlyStepThreshold` (default `30`) consecutive
 *    read-only steps without payload mutations, mutating actions, sub-agent delegations, or
 *    terminal completion — injects a non-lethal Wrap-Up Directive and pauses (`ReadOnlySpiral`)
 *    only after `ReadOnlyPostDirectiveGraceSteps` (default `5`) additional read-only steps.
 *
 * @module @memberjunction/ai-agents
 */

import { LimitsConfigResolver, type MJLimitsStuckDetectorConfig } from '@memberjunction/core';
import type { BaseAgentNextStep, ExecuteAgentParams } from '@memberjunction/ai-core-plus';

/** Combined post-step stuck evaluation result returned by {@link AgentStuckDetector.EvaluateStepDecision}. */
export interface StuckStepEvaluationOutcome {
    /** Directives appended to `params.conversationMessages` on this step (0, 1, or 2). */
    InjectedDirectives: string[];
    /** Non-null when an escalation requires a non-destructive checkpoint pause. */
    PauseRequest: {
        PauseReason: 'StuckToolCallLoop' | 'ReadOnlySpiral';
        Summary: string;
    } | null;
}

/** Outcome returned by {@link AgentStuckDetector.RecordToolCall}. */
export interface StuckToolCallAssessment {
    Action: 'none' | 'inject-directive' | 'pause';
    Fingerprint: string;
    CountInWindow: number;
    Threshold: number;
    Directive?: string;
    PauseReason?: 'StuckToolCallLoop';
    Summary?: string;
}

/** Input describing one completed agent step for {@link AgentStuckDetector.RecordStepOutcome}. */
export interface StuckStepOutcomeInput {
    StepType: string;
    ActionNames?: readonly string[];
    HasPayloadMutation: boolean;
    HasSubAgentDelegation: boolean;
    IsTerminal: boolean;
}

/** Outcome returned by {@link AgentStuckDetector.RecordStepOutcome}. */
export interface StuckReadOnlyAssessment {
    Action: 'none' | 'inject-wrap-up-directive' | 'pause';
    ConsecutiveReadOnlySteps: number;
    Threshold: number;
    Directive?: string;
    PauseReason?: 'ReadOnlySpiral';
    Summary?: string;
}

/** Point-in-time diagnostic snapshot of {@link AgentStuckDetector}. */
export interface AgentStuckDetectorSnapshot {
    RecentToolFingerprints: readonly string[];
    ConsecutiveReadOnlySteps: number;
    WrapUpDirectiveInjectedAtStep: number | null;
    DirectivesInjectedForFingerprints: readonly string[];
    PendingDirectives: readonly string[];
}

/** Optional structured action metadata used to classify read-only vs mutating actions accurately. */
export interface ActionReadOnlyMetadata {
    DisallowWhenTainted?: boolean | null;
    Verb?: string | null;
}

/** Lookup callback resolving structured metadata for an action name when available. */
export type ActionReadOnlyMetadataLookup = (actionName: string) => ActionReadOnlyMetadata | null | undefined;

/** Keywords identifying clearly mutating or side-effecting tool/action names. */
const MUTATING_ACTION_TOKENS: readonly string[] = [
    'create',
    'update',
    'delete',
    'remove',
    'save',
    'upsert',
    'write',
    'edit',
    'patch',
    'send',
    'post',
    'publish',
    'submit',
    'deploy',
    'merge',
    'commit',
    'push',
    'approve',
    'reject',
    'cancel',
    'close',
    'complete',
    'assign',
    'move',
    'upload',
    'modify',
    'set',
    'add',
    'insert',
    'drop',
    'archive',
    'restore',
    'trigger',
    'invoke',
    'execute',
    'log',
];

/** Keywords that indicate mutation only when used as a leading verb (not a noun like 'Get Agent Run'). */
const LEADING_MUTATING_TOKENS: readonly string[] = ['run'];

/** Keywords identifying read-only / investigative tool/action names. */
const READ_ONLY_ACTION_TOKENS: readonly string[] = [
    'get',
    'list',
    'search',
    'find',
    'read',
    'query',
    'fetch',
    'inspect',
    'view',
    'describe',
    'check',
    'status',
    'lookup',
    'count',
    'analyze',
    'diff',
    'cat',
    'head',
    'tail',
    'grep',
    'browse',
    'explore',
    'discover',
    'preview',
    'load',
    'show',
    'select',
];

function tokenizeIdentifier(name: string): string[] {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length > 0);
}

/**
 * Classifies whether an action/tool represents a read-only investigative operation.
 * Prefers structured action metadata (`DisallowWhenTainted`, `Verb`) when available, and falls
 * back to conservative token classification (fail-safe toward recognizing progress/mutation).
 */
export function IsReadOnlyToolOrActionName(
    name: string,
    metadata?: ActionReadOnlyMetadata | null
): boolean {
    if (metadata?.DisallowWhenTainted === true) {
        return false;
    }
    const verb = metadata?.Verb?.trim().toLowerCase();
    if (verb && verb.length > 0) {
        if (MUTATING_ACTION_TOKENS.includes(verb) || LEADING_MUTATING_TOKENS.includes(verb)) {
            return false;
        }
        return READ_ONLY_ACTION_TOKENS.includes(verb);
    }

    const tokens = tokenizeIdentifier(name);
    if (tokens.length === 0) {
        return false;
    }
    if (tokens.some((t) => MUTATING_ACTION_TOKENS.includes(t))) {
        return false;
    }
    if (LEADING_MUTATING_TOKENS.includes(tokens[0])) {
        return false;
    }
    const firstReadIdx = tokens.findIndex((t) => READ_ONLY_ACTION_TOKENS.includes(t));
    if (firstReadIdx === -1) {
        return false;
    }
    // Only treat 'run' as mutating if it appears BEFORE any read-only verb (e.g. 'HubSpot - Run Sync').
    const leadingMutIdx = tokens.findIndex((t) => LEADING_MUTATING_TOKENS.includes(t));
    if (leadingMutIdx !== -1 && leadingMutIdx < firstReadIdx) {
        return false;
    }
    return true;
}

/**
 * Produces deterministic, key-sorted JSON serialization for canonical tool-call fingerprinting.
 */
export function StableSortedJSON(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): string {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return JSON.stringify(value);
    }
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }
    if (Array.isArray(value)) {
        if (seen.has(value)) {
            return '"[Circular]"';
        }
        seen.add(value);
        const rendered = `[${value.map((item) => StableSortedJSON(item, seen)).join(',')}]`;
        seen.delete(value);
        return rendered;
    }
    if (typeof value === 'object') {
        if (seen.has(value)) {
            return '"[Circular]"';
        }
        seen.add(value);
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record)
            .filter((k) => record[k] !== undefined)
            .sort();
        const entries = keys.map((k) => `${JSON.stringify(k)}:${StableSortedJSON(record[k], seen)}`);
        seen.delete(value);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(String(value));
}

/**
 * Computes a deterministic canonical fingerprint (`normalizedName::stableSortedJSON(args)`)
 * for any action, native tool, or client tool invocation.
 */
export function ComputeCanonicalToolFingerprint(toolName: string, args: unknown): string {
    const normalizedName = toolName.trim().toLowerCase();
    return `${normalizedName}::${StableSortedJSON(args ?? {})}`;
}

/**
 * Per-run semantic stuck-run detector tracking repeated canonical tool calls and read-only spirals.
 */
export class AgentStuckDetector {
    private _recentToolFingerprints: string[] = [];
    private readonly _directiveInjectedFingerprints = new Set<string>();
    private _pendingDirectives: string[] = [];
    private _consecutiveReadOnlySteps = 0;
    private _wrapUpDirectiveInjectedAtStep: number | null = null;
    private _lastInvokedBaseFingerprints: string[] = [];
    private readonly _lastResultSigByFingerprint = new Map<string, string>();

    /** Clears all sliding windows and counters at run start or post-approval checkpoint resume. */
    public Reset(): void {
        this._recentToolFingerprints = [];
        this._directiveInjectedFingerprints.clear();
        this._pendingDirectives = [];
        this._consecutiveReadOnlySteps = 0;
        this._wrapUpDirectiveInjectedAtStep = null;
        this._lastInvokedBaseFingerprints = [];
        this._lastResultSigByFingerprint.clear();
    }

    /**
     * Flushes any deferred directives queued during native tool-calling turns once tool results
     * have been appended to `params.conversationMessages` (preventing illegal
     * `assistant(tool_use) -> user(directive) -> tool(results)` ordering).
     */
    public FlushPendingDirectives(params: ExecuteAgentParams): string[] {
        if (this._pendingDirectives.length === 0) {
            return [];
        }
        const flushed = [...this._pendingDirectives];
        this._pendingDirectives = [];
        if (Array.isArray(params.conversationMessages)) {
            for (const directive of flushed) {
                params.conversationMessages.push({
                    role: 'user',
                    content: directive,
                });
            }
        }
        return flushed;
    }

    /**
     * Records a tool/action invocation and checks whether the same canonical call has repeated
     * `>= config.IdenticalToolCallThreshold` times within the last `config.WindowSize` calls.
     *
     * When `resultHash` is supplied and differs across polling calls (e.g., job status changing
     * from `queued` to `running`), calls do not collide as identical stuck loops. An intervening
     * mutating call resets the sliding window so `list -> create -> list` never false-positives.
     */
    public RecordToolCall(
        toolName: string,
        args: unknown,
        config: MJLimitsStuckDetectorConfig = LimitsConfigResolver.Resolve().Limits.StuckDetector,
        resultHash?: string | null,
        actionMetadata?: ActionReadOnlyMetadata | null
    ): StuckToolCallAssessment {
        const baseFingerprint = ComputeCanonicalToolFingerprint(toolName, args);
        const fingerprint =
            resultHash && resultHash.length > 0 ? `${baseFingerprint}::r=${resultHash}` : baseFingerprint;
        const threshold = Math.max(2, config.IdenticalToolCallThreshold);
        if (!config.Enabled) {
            return { Action: 'none', Fingerprint: fingerprint, CountInWindow: 0, Threshold: threshold };
        }

        const windowSize = Math.max(threshold, config.WindowSize);
        this._recentToolFingerprints.push(fingerprint);
        if (this._recentToolFingerprints.length > windowSize) {
            this._recentToolFingerprints.splice(0, this._recentToolFingerprints.length - windowSize);
        }
        this.pruneAgedDirectiveFingerprints();

        let countInWindow = 0;
        for (const fp of this._recentToolFingerprints) {
            if (fp === fingerprint) {
                countInWindow++;
            }
        }

        // If a non-read-only (mutating) call ran with a fresh fingerprint (not itself repeating),
        // clear older read-only fingerprints so `list -> create -> list` resets cleanly.
        if (countInWindow === 1 && !IsReadOnlyToolOrActionName(toolName, actionMetadata)) {
            this._recentToolFingerprints = [fingerprint];
            this.pruneAgedDirectiveFingerprints();
        }

        if (countInWindow < threshold) {
            return { Action: 'none', Fingerprint: fingerprint, CountInWindow: countInWindow, Threshold: threshold };
        }

        if (!this._directiveInjectedFingerprints.has(fingerprint)) {
            this._directiveInjectedFingerprints.add(fingerprint);
            return {
                Action: 'inject-directive',
                Fingerprint: fingerprint,
                CountInWindow: countInWindow,
                Threshold: threshold,
                Directive:
                    `[System Course-Correction] You have invoked '${toolName}' with identical arguments ` +
                    `${countInWindow} times within your last ${this._recentToolFingerprints.length} tool calls. ` +
                    `Do NOT repeat the exact same call again. Either change your parameters/approach or ` +
                    `synthesize your findings and conclude now.`,
            };
        }

        return {
            Action: 'pause',
            Fingerprint: fingerprint,
            CountInWindow: countInWindow,
            Threshold: threshold,
            PauseReason: 'StuckToolCallLoop',
            Summary:
                `Agent repeated identical tool call '${toolName}' ${countInWindow} times within the last ` +
                `${this._recentToolFingerprints.length} tool calls despite a course-correction directive.`,
        };
    }

    /**
     * Records a completed agent step outcome and checks for a read-without-act spiral.
     */
    public RecordStepOutcome(
        outcome: StuckStepOutcomeInput,
        config: MJLimitsStuckDetectorConfig = LimitsConfigResolver.Resolve().Limits.StuckDetector,
        actionMetadataLookup?: ActionReadOnlyMetadataLookup
    ): StuckReadOnlyAssessment {
        const threshold = Math.max(1, config.ReadOnlyStepThreshold);
        if (!config.Enabled) {
            return { Action: 'none', ConsecutiveReadOnlySteps: 0, Threshold: threshold };
        }

        if (outcome.IsTerminal || outcome.HasPayloadMutation || outcome.HasSubAgentDelegation) {
            this.resetReadOnlyStreak();
            if (outcome.HasPayloadMutation || outcome.HasSubAgentDelegation) {
                this.resetToolLoopWindow();
            }
            return { Action: 'none', ConsecutiveReadOnlySteps: 0, Threshold: threshold };
        }

        const stepType = outcome.StepType;
        if (stepType === 'Sub-Agent' || stepType === 'Tasks' || stepType === 'Handoff' || stepType === 'Plan') {
            this.resetReadOnlyStreak();
            this.resetToolLoopWindow();
            return { Action: 'none', ConsecutiveReadOnlySteps: 0, Threshold: threshold };
        }

        const actionNames = outcome.ActionNames ?? [];
        if (actionNames.length > 0) {
            const allReadOnly = actionNames.every((name) =>
                IsReadOnlyToolOrActionName(name, actionMetadataLookup?.(name))
            );
            if (!allReadOnly) {
                this.resetReadOnlyStreak();
                return { Action: 'none', ConsecutiveReadOnlySteps: 0, Threshold: threshold };
            }
            this._consecutiveReadOnlySteps++;
        } else if (stepType === 'Retry') {
            this._consecutiveReadOnlySteps++;
        } else {
            return { Action: 'none', ConsecutiveReadOnlySteps: this._consecutiveReadOnlySteps, Threshold: threshold };
        }

        if (this._wrapUpDirectiveInjectedAtStep === null && this._consecutiveReadOnlySteps >= threshold) {
            this._wrapUpDirectiveInjectedAtStep = this._consecutiveReadOnlySteps;
            return {
                Action: 'inject-wrap-up-directive',
                ConsecutiveReadOnlySteps: this._consecutiveReadOnlySteps,
                Threshold: threshold,
                Directive:
                    `You have completed ${this._consecutiveReadOnlySteps} consecutive read-only investigation steps ` +
                    `without producing a final output or invoking a terminal action. Synthesize what you have gathered ` +
                    `so far and either call your required terminal action or return your final response on this turn. ` +
                    `Do not perform additional exploratory reads unless strictly required to fix a concrete gap.`,
            };
        }

        const graceSteps = Math.max(1, config.ReadOnlyPostDirectiveGraceSteps);
        if (
            this._wrapUpDirectiveInjectedAtStep !== null &&
            this._consecutiveReadOnlySteps >= this._wrapUpDirectiveInjectedAtStep + graceSteps
        ) {
            return {
                Action: 'pause',
                ConsecutiveReadOnlySteps: this._consecutiveReadOnlySteps,
                Threshold: threshold,
                PauseReason: 'ReadOnlySpiral',
                Summary:
                    `Agent performed ${this._consecutiveReadOnlySteps} consecutive read-only steps ` +
                    `(${graceSteps} steps past the wrap-up directive at step ${this._wrapUpDirectiveInjectedAtStep}) ` +
                    `without mutating state or concluding.`,
            };
        }

        return { Action: 'none', ConsecutiveReadOnlySteps: this._consecutiveReadOnlySteps, Threshold: threshold };
    }

    /**
     * Evaluates a completed non-terminal step decision for both repeated canonical tool/action
     * loops and read-only spirals, injecting any course-correction or wrap-up directives onto
     * `params.conversationMessages` (or deferring them until after tool results on native
     * tool-calling turns) and returning a pause request only when escalation triggers.
     */
    public EvaluateStepDecision<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        config: MJLimitsStuckDetectorConfig = LimitsConfigResolver.Resolve().Limits.StuckDetector,
        circuitBrokenActionNames?: ReadonlySet<string>,
        actionMetadataLookup?: ActionReadOnlyMetadataLookup
    ): StuckStepEvaluationOutcome {
        if (!config.Enabled) {
            return { InjectedDirectives: [], PauseRequest: null };
        }
        const injectedDirectives: string[] = [];
        let pauseRequest: StuckStepEvaluationOutcome['PauseRequest'] = null;

        const invokedBaseFingerprints: string[] = [];
        const recordToolInvocation = (name: string, args: unknown): void => {
            actionNames.push(name);
            if (circuitBrokenActionNames?.has(name)) {
                return;
            }
            invokedBaseFingerprints.push(ComputeCanonicalToolFingerprint(name, args));
            const toolEval = this.RecordToolCall(name, args, config, undefined, actionMetadataLookup?.(name));
            if (toolEval.Action === 'inject-directive' && toolEval.Directive) {
                injectedDirectives.push(toolEval.Directive);
            } else if (toolEval.Action === 'pause' && toolEval.PauseReason && !pauseRequest) {
                pauseRequest = {
                    PauseReason: toolEval.PauseReason,
                    Summary: toolEval.Summary ?? `Repeated identical tool call '${name}'`,
                };
            }
        };

        const actionNames: string[] = [];
        if (nextStep.actions && nextStep.actions.length > 0) {
            for (const act of nextStep.actions) {
                recordToolInvocation(act.name, act.params);
            }
        }

        if (nextStep.clientTools && nextStep.clientTools.length > 0) {
            for (const tool of nextStep.clientTools) {
                recordToolInvocation(tool.Name, tool.Params);
            }
        }

        // Inline turn tools (artifact, conversation, agent tools, and memory writes) are also
        // tracked so repeated identical inline calls trigger StuckToolCallLoop and mutating
        // writes reset the read-only streak accurately.
        if (nextStep.artifactToolCalls && nextStep.artifactToolCalls.length > 0) {
            for (const call of nextStep.artifactToolCalls) {
                recordToolInvocation(call.tool, call.input);
            }
        }
        if (nextStep.conversationToolCalls && nextStep.conversationToolCalls.length > 0) {
            for (const call of nextStep.conversationToolCalls) {
                recordToolInvocation(call.tool, call.input);
            }
        }
        if (nextStep.agentToolCalls && nextStep.agentToolCalls.length > 0) {
            for (const call of nextStep.agentToolCalls) {
                recordToolInvocation(call.toolName, call.arguments);
            }
        }

        const hasInlineMemoryWrite = Array.isArray(nextStep.memoryWrites) && nextStep.memoryWrites.length > 0;
        const hasPayloadMutation = Boolean(
            hasInlineMemoryWrite ||
                (nextStep.payloadChangeRequest &&
                    ((nextStep.payloadChangeRequest.newElements &&
                        Object.keys(nextStep.payloadChangeRequest.newElements).length > 0) ||
                        (nextStep.payloadChangeRequest.updateElements &&
                            Object.keys(nextStep.payloadChangeRequest.updateElements).length > 0) ||
                        (nextStep.payloadChangeRequest.removeElements &&
                            Object.keys(nextStep.payloadChangeRequest.removeElements).length > 0)))
        );

        // Distinguish synthetic post-action / post-subagent / post-loop `step: 'Retry'` continuations
        // (carrying `priorStepResult` from an already-evaluated step) so they neither double-count
        // `_consecutiveReadOnlySteps` nor trigger false `ReadOnlySpiral` pauses after mutating actions.
        const isSyntheticPostStepRetry =
            nextStep.step === 'Retry' &&
            nextStep.priorStepResult !== undefined &&
            actionNames.length === 0;

        if (invokedBaseFingerprints.length > 0) {
            this._lastInvokedBaseFingerprints = invokedBaseFingerprints;
        }

        // Per-fingerprint result tracking (R2-1): if a step carries `priorStepResult` (either on
        // the synthetic post-action Retry continuation or directly on the step), compare the
        // result signature ONLY against the previous result for the same canonical fingerprint(s).
        // When a specific polled call returns a NEW result (e.g. job status queued -> running),
        // evict prior entries for THAT fingerprint only — preserving other fingerprints in the
        // window so two-call A-B-A-B oscillations and repeated identical mutating calls are still caught!
        if (nextStep.priorStepResult !== undefined && this._lastInvokedBaseFingerprints.length > 0) {
            const resultSig = StableSortedJSON(nextStep.priorStepResult);
            for (const baseFp of this._lastInvokedBaseFingerprints) {
                const prevSig = this._lastResultSigByFingerprint.get(baseFp);
                if (prevSig !== undefined && prevSig !== resultSig) {
                    // Keep only the latest entry for this advancing fingerprint so it counts as 1 fresh call.
                    let keptLatest = false;
                    for (let i = this._recentToolFingerprints.length - 1; i >= 0; i--) {
                        if (this._recentToolFingerprints[i] === baseFp) {
                            if (!keptLatest) {
                                keptLatest = true;
                            } else {
                                this._recentToolFingerprints.splice(i, 1);
                            }
                        }
                    }
                    this._directiveInjectedFingerprints.delete(baseFp);
                }
                this._lastResultSigByFingerprint.set(baseFp, resultSig);
            }
        }

        if (isSyntheticPostStepRetry) {
            let priorMutated = hasPayloadMutation;
            if (!priorMutated && Array.isArray(nextStep.priorStepResult)) {
                for (const item of nextStep.priorStepResult) {
                    if (!item || typeof item !== 'object') continue;
                    const summary = item as { success?: boolean; actionName?: string; name?: string };
                    const executedName = summary.actionName ?? summary.name;
                    if (
                        summary.success !== false &&
                        executedName &&
                        !IsReadOnlyToolOrActionName(executedName, actionMetadataLookup?.(executedName))
                    ) {
                        priorMutated = true;
                        break;
                    }
                }
            }
            if (priorMutated) {
                // Only reset the read-only streak here — do NOT wipe `_recentToolFingerprints`,
                // otherwise repeated identical mutating calls (`Send Email {same args}` x4) would
                // never accumulate above 1! (`RecordToolCall` already handles `list -> create -> list`.)
                this.resetReadOnlyStreak();
            }
        } else {
            const readOnlyEval = this.RecordStepOutcome(
                {
                    StepType: nextStep.step ?? 'Unknown',
                    ActionNames: actionNames,
                    HasPayloadMutation: hasPayloadMutation,
                    HasSubAgentDelegation: nextStep.step === 'Sub-Agent' || Boolean(nextStep.subAgent),
                    IsTerminal: nextStep.terminate === true || nextStep.step === 'Success' || nextStep.step === 'Chat',
                },
                config,
                actionMetadataLookup
            );
            if (readOnlyEval.Action === 'inject-wrap-up-directive' && readOnlyEval.Directive) {
                injectedDirectives.push(readOnlyEval.Directive);
            } else if (readOnlyEval.Action === 'pause' && readOnlyEval.PauseReason && !pauseRequest) {
                pauseRequest = {
                    PauseReason: readOnlyEval.PauseReason,
                    Summary: readOnlyEval.Summary ?? 'Consecutive read-only spiral exceeded grace window',
                };
            }
        }

        if (injectedDirectives.length > 0) {
            const hasTrailingUnansweredToolCalls = (() => {
                const msgs = params.conversationMessages;
                if (!Array.isArray(msgs) || msgs.length === 0) return false;
                const last = msgs[msgs.length - 1] as { role?: string; toolCalls?: unknown[] };
                return last.role === 'assistant' && Array.isArray(last.toolCalls) && last.toolCalls.length > 0;
            })();
            if (nextStep.nativeTurn?.sendResultsNatively || hasTrailingUnansweredToolCalls) {
                this._pendingDirectives.push(...injectedDirectives);
            } else if (Array.isArray(params.conversationMessages)) {
                for (const directive of injectedDirectives) {
                    params.conversationMessages.push({
                        role: 'user',
                        content: directive,
                    });
                }
            }
        }

        return { InjectedDirectives: injectedDirectives, PauseRequest: pauseRequest };
    }

    /** Returns an immutable diagnostic snapshot. */
    public GetSnapshot(): AgentStuckDetectorSnapshot {
        return {
            RecentToolFingerprints: [...this._recentToolFingerprints],
            ConsecutiveReadOnlySteps: this._consecutiveReadOnlySteps,
            WrapUpDirectiveInjectedAtStep: this._wrapUpDirectiveInjectedAtStep,
            DirectivesInjectedForFingerprints: Array.from(this._directiveInjectedFingerprints),
            PendingDirectives: [...this._pendingDirectives],
        };
    }

    private resetReadOnlyStreak(): void {
        this._consecutiveReadOnlySteps = 0;
        this._wrapUpDirectiveInjectedAtStep = null;
    }

    private resetToolLoopWindow(): void {
        this._recentToolFingerprints = [];
        this._directiveInjectedFingerprints.clear();
    }

    private pruneAgedDirectiveFingerprints(): void {
        if (this._directiveInjectedFingerprints.size === 0) {
            return;
        }
        const active = new Set(this._recentToolFingerprints);
        for (const fp of this._directiveInjectedFingerprints) {
            if (!active.has(fp)) {
                this._directiveInjectedFingerprints.delete(fp);
            }
        }
    }
}
