import {
    BaseEntity,
    BaseEntityResult,
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
import {
    MJAIAgentCategoryEntity,
    MJAIAgentEntity,
    MJAIAgentPermissionEntity,
    MJAIAgentTypeEntity,
} from '@memberjunction/core-entities';
import {
    BuildAgentTypeConfigurationFromLegacyFields,
    DeepMergeAgentConfigurations,
    IsForbiddenMetadataHelperSeam,
    IsLegacyAIAgentConfigSqlDefault,
    LEGACY_AI_AGENT_CONFIG_SQL_DEFAULTS,
    MAX_AGENT_INHERITANCE_DEPTH,
    MJAIAgentEntityExtended,
    ParseAgentConfiguration,
    ParseAgentHelperPlugins,
    ResolveAgentInstantiationConfig,
    SyncAgentLegacyColumnsAndConfiguration,
    VALID_AGENT_HELPER_SEAMS,
    ValidateAgentConfigurationJson,
    ValidateLegacyAgentConfigFields,
    type IAgentConfiguration,
    type LegacyAIAgentConfigColumns,
    type LegacyAIAgentTypeConfigColumns,
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
    /** Optional CategoryID / TypeID + pre-save values to prevent non-admin sandbox escapes. */
    CategoryID?: string | null;
    PreSaveCategoryID?: string | null;
    TypeID?: string | null;
    PreSaveTypeID?: string | null;
    /** Optional dirty-field set & pre-save numeric limits so untouched null limits inherit cleanly (B4). */
    DirtyFields?: ReadonlySet<string>;
    PreSaveLimits?: Partial<
        Record<
            | 'MaxCostPerRun'
            | 'MaxTokensPerRun'
            | 'MaxTimePerRun'
            | 'MaxIterationsPerRun'
            | 'MaxExecutionsPerRun'
            | 'MaxSubAgentConsultRounds',
            number | null
        >
    >;
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
                    | 'CategoryID'
                    | 'TypeID'
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
    /** Optional category rows used to enforce Category DefaultConfiguration narrow-only ceilings. */
    AllCategories?: ReadonlyArray<Pick<MJAIAgentCategoryEntity, 'ID' | 'ParentID' | 'DefaultConfiguration'>>;
    /** Optional agent type rows used to enforce AgentType DefaultAgentConfiguration narrow-only ceilings. */
    AllAgentTypes?: ReadonlyArray<
        Pick<MJAIAgentTypeEntity, 'ID' | 'DefaultAgentConfiguration'> & Partial<LegacyAIAgentTypeConfigColumns>
    >;
}

/**
 * Resolves ordered narrow-only default policy layers (`AgentType -> Category Parent Chains`)
 * for an agent chain `[...ancestors, target]`, mirroring `BaseAIEngine.ResolveEffectiveAgentProperties`.
 */
function collectDefaultPolicyLayers(
    chain: ReadonlyArray<{ CategoryID?: string | null; TypeID?: string | null }>,
    allCategories: AgentSandboxValidationContext['AllCategories'],
    allAgentTypes: AgentSandboxValidationContext['AllAgentTypes']
): IAgentConfiguration[] {
    const layers: IAgentConfiguration[] = [];

    let effectiveTypeId: string | null = null;
    for (let i = chain.length - 1; i >= 0; i--) {
        if (chain[i].TypeID) {
            effectiveTypeId = chain[i].TypeID ?? null;
            break;
        }
    }
    if (effectiveTypeId && allAgentTypes && allAgentTypes.length > 0) {
        const agentType = allAgentTypes.find((at) => UUIDsEqual(at.ID, effectiveTypeId));
        if (agentType) {
            const typeLegacy = BuildAgentTypeConfigurationFromLegacyFields(agentType);
            const typeJson = ParseAgentConfiguration(agentType.DefaultAgentConfiguration);
            const typeLayer = DeepMergeAgentConfigurations(typeLegacy, typeJson);
            if (Object.keys(typeLayer).length > 0) {
                layers.push(typeLayer);
            }
        }
    }

    if (allCategories && allCategories.length > 0) {
        const catsById = IndexByUUID(allCategories);
        const seenCatIds = new UUIDSet();
        for (const node of chain) {
            if (!node.CategoryID) {
                continue;
            }
            const catChain: Array<NonNullable<AgentSandboxValidationContext['AllCategories']>[number]> = [];
            const walkVisited = new UUIDSet();
            let curId: string | null = node.CategoryID;
            while (curId && !walkVisited.Has(curId)) {
                walkVisited.Add(curId);
                const cat = catsById.Get(curId);
                if (!cat) {
                    break;
                }
                catChain.push(cat);
                curId = cat.ParentID ?? null;
            }
            catChain.reverse();
            for (const cat of catChain) {
                if (seenCatIds.Has(cat.ID)) {
                    continue;
                }
                seenCatIds.Add(cat.ID);
                const catJson = ParseAgentConfiguration(cat.DefaultConfiguration);
                if (catJson) {
                    layers.push(catJson);
                }
            }
        }
    }

    return layers;
}

/**
 * Computes the effective monotonic `SearchScopeAccess` ceiling across Category/Type default policy
 * layers and the ancestor agent chain using the exact `R5-6` node-property rule shared with
 * `BaseAIEngine.ResolveAgentConfiguration`:
 * - Only treat an untouched legacy `'None'` (with no explicit JSON value) as unset on a
 *   non-instantiable derived row (`BaseAgentID != null && InstantiationMode === 'None'`).
 * - Roots and instantiable templates (`InstantiationMode !== 'None'`) enforce `'None'` as an
 *   active ceiling.
 */
function computeAncestorSearchScopeCeiling(
    defaultPolicyLayers: readonly IAgentConfiguration[],
    ancestors: readonly Partial<Pick<MJAIAgentEntity, 'BaseAgentID' | 'InstantiationMode' | 'SearchScopeAccess'>>[],
    ancestorConfigs: readonly (IAgentConfiguration | null)[]
): MJAIAgentEntity['SearchScopeAccess'] | null {
    let ceiling: MJAIAgentEntity['SearchScopeAccess'] | null = null;
    const apply = (val: MJAIAgentEntity['SearchScopeAccess'] | null | undefined): void => {
        if (val != null) {
            if (ceiling === null || SEARCH_ACCESS_RANK[val] < SEARCH_ACCESS_RANK[ceiling]) {
                ceiling = val;
            }
        }
    };
    for (const layer of defaultPolicyLayers) {
        apply(layer.scope?.searchScopeAccess);
    }
    for (let i = 0; i < ancestors.length; i++) {
        const explicit = ancestorConfigs[i]?.scope?.searchScopeAccess ?? null;
        const legacy = ancestors[i].SearchScopeAccess ?? null;
        if (explicit != null && legacy != null) {
            const stricter = SEARCH_ACCESS_RANK[legacy] < SEARCH_ACCESS_RANK[explicit] ? legacy : explicit;
            apply(stricter);
        } else {
            const isNonInstantiableDerived =
                Boolean(ancestors[i].BaseAgentID) && (ancestors[i].InstantiationMode ?? 'None') === 'None';
            apply(explicit ?? (legacy && (legacy !== 'None' || !isNonInstantiableDerived) ? legacy : null));
        }
    }
    return ceiling;
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
    const jsonHasHelperPluginsKey = (raw: string | null | undefined): boolean => {
        if (!raw || raw.trim().length === 0) return false;
        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, 'helperPlugins'));
        } catch {
            return false;
        }
    };
    const hasHelperPluginsKey =
        jsonHasHelperPluginsKey(Target.Configuration) || jsonHasHelperPluginsKey(Target.TypeConfiguration);
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
        } else if (!VALID_AGENT_HELPER_SEAMS.has(plugin.seam.trim())) {
            errors.push(
                new ValidationErrorInfo(
                    'Configuration',
                    `Helper seam '${plugin.seam}' is not a valid helper seam (driverClass '${plugin.driverClass}'). Valid seams: ${Array.from(VALID_AGENT_HELPER_SEAMS).join(', ')}.`,
                    plugin.seam,
                    ValidationErrorType.Failure
                )
            );
        }
    }
    const helperConfigDirty =
        !Target.IsSaved ||
        !Target.DirtyFields ||
        Target.DirtyFields.has('Configuration') ||
        Target.DirtyFields.has('TypeConfiguration');
    if (!isAdmin && User && helperConfigDirty && (declaredHelperPlugins.length > 0 || hasHelperPluginsKey)) {
        errors.push(
            new ValidationErrorInfo(
                'Configuration',
                'Only administrators may configure helperPlugins (including clearing/modifying the key) on an AI Agent.',
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
    const defaultPolicyLayers = collectDefaultPolicyLayers(
        [...ancestors, Target],
        ctx.AllCategories,
        ctx.AllAgentTypes
    );

    // 3. InstantiationMode & maxInstancesPerUser check on create (R5-7: monotonic Math.min across
    //    AgentType -> Categories -> root..baseAgent, counted per root base agent matching
    //    ManageMyAgentInstanceAction and BaseAIEngine.ResolveEffectiveAgentProperties)
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

        let effectiveMaxPerUser: number | null = null;
        const foldMaxPerUser = (candidate: number | null | undefined): void => {
            if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
                const floored = Math.floor(candidate);
                effectiveMaxPerUser = effectiveMaxPerUser === null ? floored : Math.min(effectiveMaxPerUser, floored);
            }
        };
        for (const layer of defaultPolicyLayers) {
            foldMaxPerUser(layer.instantiation?.maxInstancesPerUser);
        }
        for (const anc of ancestors) {
            const resolved = ResolveAgentInstantiationConfig(anc.Configuration, anc.TypeConfiguration);
            foldMaxPerUser(resolved?.maxInstancesPerUser);
        }

        const ownerId = Target.OwnerUserID ?? User?.ID ?? null;
        if (effectiveMaxPerUser !== null && ownerId) {
            const rootBaseId = ancestors[0].ID;
            const resolveRootId = (agent: typeof baseAgent): string => {
                const seen = new UUIDSet([agent.ID]);
                let cur = agent;
                let depth = 0;
                while (cur.BaseAgentID && depth < MAX_AGENT_INHERITANCE_DEPTH) {
                    if (seen.Has(cur.BaseAgentID)) break;
                    seen.Add(cur.BaseAgentID);
                    const p = agentsById.Get(cur.BaseAgentID);
                    if (!p) return cur.BaseAgentID;
                    cur = p;
                    depth++;
                }
                return cur.ID;
            };
            const existingCount = AllAgents.filter(
                (a) =>
                    a.Status === 'Active' &&
                    a.BaseAgentID != null &&
                    UUIDsEqual(a.OwnerUserID, ownerId) &&
                    UUIDsEqual(resolveRootId(a), rootBaseId)
            ).length;
            if (existingCount >= effectiveMaxPerUser) {
                errors.push(
                    new ValidationErrorInfo(
                        'BaseAgentID',
                        `Maximum of ${effectiveMaxPerUser} active instance(s) of '${baseAgent.Name ?? baseAgent.ID}' per user reached.`,
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

        // Helper for R2-3 & R3-5: on existing saved instances where DirtyFields is tracked, only
        // re-check narrow-only columns and numeric ceilings that were actually modified (or when
        // Configuration or BaseAgentID itself was modified) so an admin tightening a base agent
        // never breaks unrelated edits (rename/persona) on pre-existing derived instances while
        // attaching/re-parenting BaseAgentID enforces every invariant (critical for Isolation,
        // which has no runtime clamp and is read directly from the leaf column).
        const shouldEnforceField = (fieldName: string): boolean => {
            if (!Target.IsSaved || !Target.DirtyFields) {
                return true;
            }
            return (
                Target.DirtyFields.has(fieldName) ||
                Target.DirtyFields.has('Configuration') ||
                Target.DirtyFields.has('BaseAgentID')
            );
        };

        // Isolation: strictest across the entire ancestor chain
        let strictestAncestorIsolation: MJAIAgentEntity['Isolation'] = 'InProcess';
        for (const anc of ancestors) {
            const ancIso = anc.Isolation ?? 'InProcess';
            if ((ISOLATION_RANK[ancIso] ?? 0) > (ISOLATION_RANK[strictestAncestorIsolation] ?? 0)) {
                strictestAncestorIsolation = ancIso;
            }
        }
        const targetIsoRank = ISOLATION_RANK[Target.Isolation ?? 'InProcess'] ?? 0;
        if (shouldEnforceField('Isolation') && targetIsoRank < (ISOLATION_RANK[strictestAncestorIsolation] ?? 0)) {
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

        // CategoryID / TypeID sandbox (S2, R2-4): non-admins cannot re-point or assign a derived
        // instance's CategoryID or TypeID away from its base agent chain (or assign a loose category
        // when the pre-save value was null).
        let effectiveAncestorCategoryId: string | null = null;
        let effectiveAncestorTypeId: string | null = null;
        for (let i = ancestors.length - 1; i >= 0; i--) {
            if (!effectiveAncestorCategoryId && ancestors[i].CategoryID) {
                effectiveAncestorCategoryId = ancestors[i].CategoryID ?? null;
            }
            if (!effectiveAncestorTypeId && ancestors[i].TypeID) {
                effectiveAncestorTypeId = ancestors[i].TypeID ?? null;
            }
        }
        if (Target.CategoryID !== undefined) {
            const expectedCat = Target.IsSaved ? (Target.PreSaveCategoryID ?? effectiveAncestorCategoryId) : effectiveAncestorCategoryId;
            if (expectedCat && Target.CategoryID && !UUIDsEqual(Target.CategoryID, expectedCat)) {
                errors.push(
                    new ValidationErrorInfo(
                        'CategoryID',
                        'Non-administrator users cannot reassign CategoryID on a derived agent instance.',
                        Target.CategoryID,
                        ValidationErrorType.Failure
                    )
                );
            } else if (!expectedCat && Target.CategoryID && (!Target.IsSaved || !Target.DirtyFields || Target.DirtyFields.has('CategoryID'))) {
                errors.push(
                    new ValidationErrorInfo(
                        'CategoryID',
                        'Non-administrator users cannot assign CategoryID on a derived agent instance.',
                        Target.CategoryID,
                        ValidationErrorType.Failure
                    )
                );
            } else if (expectedCat && Target.CategoryID === null && Target.DirtyFields?.has('CategoryID')) {
                errors.push(
                    new ValidationErrorInfo(
                        'CategoryID',
                        'Non-administrator users cannot clear CategoryID on a derived agent instance.',
                        null,
                        ValidationErrorType.Failure
                    )
                );
            }
        }
        if (Target.TypeID !== undefined) {
            const expectedType = Target.IsSaved ? (Target.PreSaveTypeID ?? effectiveAncestorTypeId) : effectiveAncestorTypeId;
            if (expectedType && Target.TypeID && !UUIDsEqual(Target.TypeID, expectedType)) {
                errors.push(
                    new ValidationErrorInfo(
                        'TypeID',
                        'Non-administrator users cannot reassign TypeID on a derived agent instance.',
                        Target.TypeID,
                        ValidationErrorType.Failure
                    )
                );
            } else if (!expectedType && Target.TypeID && (!Target.IsSaved || !Target.DirtyFields || Target.DirtyFields.has('TypeID'))) {
                errors.push(
                    new ValidationErrorInfo(
                        'TypeID',
                        'Non-administrator users cannot assign TypeID on a derived agent instance.',
                        Target.TypeID,
                        ValidationErrorType.Failure
                    )
                );
            } else if (expectedType && Target.TypeID === null && Target.DirtyFields?.has('TypeID')) {
                errors.push(
                    new ValidationErrorInfo(
                        'TypeID',
                        'Non-administrator users cannot clear TypeID on a derived agent instance.',
                        null,
                        ValidationErrorType.Failure
                    )
                );
            }
        }

        // Multi-hop upper-bound limit ceilings (B4):
        // - Exceeding an ancestor's finite ceiling is always rejected.
        // - `null` means "inherit ancestor ceiling" (enforced at runtime via Math.min), EXCEPT when
        //   an existing instance explicitly dirties a previously non-null cap to clear it to null.
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
            if (!shouldEnforceField(fieldName)) {
                return;
            }
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
                const isExplicitClear =
                    Target.IsSaved &&
                    Target.DirtyFields?.has(fieldName) === true &&
                    typeof Target.PreSaveLimits?.[fieldName] === 'number';
                if (isExplicitClear) {
                    errors.push(
                        new ValidationErrorInfo(
                            fieldName,
                            `Derived agent ${fieldName} cannot be cleared to null when an ancestor enforces ceiling (${effectiveCeiling}).`,
                            null,
                            ValidationErrorType.Failure
                        )
                    );
                }
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
            [
                ...defaultPolicyLayers.map((l) => l.subAgentExecution?.maxExecutionsPerRun),
                ...ancestors.flatMap((a, i) => [ancestorConfigs[i]?.subAgentExecution?.maxExecutionsPerRun, a.MaxExecutionsPerRun]),
            ],
            targetConfig?.subAgentExecution?.maxExecutionsPerRun !== undefined
                ? targetConfig.subAgentExecution.maxExecutionsPerRun
                : Target.MaxExecutionsPerRun
        );
        checkMultiHopUpperBound(
            'MaxSubAgentConsultRounds',
            [
                ...defaultPolicyLayers.map((l) => l.subAgentExecution?.maxConsultRounds),
                ...ancestors.flatMap((a, i) => [ancestorConfigs[i]?.subAgentExecution?.maxConsultRounds, a.MaxSubAgentConsultRounds]),
            ],
            targetConfig?.subAgentExecution?.maxConsultRounds !== undefined
                ? targetConfig.subAgentExecution.maxConsultRounds
                : Target.MaxSubAgentConsultRounds
        );

        // Narrow-only capabilities validated across BOTH Configuration JSON and legacy columns
        // as well as Category/AgentType default policy layers (C-R1-2):
        // 4a. SearchScopeAccess (None: 0 < Assigned: 1 < All: 2)
        const ancestorSearchAccess = computeAncestorSearchScopeCeiling(defaultPolicyLayers, ancestors, ancestorConfigs);
        const targetSearchAccess = targetConfig?.scope?.searchScopeAccess ?? Target.SearchScopeAccess ?? null;
        if (
            shouldEnforceField('SearchScopeAccess') &&
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
            shouldEnforceField('AcceptsSkills') &&
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
        const applySkillModeCeiling = (val: MJAIAgentEntity['SkillActivationMode'] | null | undefined): void => {
            if (val != null) {
                if (ancestorSkillMode === null || SKILL_ACTIVATION_RANK[val] < SKILL_ACTIVATION_RANK[ancestorSkillMode]) {
                    ancestorSkillMode = val;
                }
            }
        };
        for (const layer of defaultPolicyLayers) {
            applySkillModeCeiling(layer.skills?.activationMode);
        }
        for (let i = 0; i < ancestors.length; i++) {
            applySkillModeCeiling(ancestorConfigs[i]?.skills?.activationMode);
            applySkillModeCeiling(ancestors[i].SkillActivationMode);
        }
        const targetSkillMode = targetConfig?.skills?.activationMode ?? Target.SkillActivationMode ?? null;
        if (
            shouldEnforceField('SkillActivationMode') &&
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

        // 4d. RequirePlanMode (monotonic OR: once true on an ancestor/category/type, derived instances cannot set false)
        const ancestorRequiresPlan =
            defaultPolicyLayers.some((l) => l.execution?.requirePlanMode === true) ||
            ancestors.some((a, i) => ancestorConfigs[i]?.execution?.requirePlanMode === true || a.RequirePlanMode === true);
        const targetRequirePlan = targetConfig?.execution?.requirePlanMode ?? Target.RequirePlanMode;
        if (shouldEnforceField('RequirePlanMode') && ancestorRequiresPlan && targetRequirePlan === false) {
            errors.push(
                new ValidationErrorInfo(
                    'RequirePlanMode',
                    'Derived agent cannot disable RequirePlanMode when an ancestor requires Plan Mode.',
                    false,
                    ValidationErrorType.Failure
                )
            );
        }

        // 4e. Narrow-only booleans (monotonic AND: once false on an ancestor/category/type, derived instances cannot set true)
        const checkNarrowBoolean = (
            fieldName: 'SupportsPlanMode' | 'AcceptUnregisteredFiles' | 'AllowEphemeralClientTools' | 'AllowMemoryWrite',
            ancestorVals: Array<boolean | null | undefined>,
            targetVal: boolean | null | undefined
        ): void => {
            if (shouldEnforceField(fieldName) && ancestorVals.some((v) => v === false) && targetVal === true) {
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
            [
                ...defaultPolicyLayers.map((l) => l.execution?.supportsPlanMode),
                ...ancestors.flatMap((a, i) => [ancestorConfigs[i]?.execution?.supportsPlanMode, a.SupportsPlanMode]),
            ],
            targetConfig?.execution?.supportsPlanMode ?? Target.SupportsPlanMode
        );
        checkNarrowBoolean(
            'AcceptUnregisteredFiles',
            [
                ...defaultPolicyLayers.map((l) => l.attachments?.acceptUnregisteredFiles),
                ...ancestors.flatMap((a, i) => [ancestorConfigs[i]?.attachments?.acceptUnregisteredFiles, a.AcceptUnregisteredFiles]),
            ],
            targetConfig?.attachments?.acceptUnregisteredFiles ?? Target.AcceptUnregisteredFiles
        );
        checkNarrowBoolean(
            'AllowEphemeralClientTools',
            [
                ...defaultPolicyLayers.map((l) => l.clientTools?.allowEphemeral),
                ...ancestors.flatMap((a, i) => [ancestorConfigs[i]?.clientTools?.allowEphemeral, a.AllowEphemeralClientTools]),
            ],
            targetConfig?.clientTools?.allowEphemeral ?? Target.AllowEphemeralClientTools
        );
        checkNarrowBoolean(
            'AllowMemoryWrite',
            [
                ...defaultPolicyLayers.map((l) => l.memory?.allowMemoryWrite),
                ...ancestors.flatMap((a, i) => [ancestorConfigs[i]?.memory?.allowMemoryWrite, a.AllowMemoryWrite]),
            ],
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
    /**
     * Captures whether the caller actually modified `Configuration` (or is creating a new record)
     * BEFORE `syncConfigurationWithLegacyColumns` runs in `Save()`, so unrelated legacy-column
     * edits on pre-existing rows do not trigger full-document JSON re-validation or spuriously
     * mark `Configuration` dirty for narrow-only checks (R3-10).
     */
    private _configDirtyBeforeSync: boolean | null = null;
    private _dirtyLegacyPatchForValidation: Partial<LegacyAIAgentConfigColumns> | null = null;
    private _saveGuardCache: {
        AllAgents: MJAIAgentEntity[];
        AllPermissions: MJAIAgentPermissionEntity[];
        AllCategories: MJAIAgentCategoryEntity[];
        AllAgentTypes: MJAIAgentTypeEntity[];
        ErrorMessage?: string;
    } | null = null;

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
        const callerLegacyPatch = this.buildLegacyPatchFromSet(callerDirtyLegacyFields);
        this._dirtyLegacyPatchForValidation = Object.keys(callerLegacyPatch).length > 0 ? callerLegacyPatch : null;
        this._configDirtyBeforeSync = isCreate || (this.GetFieldByName('Configuration')?.Dirty ?? false);

        try {
            if (isCreate && !this.OwnerUserID && this.ContextCurrentUser) {
                this.OwnerUserID = this.ContextCurrentUser.ID;
            }

            if (this.BaseAgentID) {
                const guardBatch = await this.loadGuardMetadataBatch();
                this._saveGuardCache = guardBatch;
                const { AllAgents: allAgents, AllCategories: allCategories, AllAgentTypes: allAgentTypes } = guardBatch;
                baseAgent = allAgents.find((a) => UUIDsEqual(a.ID, this.BaseAgentID)) ?? null;
                if (baseAgent) {
                    resolvedRootBaseId = this.findRootBaseAgentId(baseAgent, allAgents);
                    if (isCreate) {
                        const ancestorSearchCeiling = this.inheritDefaultsFromBaseAgent(
                            baseAgent,
                            allAgents,
                            allCategories,
                            allAgentTypes
                        );
                        // R5-1 + C-R3-1 + C-R3-2: If the caller explicitly wrote `SearchScopeAccess = 'None'`
                        // (`NeverSet === false`) WITHOUT explicitly setting `Configuration.scope.searchScopeAccess`,
                        // under a broader effective ancestor ceiling (`ancestorSearchCeiling !== 'None'`),
                        // persist `scope.searchScopeAccess = 'None'` into `Configuration` so runtime resolution
                        // honors the explicit restriction instead of treating the leaf column `'None'` as unset.
                        const searchField = this.GetFieldByName('SearchScopeAccess');
                        const explicitConfigSearchAccess =
                            ParseAgentConfiguration(this.Configuration)?.scope?.searchScopeAccess;
                        if (
                            this.SearchScopeAccess === 'None' &&
                            searchField &&
                            searchField.NeverSet === false &&
                            explicitConfigSearchAccess === undefined &&
                            ancestorSearchCeiling !== null &&
                            ancestorSearchCeiling !== 'None'
                        ) {
                            callerDirtyLegacyFields.add('SearchScopeAccess');
                        }
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
        } finally {
            this._configDirtyBeforeSync = null;
            this._dirtyLegacyPatchForValidation = null;
            this._saveGuardCache = null;
        }
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const user = this.ContextCurrentUser;
        if (!IsAgentAdminOrOwnerUser(user) && user) {
            const preSaveBase =
                (this.GetFieldByName('BaseAgentID')?.OldValue as string | null | undefined) ?? this.BaseAgentID;
            const preSaveOwner =
                (this.GetFieldByName('OwnerUserID')?.OldValue as string | null | undefined) ?? this.OwnerUserID;
            if (!preSaveBase || !preSaveOwner || !UUIDsEqual(preSaveOwner, user.ID)) {
                const err = new ValidationErrorInfo(
                    'OwnerUserID',
                    'Non-administrator users can only delete their own derived agent instances.',
                    this.ID,
                    ValidationErrorType.Failure
                );
                const deleteResult = new BaseEntityResult(false, err.Message, 'delete');
                deleteResult.Errors = [err];
                this.RegisterResultHistoryEntry(deleteResult);
                return false;
            }
        }
        return super.Delete(options);
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        // 0. Configuration JSON syntax & scalar-type validation (R2-2, R3-10, C-R1-7):
        //    - On create or when caller directly modified Configuration, validate the full Configuration JSON
        //      (plus any caller-dirty raw JSON legacy columns such as RerankerConfiguration/ScopeConfig).
        //    - When caller only modified legacy columns on a saved row, validate ONLY the caller-dirty
        //      legacy patch so invalid legacy edits are caught without breaking unrelated saves on
        //      pre-existing rows with older backfilled Configuration payloads.
        const configDirtyForValidation =
            this._configDirtyBeforeSync ?? (!this.IsSaved || (this.GetFieldByName('Configuration')?.Dirty ?? false));
        const dirtyLegacyPatch =
            this._dirtyLegacyPatchForValidation ?? this.buildLegacyPatchFromSet(this.collectDirtyLegacyConfigFields(!this.IsSaved));
        if (configDirtyForValidation) {
            const configErrors = ValidateAgentConfigurationJson(this.Configuration, 'Configuration');
            if (
                Object.prototype.hasOwnProperty.call(dirtyLegacyPatch, 'RerankerConfiguration') ||
                Object.prototype.hasOwnProperty.call(dirtyLegacyPatch, 'ScopeConfig')
            ) {
                const rawJsonSubset: Partial<LegacyAIAgentConfigColumns> = {};
                if (Object.prototype.hasOwnProperty.call(dirtyLegacyPatch, 'RerankerConfiguration')) {
                    rawJsonSubset.RerankerConfiguration = dirtyLegacyPatch.RerankerConfiguration;
                }
                if (Object.prototype.hasOwnProperty.call(dirtyLegacyPatch, 'ScopeConfig')) {
                    rawJsonSubset.ScopeConfig = dirtyLegacyPatch.ScopeConfig;
                }
                configErrors.push(...ValidateLegacyAgentConfigFields(rawJsonSubset));
            }
            if (configErrors.length > 0) {
                for (const msg of configErrors) {
                    result.Errors.push(
                        new ValidationErrorInfo('Configuration', msg, this.Configuration, ValidationErrorType.Failure)
                    );
                }
                result.Success = false;
                return result;
            }
        } else if (Object.keys(dirtyLegacyPatch).length > 0) {
            const legacyErrors = ValidateLegacyAgentConfigFields(dirtyLegacyPatch);
            if (legacyErrors.length > 0) {
                for (const msg of legacyErrors) {
                    result.Errors.push(
                        new ValidationErrorInfo('Configuration', msg, this.Configuration, ValidationErrorType.Failure)
                    );
                }
                result.Success = false;
                return result;
            }
        }

        // C-R3-3: Always enforce SQL CHECK cross-field pair invariants against live post-sync
        // entity properties whenever Configuration or either column of the pair changed (covers
        // single-sided creates, JSON-only updates, and mixed legacy+JSON updates).
        const compactionTouched =
            configDirtyForValidation ||
            Object.prototype.hasOwnProperty.call(dirtyLegacyPatch, 'CompactionTargetPercent') ||
            Object.prototype.hasOwnProperty.call(dirtyLegacyPatch, 'CompactionTriggerPercent') ||
            (this.GetFieldByName('CompactionTargetPercent')?.Dirty ?? false) ||
            (this.GetFieldByName('CompactionTriggerPercent')?.Dirty ?? false);
        if (
            compactionTouched &&
            typeof this.CompactionTargetPercent === 'number' &&
            Number.isFinite(this.CompactionTargetPercent) &&
            typeof this.CompactionTriggerPercent === 'number' &&
            Number.isFinite(this.CompactionTriggerPercent) &&
            this.CompactionTargetPercent >= this.CompactionTriggerPercent
        ) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'CompactionTargetPercent',
                    `CompactionTargetPercent (${this.CompactionTargetPercent}) must be less than CompactionTriggerPercent (${this.CompactionTriggerPercent}).`,
                    this.CompactionTargetPercent,
                    ValidationErrorType.Failure
                )
            );
            result.Success = false;
            return result;
        }

        const execRangeTouched =
            configDirtyForValidation ||
            Object.prototype.hasOwnProperty.call(dirtyLegacyPatch, 'MinExecutionsPerRun') ||
            Object.prototype.hasOwnProperty.call(dirtyLegacyPatch, 'MaxExecutionsPerRun') ||
            (this.GetFieldByName('MinExecutionsPerRun')?.Dirty ?? false) ||
            (this.GetFieldByName('MaxExecutionsPerRun')?.Dirty ?? false);
        if (
            execRangeTouched &&
            typeof this.MinExecutionsPerRun === 'number' &&
            Number.isFinite(this.MinExecutionsPerRun) &&
            typeof this.MaxExecutionsPerRun === 'number' &&
            Number.isFinite(this.MaxExecutionsPerRun) &&
            this.MinExecutionsPerRun > this.MaxExecutionsPerRun
        ) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'MinExecutionsPerRun',
                    `MinExecutionsPerRun (${this.MinExecutionsPerRun}) cannot exceed MaxExecutionsPerRun (${this.MaxExecutionsPerRun}).`,
                    this.MinExecutionsPerRun,
                    ValidationErrorType.Failure
                )
            );
            result.Success = false;
            return result;
        }

        // 1. BaseAgentID inheritance, helperPlugins & non-admin sandbox checks
        const user = this.ContextCurrentUser;
        const isAdmin = IsAgentAdminOrOwnerUser(user);
        const hasHelperPluginsKey = (raw: string | null | undefined): boolean => {
            if (!raw || raw.trim().length === 0) return false;
            try {
                const parsed = JSON.parse(raw) as Record<string, unknown>;
                return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, 'helperPlugins'));
            } catch {
                return false;
            }
        };
        const hasDeclaredHelperPlugins =
            ParseAgentHelperPlugins(this.Configuration).length > 0 ||
            ParseAgentHelperPlugins(this.TypeConfiguration).length > 0 ||
            hasHelperPluginsKey(this.Configuration) ||
            hasHelperPluginsKey(this.TypeConfiguration);
        if (this.BaseAgentID || !isAdmin || hasDeclaredHelperPlugins) {
            const guardBatch = this._saveGuardCache ?? (await this.loadGuardMetadataBatch());
            if (guardBatch.ErrorMessage) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'BaseAgentID',
                        `Fail-closed: unable to verify agent inheritance and policy guardrails (${guardBatch.ErrorMessage}).`,
                        this.BaseAgentID,
                        ValidationErrorType.Failure
                    )
                );
                result.Success = false;
                return result;
            }
            const {
                AllAgents: allAgents,
                AllPermissions: allPermissions,
                AllCategories: allCategories,
                AllAgentTypes: allAgentTypes,
            } = guardBatch;
            const dirtyFieldNames = new Set<string>();
            for (const f of this.Fields) {
                if (f.Dirty) {
                    if (f.Name === 'Configuration' && this._configDirtyBeforeSync === false) {
                        continue;
                    }
                    dirtyFieldNames.add(f.Name);
                }
            }
            const oldNum = (name: string): number | null => {
                const v = this.GetFieldByName(name)?.OldValue;
                return typeof v === 'number' && Number.isFinite(v) ? v : null;
            };
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
                    CategoryID: this.CategoryID,
                    PreSaveCategoryID:
                        (this.GetFieldByName('CategoryID')?.OldValue as string | null | undefined) ?? null,
                    TypeID: this.TypeID,
                    PreSaveTypeID:
                        (this.GetFieldByName('TypeID')?.OldValue as string | null | undefined) ?? null,
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
                    DirtyFields: dirtyFieldNames,
                    PreSaveLimits: {
                        MaxCostPerRun: oldNum('MaxCostPerRun'),
                        MaxTokensPerRun: oldNum('MaxTokensPerRun'),
                        MaxTimePerRun: oldNum('MaxTimePerRun'),
                        MaxIterationsPerRun: oldNum('MaxIterationsPerRun'),
                        MaxExecutionsPerRun: oldNum('MaxExecutionsPerRun'),
                        MaxSubAgentConsultRounds: oldNum('MaxSubAgentConsultRounds'),
                    },
                },
                User: user,
                AllAgents: allAgents,
                AllPermissions: allPermissions,
                AllCategories: allCategories,
                AllAgentTypes: allAgentTypes,
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
    private inheritDefaultsFromBaseAgent(
        baseAgent: MJAIAgentEntity,
        allAgents?: readonly MJAIAgentEntity[],
        allCategories?: AgentSandboxValidationContext['AllCategories'],
        allAgentTypes?: AgentSandboxValidationContext['AllAgentTypes']
    ): MJAIAgentEntity['SearchScopeAccess'] | null {
        const nonLegacySqlDefaults: Partial<Record<keyof MJAIAgentEntity, unknown>> = {
            AcceptsSkills: 'None',
            Isolation: 'InProcess',
            MaxCostPerRun: null,
            MaxTokensPerRun: null,
            MaxTimePerRun: null,
            MaxIterationsPerRun: null,
        };
        const isFieldAtSqlDefault = <K extends keyof MJAIAgentEntity>(fieldName: K): boolean => {
            const currentVal = (this as MJAIAgentEntity)[fieldName];
            const keyStr = String(fieldName);
            if (Object.prototype.hasOwnProperty.call(LEGACY_AI_AGENT_CONFIG_SQL_DEFAULTS, keyStr)) {
                const legacyKey = keyStr as keyof LegacyAIAgentConfigColumns;
                return IsLegacyAIAgentConfigSqlDefault(
                    legacyKey,
                    currentVal as LegacyAIAgentConfigColumns[typeof legacyKey] | undefined
                );
            }
            if (Object.prototype.hasOwnProperty.call(nonLegacySqlDefaults, keyStr)) {
                return currentVal === nonLegacySqlDefaults[fieldName];
            }
            return false;
        };

        // R5-1: Never treat a written (`NeverSet === false`) strict SQL default as untouched on the
        // 4 narrow-only columns whose SQL default is the strict side (`SearchScopeAccess = 'None'`,
        // `AcceptUnregisteredFiles = false`, `AcceptsSkills = 'None'`, `SkillActivationMode = 'RequestedOnly'`),
        // otherwise an explicit caller restriction is silently loosened to the base agent's value!
        const STRICT_DEFAULT_NARROW_ONLY_FIELDS = new Set<string>([
            'SearchScopeAccess',
            'AcceptUnregisteredFiles',
            'AcceptsSkills',
            'SkillActivationMode',
        ]);

        const copyIfNotDirty = <K extends keyof MJAIAgentEntity>(
            fieldName: K,
            overrideVal?: MJAIAgentEntity[K],
            clampLooseDbDefault?: MJAIAgentEntity[K]
        ): void => {
            const field = this.GetFieldByName(String(fieldName));
            if (!field) return;
            const val = overrideVal !== undefined ? overrideVal : baseAgent[fieldName];
            if (val === undefined) return;
            const preserveWrittenStrictDefault = STRICT_DEFAULT_NARROW_ONLY_FIELDS.has(String(fieldName));
            const isUntouched = preserveWrittenStrictDefault
                ? !field.Dirty && field.NeverSet
                : !field.Dirty && (field.NeverSet || isFieldAtSqlDefault(fieldName));
            const isLooseDbDefault =
                clampLooseDbDefault !== undefined && (this as MJAIAgentEntity)[fieldName] === clampLooseDbDefault;
            if (isUntouched || isLooseDbDefault) {
                (this as MJAIAgentEntity)[fieldName] = val;
            }
        };

        // Walk full ancestor chain so newly-created derived instances inherit the strictest
        // ancestor limits and narrow-only capability booleans (prevents DB defaults like
        // AllowEphemeralClientTools=1 from colliding with a false ancestor in ValidateAsync).
        const ancestors: MJAIAgentEntity[] = [baseAgent];
        if (allAgents && allAgents.length > 0) {
            const byId = IndexByUUID(allAgents);
            const seen = new UUIDSet([baseAgent.ID]);
            let cur: MJAIAgentEntity | undefined = baseAgent;
            while (cur?.BaseAgentID && ancestors.length <= MAX_AGENT_INHERITANCE_DEPTH) {
                if (seen.Has(cur.BaseAgentID)) break;
                seen.Add(cur.BaseAgentID);
                const parent = byId.Get(cur.BaseAgentID);
                if (!parent) break;
                ancestors.unshift(parent);
                cur = parent;
            }
        }
        const ancestorConfigs = ancestors.map((a) => ParseAgentConfiguration(a.Configuration));
        if (!this.TypeID && baseAgent.TypeID) {
            this.TypeID = baseAgent.TypeID;
        }
        if (!this.CategoryID && baseAgent.CategoryID) {
            this.CategoryID = baseAgent.CategoryID;
        }
        const defaultPolicyLayers = collectDefaultPolicyLayers(
            [...ancestors, { CategoryID: this.CategoryID, TypeID: this.TypeID }],
            allCategories,
            allAgentTypes
        );
        const minFinite = (vals: Array<number | null | undefined>): number | null => {
            let best: number | null = null;
            for (const v of vals) {
                if (typeof v === 'number' && Number.isFinite(v)) {
                    best = best === null ? v : Math.min(best, v);
                }
            }
            return best;
        };

        let strictestSkillMode: MJAIAgentEntity['SkillActivationMode'] = baseAgent.SkillActivationMode ?? 'RequestedOnly';
        const foldSkillMode = (v: MJAIAgentEntity['SkillActivationMode'] | null | undefined): void => {
            if (v != null && SKILL_ACTIVATION_RANK[v] < SKILL_ACTIVATION_RANK[strictestSkillMode]) {
                strictestSkillMode = v;
            }
        };
        for (const layer of defaultPolicyLayers) {
            foldSkillMode(layer.skills?.activationMode);
        }
        for (let i = 0; i < ancestors.length; i++) {
            foldSkillMode(ancestorConfigs[i]?.skills?.activationMode);
            foldSkillMode(ancestors[i].SkillActivationMode);
        }

        const ancestorSearchCeiling = computeAncestorSearchScopeCeiling(defaultPolicyLayers, ancestors, ancestorConfigs);
        const strictestSearchAccess: MJAIAgentEntity['SearchScopeAccess'] = ancestorSearchCeiling ?? 'None';

        copyIfNotDirty('ModelSelectionMode');
        copyIfNotDirty('AcceptsSkills');
        copyIfNotDirty('SkillActivationMode', strictestSkillMode);
        copyIfNotDirty('SearchScopeAccess', strictestSearchAccess);
        copyIfNotDirty('ArtifactCreationMode');
        copyIfNotDirty('DefaultArtifactTypeID');
        copyIfNotDirty('InjectNotes');
        copyIfNotDirty('MaxNotesToInject');
        copyIfNotDirty('NoteInjectionStrategy');
        copyIfNotDirty('InjectExamples');
        copyIfNotDirty('MaxExamplesToInject');
        copyIfNotDirty('ExampleInjectionStrategy');
        copyIfNotDirty(
            'AllowMemoryWrite',
            defaultPolicyLayers.some((l) => l.memory?.allowMemoryWrite === false) ||
                ancestors.some((a, i) => ancestorConfigs[i]?.memory?.allowMemoryWrite === false || a.AllowMemoryWrite === false)
                ? false
                : baseAgent.AllowMemoryWrite,
            true
        );
        copyIfNotDirty('DeclareActionsAsNativeTools');
        let strictestIso: MJAIAgentEntity['Isolation'] = baseAgent.Isolation ?? 'InProcess';
        for (const a of ancestors) {
            const iso = a.Isolation ?? 'InProcess';
            if ((ISOLATION_RANK[iso] ?? 0) > (ISOLATION_RANK[strictestIso] ?? 0)) {
                strictestIso = iso;
            }
        }
        copyIfNotDirty('Isolation', strictestIso, 'InProcess');
        copyIfNotDirty(
            'SupportsPlanMode',
            defaultPolicyLayers.some((l) => l.execution?.supportsPlanMode === false) ||
                ancestors.some((a, i) => ancestorConfigs[i]?.execution?.supportsPlanMode === false || a.SupportsPlanMode === false)
                ? false
                : baseAgent.SupportsPlanMode,
            true
        );
        copyIfNotDirty(
            'RequirePlanMode',
            defaultPolicyLayers.some((l) => l.execution?.requirePlanMode === true) ||
                ancestors.some((a, i) => ancestorConfigs[i]?.execution?.requirePlanMode === true || a.RequirePlanMode === true)
                ? true
                : baseAgent.RequirePlanMode,
            false
        );
        copyIfNotDirty(
            'AllowEphemeralClientTools',
            defaultPolicyLayers.some((l) => l.clientTools?.allowEphemeral === false) ||
                ancestors.some((a, i) => ancestorConfigs[i]?.clientTools?.allowEphemeral === false || a.AllowEphemeralClientTools === false)
                ? false
                : baseAgent.AllowEphemeralClientTools,
            true
        );
        copyIfNotDirty(
            'AcceptUnregisteredFiles',
            defaultPolicyLayers.some((l) => l.attachments?.acceptUnregisteredFiles === false) ||
                ancestors.some((a, i) => ancestorConfigs[i]?.attachments?.acceptUnregisteredFiles === false || a.AcceptUnregisteredFiles === false)
                ? false
                : baseAgent.AcceptUnregisteredFiles
        );
        copyIfNotDirty('MaxCostPerRun', minFinite(ancestors.map((a) => a.MaxCostPerRun)));
        copyIfNotDirty('MaxTokensPerRun', minFinite(ancestors.map((a) => a.MaxTokensPerRun)));
        copyIfNotDirty('MaxTimePerRun', minFinite(ancestors.map((a) => a.MaxTimePerRun)));
        copyIfNotDirty('MaxIterationsPerRun', minFinite(ancestors.map((a) => a.MaxIterationsPerRun)));
        copyIfNotDirty(
            'MaxExecutionsPerRun',
            minFinite([
                ...defaultPolicyLayers.map((l) => l.subAgentExecution?.maxExecutionsPerRun),
                ...ancestors.flatMap((a, i) => [ancestorConfigs[i]?.subAgentExecution?.maxExecutionsPerRun, a.MaxExecutionsPerRun]),
            ])
        );
        copyIfNotDirty(
            'MaxSubAgentConsultRounds',
            minFinite([
                ...defaultPolicyLayers.map((l) => l.subAgentExecution?.maxConsultRounds),
                ...ancestors.flatMap((a, i) => [ancestorConfigs[i]?.subAgentExecution?.maxConsultRounds, a.MaxSubAgentConsultRounds]),
            ])
        );
        copyIfNotDirty('EnableContextCompression');
        copyIfNotDirty('ContextCompressionMessageThreshold');
        copyIfNotDirty('ContextCompressionPromptID');
        copyIfNotDirty('ContextCompressionMessageRetentionCount');
        copyIfNotDirty('RerankerConfiguration');
        copyIfNotDirty('ContextWindowMaxTokens');
        copyIfNotDirty('CompactionTriggerPercent');
        copyIfNotDirty('CompactionTargetPercent');
        copyIfNotDirty('ConversationSummaryPromptID');
        return ancestorSearchCeiling;
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

    private async loadGuardMetadataBatch(): Promise<{
        AllAgents: MJAIAgentEntity[];
        AllPermissions: MJAIAgentPermissionEntity[];
        AllCategories: MJAIAgentCategoryEntity[];
        AllAgentTypes: MJAIAgentTypeEntity[];
        ErrorMessage?: string;
    }> {
        // R5 Follow-up #5: single batched RunViews with ResultType: 'simple' + minimal explicit Fields
        // (replaces 7 full-table entity_object queries on derived creates) and fail-closed on read errors.
        const rv = new RunView(this.RunViewProviderToUse);
        const results = await rv.RunViews(
            [
                {
                    EntityName: 'MJ: AI Agents',
                    ResultType: 'simple',
                    Fields: [
                        'ID', 'Name', 'BaseAgentID', 'RootBaseAgentID', 'OwnerUserID', 'Status',
                        'CategoryID', 'TypeID', 'InstantiationMode', 'DriverClass', 'Isolation',
                        'MaxCostPerRun', 'MaxTokensPerRun', 'MaxTimePerRun', 'MaxIterationsPerRun',
                        'Configuration', 'TypeConfiguration', 'ModelSelectionMode', 'AcceptsSkills',
                        'SkillActivationMode', 'SearchScopeAccess', 'ArtifactCreationMode',
                        'DefaultArtifactTypeID', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy',
                        'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy',
                        'AllowMemoryWrite', 'DeclareActionsAsNativeTools', 'SupportsPlanMode',
                        'RequirePlanMode', 'AllowEphemeralClientTools', 'AcceptUnregisteredFiles',
                        'MaxExecutionsPerRun', 'MaxSubAgentConsultRounds', 'EnableContextCompression',
                        'ContextCompressionMessageThreshold', 'ContextCompressionPromptID',
                        'ContextCompressionMessageRetentionCount', 'RerankerConfiguration',
                        'ContextWindowMaxTokens', 'CompactionTriggerPercent', 'CompactionTargetPercent',
                        'ConversationSummaryPromptID',
                    ],
                },
                {
                    EntityName: 'MJ: AI Agent Permissions',
                    ResultType: 'simple',
                    Fields: ['ID', 'AgentID', 'UserID', 'RoleID', 'CanView', 'CanRun', 'CanEdit', 'CanDelete'],
                },
                {
                    EntityName: 'MJ: AI Agent Categories',
                    ResultType: 'simple',
                    Fields: ['ID', 'ParentID', 'DefaultConfiguration'],
                },
                {
                    EntityName: 'MJ: AI Agent Types',
                    ResultType: 'simple',
                    Fields: [
                        'ID', 'DefaultAgentConfiguration', 'ContextCompressionMessageThreshold',
                        'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount',
                        'ContextWindowMaxTokens', 'CompactionTriggerPercent', 'CompactionTargetPercent',
                        'ConversationSummaryPromptID',
                    ],
                },
            ],
            this.ContextCurrentUser
        );
        const failed = results.find((r) => !r.Success);
        if (failed) {
            return {
                AllAgents: [],
                AllPermissions: [],
                AllCategories: [],
                AllAgentTypes: [],
                ErrorMessage: failed.ErrorMessage || 'Guard metadata RunViews query failed',
            };
        }
        return {
            AllAgents: results[0].Results as MJAIAgentEntity[],
            AllPermissions: results[1].Results as MJAIAgentPermissionEntity[],
            AllCategories: results[2].Results as MJAIAgentCategoryEntity[],
            AllAgentTypes: results[3].Results as MJAIAgentTypeEntity[],
        };
    }

    private async loadAllAgentsForGuard(): Promise<MJAIAgentEntity[]> {
        const rv = new RunView(this.RunViewProviderToUse);
        const res = await rv.RunView<MJAIAgentEntity>(
            {
                EntityName: 'MJ: AI Agents',
                ResultType: 'simple',
                Fields: ['ID', 'BaseAgentID', 'RootBaseAgentID'],
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
        if (!isCreate) {
            return field.Dirty === true;
        }
        if (field.Dirty === true) {
            return true;
        }
        if (field.NeverSet !== false) {
            return false;
        }
        // On GraphQL CreateRecord (`NewRecord()` + `SetMany(input)`), ResolverBase populates every
        // writable field with its SQL default, leaving `Dirty === false` while flipping `NeverSet`
        // to `false`. Treat `!Dirty` + SQL default value as untouched so defaults never freeze into
        // `AIAgent.Configuration` and clobber BaseAgent / Category / AgentType cascade (C-R1-1).
        if (fieldName === 'Configuration') {
            return this.Configuration !== null && this.Configuration !== undefined;
        }
        if (Object.prototype.hasOwnProperty.call(LEGACY_AI_AGENT_CONFIG_SQL_DEFAULTS, fieldName)) {
            const legacyKey = fieldName as keyof LegacyAIAgentConfigColumns;
            const legacyValues = this.buildLegacyConfigValues();
            return !IsLegacyAIAgentConfigSqlDefault(legacyKey, legacyValues[legacyKey]);
        }
        return true;
    }

    private collectDirtyLegacyConfigFields(isCreate: boolean): Set<keyof LegacyAIAgentConfigColumns> {
        const dirtyLegacyFields = new Set<keyof LegacyAIAgentConfigColumns>();
        const legacyValues = this.buildLegacyConfigValues();
        const keys = Object.keys(legacyValues) as Array<keyof LegacyAIAgentConfigColumns>;
        for (const key of keys) {
            const field = this.GetFieldByName(key);
            if (!field) {
                continue;
            }
            if (!isCreate) {
                if (field.Dirty === true) {
                    dirtyLegacyFields.add(key);
                }
            } else if (
                field.Dirty === true ||
                (field.NeverSet === false && !IsLegacyAIAgentConfigSqlDefault(key, legacyValues[key]))
            ) {
                dirtyLegacyFields.add(key);
            }
        }
        return dirtyLegacyFields;
    }

    private buildLegacyPatchFromSet(
        dirtyFields: ReadonlySet<keyof LegacyAIAgentConfigColumns>
    ): Partial<LegacyAIAgentConfigColumns> {
        const patch: Partial<LegacyAIAgentConfigColumns> = {};
        if (dirtyFields.size === 0) {
            return patch;
        }
        const legacyValues = this.buildLegacyConfigValues();
        for (const key of dirtyFields) {
            if (legacyValues[key] !== undefined) {
                (patch as Record<string, unknown>)[key] = legacyValues[key];
            }
        }
        // R5 Follow-up #6: include stored counterparts for cross-field pair constraints when only one side is dirty
        if (dirtyFields.has('CompactionTargetPercent') && !dirtyFields.has('CompactionTriggerPercent')) {
            patch.CompactionTriggerPercent = legacyValues.CompactionTriggerPercent;
        } else if (dirtyFields.has('CompactionTriggerPercent') && !dirtyFields.has('CompactionTargetPercent')) {
            patch.CompactionTargetPercent = legacyValues.CompactionTargetPercent;
        }
        if (dirtyFields.has('MinExecutionsPerRun') && !dirtyFields.has('MaxExecutionsPerRun')) {
            patch.MaxExecutionsPerRun = legacyValues.MaxExecutionsPerRun;
        } else if (dirtyFields.has('MaxExecutionsPerRun') && !dirtyFields.has('MinExecutionsPerRun')) {
            patch.MinExecutionsPerRun = legacyValues.MinExecutionsPerRun;
        }
        return patch;
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
        const previousConfigJson =
            !isCreate && typeof configField.OldValue === 'string' ? configField.OldValue : null;
        const syncResult = SyncAgentLegacyColumnsAndConfiguration({
            IsNewRecord: isCreate,
            ConfigurationJson: this.Configuration,
            PreviousConfigurationJson: previousConfigJson,
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
