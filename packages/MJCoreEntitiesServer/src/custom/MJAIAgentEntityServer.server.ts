import {
    BaseEntity,
    EntityDeleteOptions,
    EntitySaveOptions,
    IEntityDataProvider,
    IMetadataProvider,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { EscapeSQLString, IndexByUUID, RegisterClass, UUIDsEqual, UUIDSet } from '@memberjunction/global';
import { MJAIAgentEntity, MJAIAgentPermissionEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import {
    IsForbiddenMetadataHelperSeam,
    MAX_AGENT_INHERITANCE_DEPTH,
    MJAIAgentEntityExtended,
    ParseAgentConfiguration,
    ParseAgentHelperPlugins,
    ParseAgentInstantiationConfig,
    SyncAgentLegacyColumnsAndConfiguration,
    ValidateAgentConfigurationJson,
    type LegacyAIAgentConfigColumns,
} from '@memberjunction/ai-core-plus';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { ValidateJsonAgainstSchemaLite } from './json-schema-lite';

const ADMIN_ROLE_NAMES = new Set([
    'system administrator',
    'administrator',
    'admin',
    'administration',
    'agent administrator',
]);

const ISOLATION_RANK: Record<MJAIAgentEntity['Isolation'], number> = {
    InProcess: 0,
    Worker: 1,
    Process: 2,
    Container: 3,
};

const SEARCH_ACCESS_RANK: Record<MJAIAgentEntity['SearchScopeAccess'], number> = {
    None: 0,
    Assigned: 1,
    All: 2,
};

const ACCEPTS_SKILLS_RANK: Record<MJAIAgentEntity['AcceptsSkills'], number> = {
    None: 0,
    Limited: 1,
    All: 2,
};

const SKILL_ACTIVATION_RANK: Record<MJAIAgentEntity['SkillActivationMode'], number> = {
    RequestedOnly: 0,
    Auto: 1,
};

/**
 * Type guard narrowing an `IEntityDataProvider` to `IMetadataProvider` when the provider
 * implements metadata/entity-instantiation methods (e.g., `SQLServerDataProvider`, `PostgreSQLDataProvider`).
 */
export function IsMetadataProvider(
    provider: IEntityDataProvider | null | undefined
): provider is IEntityDataProvider & IMetadataProvider {
    return Boolean(provider && 'GetEntityObject' in provider && 'Entities' in provider);
}

/**
 * Returns true when `user` is an Owner-type user or holds an administrative / Agent Administrator role.
 */
export function IsAgentAdminOrOwnerUser(user: UserInfo | null | undefined): boolean {
    if (!user) {
        return true; // System / unauthenticated internal context
    }
    if (user.Type?.trim().toLowerCase() === 'owner') {
        return true;
    }
    const roles = user.UserRoles ?? [];
    return roles.some((ur) => ADMIN_ROLE_NAMES.has((ur.Role ?? '').trim().toLowerCase()));
}

/**
 * Snapshot of an agent record used by the pure {@link ValidateAgentInheritanceAndSandbox} helper.
 */
export interface AgentSandboxValidationTarget {
    ID: string;
    IsSaved: boolean;
    BaseAgentID: string | null;
    PreSaveBaseAgentID: string | null;
    OwnerUserID: string | null;
    PreSaveOwnerUserID: string | null;
    InstantiationMode: MJAIAgentEntity['InstantiationMode'];
    DriverClass: string | null;
    DriverClassDirty: boolean;
    Isolation: MJAIAgentEntity['Isolation'];
    ExposeAsAction: boolean;
    MaxCostPerRun: number | null;
    MaxTokensPerRun: number | null;
    MaxTimePerRun: number | null;
    MaxIterationsPerRun: number | null;
    /** Optional narrow-only capability columns checked against the full ancestor chain. */
    SearchScopeAccess?: MJAIAgentEntity['SearchScopeAccess'] | null;
    RequirePlanMode?: boolean | null;
    SupportsPlanMode?: boolean | null;
    AcceptUnregisteredFiles?: boolean | null;
    AllowEphemeralClientTools?: boolean | null;
    AcceptsSkills?: MJAIAgentEntity['AcceptsSkills'] | null;
    SkillActivationMode?: MJAIAgentEntity['SkillActivationMode'] | null;
    AllowMemoryWrite?: boolean | null;
    MaxExecutionsPerRun?: number | null;
    MaxSubAgentConsultRounds?: number | null;
    /** Optional JSON bag carrying `helperPlugins` and operational config (`Configuration`). */
    Configuration?: string | null;
    /** Optional `TypeConfiguration` JSON (checked for `helperPlugins` fallback). */
    TypeConfiguration?: string | null;
}

/**
 * Pure validation context passed into {@link ValidateAgentInheritanceAndSandbox}.
 */
export interface AgentSandboxValidationContext {
    Target: AgentSandboxValidationTarget;
    User: UserInfo | null | undefined;
    /** Full agent list (used to trace BaseAgentID chains, cycles, depth, and user instance counts). */
    AllAgents: ReadonlyArray<
        Pick<
            MJAIAgentEntity,
            | 'ID'
            | 'Name'
            | 'BaseAgentID'
            | 'OwnerUserID'
            | 'Status'
            | 'InstantiationMode'
            | 'DriverClass'
            | 'Isolation'
            | 'MaxCostPerRun'
            | 'MaxTokensPerRun'
            | 'MaxTimePerRun'
            | 'MaxIterationsPerRun'
            | 'TypeConfiguration'
        > &
            Partial<
                Pick<
                    MJAIAgentEntity,
                    | 'Configuration'
                    | 'SearchScopeAccess'
                    | 'RequirePlanMode'
                    | 'SupportsPlanMode'
                    | 'AcceptUnregisteredFiles'
                    | 'AllowEphemeralClientTools'
                    | 'AcceptsSkills'
                    | 'SkillActivationMode'
                    | 'AllowMemoryWrite'
                    | 'MaxExecutionsPerRun'
                    | 'MaxSubAgentConsultRounds'
                >
            >
    >;
    AllPermissions: ReadonlyArray<MJAIAgentPermissionEntity>;
}

/**
 * PURE validation core for `BaseAgentID` prototype inheritance integrity and non-Owner (`UI` role)
 * sandboxing (exported for unit tests and called by {@link MJAIAgentEntityServer.ValidateAsync}):
 *
 * 1. **Chain integrity (all users)**:
 *    - `BaseAgentID` must reference an existing agent, cannot point to itself or form a cycle,
 *      and total inheritance depth must not exceed `MAX_AGENT_INHERITANCE_DEPTH` (5).
 * 2. **Instantiation policy on create**:
 *    - Non-admin users can only instantiate from a base agent whose `InstantiationMode !== 'None'`.
 *    - Enforces `TypeConfiguration.instantiation.maxInstancesPerUser` when configured.
 * 3. **Non-Owner (`UI` role) sandbox**:
 *    - May only create/update derived agents (`BaseAgentID != null`), owned by `User.ID`
 *      (checked against pre-save `OldValue` on update), with `InstantiationMode === 'None'`.
 *    - Must hold effective `CanRun` on `BaseAgentID`.
 *    - Cannot set custom `DriverClass`, loosen `Isolation`, set `ExposeAsAction = true`, or raise
 *      finite `MaxCostPerRun` / `MaxTokensPerRun` / `MaxTimePerRun` / `MaxIterationsPerRun` above
 *      the base agent's bounds.
 */
export function ValidateAgentInheritanceAndSandbox(
    ctx: AgentSandboxValidationContext
): ValidationErrorInfo[] {
    const errors: ValidationErrorInfo[] = [];
    const { Target, User, AllAgents, AllPermissions } = ctx;
    const isAdmin = IsAgentAdminOrOwnerUser(User);

    // 0. Per-agent helperPlugins security guard (Extension Point #3):
    //    - Code-only security seams (limits, actionPolicy, policy, permissions) are forbidden in
    //      metadata for ALL users (including administrators).
    //    - Non-administrator users cannot configure ANY helperPlugins on personal agent instances.
    const declaredHelperPlugins = [
        ...ParseAgentHelperPlugins(Target.Configuration),
        ...ParseAgentHelperPlugins(Target.TypeConfiguration),
    ];
    for (const plugin of declaredHelperPlugins) {
        if (IsForbiddenMetadataHelperSeam(plugin.seam)) {
            errors.push(
                new ValidationErrorInfo(
                    'Configuration',
                    `Helper seam '${plugin.seam}' is code-only and cannot be overridden via agent metadata helperPlugins (driverClass '${plugin.driverClass}'). Use @RegisterClass in server code instead.`,
                    plugin.seam,
                    ValidationErrorType.Failure
                )
            );
        }
    }
    if (!isAdmin && User && declaredHelperPlugins.length > 0) {
        errors.push(
            new ValidationErrorInfo(
                'Configuration',
                'Only administrators may configure helperPlugins on an AI Agent.',
                declaredHelperPlugins.map((p) => `${p.seam}:${p.driverClass}`).join(', '),
                ValidationErrorType.Failure
            )
        );
    }

    // 1. Non-admin sandbox on root vs derived + ownership + InstantiationMode
    if (!isAdmin && User) {
        const effectiveBaseId = Target.BaseAgentID;
        if (!effectiveBaseId) {
            errors.push(
                new ValidationErrorInfo(
                    'BaseAgentID',
                    'Non-administrator users can only create or modify derived agent instances with BaseAgentID set.',
                    null,
                    ValidationErrorType.Failure
                )
            );
            return errors;
        }

        if (Target.IsSaved && Target.PreSaveBaseAgentID && !UUIDsEqual(Target.PreSaveBaseAgentID, effectiveBaseId)) {
            errors.push(
                new ValidationErrorInfo(
                    'BaseAgentID',
                    'Cannot re-parent BaseAgentID on an existing derived agent instance.',
                    effectiveBaseId,
                    ValidationErrorType.Failure
                )
            );
        }

        const preSaveOwner = Target.IsSaved ? (Target.PreSaveOwnerUserID ?? Target.OwnerUserID) : Target.OwnerUserID;
        if (preSaveOwner && !UUIDsEqual(preSaveOwner, User.ID)) {
            errors.push(
                new ValidationErrorInfo(
                    'OwnerUserID',
                    'You can only create or modify your own personal agent instances.',
                    Target.OwnerUserID,
                    ValidationErrorType.Failure
                )
            );
        }
        if (Target.OwnerUserID && !UUIDsEqual(Target.OwnerUserID, User.ID)) {
            errors.push(
                new ValidationErrorInfo(
                    'OwnerUserID',
                    'Cannot reassign OwnerUserID to another user.',
                    Target.OwnerUserID,
                    ValidationErrorType.Failure
                )
            );
        }

        if ((Target.InstantiationMode ?? 'None') !== 'None') {
            errors.push(
                new ValidationErrorInfo(
                    'InstantiationMode',
                    'Only administrators may publish instantiable agent templates (InstantiationMode must be None for personal instances).',
                    Target.InstantiationMode,
                    ValidationErrorType.Failure
                )
            );
        }

        if (Target.ExposeAsAction) {
            errors.push(
                new ValidationErrorInfo(
                    'ExposeAsAction',
                    'Personal agent instances cannot set ExposeAsAction = true.',
                    true,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    // 2. BaseAgentID chain integrity (existence, no cycle, depth <= MAX_AGENT_INHERITANCE_DEPTH)
    if (!Target.BaseAgentID) {
        return errors;
    }

    if (Target.ID && UUIDsEqual(Target.ID, Target.BaseAgentID)) {
        errors.push(
            new ValidationErrorInfo(
                'BaseAgentID',
                'An agent cannot set BaseAgentID to itself.',
                Target.BaseAgentID,
                ValidationErrorType.Failure
            )
        );
        return errors;
    }

    const agentsById = IndexByUUID(AllAgents);
    const baseAgent = agentsById.Get(Target.BaseAgentID);
    if (!baseAgent) {
        errors.push(
            new ValidationErrorInfo(
                'BaseAgentID',
                `BaseAgentID '${Target.BaseAgentID}' does not reference an existing AI Agent.`,
                Target.BaseAgentID,
                ValidationErrorType.Failure
            )
        );
        return errors;
    }

    // Walk up BaseAgentID chain to detect cycles, enforce max depth (5 hops), and collect full
    // ancestor chain (`ancestors[0]` = root, `ancestors[ancestors.length - 1]` = immediate baseAgent)
    // so multi-hop capability and limit ceilings are enforced across every ancestor.
    const visited = new UUIDSet(Target.ID ? [Target.ID] : []);
    const ancestorsBottomUp: Array<typeof baseAgent> = [];
    let cursor: typeof baseAgent | undefined = baseAgent;
    let hops = 1; // Target -> baseAgent is hop 1
    while (cursor) {
        if (visited.Has(cursor.ID)) {
            errors.push(
                new ValidationErrorInfo(
                    'BaseAgentID',
                    'BaseAgentID inheritance cycle detected.',
                    Target.BaseAgentID,
                    ValidationErrorType.Failure
                )
            );
            return errors;
        }
        visited.Add(cursor.ID);
        ancestorsBottomUp.push(cursor);

        if (hops > MAX_AGENT_INHERITANCE_DEPTH) {
            errors.push(
                new ValidationErrorInfo(
                    'BaseAgentID',
                    `Agent prototype inheritance depth exceeds maximum allowed depth of ${MAX_AGENT_INHERITANCE_DEPTH}.`,
                    Target.BaseAgentID,
                    ValidationErrorType.Failure
                )
            );
            return errors;
        }

        if (!cursor.BaseAgentID) {
            break;
        }
        const nextParent = agentsById.Get(cursor.BaseAgentID);
        if (!nextParent) {
            break;
        }
        cursor = nextParent;
        hops++;
    }
    const ancestors = [...ancestorsBottomUp].reverse(); // root -> ... -> baseAgent

    // 3. InstantiationMode & maxInstancesPerUser check on create
    if (!Target.IsSaved) {
        if (!isAdmin && (baseAgent.InstantiationMode ?? 'None') === 'None') {
            errors.push(
                new ValidationErrorInfo(
                    'BaseAgentID',
                    `Agent '${baseAgent.Name ?? baseAgent.ID}' does not allow creating derived instances (InstantiationMode is 'None').`,
                    Target.BaseAgentID,
                    ValidationErrorType.Failure
                )
            );
        }

        const baseParsedConfig = ParseAgentConfiguration(baseAgent.Configuration);
        const instCfg =
            baseParsedConfig?.instantiation ?? ParseAgentInstantiationConfig(baseAgent.TypeConfiguration);
        const ownerId = Target.OwnerUserID ?? User?.ID ?? null;
        if (instCfg?.maxInstancesPerUser && ownerId) {
            const existingCount = AllAgents.filter(
                (a) =>
                    a.Status === 'Active' &&
                    a.BaseAgentID != null &&
                    UUIDsEqual(a.BaseAgentID, baseAgent.ID) &&
                    UUIDsEqual(a.OwnerUserID, ownerId)
            ).length;
            if (existingCount >= instCfg.maxInstancesPerUser) {
                errors.push(
                    new ValidationErrorInfo(
                        'BaseAgentID',
                        `Maximum of ${instCfg.maxInstancesPerUser} active instance(s) of '${baseAgent.Name ?? baseAgent.ID}' per user reached.`,
                        Target.BaseAgentID,
                        ValidationErrorType.Failure
                    )
                );
            }
        }
    }

    // 4. Non-admin runtime capability & multi-hop bounds sandbox against full ancestor chain
    if (!isAdmin && User) {
        const basePerms = AIAgentPermissionHelper.ComputeEffectivePermissionsSync(
            baseAgent,
            AllAgents,
            AllPermissions,
            User
        );
        if (!basePerms.canRun) {
            errors.push(
                new ValidationErrorInfo(
                    'BaseAgentID',
                    `You do not have permission to run base agent '${baseAgent.Name ?? baseAgent.ID}'.`,
                    Target.BaseAgentID,
                    ValidationErrorType.Failure
                )
            );
        }

        // DriverClass: compare unconditionally against nearest non-null ancestor DriverClass
        let effectiveAncestorDriver: string | null = null;
        for (let i = ancestors.length - 1; i >= 0; i--) {
            const d = ancestors[i].DriverClass?.trim();
            if (d) {
                effectiveAncestorDriver = d;
                break;
            }
        }
        const targetDriver = Target.DriverClass?.trim() || null;
        if (targetDriver !== null && targetDriver !== effectiveAncestorDriver) {
            errors.push(
                new ValidationErrorInfo(
                    'DriverClass',
                    'Non-administrator users cannot set a custom DriverClass on a derived agent instance.',
                    Target.DriverClass,
                    ValidationErrorType.Failure
                )
            );
        }

        // Isolation: strictest across the entire ancestor chain
        let strictestAncestorIsolation: MJAIAgentEntity['Isolation'] = 'InProcess';
        for (const anc of ancestors) {
            const ancIso = anc.Isolation ?? 'InProcess';
            if ((ISOLATION_RANK[ancIso] ?? 0) > (ISOLATION_RANK[strictestAncestorIsolation] ?? 0)) {
                strictestAncestorIsolation = ancIso;
            }
        }
        const targetIsoRank = ISOLATION_RANK[Target.Isolation ?? 'InProcess'] ?? 0;
        if (targetIsoRank < (ISOLATION_RANK[strictestAncestorIsolation] ?? 0)) {
            errors.push(
                new ValidationErrorInfo(
                    'Isolation',
                    `Derived agent Isolation ('${Target.Isolation}') cannot be less strict than ancestor Isolation ('${strictestAncestorIsolation}').`,
                    Target.Isolation,
                    ValidationErrorType.Failure
                )
            );
        }

        const ancestorConfigs = ancestors.map((a) => ParseAgentConfiguration(a.Configuration));
        const targetConfig = ParseAgentConfiguration(Target.Configuration);

        // Multi-hop upper-bound limit ceilings: reject BOTH exceeding AND null-clearing a finite ancestor ceiling
        const checkMultiHopUpperBound = (
            fieldName:
                | 'MaxCostPerRun'
                | 'MaxTokensPerRun'
                | 'MaxTimePerRun'
                | 'MaxIterationsPerRun'
                | 'MaxExecutionsPerRun'
                | 'MaxSubAgentConsultRounds',
            ancestorValues: Array<number | null | undefined>,
            childLimit: number | null | undefined
        ): void => {
            let effectiveCeiling: number | null = null;
            for (const v of ancestorValues) {
                if (typeof v === 'number' && Number.isFinite(v)) {
                    effectiveCeiling = effectiveCeiling === null ? v : Math.min(effectiveCeiling, v);
                }
            }
            if (effectiveCeiling === null) {
                return;
            }
            if (childLimit === null) {
                errors.push(
                    new ValidationErrorInfo(
                        fieldName,
                        `Derived agent ${fieldName} cannot be cleared to null when an ancestor enforces ceiling (${effectiveCeiling}).`,
                        null,
                        ValidationErrorType.Failure
                    )
                );
                return;
            }
            if (typeof childLimit === 'number' && childLimit > effectiveCeiling) {
                errors.push(
                    new ValidationErrorInfo(
                        fieldName,
                        `Derived agent ${fieldName} (${childLimit}) cannot exceed ancestor ceiling (${effectiveCeiling}).`,
                        childLimit,
                        ValidationErrorType.Failure
                    )
                );
            }
        };

        checkMultiHopUpperBound('MaxCostPerRun', ancestors.map((a) => a.MaxCostPerRun), Target.MaxCostPerRun);
        checkMultiHopUpperBound('MaxTokensPerRun', ancestors.map((a) => a.MaxTokensPerRun), Target.MaxTokensPerRun);
        checkMultiHopUpperBound('MaxTimePerRun', ancestors.map((a) => a.MaxTimePerRun), Target.MaxTimePerRun);
        checkMultiHopUpperBound('MaxIterationsPerRun', ancestors.map((a) => a.MaxIterationsPerRun), Target.MaxIterationsPerRun);
        checkMultiHopUpperBound(
            'MaxExecutionsPerRun',
            ancestors.map((a, i) => ancestorConfigs[i]?.subAgentExecution?.maxExecutionsPerRun ?? a.MaxExecutionsPerRun),
            targetConfig?.subAgentExecution?.maxExecutionsPerRun !== undefined
                ? targetConfig.subAgentExecution.maxExecutionsPerRun
                : Target.MaxExecutionsPerRun
        );
        checkMultiHopUpperBound(
            'MaxSubAgentConsultRounds',
            ancestors.map((a, i) => ancestorConfigs[i]?.subAgentExecution?.maxConsultRounds ?? a.MaxSubAgentConsultRounds),
            targetConfig?.subAgentExecution?.maxConsultRounds !== undefined
                ? targetConfig.subAgentExecution.maxConsultRounds
                : Target.MaxSubAgentConsultRounds
        );

        // Narrow-only capabilities validated across BOTH Configuration JSON and legacy columns:
        // 4a. SearchScopeAccess (None: 0 < Assigned: 1 < All: 2)
        let ancestorSearchAccess: MJAIAgentEntity['SearchScopeAccess'] | null = null;
        for (let i = 0; i < ancestors.length; i++) {
            const explicit = ancestorConfigs[i]?.scope?.searchScopeAccess;
            const legacy = ancestors[i].SearchScopeAccess;
            const val = explicit ?? (legacy && legacy !== 'None' ? legacy : (i === 0 ? legacy : null));
            if (val != null) {
                if (ancestorSearchAccess === null || SEARCH_ACCESS_RANK[val] < SEARCH_ACCESS_RANK[ancestorSearchAccess]) {
                    ancestorSearchAccess = val;
                }
            }
        }
        const targetSearchAccess = targetConfig?.scope?.searchScopeAccess ?? Target.SearchScopeAccess ?? null;
        if (
            ancestorSearchAccess !== null &&
            targetSearchAccess !== null &&
            SEARCH_ACCESS_RANK[targetSearchAccess] > SEARCH_ACCESS_RANK[ancestorSearchAccess]
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'SearchScopeAccess',
                    `Derived agent SearchScopeAccess ('${targetSearchAccess}') cannot widen ancestor SearchScopeAccess ('${ancestorSearchAccess}').`,
                    targetSearchAccess,
                    ValidationErrorType.Failure
                )
            );
        }

        // 4b. AcceptsSkills (None: 0 < Limited: 1 < All: 2)
        let ancestorAcceptsSkills: MJAIAgentEntity['AcceptsSkills'] | null = null;
        for (const anc of ancestors) {
            const val = anc.AcceptsSkills;
            if (val != null) {
                if (ancestorAcceptsSkills === null || ACCEPTS_SKILLS_RANK[val] < ACCEPTS_SKILLS_RANK[ancestorAcceptsSkills]) {
                    ancestorAcceptsSkills = val;
                }
            }
        }
        if (
            ancestorAcceptsSkills !== null &&
            Target.AcceptsSkills != null &&
            ACCEPTS_SKILLS_RANK[Target.AcceptsSkills] > ACCEPTS_SKILLS_RANK[ancestorAcceptsSkills]
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'AcceptsSkills',
                    `Derived agent AcceptsSkills ('${Target.AcceptsSkills}') cannot widen ancestor AcceptsSkills ('${ancestorAcceptsSkills}').`,
                    Target.AcceptsSkills,
                    ValidationErrorType.Failure
                )
            );
        }

        // 4c. SkillActivationMode (RequestedOnly: 0 < Auto: 1)
        let ancestorSkillMode: MJAIAgentEntity['SkillActivationMode'] | null = null;
        for (let i = 0; i < ancestors.length; i++) {
            const val = ancestorConfigs[i]?.skills?.activationMode ?? ancestors[i].SkillActivationMode ?? null;
            if (val != null) {
                if (ancestorSkillMode === null || SKILL_ACTIVATION_RANK[val] < SKILL_ACTIVATION_RANK[ancestorSkillMode]) {
                    ancestorSkillMode = val;
                }
            }
        }
        const targetSkillMode = targetConfig?.skills?.activationMode ?? Target.SkillActivationMode ?? null;
        if (
            ancestorSkillMode !== null &&
            targetSkillMode !== null &&
            SKILL_ACTIVATION_RANK[targetSkillMode] > SKILL_ACTIVATION_RANK[ancestorSkillMode]
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'SkillActivationMode',
                    `Derived agent SkillActivationMode ('${targetSkillMode}') cannot widen ancestor SkillActivationMode ('${ancestorSkillMode}').`,
                    targetSkillMode,
                    ValidationErrorType.Failure
                )
            );
        }

        // 4d. RequirePlanMode (monotonic OR: once true on an ancestor, derived instances cannot set false)
        const ancestorRequiresPlan = ancestors.some(
            (a, i) => (ancestorConfigs[i]?.execution?.requirePlanMode ?? a.RequirePlanMode) === true
        );
        const targetRequirePlan = targetConfig?.execution?.requirePlanMode ?? Target.RequirePlanMode;
        if (ancestorRequiresPlan && targetRequirePlan === false) {
            errors.push(
                new ValidationErrorInfo(
                    'RequirePlanMode',
                    'Derived agent cannot disable RequirePlanMode when an ancestor requires Plan Mode.',
                    false,
                    ValidationErrorType.Failure
                )
            );
        }

        // 4e. Narrow-only booleans (monotonic AND: once false on an ancestor, derived instances cannot set true)
        const checkNarrowBoolean = (
            fieldName: 'SupportsPlanMode' | 'AcceptUnregisteredFiles' | 'AllowEphemeralClientTools' | 'AllowMemoryWrite',
            ancestorVals: Array<boolean | null | undefined>,
            targetVal: boolean | null | undefined
        ): void => {
            if (ancestorVals.some((v) => v === false) && targetVal === true) {
                errors.push(
                    new ValidationErrorInfo(
                        fieldName,
                        `Derived agent cannot enable ${fieldName} when an ancestor disables it.`,
                        true,
                        ValidationErrorType.Failure
                    )
                );
            }
        };

        checkNarrowBoolean(
            'SupportsPlanMode',
            ancestors.map((a, i) => ancestorConfigs[i]?.execution?.supportsPlanMode ?? a.SupportsPlanMode),
            targetConfig?.execution?.supportsPlanMode ?? Target.SupportsPlanMode
        );
        checkNarrowBoolean(
            'AcceptUnregisteredFiles',
            ancestors.map((a, i) => ancestorConfigs[i]?.attachments?.acceptUnregisteredFiles ?? a.AcceptUnregisteredFiles),
            targetConfig?.attachments?.acceptUnregisteredFiles ?? Target.AcceptUnregisteredFiles
        );
        checkNarrowBoolean(
            'AllowEphemeralClientTools',
            ancestors.map((a, i) => ancestorConfigs[i]?.clientTools?.allowEphemeral ?? a.AllowEphemeralClientTools),
            targetConfig?.clientTools?.allowEphemeral ?? Target.AllowEphemeralClientTools
        );
        checkNarrowBoolean(
            'AllowMemoryWrite',
            ancestors.map((a, i) => ancestorConfigs[i]?.memory?.allowMemoryWrite ?? a.AllowMemoryWrite),
            targetConfig?.memory?.allowMemoryWrite ?? Target.AllowMemoryWrite
        );
    }

    return errors;
}

/**
 * Server-side AI Agent entity enforcing:
 *   1. `TypeConfiguration` ⊨ `ConfigSchema` validation.
 *   2. `BaseAgentID` prototype inheritance integrity (`MaxDepth = 5`, cycle detection, `InstantiationMode` & `maxInstancesPerUser`).
 *   3. Non-Owner (`UI` role) sandbox for creating/updating/deleting derived personal instances.
 *   4. Automatic `OwnerUserID` attribution, derived default capability inheritance on create, and
 *      `IsPrimaryInstance` uniqueness per `(OwnerUserID, RootBaseAgentID)`.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agents')
export class MJAIAgentEntityServer extends MJAIAgentEntityExtended {
    /** Enable async validation so TypeConfiguration, BaseAgentID chain, and sandbox checks run. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isCreate = !this.IsSaved;
        let baseAgent: MJAIAgentEntity | null = null;
        let resolvedRootBaseId: string | null = null;

        // Capture caller-dirty legacy fields BEFORE inheritDefaultsFromBaseAgent copies parent
        // defaults onto legacy columns so newly created derived instances do not freeze inherited
        // parent values into AIAgent.Configuration JSON.
        const callerDirtyLegacyFields = this.collectDirtyLegacyConfigFields(isCreate);

        if (isCreate && !this.OwnerUserID && this.ContextCurrentUser) {
            this.OwnerUserID = this.ContextCurrentUser.ID;
        }

        if (this.BaseAgentID) {
            const allAgents = await this.loadAllAgentsForGuard();
            baseAgent = allAgents.find((a) => UUIDsEqual(a.ID, this.BaseAgentID)) ?? null;
            if (baseAgent) {
                resolvedRootBaseId = this.findRootBaseAgentId(baseAgent, allAgents);
                if (isCreate) {
                    this.inheritDefaultsFromBaseAgent(baseAgent);
                    const primaryDirty = this.GetFieldByName('IsPrimaryInstance')?.Dirty ?? false;
                    if (!primaryDirty && !this.IsPrimaryInstance && this.OwnerUserID) {
                        const existingSiblings = this.findActiveSiblingsForOwnerAndRoot(
                            allAgents,
                            this.OwnerUserID,
                            resolvedRootBaseId,
                            this.ID
                        );
                        if (existingSiblings.length === 0) {
                            this.IsPrimaryInstance = true;
                        }
                    }
                }
            }
        }

        // Bidirectional v6.x sync between AIAgent.Configuration JSON and deprecated legacy columns
        this.syncConfigurationWithLegacyColumns(isCreate, callerDirtyLegacyFields);

        const saved = await super.Save(options);
        if (!saved) {
            return false;
        }

        // Maintain single IsPrimaryInstance per (OwnerUserID, RootBaseAgentID)
        if (this.BaseAgentID && this.OwnerUserID && this.IsPrimaryInstance === true) {
            const rootId = this.RootBaseAgentID ?? resolvedRootBaseId ?? this.BaseAgentID;
            await this.clearOtherPrimaryInstances(this.OwnerUserID, rootId, this.ID);
        }

        return true;
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const user = this.ContextCurrentUser;
        if (!IsAgentAdminOrOwnerUser(user) && user) {
            const preSaveBase =
                (this.GetFieldByName('BaseAgentID')?.OldValue as string | null | undefined) ?? this.BaseAgentID;
            const preSaveOwner =
                (this.GetFieldByName('OwnerUserID')?.OldValue as string | null | undefined) ?? this.OwnerUserID;
            if (!preSaveBase || !preSaveOwner || !UUIDsEqual(preSaveOwner, user.ID)) {
                this.LatestResult?.Errors.push(
                    new ValidationErrorInfo(
                        'OwnerUserID',
                        'Non-administrator users can only delete their own derived agent instances.',
                        this.ID,
                        ValidationErrorType.Failure
                    )
                );
                return false;
            }
        }
        return super.Delete(options);
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        // 0. Configuration JSON syntax & scalar-type validation
        const configErrors = ValidateAgentConfigurationJson(this.Configuration, 'Configuration');
        if (configErrors.length > 0) {
            for (const msg of configErrors) {
                result.Errors.push(
                    new ValidationErrorInfo('Configuration', msg, this.Configuration, ValidationErrorType.Failure)
                );
            }
            result.Success = false;
            return result;
        }

        // 1. BaseAgentID inheritance, helperPlugins & non-admin sandbox checks
        const user = this.ContextCurrentUser;
        const isAdmin = IsAgentAdminOrOwnerUser(user);
        const hasDeclaredHelperPlugins =
            ParseAgentHelperPlugins(this.Configuration).length > 0 ||
            ParseAgentHelperPlugins(this.TypeConfiguration).length > 0;
        if (this.BaseAgentID || !isAdmin || hasDeclaredHelperPlugins) {
            const [allAgents, allPermissions] = await Promise.all([
                this.loadAllAgentsForGuard(),
                this.loadAllAgentPermissionsForGuard(),
            ]);
            const sandboxErrors = ValidateAgentInheritanceAndSandbox({
                Target: {
                    ID: this.ID,
                    IsSaved: this.IsSaved,
                    BaseAgentID: this.BaseAgentID,
                    PreSaveBaseAgentID:
                        (this.GetFieldByName('BaseAgentID')?.OldValue as string | null | undefined) ?? this.BaseAgentID,
                    OwnerUserID: this.OwnerUserID,
                    PreSaveOwnerUserID:
                        (this.GetFieldByName('OwnerUserID')?.OldValue as string | null | undefined) ?? this.OwnerUserID,
                    InstantiationMode: this.InstantiationMode,
                    DriverClass: this.DriverClass,
                    DriverClassDirty: this.GetFieldByName('DriverClass')?.Dirty ?? false,
                    Isolation: this.Isolation,
                    ExposeAsAction: this.ExposeAsAction,
                    MaxCostPerRun: this.MaxCostPerRun,
                    MaxTokensPerRun: this.MaxTokensPerRun,
                    MaxTimePerRun: this.MaxTimePerRun,
                    MaxIterationsPerRun: this.MaxIterationsPerRun,
                    SearchScopeAccess: this.SearchScopeAccess,
                    RequirePlanMode: this.RequirePlanMode,
                    SupportsPlanMode: this.SupportsPlanMode,
                    AcceptUnregisteredFiles: this.AcceptUnregisteredFiles,
                    AllowEphemeralClientTools: this.AllowEphemeralClientTools,
                    AcceptsSkills: this.AcceptsSkills,
                    SkillActivationMode: this.SkillActivationMode,
                    AllowMemoryWrite: this.AllowMemoryWrite,
                    MaxExecutionsPerRun: this.MaxExecutionsPerRun,
                    MaxSubAgentConsultRounds: this.MaxSubAgentConsultRounds,
                    Configuration: this.Configuration,
                    TypeConfiguration: this.TypeConfiguration,
                },
                User: user,
                AllAgents: allAgents,
                AllPermissions: allPermissions,
            });
            if (sandboxErrors.length > 0) {
                result.Errors.push(...sandboxErrors);
                result.Success = result.Success && sandboxErrors.every((e) => e.Type !== ValidationErrorType.Failure);
            }
        }

        // 2. TypeConfiguration ⊨ ConfigSchema invariant
        const configJson = this.TypeConfiguration;
        if (!configJson || configJson.trim().length === 0) {
            return result;
        }

        const configDirty = this.GetFieldByName('TypeConfiguration')?.Dirty ?? false;
        const typeDirty = this.GetFieldByName('TypeID')?.Dirty ?? false;
        if (this.IsSaved && !configDirty && !typeDirty) {
            return result;
        }

        const schemaJson = await this.loadTypeConfigSchema();
        const errors = BuildTypeConfigurationValidationErrors(configJson, schemaJson);
        if (errors.length > 0) {
            result.Errors.push(...errors);
            result.Success = result.Success && errors.every((e) => e.Type !== ValidationErrorType.Failure);
        }
        return result;
    }

    /**
     * Copies core capability defaults from `baseAgent` onto a newly-created derived instance
     * ONLY for fields the caller left untouched (not dirty). This ensures newly minted instances
     * like *Pepper* immediately inherit `TypeID`, `AcceptsSkills`, `SkillActivationMode`,
     * `ModelSelectionMode`, `Isolation`, and memory settings without requiring every caller to
     * manually copy 20 columns.
     */
    private inheritDefaultsFromBaseAgent(baseAgent: MJAIAgentEntity): void {
        const copyIfNotDirty = <K extends keyof MJAIAgentEntity>(fieldName: K): void => {
            const field = this.GetFieldByName(String(fieldName));
            if (field && !field.Dirty && field.NeverSet) {
                const baseVal = baseAgent[fieldName];
                if (baseVal !== undefined) {
                    (this as MJAIAgentEntity)[fieldName] = baseVal;
                }
            }
        };

        if (!this.TypeID && baseAgent.TypeID) {
            this.TypeID = baseAgent.TypeID;
        }
        copyIfNotDirty('ModelSelectionMode');
        copyIfNotDirty('AcceptsSkills');
        copyIfNotDirty('SkillActivationMode');
        copyIfNotDirty('SearchScopeAccess');
        copyIfNotDirty('ArtifactCreationMode');
        copyIfNotDirty('DefaultArtifactTypeID');
        copyIfNotDirty('InjectNotes');
        copyIfNotDirty('MaxNotesToInject');
        copyIfNotDirty('NoteInjectionStrategy');
        copyIfNotDirty('InjectExamples');
        copyIfNotDirty('MaxExamplesToInject');
        copyIfNotDirty('ExampleInjectionStrategy');
        copyIfNotDirty('AllowMemoryWrite');
        copyIfNotDirty('DeclareActionsAsNativeTools');
        copyIfNotDirty('Isolation');
        copyIfNotDirty('SupportsPlanMode');
        copyIfNotDirty('RequirePlanMode');
        copyIfNotDirty('EnableContextCompression');
        copyIfNotDirty('ContextCompressionMessageThreshold');
        copyIfNotDirty('ContextCompressionPromptID');
        copyIfNotDirty('ContextCompressionMessageRetentionCount');
        copyIfNotDirty('RerankerConfiguration');
        copyIfNotDirty('ContextWindowMaxTokens');
        copyIfNotDirty('CompactionTriggerPercent');
        copyIfNotDirty('CompactionTargetPercent');
        copyIfNotDirty('ConversationSummaryPromptID');
        if (!this.CategoryID && baseAgent.CategoryID) {
            this.CategoryID = baseAgent.CategoryID;
        }
    }

    private findRootBaseAgentId(
        start: MJAIAgentEntity,
        allAgents: readonly MJAIAgentEntity[]
    ): string {
        const agentsById = IndexByUUID(allAgents);
        const visited = new UUIDSet([start.ID]);
        let cursor = start;
        let hops = 0;
        while (cursor.BaseAgentID && hops < MAX_AGENT_INHERITANCE_DEPTH) {
            if (visited.Has(cursor.BaseAgentID)) {
                break;
            }
            visited.Add(cursor.BaseAgentID);
            const parent = agentsById.Get(cursor.BaseAgentID);
            if (!parent) {
                return cursor.BaseAgentID;
            }
            cursor = parent;
            hops++;
        }
        return cursor.ID;
    }

    private findActiveSiblingsForOwnerAndRoot(
        allAgents: readonly MJAIAgentEntity[],
        ownerUserId: string,
        rootBaseId: string,
        excludeAgentId?: string | null
    ): MJAIAgentEntity[] {
        return allAgents.filter((a) => {
            if (a.Status !== 'Active' || !a.BaseAgentID || !UUIDsEqual(a.OwnerUserID, ownerUserId)) {
                return false;
            }
            if (excludeAgentId && UUIDsEqual(a.ID, excludeAgentId)) {
                return false;
            }
            const aRoot = a.RootBaseAgentID ?? this.findRootBaseAgentId(a, allAgents);
            return UUIDsEqual(aRoot, rootBaseId);
        });
    }

    private async clearOtherPrimaryInstances(
        ownerUserId: string,
        rootBaseId: string,
        currentAgentId: string
    ): Promise<void> {
        const rv = new RunView(this.RunViewProviderToUse);
        const safeOwner = EscapeSQLString(ownerUserId);
        const res = await rv.RunView<MJAIAgentEntity>(
            {
                EntityName: 'MJ: AI Agents',
                ExtraFilter: `OwnerUserID='${safeOwner}' AND BaseAgentID IS NOT NULL AND IsPrimaryInstance=1 AND Status='Active'`,
                ResultType: 'entity_object',
            },
            this.ContextCurrentUser
        );
        if (!res.Success || res.Results.length === 0) {
            return;
        }
        const allAgents = await this.loadAllAgentsForGuard();
        for (const sibling of res.Results) {
            if (UUIDsEqual(sibling.ID, currentAgentId)) {
                continue;
            }
            const sibRoot = sibling.RootBaseAgentID ?? this.findRootBaseAgentId(sibling, allAgents);
            if (UUIDsEqual(sibRoot, rootBaseId)) {
                sibling.IsPrimaryInstance = false;
                await sibling.Save();
            }
        }
    }

    private async loadAllAgentsForGuard(): Promise<MJAIAgentEntity[]> {
        const rv = new RunView(this.RunViewProviderToUse);
        const res = await rv.RunView<MJAIAgentEntity>(
            {
                EntityName: 'MJ: AI Agents',
                ResultType: 'entity_object',
            },
            this.ContextCurrentUser
        );
        return res.Success ? res.Results : [];
    }

    private async loadAllAgentPermissionsForGuard(): Promise<MJAIAgentPermissionEntity[]> {
        const rv = new RunView(this.RunViewProviderToUse);
        const res = await rv.RunView<MJAIAgentPermissionEntity>(
            {
                EntityName: 'MJ: AI Agent Permissions',
                ResultType: 'entity_object',
            },
            this.ContextCurrentUser
        );
        return res.Success ? res.Results : [];
    }

    private buildLegacyConfigValues(): LegacyAIAgentConfigColumns {
        return {
            ModelSelectionMode: this.ModelSelectionMode,
            DefaultPromptEffortLevel: this.DefaultPromptEffortLevel,
            ChatHandlingOption: this.ChatHandlingOption,
            SupportsPlanMode: this.SupportsPlanMode,
            RequirePlanMode: this.RequirePlanMode,
            DeclareActionsAsNativeTools: this.DeclareActionsAsNativeTools,
            EnableContextCompression: this.EnableContextCompression,
            ContextCompressionMessageThreshold: this.ContextCompressionMessageThreshold,
            ContextCompressionPromptID: this.ContextCompressionPromptID,
            ContextCompressionMessageRetentionCount: this.ContextCompressionMessageRetentionCount,
            ContextWindowMaxTokens: this.ContextWindowMaxTokens,
            CompactionTriggerPercent: this.CompactionTriggerPercent,
            CompactionTargetPercent: this.CompactionTargetPercent,
            ConversationSummaryPromptID: this.ConversationSummaryPromptID,
            InjectNotes: this.InjectNotes,
            MaxNotesToInject: this.MaxNotesToInject,
            NoteInjectionStrategy: this.NoteInjectionStrategy,
            InjectExamples: this.InjectExamples,
            MaxExamplesToInject: this.MaxExamplesToInject,
            ExampleInjectionStrategy: this.ExampleInjectionStrategy,
            NoteRetentionDays: this.NoteRetentionDays,
            ExampleRetentionDays: this.ExampleRetentionDays,
            AutoArchiveEnabled: this.AutoArchiveEnabled,
            AllowMemoryWrite: this.AllowMemoryWrite,
            RerankerConfiguration: this.RerankerConfiguration,
            PayloadDownstreamPaths: this.PayloadDownstreamPaths,
            PayloadUpstreamPaths: this.PayloadUpstreamPaths,
            PayloadSelfReadPaths: this.PayloadSelfReadPaths,
            PayloadSelfWritePaths: this.PayloadSelfWritePaths,
            PayloadScope: this.PayloadScope,
            StartingPayloadValidation: this.StartingPayloadValidation,
            StartingPayloadValidationMode: this.StartingPayloadValidationMode,
            FinalPayloadValidation: this.FinalPayloadValidation,
            FinalPayloadValidationMode: this.FinalPayloadValidationMode,
            FinalPayloadValidationMaxRetries: this.FinalPayloadValidationMaxRetries,
            ExecutionMode: this.ExecutionMode,
            MinExecutionsPerRun: this.MinExecutionsPerRun,
            MaxExecutionsPerRun: this.MaxExecutionsPerRun,
            MaxSubAgentConsultRounds: this.MaxSubAgentConsultRounds,
            MessageMode: this.MessageMode,
            MaxMessages: this.MaxMessages,
            AttachmentRootPath: this.AttachmentRootPath,
            InlineStorageThresholdBytes: this.InlineStorageThresholdBytes,
            AcceptUnregisteredFiles: this.AcceptUnregisteredFiles,
            ArtifactCreationMode: this.ArtifactCreationMode,
            DefaultArtifactTypeID: this.DefaultArtifactTypeID,
            SearchScopeAccess: this.SearchScopeAccess,
            ScopeConfig: this.ScopeConfig,
            SkillActivationMode: this.SkillActivationMode,
            AllowEphemeralClientTools: this.AllowEphemeralClientTools,
            RecordingDefault: this.RecordingDefault,
        };
    }

    private isFieldExplicitlyWritten(fieldName: string, isCreate: boolean): boolean {
        const field = this.GetFieldByName(fieldName);
        if (!field) {
            return false;
        }
        // On NewRecord(), EntityField.set Value() sets _oldValue = value on the first write
        // when _neverSet === true (leaving Dirty === false while flipping NeverSet to false).
        // Checking Dirty || !NeverSet on create accurately detects every caller-written field
        // without treating untouched SQL metadata defaults (NeverSet === true) as dirty.
        return isCreate ? (field.Dirty === true || field.NeverSet === false) : field.Dirty === true;
    }

    private collectDirtyLegacyConfigFields(isCreate: boolean): Set<keyof LegacyAIAgentConfigColumns> {
        const dirtyLegacyFields = new Set<keyof LegacyAIAgentConfigColumns>();
        const keys = Object.keys(this.buildLegacyConfigValues()) as Array<keyof LegacyAIAgentConfigColumns>;
        for (const key of keys) {
            if (this.isFieldExplicitlyWritten(key, isCreate)) {
                dirtyLegacyFields.add(key);
            }
        }
        return dirtyLegacyFields;
    }

    private syncConfigurationWithLegacyColumns(
        isCreate: boolean,
        dirtyLegacyFields: ReadonlySet<keyof LegacyAIAgentConfigColumns>
    ): void {
        const configField = this.GetFieldByName('Configuration');
        if (!configField) {
            // Database schema has not yet received the Configuration column (e.g., PostgreSQL prior to twin migration).
            return;
        }
        const legacyValues = this.buildLegacyConfigValues();
        const configDirty = this.isFieldExplicitlyWritten('Configuration', isCreate);
        const syncResult = SyncAgentLegacyColumnsAndConfiguration({
            IsNewRecord: isCreate,
            ConfigurationJson: this.Configuration,
            ConfigurationDirty: configDirty,
            LegacyValues: legacyValues,
            DirtyLegacyFields: dirtyLegacyFields,
        });

        for (const [key, value] of Object.entries(syncResult.LegacyColumnUpdates)) {
            if (value !== undefined) {
                this.assignLegacyConfigField(key as keyof LegacyAIAgentConfigColumns, value);
            }
        }
        if (syncResult.ShouldUpdateConfiguration) {
            this.Configuration = syncResult.ConfigurationJson;
        }
    }

    private assignLegacyConfigField<K extends keyof LegacyAIAgentConfigColumns>(
        fieldName: K,
        value: LegacyAIAgentConfigColumns[K]
    ): void {
        const target: LegacyAIAgentConfigColumns = this;
        target[fieldName] = value;
    }

    private async loadTypeConfigSchema(): Promise<string | null> {
        if (!this.TypeID) {
            return null;
        }
        if (!IsMetadataProvider(this.ProviderToUse)) {
            return null;
        }
        const type = await this.ProviderToUse.GetEntityObject<MJAIAgentTypeEntity>(
            'MJ: AI Agent Types',
            this.ContextCurrentUser
        );
        if (!(await type.Load(this.TypeID))) {
            return null;
        }
        return type.ConfigSchema ?? null;
    }
}

/**
 * PURE validation core for the `TypeConfiguration` ⊨ `ConfigSchema` invariant (exported for
 * unit tests and reuse).
 */
export function BuildTypeConfigurationValidationErrors(
    typeConfigurationJson: string,
    configSchemaJson: string | null
): ValidationErrorInfo[] {
    let config: unknown;
    try {
        config = JSON.parse(typeConfigurationJson);
    } catch (error) {
        return [
            new ValidationErrorInfo(
                'TypeConfiguration',
                `TypeConfiguration is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
                typeConfigurationJson,
                ValidationErrorType.Failure
            ),
        ];
    }
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
        return [
            new ValidationErrorInfo(
                'TypeConfiguration',
                'TypeConfiguration must be a JSON object (arrays and scalars are not valid configuration payloads).',
                typeConfigurationJson,
                ValidationErrorType.Failure
            ),
        ];
    }

    if (!configSchemaJson || configSchemaJson.trim().length === 0) {
        return [];
    }

    let schema: unknown;
    try {
        schema = JSON.parse(configSchemaJson);
    } catch {
        schema = null;
    }
    if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
        return [
            new ValidationErrorInfo(
                'TypeConfiguration',
                "The agent type's ConfigSchema is not a parseable JSON Schema object — schema conformance was NOT " +
                    'checked (fix the ConfigSchema on the agent type row).',
                configSchemaJson,
                ValidationErrorType.Warning
            ),
        ];
    }

    return ValidateJsonAgainstSchemaLite(config, schema as Record<string, unknown>).map(
        (violation) =>
            new ValidationErrorInfo(
                'TypeConfiguration',
                `TypeConfiguration does not conform to the agent type's ConfigSchema: ${violation}`,
                typeConfigurationJson,
                ValidationErrorType.Failure
            )
    );
}
