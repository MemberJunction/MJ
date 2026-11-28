/**
 * @fileoverview Singleton registry resolving built-in and metadata/programmatically
 * registered {@link BaseAgentStepHandler} plugins (Extension Point #1).
 *
 * Resolution order for a step key (e.g. `'Actions'` or a custom OpenApp `'ApprovalGate'`):
 * 1. Programmatic registration via {@link AgentStepTypeRegistry.RegisterStepType} (code-only OpenApp plugins / tests)
 * 2. Active metadata row in `AIEngine.Instance.AgentStepTypes` (`MJ: AI Agent Step Types`)
 * 3. Built-in 14 default descriptors (fallback when metadata is not seeded in unit tests)
 *
 * Handler instances are always constructed through `MJGlobal.Instance.ClassFactory`
 * (`@RegisterClass(BaseAgentStepHandler, '<DriverClass>')`), so higher-priority
 * `@RegisterClass` overrides work automatically for every built-in and custom step type.
 *
 * @module @memberjunction/ai-agents
 */

import type { AgentNextStepKey, BuiltInAgentNextStepKey } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIAgentStepTypeEntity } from '@memberjunction/core-entities';
import { BaseSingleton, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { BaseAgentStepHandler } from './BaseAgentStepHandler';
import {
    ActionsStepHandler,
    ChatStepHandler,
    ClientToolsStepHandler,
    DecisionStepHandler,
    FailedStepHandler,
    ForEachStepHandler,
    HandoffStepHandler,
    PlanStepHandler,
    RetryStepHandler,
    SkillStepHandler,
    SubAgentStepHandler,
    SuccessStepHandler,
    TasksStepHandler,
    WhileStepHandler,
} from './BuiltInAgentStepHandlers';

/** Constructor signature for a zero-arg {@link BaseAgentStepHandler} subclass. */
export type AgentStepHandlerConstructor = new () => BaseAgentStepHandler;

/** Scope enum derived directly from `MJAIAgentStepTypeEntity['AppliesTo']`. */
export type AgentStepTypeAppliesTo = MJAIAgentStepTypeEntity['AppliesTo'];

/**
 * Descriptor used for built-in defaults or programmatic OpenApp step-type registration.
 */
export interface AgentStepTypeDescriptor {
    /** Canonical step key emitted in `BaseAgentNextStep.step`. */
    StepKey: AgentNextStepKey;
    /** Optional `AIAgentStepType.ID` when backed by metadata. */
    StepTypeID?: string;
    /** Registered `@RegisterClass(BaseAgentStepHandler, DriverClass)` key. */
    DriverClass: string;
    /** Which agent types may invoke this step type. */
    AppliesTo?: AgentStepTypeAppliesTo;
    /** Whether this step may execute while Plan Mode is active and unapproved. */
    AllowedInUnapprovedPlanMode?: boolean;
    /** Whether this step counts against the run/tree execution budget before dispatch. */
    CountsAgainstTreeBudget?: boolean;
    /** Whether this step's prompt instructions are injected into Loop prompts by default. */
    DefaultEnabledInPrompt?: boolean;
    /** Optional prompt instructions teaching the LLM how to emit this step type. */
    PromptInstructions?: string | null;
    /** Optional JSON Schema validating `customStepData` before handler execution (`AIAgentStepType.ResponseSchemaSnippet` or `Configuration.configSchema`). */
    ConfigSchema?: string | null;
    /** Optional direct constructor fallback used when `ClassFactory` has been cleared in unit tests. */
    FallbackClass?: AgentStepHandlerConstructor;
}

/**
 * Effective policy and instantiated handler returned by {@link AgentStepTypeRegistry.ResolveEffectivePolicy}.
 */
export interface ResolvedAgentStepTypePolicy {
    StepKey: AgentNextStepKey;
    StepTypeID?: string;
    DriverClass: string;
    AppliesTo: AgentStepTypeAppliesTo;
    AllowedInUnapprovedPlanMode: boolean;
    CountsAgainstTreeBudget: boolean;
    DefaultEnabledInPrompt: boolean;
    PromptInstructions: string | null;
    ConfigSchema: string | null;
    IsBuiltIn: boolean;
    Handler: BaseAgentStepHandler;
}

interface BuiltInStepDefault {
    StepKey: BuiltInAgentNextStepKey;
    DriverClass: string;
    AppliesTo: AgentStepTypeAppliesTo;
    AllowedInUnapprovedPlanMode: boolean;
    CountsAgainstTreeBudget: boolean;
    FallbackClass: AgentStepHandlerConstructor;
}

const BUILT_IN_STEP_DEFAULTS: ReadonlyArray<BuiltInStepDefault> = [
    { StepKey: 'Actions', DriverClass: 'ActionsStepHandler', AppliesTo: 'Both', AllowedInUnapprovedPlanMode: false, CountsAgainstTreeBudget: true, FallbackClass: ActionsStepHandler },
    { StepKey: 'Sub-Agent', DriverClass: 'SubAgentStepHandler', AppliesTo: 'Both', AllowedInUnapprovedPlanMode: false, CountsAgainstTreeBudget: true, FallbackClass: SubAgentStepHandler },
    { StepKey: 'Retry', DriverClass: 'RetryStepHandler', AppliesTo: 'All', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true, FallbackClass: RetryStepHandler },
    { StepKey: 'Success', DriverClass: 'SuccessStepHandler', AppliesTo: 'All', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true, FallbackClass: SuccessStepHandler },
    { StepKey: 'Failed', DriverClass: 'FailedStepHandler', AppliesTo: 'All', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true, FallbackClass: FailedStepHandler },
    { StepKey: 'Chat', DriverClass: 'ChatStepHandler', AppliesTo: 'Both', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: false, FallbackClass: ChatStepHandler },
    { StepKey: 'ForEach', DriverClass: 'ForEachStepHandler', AppliesTo: 'Both', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true, FallbackClass: ForEachStepHandler },
    { StepKey: 'While', DriverClass: 'WhileStepHandler', AppliesTo: 'Both', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true, FallbackClass: WhileStepHandler },
    { StepKey: 'Skill', DriverClass: 'SkillStepHandler', AppliesTo: 'Loop', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true, FallbackClass: SkillStepHandler },
    { StepKey: 'Plan', DriverClass: 'PlanStepHandler', AppliesTo: 'Loop', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true, FallbackClass: PlanStepHandler },
    { StepKey: 'Tasks', DriverClass: 'TasksStepHandler', AppliesTo: 'Both', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true, FallbackClass: TasksStepHandler },
    { StepKey: 'Handoff', DriverClass: 'HandoffStepHandler', AppliesTo: 'Loop', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true, FallbackClass: HandoffStepHandler },
    { StepKey: 'ClientTools', DriverClass: 'ClientToolsStepHandler', AppliesTo: 'Loop', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true, FallbackClass: ClientToolsStepHandler },
    { StepKey: 'Decision', DriverClass: 'DecisionStepHandler', AppliesTo: 'Both', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true, FallbackClass: DecisionStepHandler },
];

const BUILT_IN_BY_KEY = new Map<string, BuiltInStepDefault>(
    BUILT_IN_STEP_DEFAULTS.map((d) => [d.StepKey.toLowerCase(), d])
);

/**
 * Process-wide singleton registry backing Extension Point #1 (pluggable agent step types).
 */
export class AgentStepTypeRegistry extends BaseSingleton<AgentStepTypeRegistry> {
    private readonly _programmatic = new Map<string, AgentStepTypeDescriptor>();

    public constructor() {
        super();
    }

    public static get Instance(): AgentStepTypeRegistry {
        return AgentStepTypeRegistry.getInstance<AgentStepTypeRegistry>();
    }

    /**
     * Registers (or replaces) a programmatic step-type descriptor for code-only OpenApp
     * plugins or unit tests.
     */
    public RegisterStepType(descriptor: AgentStepTypeDescriptor): void {
        const key = descriptor.StepKey.trim().toLowerCase();
        if (!key) {
            throw new Error('AgentStepTypeRegistry.RegisterStepType requires a non-empty StepKey.');
        }
        this._programmatic.set(key, descriptor);
    }

    /**
     * Removes a previously registered programmatic step-type descriptor.
     */
    public UnregisterStepType(stepKey: string): void {
        this._programmatic.delete(stepKey.trim().toLowerCase());
    }

    /**
     * Clears all programmatic registrations (primarily for test teardown).
     */
    public ClearProgrammaticRegistrations(): void {
        this._programmatic.clear();
    }

    /**
     * Returns `true` when `stepKey` resolves to a built-in step type (one of the 14 core keys).
     */
    public IsBuiltInStepType(stepKey: string): boolean {
        return BUILT_IN_BY_KEY.has(stepKey.trim().toLowerCase());
    }

    /**
     * Resolves the effective step policy and handler instance for `stepKey`, or `null` if
     * the step key is unregistered / inactive.
     */
    public ResolveEffectivePolicy(stepKey: AgentNextStepKey | null | undefined): ResolvedAgentStepTypePolicy | null {
        if (typeof stepKey !== 'string' || stepKey.trim().length === 0) {
            return null;
        }
        const normalized = stepKey.trim().toLowerCase();
        const builtIn = BUILT_IN_BY_KEY.get(normalized);
        const programmatic = this._programmatic.get(normalized);
        const metadataRow = this.findMetadataRow(normalized);

        if (programmatic) {
            const handler = this.instantiateHandler(
                programmatic.DriverClass,
                programmatic.FallbackClass ?? builtIn?.FallbackClass
            );
            if (!handler) {
                return null;
            }
            return {
                StepKey: programmatic.StepKey,
                StepTypeID: programmatic.StepTypeID ?? metadataRow?.ID,
                DriverClass: programmatic.DriverClass,
                AppliesTo: programmatic.AppliesTo ?? builtIn?.AppliesTo ?? 'Loop',
                AllowedInUnapprovedPlanMode:
                    programmatic.AllowedInUnapprovedPlanMode ?? handler.AllowedInUnapprovedPlanMode,
                CountsAgainstTreeBudget:
                    programmatic.CountsAgainstTreeBudget ?? handler.CountsAgainstTreeBudget,
                DefaultEnabledInPrompt: programmatic.DefaultEnabledInPrompt ?? true,
                PromptInstructions: programmatic.PromptInstructions ?? null,
                ConfigSchema: programmatic.ConfigSchema ?? (metadataRow ? this.resolveMetadataConfigSchema(metadataRow) : null),
                IsBuiltIn: Boolean(builtIn),
                Handler: handler,
            };
        }

        if (metadataRow) {
            // Built-in step types cannot be disabled or re-scoped via DB metadata edits (prevents
            // accidentally bricking every agent with "Invalid next step").
            if (!builtIn && metadataRow.Status !== 'Active') {
                return null;
            }
            // Clamp built-in step type security invariants so DB metadata edits can never weaken
            // Plan Mode restrictions, skip tree-budget accounting, or hijack built-in DriverClass.
            // For custom step types, also fail CLOSED against the code handler's declared flags
            // (`row && handler` for AllowedInUnapprovedPlanMode; `row || handler` for budget).
            const effectiveDriverClass = builtIn ? builtIn.DriverClass : metadataRow.DriverClass;
            const handler = this.instantiateHandler(effectiveDriverClass, builtIn?.FallbackClass);
            if (!handler) {
                return null;
            }
            return {
                StepKey: builtIn ? builtIn.StepKey : metadataRow.Name,
                StepTypeID: metadataRow.ID,
                DriverClass: effectiveDriverClass,
                AppliesTo: builtIn ? builtIn.AppliesTo : metadataRow.AppliesTo,
                AllowedInUnapprovedPlanMode: builtIn
                    ? builtIn.AllowedInUnapprovedPlanMode && metadataRow.AllowedInUnapprovedPlanMode
                    : Boolean(metadataRow.AllowedInUnapprovedPlanMode) && handler.AllowedInUnapprovedPlanMode,
                CountsAgainstTreeBudget: builtIn
                    ? builtIn.CountsAgainstTreeBudget || metadataRow.CountsAgainstTreeBudget
                    : Boolean(metadataRow.CountsAgainstTreeBudget) || handler.CountsAgainstTreeBudget,
                DefaultEnabledInPrompt: metadataRow.DefaultEnabledInPrompt,
                PromptInstructions: metadataRow.PromptDocsTemplate ?? null,
                ConfigSchema: this.resolveMetadataConfigSchema(metadataRow),
                IsBuiltIn: Boolean(builtIn),
                Handler: handler,
            };
        }

        if (builtIn) {
            const handler = this.instantiateHandler(builtIn.DriverClass, builtIn.FallbackClass);
            if (!handler) {
                return null;
            }
            return {
                StepKey: builtIn.StepKey,
                DriverClass: builtIn.DriverClass,
                AppliesTo: builtIn.AppliesTo,
                AllowedInUnapprovedPlanMode: builtIn.AllowedInUnapprovedPlanMode,
                CountsAgainstTreeBudget: builtIn.CountsAgainstTreeBudget,
                DefaultEnabledInPrompt: true,
                PromptInstructions: null,
                ConfigSchema: null,
                IsBuiltIn: true,
                Handler: handler,
            };
        }

        return null;
    }

    /**
     * Resolves an effective step policy by `AIAgentStepType.ID` (used by Flow `Custom` steps
     * referencing `AIAgentStep.StepTypeID`). Returns `null` if no matching active step type exists.
     */
    public ResolveEffectivePolicyByID(stepTypeId: string | null | undefined): ResolvedAgentStepTypePolicy | null {
        if (typeof stepTypeId !== 'string' || stepTypeId.trim().length === 0) {
            return null;
        }
        for (const desc of this._programmatic.values()) {
            if (desc.StepTypeID && UUIDsEqual(desc.StepTypeID, stepTypeId)) {
                return this.ResolveEffectivePolicy(desc.StepKey);
            }
        }
        for (const row of this.safeMetadataRows()) {
            if (UUIDsEqual(row.ID, stepTypeId)) {
                return this.ResolveEffectivePolicy(row.Name);
            }
        }
        return null;
    }

    /**
     * Lists active non-built-in step types applicable to `scope` whose prompt instructions should
     * be surfaced in prompt assembly (`DefaultEnabledInPrompt === true`).
     */
    public GetActiveCustomStepPolicies(scope?: 'Loop' | 'Flow'): ResolvedAgentStepTypePolicy[] {
        const keys = new Set<string>();
        for (const key of this._programmatic.keys()) {
            if (!BUILT_IN_BY_KEY.has(key)) {
                keys.add(key);
            }
        }
        for (const row of this.safeMetadataRows()) {
            const key = row.Name?.trim().toLowerCase();
            if (key && !BUILT_IN_BY_KEY.has(key) && row.Status === 'Active') {
                keys.add(key);
            }
        }

        const results: ResolvedAgentStepTypePolicy[] = [];
        for (const key of keys) {
            const policy = this.ResolveEffectivePolicy(key);
            if (!policy || policy.IsBuiltIn) {
                continue;
            }
            if (scope && !this.appliesToScope(policy.AppliesTo, scope)) {
                continue;
            }
            results.push(policy);
        }
        return results;
    }

    /**
     * Checks whether a step type's `AppliesTo` scope permits execution under the given agent type name.
     * Unknown or custom agent type names (not `'Loop'` or `'Flow'`) are allowed only when
     * `AppliesTo === 'All'` or `'Both'`, or when `agentTypeName` is absent (e.g. unit test mocks).
     */
    public DoesStepApplyToAgentType(
        appliesTo: AgentStepTypeAppliesTo,
        agentTypeName: string | null | undefined
    ): boolean {
        if (appliesTo === 'All' || appliesTo === 'Both' || !agentTypeName) {
            return true;
        }
        const normalized = agentTypeName.trim().toLowerCase();
        if (normalized.includes('loop')) {
            return appliesTo === 'Loop';
        }
        if (normalized.includes('flow')) {
            return appliesTo === 'Flow';
        }
        return true;
    }

    private appliesToScope(appliesTo: AgentStepTypeAppliesTo, scope: 'Loop' | 'Flow'): boolean {
        if (appliesTo === 'All' || appliesTo === 'Both') {
            return true;
        }
        return appliesTo === scope;
    }

    private safeMetadataRows(): ReadonlyArray<MJAIAgentStepTypeEntity> {
        try {
            const rows = AIEngine.Instance?.AgentStepTypes;
            return Array.isArray(rows) ? rows : [];
        } catch {
            return [];
        }
    }

    private resolveMetadataConfigSchema(row: MJAIAgentStepTypeEntity): string | null {
        if (row.ResponseSchemaSnippet && row.ResponseSchemaSnippet.trim().length > 0) {
            return row.ResponseSchemaSnippet;
        }
        if (row.Configuration && row.Configuration.trim().length > 0) {
            try {
                const parsed: unknown = JSON.parse(row.Configuration);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const schema = (parsed as Record<string, unknown>)['configSchema'];
                    if (typeof schema === 'string' && schema.trim().length > 0) {
                        return schema;
                    }
                    if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
                        return JSON.stringify(schema);
                    }
                }
            } catch {
                // Ignore malformed Configuration JSON when probing optional configSchema
            }
        }
        return null;
    }

    private findMetadataRow(normalizedKey: string): MJAIAgentStepTypeEntity | undefined {
        for (const row of this.safeMetadataRows()) {
            if (row.Name?.trim().toLowerCase() === normalizedKey) {
                return row;
            }
        }
        return undefined;
    }

    private instantiateHandler(
        driverClass: string,
        fallbackClass?: AgentStepHandlerConstructor
    ): BaseAgentStepHandler | null {
        const trimmed = driverClass.trim();
        if (trimmed.length > 0) {
            const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseAgentStepHandler>(
                BaseAgentStepHandler,
                trimmed
            );
            if (resolved.Resolved && resolved.Instance) {
                return resolved.Instance;
            }
        }
        if (fallbackClass) {
            return new fallbackClass();
        }
        return null;
    }
}
