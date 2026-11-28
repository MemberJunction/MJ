import {
    AuthorizationEvaluator,
    AuthorizationInfo,
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntityInfo,
    EntityPermissionType,
    EntitySaveOptions,
    IEntityDataProvider,
    IMetadataProvider,
    Metadata,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
    WellKnownUserSource,
} from '@memberjunction/core';
import { EscapeSQLString, IndexByUUID, RegisterClass, UUIDsEqual, UUIDSet } from '@memberjunction/global';
import {
    MJAIAgentCategoryEntity,
    MJAIAgentEntity,
    MJAIAgentPermissionEntity,
    MJAIAgentTypeEntity,
} from '@memberjunction/core-entities';
import {
    AGENT_ACCEPTS_SKILLS_RANK,
    AGENT_ARTIFACT_CREATION_MODE_RANK,
    AGENT_FINAL_VALIDATION_MODE_RANK,
    AGENT_ISOLATION_RANK,
    AGENT_MESSAGE_MODE_RANK,
    AGENT_SEARCH_SCOPE_ACCESS_RANK,
    AGENT_SKILL_ACTIVATION_RANK,
    AGENT_STARTING_VALIDATION_MODE_RANK,
    BuildAgentTypeConfigurationFromLegacyFields,
    DeepMergeAgentConfigurations,
    DoesAgentAllowWidenFromBase,
    FindScopeConfigWideningViolations,
    FoldRebaseAwareChain,
    HasPathTraversalSegment,
    IntersectPayloadPathSets,
    IsAttachmentRootPathWithinAncestor,
    IsForbiddenMetadataHelperSeam,
    IsLegacyAIAgentConfigSqlDefault,
    IsPayloadPathSetWithinAncestor,
    IsPayloadScopeWithinAncestor,
    JsonHasAllowWidenFromBaseKey,
    LEGACY_AI_AGENT_CONFIG_SQL_DEFAULTS,
    MAX_AGENT_INHERITANCE_DEPTH,
    MJAIAgentEntityExtended,
    NARROW_ONLY_PROMPT_PARAM_GATES,
    NarrowAttachmentRootPath,
    NarrowPayloadScope,
    NarrowScopeConfigObjects,
    ParseAgentConfigJsonObject,
    ParseAgentConfiguration,
    ParseAgentHelperPlugins,
    ParseAgentInstantiationConfig,
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

/**
 * Canonical `MJ: Authorizations` capability name granting full administrative authority over
 * AI Agents, Categories, Types, Step Types, and Personas. Evaluated with ancestors via
 * `AuthorizationEvaluator` alongside the legacy administrative role fallback.
 */
export const AI_AGENT_ADMINISTRATION_AUTHORIZATION = 'AI: Agent Administration';

const ADMIN_ROLE_NAMES = new Set([
    'system administrator',
    'administrator',
    'admin',
    'administration',
    'agent administrator',
]);

const ISOLATION_RANK = AGENT_ISOLATION_RANK;
const SEARCH_ACCESS_RANK = AGENT_SEARCH_SCOPE_ACCESS_RANK;
const ACCEPTS_SKILLS_RANK = AGENT_ACCEPTS_SKILLS_RANK;
const SKILL_ACTIVATION_RANK = AGENT_SKILL_ACTIVATION_RANK;

/**
 * Type guard narrowing an `IEntityDataProvider` to `IMetadataProvider` when the provider
 * implements metadata/entity-instantiation methods (e.g., `SQLServerDataProvider`, `PostgreSQLDataProvider`).
 */
export function IsMetadataProvider(
    provider: IEntityDataProvider | null | undefined
): provider is IEntityDataProvider & IMetadataProvider {
    return Boolean(provider && 'GetEntityObject' in provider && 'Entities' in provider);
}

function authorizationsForAdminCheck(
    provider: IEntityDataProvider | Pick<IMetadataProvider, 'Authorizations'> | null | undefined
): AuthorizationInfo[] {
    const mdProvider =
        provider && 'Authorizations' in provider && Array.isArray((provider as Partial<IMetadataProvider>).Authorizations)
            ? (provider as Pick<IMetadataProvider, 'Authorizations'>)
            : undefined;
    try {
        const md = mdProvider ?? new Metadata();
        return Array.isArray(md.Authorizations) ? md.Authorizations : [];
    } catch {
        return [];
    }
}

/**
 * Returns true when `user` is the server system user, an Owner-type user, holds the
 * `AI: Agent Administration` authorization (direct or via an ancestor authorization), or holds
 * an administrative / `Agent Administrator` role.
 */
export function IsAgentAdminOrOwnerUser(
    user: UserInfo | null | undefined,
    provider?: IEntityDataProvider | Pick<IMetadataProvider, 'Authorizations'> | null
): boolean {
    if (!user) {
        return true; // System / unauthenticated internal context
    }
    if (user.Type?.trim().toLowerCase() === 'owner' || WellKnownUserSource.Instance.IsSystemUser(user)) {
        return true;
    }
    const authorizations = authorizationsForAdminCheck(provider);
    if (authorizations.length > 0) {
        const auth = authorizations.find(
            (a) => a.Name?.trim().toLowerCase() === AI_AGENT_ADMINISTRATION_AUTHORIZATION.toLowerCase()
        );
        if (auth) {
            const evaluator = new AuthorizationEvaluator();
            if (evaluator.UserCanExecuteWithAncestors(auth, user, authorizations)) {
                return true;
            }
        }
    }
    const roles = user.UserRoles ?? [];
    return roles.some((ur) => ADMIN_ROLE_NAMES.has((ur.Role ?? '').trim().toLowerCase()));
}

/**
 * Minimal entity context required by {@link CheckAgentAdminEntityPermissions}.
 */
export interface AgentAdminPermissionCheckContext {
    readonly ActiveUser: UserInfo | null | undefined;
    readonly EntityInfo: Pick<EntityInfo, 'VirtualEntity' | 'AllowCreateAPI' | 'AllowUpdateAPI' | 'AllowDeleteAPI'> | null | undefined;
    readonly ProviderToUse: IEntityDataProvider | Pick<IMetadataProvider, 'Authorizations'> | null | undefined;
}

/**
 * Shared `CheckPermissions` helper for admin-governed AI Agent definition entities
 * (`MJ: AI Agent Categories`, `MJ: AI Agent Types`, `MJ: AI Agent Step Types`).
 *
 * Baseline `Developer` and `Integration` role grants on these entities are read-only
 * (`CanRead: true`, `CanCreate/Update/Delete: false`), while `User: System` (and other `Owner`
 * users or holders of the `AI: Agent Administration` authorization / admin roles) may not carry
 * the dedicated `Agent Administrator` role in `UserRoles`. This helper authorizes those admin /
 * owner / system callers for Create/Update/Delete once entity-level API flags allow the operation,
 * while delegating reads and non-admin callers to `super.CheckPermissions`.
 */
export function CheckAgentAdminEntityPermissions(
    context: AgentAdminPermissionCheckContext,
    type: EntityPermissionType,
    throwError: boolean,
    superCheck: (type: EntityPermissionType, throwError: boolean) => boolean
): boolean {
    if (type === EntityPermissionType.Read) {
        return superCheck(type, throwError);
    }
    const user = context.ActiveUser;
    if (!user) {
        return superCheck(type, throwError);
    }
    const info = context.EntityInfo;
    if (!info || info.VirtualEntity) {
        return superCheck(type, throwError);
    }
    const apiAllowed =
        (type === EntityPermissionType.Create && info.AllowCreateAPI) ||
        (type === EntityPermissionType.Update && info.AllowUpdateAPI) ||
        (type === EntityPermissionType.Delete && info.AllowDeleteAPI);
    if (!apiAllowed) {
        return superCheck(type, throwError);
    }
    if (IsAgentAdminOrOwnerUser(user, context.ProviderToUse)) {
        return true;
    }
    return superCheck(type, throwError);
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
    MinExecutionsPerRun?: number | null;
    MaxSubAgentConsultRounds?: number | null;
    /** Optional additional narrow-only columns validated across the BaseAgentID cascade. */
    PayloadDownstreamPaths?: string | null;
    PayloadUpstreamPaths?: string | null;
    PayloadSelfReadPaths?: string | null;
    PayloadSelfWritePaths?: string | null;
    PayloadScope?: string | null;
    StartingPayloadValidationMode?: MJAIAgentEntity['StartingPayloadValidationMode'] | null;
    FinalPayloadValidationMode?: MJAIAgentEntity['FinalPayloadValidationMode'] | null;
    FinalPayloadValidationMaxRetries?: number | null;
    ArtifactCreationMode?: MJAIAgentEntity['ArtifactCreationMode'] | null;
    MessageMode?: MJAIAgentEntity['MessageMode'] | null;
    MaxMessages?: number | null;
    AttachmentRootPath?: string | null;
    InlineStorageThresholdBytes?: number | null;
    ContextWindowMaxTokens?: number | null;
    MaxNotesToInject?: number | null;
    MaxExamplesToInject?: number | null;
    NoteRetentionDays?: number | null;
    ExampleRetentionDays?: number | null;
    AutoArchiveEnabled?: boolean | null;
    ScopeConfig?: string | null;
    AgentTypePromptParams?: string | null;
    /** Optional JSON bag carrying `helperPlugins`, `allowWidenFromBase`, and operational config (`Configuration`). */
    Configuration?: string | null;
    /** Pre-save `Configuration` JSON (used to prevent non-admins from clearing `allowWidenFromBase`). */
    PreSaveConfiguration?: string | null;
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
            | 'MaxSubAgentConsultRounds'
            | 'ContextWindowMaxTokens'
            | 'MaxNotesToInject'
            | 'MaxExamplesToInject'
            | 'NoteRetentionDays'
            | 'ExampleRetentionDays'
            | 'MaxMessages'
            | 'InlineStorageThresholdBytes'
            | 'FinalPayloadValidationMaxRetries',
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
    /** Optional data/metadata provider for resolving `MJ: Authorizations` (`AI: Agent Administration`). */
    Provider?: IEntityDataProvider | null;
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
                    | 'MinExecutionsPerRun'
                    | 'MaxExecutionsPerRun'
                    | 'MaxSubAgentConsultRounds'
                    | 'PayloadDownstreamPaths'
                    | 'PayloadUpstreamPaths'
                    | 'PayloadSelfReadPaths'
                    | 'PayloadSelfWritePaths'
                    | 'PayloadScope'
                    | 'StartingPayloadValidationMode'
                    | 'FinalPayloadValidationMode'
                    | 'FinalPayloadValidationMaxRetries'
                    | 'ArtifactCreationMode'
                    | 'MessageMode'
                    | 'MaxMessages'
                    | 'AttachmentRootPath'
                    | 'InlineStorageThresholdBytes'
                    | 'ContextWindowMaxTokens'
                    | 'MaxNotesToInject'
                    | 'MaxExamplesToInject'
                    | 'NoteRetentionDays'
                    | 'ExampleRetentionDays'
                    | 'AutoArchiveEnabled'
                    | 'ScopeConfig'
                    | 'AgentTypePromptParams'
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
    const narrow = (
        acc: MJAIAgentEntity['SearchScopeAccess'] | null,
        val: MJAIAgentEntity['SearchScopeAccess'] | null | undefined
    ): MJAIAgentEntity['SearchScopeAccess'] | null => {
        if (val == null) return acc;
        if (acc === null || SEARCH_ACCESS_RANK[val] < SEARCH_ACCESS_RANK[acc]) {
            return val;
        }
        return acc;
    };
    let seed: MJAIAgentEntity['SearchScopeAccess'] | null = null;
    for (const layer of defaultPolicyLayers) {
        seed = narrow(seed, layer.scope?.searchScopeAccess);
    }
    if (ancestors.length === 0) {
        return seed;
    }
    const exp0 = ancestorConfigs[0]?.scope?.searchScopeAccess ?? null;
    const leg0 = ancestors[0].SearchScopeAccess ?? null;
    if (exp0 != null && leg0 != null) {
        seed = narrow(seed, SEARCH_ACCESS_RANK[leg0] < SEARCH_ACCESS_RANK[exp0] ? leg0 : exp0);
    } else {
        const isNonInst0 = Boolean(ancestors[0].BaseAgentID) && (ancestors[0].InstantiationMode ?? 'None') === 'None';
        seed = narrow(seed, exp0 ?? (leg0 && (leg0 !== 'None' || !isNonInst0) ? leg0 : null));
    }
    return FoldRebaseAwareChain({
        Nodes: ancestors,
        NodeConfigs: ancestorConfigs,
        Seed: seed,
        GetNodeValue: (anc, cfg, idx) => {
            const explicit = cfg?.scope?.searchScopeAccess ?? null;
            const legacy = anc.SearchScopeAccess ?? null;
            const canWiden = idx > 0 && cfg?.allowWidenFromBase === true;
            if (canWiden) {
                if (explicit != null) return explicit;
                return legacy != null && legacy !== 'None' ? legacy : undefined;
            }
            if (explicit != null && legacy != null) {
                return SEARCH_ACCESS_RANK[legacy] < SEARCH_ACCESS_RANK[explicit] ? legacy : explicit;
            }
            if (explicit != null) return explicit;
            const isNonInst = Boolean(anc.BaseAgentID) && (anc.InstantiationMode ?? 'None') === 'None';
            if (legacy != null && (legacy !== 'None' || !isNonInst)) {
                return legacy;
            }
            return undefined;
        },
        Narrow: (acc, next) => narrow(acc, next),
    });
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
    const isAdmin = IsAgentAdminOrOwnerUser(User, ctx.Provider);

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

    // 0b. Admin-only Configuration.allowWidenFromBase guard:
    //     Non-administrator users cannot set, modify, or clear `allowWidenFromBase` on save.
    const configDirty =
        !Target.IsSaved || !Target.DirtyFields || Target.DirtyFields.has('Configuration');
    if (
        !isAdmin &&
        User &&
        configDirty &&
        (JsonHasAllowWidenFromBaseKey(Target.Configuration) ||
            JsonHasAllowWidenFromBaseKey(Target.PreSaveConfiguration))
    ) {
        errors.push(
            new ValidationErrorInfo(
                'Configuration',
                'Only administrators may set, modify, or clear Configuration.allowWidenFromBase on an AI Agent.',
                Target.Configuration,
                ValidationErrorType.Failure
            )
        );
    }

    // 0c. Path-traversal guard on PayloadScope and AttachmentRootPath (ALL users, root or derived,
    //     even when allowWidenFromBase === true).
    const preParsedTargetConfig = ParseAgentConfiguration(Target.Configuration);
    const rawTargetPayloadScope =
        preParsedTargetConfig?.payload?.scope !== undefined
            ? preParsedTargetConfig.payload.scope
            : Target.PayloadScope;
    if (HasPathTraversalSegment(rawTargetPayloadScope)) {
        errors.push(
            new ValidationErrorInfo(
                'PayloadScope',
                `PayloadScope ('${rawTargetPayloadScope}') cannot contain '..' path traversal segments.`,
                rawTargetPayloadScope,
                ValidationErrorType.Failure
            )
        );
    }
    const rawTargetAttachRoot =
        preParsedTargetConfig?.attachments?.rootPath !== undefined
            ? preParsedTargetConfig.attachments.rootPath
            : Target.AttachmentRootPath;
    if (HasPathTraversalSegment(rawTargetAttachRoot)) {
        errors.push(
            new ValidationErrorInfo(
                'AttachmentRootPath',
                `AttachmentRootPath ('${rawTargetAttachRoot}') cannot contain '..' path traversal segments.`,
                rawTargetAttachRoot,
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

        const ancestorConfigsForInst = ancestors.map((a) => ParseAgentConfiguration(a.Configuration));
        const sanitizePosInt = (v: number | null | undefined): number | null =>
            typeof v === 'number' && Number.isFinite(v) && Math.floor(v) >= 1 ? Math.floor(v) : null;
        const minInstVal = (a: number | null, b: number | null): number | null =>
            b === null ? a : a === null ? b : Math.min(a, b);
        let seedMaxPerUser: number | null = null;
        for (const layer of defaultPolicyLayers) {
            seedMaxPerUser = minInstVal(seedMaxPerUser, sanitizePosInt(layer.instantiation?.maxInstancesPerUser));
        }
        if (ancestors.length > 0) {
            seedMaxPerUser = minInstVal(
                seedMaxPerUser,
                sanitizePosInt(ancestorConfigsForInst[0]?.instantiation?.maxInstancesPerUser)
            );
            seedMaxPerUser = minInstVal(
                seedMaxPerUser,
                sanitizePosInt(ParseAgentInstantiationConfig(ancestors[0].TypeConfiguration)?.maxInstancesPerUser)
            );
        }
        const effectiveMaxPerUser = FoldRebaseAwareChain({
            Nodes: ancestors,
            NodeConfigs: ancestorConfigsForInst,
            Seed: seedMaxPerUser,
            GetNodeValue: (anc, cfg, idx) => {
                const fromJson = sanitizePosInt(cfg?.instantiation?.maxInstancesPerUser);
                const fromTypeCfg = sanitizePosInt(ParseAgentInstantiationConfig(anc.TypeConfiguration)?.maxInstancesPerUser);
                if (idx > 0 && cfg?.allowWidenFromBase === true) {
                    if (fromJson !== null) return fromJson;
                    return fromTypeCfg !== null ? fromTypeCfg : undefined;
                }
                const combined = minInstVal(fromJson, fromTypeCfg);
                return combined !== null ? combined : undefined;
            },
            Narrow: (acc, next) => minInstVal(acc, next),
        });

        const ownerId = Target.OwnerUserID ?? User?.ID ?? null;
        const isCreatingPersonalInstance = (Target.InstantiationMode ?? 'None') === 'None';
        if (effectiveMaxPerUser !== null && ownerId && isCreatingPersonalInstance) {
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
            const rootBaseId = resolveRootId(baseAgent);
            const existingCount = AllAgents.filter(
                (a) =>
                    a.Status === 'Active' &&
                    a.BaseAgentID != null &&
                    (a.InstantiationMode ?? 'None') === 'None' &&
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

    const ancestorConfigs = ancestors.map((a) => ParseAgentConfiguration(a.Configuration));
    const targetConfig = preParsedTargetConfig;
    const targetAllowsWiden = targetConfig?.allowWidenFromBase === true;
    const baseAgentLabel = baseAgent.Name ?? baseAgent.ID;

    // Helper for R2-3 & R3-5: on existing saved instances where DirtyFields is tracked, only
    // re-check narrow-only columns and numeric ceilings that were actually modified (or when
    // Configuration or BaseAgentID itself was modified) so an admin tightening a base agent
    // never breaks unrelated edits (rename/persona) on pre-existing derived instances while
    // attaching/re-parenting BaseAgentID enforces every invariant.
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

    const widenHint = (fieldName: string, detail: string): string =>
        `Derived agent cannot widen ${fieldName} ${detail} beyond base agent '${baseAgentLabel}'. Set Configuration.allowWidenFromBase = true (Admin only) if intentional.`;

    // 4A. Non-admin-only sandbox checks (CanRun, DriverClass, CategoryID, TypeID)
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
                    `You do not have permission to run base agent '${baseAgentLabel}'.`,
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
    }

    // 4B. Unconditional derived invariants (ALL users, including Admins AND even with allowWidenFromBase === true)
    //     - Isolation minimum (InProcess < Worker < Process < Container)
    //     - Cross-cascade effectiveMinExecutionsPerRun <= effectiveMaxExecutionsPerRun
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

    const computeRebaseAncestorMin = (
        layerPicker: (l: IAgentConfiguration) => number | null | undefined,
        nodeJsonPicker: (cfg: IAgentConfiguration | null) => number | null | undefined,
        nodeLegacyPicker: (a: (typeof ancestors)[number]) => number | null | undefined,
        sqlDefault: number | null = null
    ): number | null => {
        const minFin = (a: number | null, b: number | null | undefined): number | null => {
            if (typeof b !== 'number' || !Number.isFinite(b)) return a;
            return a === null ? b : Math.min(a, b);
        };
        let seed: number | null = null;
        for (const layer of defaultPolicyLayers) {
            seed = minFin(seed, layerPicker(layer));
        }
        if (ancestors.length > 0) {
            const exp0 = nodeJsonPicker(ancestorConfigs[0]);
            const leg0 = nodeLegacyPicker(ancestors[0]);
            const leg0Eff =
                exp0 === undefined && sqlDefault !== null && leg0 === sqlDefault && seed !== null ? null : leg0;
            seed = minFin(seed, exp0);
            seed = minFin(seed, leg0Eff);
        }
        return FoldRebaseAwareChain({
            Nodes: ancestors,
            NodeConfigs: ancestorConfigs,
            Seed: seed,
            GetNodeValue: (anc, cfg, idx) => {
                const explicit = nodeJsonPicker(cfg);
                const legacy = nodeLegacyPicker(anc);
                if (idx > 0 && cfg?.allowWidenFromBase === true) {
                    if (explicit === null) return null;
                    if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
                    if (typeof legacy === 'number' && Number.isFinite(legacy) && legacy !== sqlDefault) return legacy;
                    return undefined;
                }
                if (typeof explicit === 'number' && Number.isFinite(explicit)) {
                    if (typeof legacy === 'number' && Number.isFinite(legacy) && legacy !== sqlDefault) {
                        return Math.min(explicit, legacy);
                    }
                    return explicit;
                }
                if (typeof legacy === 'number' && Number.isFinite(legacy) && legacy !== sqlDefault) {
                    return legacy;
                }
                return undefined;
            },
            Narrow: (acc, next) => minFin(acc, next),
        });
    };

    // Cross-cascade effectiveMinExecutionsPerRun <= effectiveMaxExecutionsPerRun
    const ancestorMaxExecutions = computeRebaseAncestorMin(
        (l) => l.subAgentExecution?.maxExecutionsPerRun,
        (cfg) => cfg?.subAgentExecution?.maxExecutionsPerRun,
        (a) => a.MaxExecutionsPerRun
    );
    const targetMaxExecutions =
        targetConfig?.subAgentExecution?.maxExecutionsPerRun !== undefined
            ? targetConfig.subAgentExecution.maxExecutionsPerRun
            : Target.MaxExecutionsPerRun;
    const effectiveMaxExecAcrossCascade: number | null = targetAllowsWiden
        ? targetMaxExecutions !== undefined
            ? targetMaxExecutions
            : ancestorMaxExecutions
        : typeof targetMaxExecutions === 'number' && Number.isFinite(targetMaxExecutions)
          ? ancestorMaxExecutions !== null
              ? Math.min(ancestorMaxExecutions, targetMaxExecutions)
              : targetMaxExecutions
          : ancestorMaxExecutions;

    let effectiveMinExecAcrossCascade: number | null = null;
    for (const layer of defaultPolicyLayers) {
        if (typeof layer.subAgentExecution?.minExecutionsPerRun === 'number') {
            effectiveMinExecAcrossCascade = layer.subAgentExecution.minExecutionsPerRun;
        }
    }
    for (let i = 0; i < ancestors.length; i++) {
        const v = ancestorConfigs[i]?.subAgentExecution?.minExecutionsPerRun ?? ancestors[i].MinExecutionsPerRun;
        if (typeof v === 'number' && Number.isFinite(v)) {
            effectiveMinExecAcrossCascade = v;
        }
    }
    const targetMinExec =
        targetConfig?.subAgentExecution?.minExecutionsPerRun !== undefined
            ? targetConfig.subAgentExecution.minExecutionsPerRun
            : Target.MinExecutionsPerRun;
    if (typeof targetMinExec === 'number' && Number.isFinite(targetMinExec)) {
        effectiveMinExecAcrossCascade = targetMinExec;
    } else if (targetMinExec === null && targetConfig?.subAgentExecution?.minExecutionsPerRun === null) {
        effectiveMinExecAcrossCascade = null;
    }
    if (
        (shouldEnforceField('MinExecutionsPerRun') || shouldEnforceField('MaxExecutionsPerRun')) &&
        effectiveMinExecAcrossCascade !== null &&
        effectiveMaxExecAcrossCascade !== null &&
        effectiveMinExecAcrossCascade > effectiveMaxExecAcrossCascade
    ) {
        errors.push(
            new ValidationErrorInfo(
                'MinExecutionsPerRun',
                `Effective MinExecutionsPerRun (${effectiveMinExecAcrossCascade}) across the BaseAgentID cascade cannot exceed effective MaxExecutionsPerRun (${effectiveMaxExecAcrossCascade}).`,
                effectiveMinExecAcrossCascade,
                ValidationErrorType.Failure
            )
        );
    }

    // 4C. Non-widening ceiling & capability enforcement for ALL users (including Admins!) unless
    //     Configuration.allowWidenFromBase === true (eliminates save-time vs runtime split-brain).
    if (!targetAllowsWiden) {
        const checkMultiHopUpperBound = (
            fieldName:
                | 'MaxCostPerRun'
                | 'MaxTokensPerRun'
                | 'MaxTimePerRun'
                | 'MaxIterationsPerRun'
                | 'MaxExecutionsPerRun'
                | 'MaxSubAgentConsultRounds'
                | 'ContextWindowMaxTokens'
                | 'MaxNotesToInject'
                | 'MaxExamplesToInject'
                | 'NoteRetentionDays'
                | 'ExampleRetentionDays'
                | 'MaxMessages'
                | 'InlineStorageThresholdBytes'
                | 'FinalPayloadValidationMaxRetries',
            effectiveCeiling: number | null,
            childLimit: number | null | undefined,
            explicitJsonVal: number | null | undefined,
            sqlDefault: number | null = null
        ): void => {
            if (!shouldEnforceField(fieldName)) {
                return;
            }
            if (effectiveCeiling === null) {
                return;
            }
            // Ignore untouched SQL default values when JSON didn't set the key and the field wasn't dirtied
            if (
                sqlDefault !== null &&
                explicitJsonVal === undefined &&
                childLimit === sqlDefault &&
                Target.DirtyFields &&
                !Target.DirtyFields.has(fieldName)
            ) {
                return;
            }
            if (childLimit === null) {
                const isExplicitClear =
                    (Target.IsSaved &&
                        Target.DirtyFields?.has(fieldName) === true &&
                        typeof Target.PreSaveLimits?.[fieldName] === 'number') ||
                    explicitJsonVal === null;
                if (isExplicitClear) {
                    errors.push(
                        new ValidationErrorInfo(
                            fieldName,
                            widenHint(fieldName, `(cleared to null vs ceiling ${effectiveCeiling})`),
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
                        widenHint(fieldName, `(${childLimit} > ceiling ${effectiveCeiling})`),
                        childLimit,
                        ValidationErrorType.Failure
                    )
                );
            }
        };

        checkMultiHopUpperBound(
            'MaxCostPerRun',
            computeRebaseAncestorMin(() => undefined, () => undefined, (a) => a.MaxCostPerRun),
            Target.MaxCostPerRun,
            undefined
        );
        checkMultiHopUpperBound(
            'MaxTokensPerRun',
            computeRebaseAncestorMin(() => undefined, () => undefined, (a) => a.MaxTokensPerRun),
            Target.MaxTokensPerRun,
            undefined
        );
        checkMultiHopUpperBound(
            'MaxTimePerRun',
            computeRebaseAncestorMin(() => undefined, () => undefined, (a) => a.MaxTimePerRun),
            Target.MaxTimePerRun,
            undefined
        );
        checkMultiHopUpperBound(
            'MaxIterationsPerRun',
            computeRebaseAncestorMin(() => undefined, () => undefined, (a) => a.MaxIterationsPerRun),
            Target.MaxIterationsPerRun,
            undefined
        );
        checkMultiHopUpperBound(
            'MaxExecutionsPerRun',
            ancestorMaxExecutions,
            targetMaxExecutions,
            targetConfig?.subAgentExecution?.maxExecutionsPerRun
        );
        checkMultiHopUpperBound(
            'MaxSubAgentConsultRounds',
            computeRebaseAncestorMin(
                (l) => l.subAgentExecution?.maxConsultRounds,
                (cfg) => cfg?.subAgentExecution?.maxConsultRounds,
                (a) => a.MaxSubAgentConsultRounds
            ),
            targetConfig?.subAgentExecution?.maxConsultRounds !== undefined
                ? targetConfig.subAgentExecution.maxConsultRounds
                : Target.MaxSubAgentConsultRounds,
            targetConfig?.subAgentExecution?.maxConsultRounds
        );
        checkMultiHopUpperBound(
            'ContextWindowMaxTokens',
            computeRebaseAncestorMin(
                (l) => l.contextWindow?.maxTokens,
                (cfg) => cfg?.contextWindow?.maxTokens,
                (a) => a.ContextWindowMaxTokens
            ),
            targetConfig?.contextWindow?.maxTokens !== undefined
                ? targetConfig.contextWindow.maxTokens
                : Target.ContextWindowMaxTokens,
            targetConfig?.contextWindow?.maxTokens
        );
        checkMultiHopUpperBound(
            'MaxNotesToInject',
            computeRebaseAncestorMin(
                (l) => l.memory?.maxNotesToInject,
                (cfg) => cfg?.memory?.maxNotesToInject,
                (a) => a.MaxNotesToInject,
                5 // SQL schema default DF_AIAgent_MaxNotesToInject
            ),
            targetConfig?.memory?.maxNotesToInject !== undefined
                ? targetConfig.memory.maxNotesToInject
                : Target.MaxNotesToInject,
            targetConfig?.memory?.maxNotesToInject,
            5 // SQL schema default DF_AIAgent_MaxNotesToInject
        );
        checkMultiHopUpperBound(
            'MaxExamplesToInject',
            computeRebaseAncestorMin(
                (l) => l.memory?.maxExamplesToInject,
                (cfg) => cfg?.memory?.maxExamplesToInject,
                (a) => a.MaxExamplesToInject,
                3 // SQL schema default DF_AIAgent_MaxExamplesToInject
            ),
            targetConfig?.memory?.maxExamplesToInject !== undefined
                ? targetConfig.memory.maxExamplesToInject
                : Target.MaxExamplesToInject,
            targetConfig?.memory?.maxExamplesToInject,
            3 // SQL schema default DF_AIAgent_MaxExamplesToInject
        );
        const ancestorNoteRetentionDays = computeRebaseAncestorMin(
            (l) => l.memory?.noteRetentionDays,
            (cfg) => cfg?.memory?.noteRetentionDays,
            (a) => a.NoteRetentionDays,
            90 // SQL schema default DF_AIAgent_NoteRetentionDays
        );
        checkMultiHopUpperBound(
            'NoteRetentionDays',
            ancestorNoteRetentionDays,
            targetConfig?.memory?.noteRetentionDays !== undefined
                ? targetConfig.memory.noteRetentionDays
                : Target.NoteRetentionDays,
            targetConfig?.memory?.noteRetentionDays,
            90 // SQL schema default DF_AIAgent_NoteRetentionDays
        );
        const ancestorExampleRetentionDays = computeRebaseAncestorMin(
            (l) => l.memory?.exampleRetentionDays,
            (cfg) => cfg?.memory?.exampleRetentionDays,
            (a) => a.ExampleRetentionDays,
            180 // SQL schema default DF_AIAgent_ExampleRetentionDays
        );
        checkMultiHopUpperBound(
            'ExampleRetentionDays',
            ancestorExampleRetentionDays,
            targetConfig?.memory?.exampleRetentionDays !== undefined
                ? targetConfig.memory.exampleRetentionDays
                : Target.ExampleRetentionDays,
            targetConfig?.memory?.exampleRetentionDays,
            180 // SQL schema default DF_AIAgent_ExampleRetentionDays
        );
        checkMultiHopUpperBound(
            'MaxMessages',
            computeRebaseAncestorMin(
                (l) => l.attachments?.maxMessages,
                (cfg) => cfg?.attachments?.maxMessages,
                (a) => a.MaxMessages
            ),
            targetConfig?.attachments?.maxMessages !== undefined
                ? targetConfig.attachments.maxMessages
                : Target.MaxMessages,
            targetConfig?.attachments?.maxMessages
        );
        checkMultiHopUpperBound(
            'InlineStorageThresholdBytes',
            computeRebaseAncestorMin(
                (l) => l.attachments?.inlineStorageThresholdBytes,
                (cfg) => cfg?.attachments?.inlineStorageThresholdBytes,
                (a) => a.InlineStorageThresholdBytes
            ),
            targetConfig?.attachments?.inlineStorageThresholdBytes !== undefined
                ? targetConfig.attachments.inlineStorageThresholdBytes
                : Target.InlineStorageThresholdBytes,
            targetConfig?.attachments?.inlineStorageThresholdBytes
        );
        checkMultiHopUpperBound(
            'FinalPayloadValidationMaxRetries',
            computeRebaseAncestorMin(
                (l) => l.payload?.finalValidationMaxRetries,
                (cfg) => cfg?.payload?.finalValidationMaxRetries,
                (a) => a.FinalPayloadValidationMaxRetries,
                3 // SQL schema default DF_AIAgent_FinalPayloadValidationMaxRetries
            ),
            targetConfig?.payload?.finalValidationMaxRetries !== undefined
                ? targetConfig.payload.finalValidationMaxRetries
                : Target.FinalPayloadValidationMaxRetries,
            targetConfig?.payload?.finalValidationMaxRetries,
            3 // SQL schema default DF_AIAgent_FinalPayloadValidationMaxRetries
        );

        // instantiation.maxInstancesPerUser ceiling (cannot raise above ancestor ceiling)
        const ancestorMaxInstances = computeRebaseAncestorMin(
            (l) => l.instantiation?.maxInstancesPerUser,
            (cfg) => cfg?.instantiation?.maxInstancesPerUser,
            (a) => ParseAgentInstantiationConfig(a.TypeConfiguration)?.maxInstancesPerUser
        );
        const targetMaxInstances =
            targetConfig?.instantiation?.maxInstancesPerUser ??
            ParseAgentInstantiationConfig(Target.TypeConfiguration)?.maxInstancesPerUser;
        if (
            shouldEnforceField('Configuration') &&
            ancestorMaxInstances !== null &&
            typeof targetMaxInstances === 'number' &&
            targetMaxInstances > ancestorMaxInstances
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'Configuration',
                    widenHint('instantiation.maxInstancesPerUser', `(${targetMaxInstances} > ceiling ${ancestorMaxInstances})`),
                    targetMaxInstances,
                    ValidationErrorType.Failure
                )
            );
        }

        // Narrow-only capabilities validated across BOTH Configuration JSON and legacy columns
        // as well as Category/AgentType default policy layers (rebase-aware across ancestors):
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
                    widenHint('SearchScopeAccess', `('${targetSearchAccess}' > '${ancestorSearchAccess}')`),
                    targetSearchAccess,
                    ValidationErrorType.Failure
                )
            );
        }

        // 4b. AcceptsSkills (None: 0 < Limited: 1 < All: 2)
        const ancestorAcceptsSkills = FoldRebaseAwareChain<
            (typeof ancestors)[number],
            MJAIAgentEntity['AcceptsSkills'] | null
        >({
            Nodes: ancestors,
            NodeConfigs: ancestorConfigs,
            Seed: ancestors[0]?.AcceptsSkills ?? null,
            GetNodeValue: (anc) => anc.AcceptsSkills ?? undefined,
            Narrow: (acc, next) => {
                if (next == null) return acc;
                return acc === null || ACCEPTS_SKILLS_RANK[next] < ACCEPTS_SKILLS_RANK[acc] ? next : acc;
            },
        });
        if (
            shouldEnforceField('AcceptsSkills') &&
            ancestorAcceptsSkills !== null &&
            Target.AcceptsSkills != null &&
            ACCEPTS_SKILLS_RANK[Target.AcceptsSkills] > ACCEPTS_SKILLS_RANK[ancestorAcceptsSkills]
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'AcceptsSkills',
                    widenHint('AcceptsSkills', `('${Target.AcceptsSkills}' > '${ancestorAcceptsSkills}')`),
                    Target.AcceptsSkills,
                    ValidationErrorType.Failure
                )
            );
        }

        // 4c. SkillActivationMode (RequestedOnly: 0 < Auto: 1)
        const narrowSkill = (
            acc: MJAIAgentEntity['SkillActivationMode'] | null,
            v: MJAIAgentEntity['SkillActivationMode'] | null | undefined
        ): MJAIAgentEntity['SkillActivationMode'] | null => {
            if (v == null) return acc;
            return acc === null || SKILL_ACTIVATION_RANK[v] < SKILL_ACTIVATION_RANK[acc] ? v : acc;
        };
        let seedAncSkill: MJAIAgentEntity['SkillActivationMode'] | null = null;
        for (const layer of defaultPolicyLayers) {
            seedAncSkill = narrowSkill(seedAncSkill, layer.skills?.activationMode);
        }
        if (ancestors.length > 0) {
            seedAncSkill = narrowSkill(seedAncSkill, ancestorConfigs[0]?.skills?.activationMode);
            seedAncSkill = narrowSkill(seedAncSkill, ancestors[0].SkillActivationMode);
        }
        const ancestorSkillMode = FoldRebaseAwareChain({
            Nodes: ancestors,
            NodeConfigs: ancestorConfigs,
            Seed: seedAncSkill,
            GetNodeValue: (anc, cfg, idx) => {
                const exp = cfg?.skills?.activationMode ?? null;
                const leg = anc.SkillActivationMode ?? null;
                if (idx > 0 && cfg?.allowWidenFromBase === true) {
                    if (exp != null) return exp;
                    return leg != null && leg !== 'RequestedOnly' ? leg : undefined;
                }
                if (exp != null && leg != null) {
                    return SKILL_ACTIVATION_RANK[leg] < SKILL_ACTIVATION_RANK[exp] ? leg : exp;
                }
                if (exp != null) return exp;
                const isNonInst = Boolean(anc.BaseAgentID) && (anc.InstantiationMode ?? 'None') === 'None';
                return leg != null && (leg !== 'RequestedOnly' || !isNonInst) ? leg : undefined;
            },
            Narrow: (acc, next) => narrowSkill(acc, next),
        });
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
                    widenHint('SkillActivationMode', `('${targetSkillMode}' > '${ancestorSkillMode}')`),
                    targetSkillMode,
                    ValidationErrorType.Failure
                )
            );
        }

        // 4d. RequirePlanMode (rebase-aware monotonic OR)
        const seedAncRequirePlan =
            defaultPolicyLayers.some((l) => l.execution?.requirePlanMode === true) ||
            (ancestors.length > 0 &&
                (ancestorConfigs[0]?.execution?.requirePlanMode === true || ancestors[0].RequirePlanMode === true));
        const ancestorRequiresPlan = FoldRebaseAwareChain({
            Nodes: ancestors,
            NodeConfigs: ancestorConfigs,
            Seed: seedAncRequirePlan,
            GetNodeValue: (anc, cfg, idx) => {
                const exp = cfg?.execution?.requirePlanMode;
                const leg = anc.RequirePlanMode;
                if (idx > 0 && cfg?.allowWidenFromBase === true) {
                    if (typeof exp === 'boolean') return exp;
                    return leg === true ? true : undefined;
                }
                if (exp === true || leg === true) return true;
                return typeof exp === 'boolean' ? exp : undefined;
            },
            Narrow: (acc, next) => acc || next,
        });
        const targetRequirePlan = targetConfig?.execution?.requirePlanMode ?? Target.RequirePlanMode;
        if (shouldEnforceField('RequirePlanMode') && ancestorRequiresPlan && targetRequirePlan === false) {
            errors.push(
                new ValidationErrorInfo(
                    'RequirePlanMode',
                    widenHint('RequirePlanMode', `(false vs required true)`),
                    false,
                    ValidationErrorType.Failure
                )
            );
        }

        // 4e. Narrow-only booleans (rebase-aware monotonic AND)
        const computeRebaseAncestorBoolAnd = (
            layerPicker: (l: IAgentConfiguration) => boolean | null | undefined,
            nodeJsonPicker: (cfg: IAgentConfiguration | null) => boolean | null | undefined,
            nodeLegacyPicker: (a: (typeof ancestors)[number]) => boolean | null | undefined,
            sqlDefault: boolean
        ): boolean | null => {
            const foldAnd = (acc: boolean | null, v: boolean | null | undefined): boolean | null => {
                if (typeof v !== 'boolean') return acc;
                return acc === null ? v : acc && v;
            };
            let seed: boolean | null = null;
            for (const layer of defaultPolicyLayers) {
                seed = foldAnd(seed, layerPicker(layer));
            }
            if (ancestors.length > 0) {
                const exp0 = nodeJsonPicker(ancestorConfigs[0]);
                const leg0 = nodeLegacyPicker(ancestors[0]);
                seed =
                    typeof exp0 === 'boolean' && typeof leg0 === 'boolean'
                        ? foldAnd(seed, exp0 && leg0)
                        : foldAnd(seed, exp0 ?? leg0);
            }
            return FoldRebaseAwareChain({
                Nodes: ancestors,
                NodeConfigs: ancestorConfigs,
                Seed: seed,
                GetNodeValue: (anc, cfg, idx) => {
                    const exp = nodeJsonPicker(cfg);
                    const leg = nodeLegacyPicker(anc);
                    if (idx > 0 && cfg?.allowWidenFromBase === true) {
                        if (typeof exp === 'boolean') return exp;
                        return typeof leg === 'boolean' && leg !== sqlDefault ? leg : undefined;
                    }
                    if (typeof exp === 'boolean' && typeof leg === 'boolean') return exp && leg;
                    if (typeof exp === 'boolean') return exp;
                    if (typeof leg === 'boolean') {
                        if (sqlDefault === false && leg === false) {
                            const isNonInst = Boolean(anc.BaseAgentID) && (anc.InstantiationMode ?? 'None') === 'None';
                            return isNonInst ? undefined : false;
                        }
                        return leg !== sqlDefault ? leg : undefined;
                    }
                    return undefined;
                },
                Narrow: (acc, next) => foldAnd(acc, next),
            });
        };

        const checkRebaseNarrowBoolean = (
            fieldName: 'SupportsPlanMode' | 'AcceptUnregisteredFiles' | 'AllowEphemeralClientTools' | 'AllowMemoryWrite',
            ancestorEffective: boolean | null,
            targetVal: boolean | null | undefined
        ): void => {
            if (shouldEnforceField(fieldName) && ancestorEffective === false && targetVal === true) {
                errors.push(
                    new ValidationErrorInfo(
                        fieldName,
                        widenHint(fieldName, `(true vs disabled false)`),
                        true,
                        ValidationErrorType.Failure
                    )
                );
            }
        };

        checkRebaseNarrowBoolean(
            'SupportsPlanMode',
            computeRebaseAncestorBoolAnd(
                (l) => l.execution?.supportsPlanMode,
                (cfg) => cfg?.execution?.supportsPlanMode,
                (a) => a.SupportsPlanMode,
                true
            ),
            targetConfig?.execution?.supportsPlanMode ?? Target.SupportsPlanMode
        );
        checkRebaseNarrowBoolean(
            'AcceptUnregisteredFiles',
            computeRebaseAncestorBoolAnd(
                (l) => l.attachments?.acceptUnregisteredFiles,
                (cfg) => cfg?.attachments?.acceptUnregisteredFiles,
                (a) => a.AcceptUnregisteredFiles,
                false
            ),
            targetConfig?.attachments?.acceptUnregisteredFiles ?? Target.AcceptUnregisteredFiles
        );
        checkRebaseNarrowBoolean(
            'AllowEphemeralClientTools',
            computeRebaseAncestorBoolAnd(
                (l) => l.clientTools?.allowEphemeral,
                (cfg) => cfg?.clientTools?.allowEphemeral,
                (a) => a.AllowEphemeralClientTools,
                true
            ),
            targetConfig?.clientTools?.allowEphemeral ?? Target.AllowEphemeralClientTools
        );
        checkRebaseNarrowBoolean(
            'AllowMemoryWrite',
            computeRebaseAncestorBoolAnd(
                (l) => l.memory?.allowMemoryWrite,
                (cfg) => cfg?.memory?.allowMemoryWrite,
                (a) => a.AllowMemoryWrite,
                true
            ),
            targetConfig?.memory?.allowMemoryWrite ?? Target.AllowMemoryWrite
        );

        // 4f. Ranked enum surfaces: ArtifactCreationMode, MessageMode, StartingPayloadValidationMode, FinalPayloadValidationMode
        const checkRankedEnumSurface = <T extends string>(args: {
            fieldName:
                | 'ArtifactCreationMode'
                | 'MessageMode'
                | 'StartingPayloadValidationMode'
                | 'FinalPayloadValidationMode';
            ranks: Readonly<Record<T, number>>;
            sqlDefault: T;
            layerPicker: (l: IAgentConfiguration) => T | null | undefined;
            jsonPicker: (cfg: IAgentConfiguration | null) => T | null | undefined;
            legacyPicker: (a: (typeof ancestors)[number]) => T | null | undefined;
            targetLegacy: T | null | undefined;
        }): void => {
            if (!shouldEnforceField(args.fieldName)) return;
            const narrowEnum = (acc: T | null, v: T | null | undefined): T | null => {
                if (v == null) return acc;
                return acc === null || args.ranks[v] < args.ranks[acc] ? v : acc;
            };
            let seed: T | null = null;
            for (const layer of defaultPolicyLayers) {
                seed = narrowEnum(seed, args.layerPicker(layer));
            }
            if (ancestors.length > 0) {
                const exp0 = args.jsonPicker(ancestorConfigs[0]);
                const leg0 = args.legacyPicker(ancestors[0]);
                if (exp0 != null && leg0 != null) {
                    seed = narrowEnum(seed, args.ranks[leg0] < args.ranks[exp0] ? leg0 : exp0);
                } else if (exp0 != null) {
                    seed = narrowEnum(seed, exp0);
                } else if (leg0 != null && leg0 !== args.sqlDefault) {
                    seed = narrowEnum(seed, leg0);
                } else if (seed === null && leg0 != null) {
                    seed = leg0;
                }
            }
            const ancestorEffective = FoldRebaseAwareChain({
                Nodes: ancestors,
                NodeConfigs: ancestorConfigs,
                Seed: seed,
                GetNodeValue: (anc, cfg, idx) => {
                    const exp = args.jsonPicker(cfg) ?? null;
                    const leg = args.legacyPicker(anc) ?? null;
                    if (idx > 0 && cfg?.allowWidenFromBase === true) {
                        if (exp != null) return exp;
                        return leg != null && leg !== args.sqlDefault ? leg : undefined;
                    }
                    if (exp != null && leg != null) {
                        return args.ranks[leg] < args.ranks[exp] ? leg : exp;
                    }
                    if (exp != null) return exp;
                    return leg != null && leg !== args.sqlDefault ? leg : undefined;
                },
                Narrow: (acc, next) => narrowEnum(acc, next),
            });
            if (ancestorEffective === null) return;
            const expTarget = args.jsonPicker(targetConfig);
            if (
                expTarget === undefined &&
                args.targetLegacy === args.sqlDefault &&
                Target.DirtyFields &&
                !Target.DirtyFields.has(args.fieldName)
            ) {
                return;
            }
            const targetVal = expTarget ?? args.targetLegacy ?? null;
            if (targetVal != null && args.ranks[targetVal] > args.ranks[ancestorEffective]) {
                errors.push(
                    new ValidationErrorInfo(
                        args.fieldName,
                        widenHint(args.fieldName, `('${targetVal}' > '${ancestorEffective}')`),
                        targetVal,
                        ValidationErrorType.Failure
                    )
                );
            }
        };

        checkRankedEnumSurface({
            fieldName: 'ArtifactCreationMode',
            ranks: AGENT_ARTIFACT_CREATION_MODE_RANK,
            sqlDefault: 'Always',
            layerPicker: (l) => l.artifacts?.creationMode,
            jsonPicker: (cfg) => cfg?.artifacts?.creationMode,
            legacyPicker: (a) => a.ArtifactCreationMode,
            targetLegacy: Target.ArtifactCreationMode,
        });
        checkRankedEnumSurface({
            fieldName: 'MessageMode',
            ranks: AGENT_MESSAGE_MODE_RANK,
            sqlDefault: 'None',
            layerPicker: (l) => l.attachments?.messageMode,
            jsonPicker: (cfg) => cfg?.attachments?.messageMode,
            legacyPicker: (a) => a.MessageMode,
            targetLegacy: Target.MessageMode,
        });
        checkRankedEnumSurface({
            fieldName: 'StartingPayloadValidationMode',
            ranks: AGENT_STARTING_VALIDATION_MODE_RANK,
            sqlDefault: 'Fail',
            layerPicker: (l) => l.payload?.startingValidationMode,
            jsonPicker: (cfg) => cfg?.payload?.startingValidationMode,
            legacyPicker: (a) => a.StartingPayloadValidationMode,
            targetLegacy: Target.StartingPayloadValidationMode,
        });
        checkRankedEnumSurface({
            fieldName: 'FinalPayloadValidationMode',
            ranks: AGENT_FINAL_VALIDATION_MODE_RANK,
            sqlDefault: 'Retry',
            layerPicker: (l) => l.payload?.finalValidationMode,
            jsonPicker: (cfg) => cfg?.payload?.finalValidationMode,
            legacyPicker: (a) => a.FinalPayloadValidationMode,
            targetLegacy: Target.FinalPayloadValidationMode,
        });

        // 4g. AutoArchiveEnabled: cannot flip true -> false when ancestor enforces finite retention
        const ancestorHasFiniteRetention =
            ancestorNoteRetentionDays !== null || ancestorExampleRetentionDays !== null;
        const seedAncAutoArchive: boolean = (() => {
            if (ancestors.length > 0) {
                const exp0 = ancestorConfigs[0]?.memory?.autoArchiveEnabled;
                if (typeof exp0 === 'boolean') return exp0;
                const leg0 = ancestors[0].AutoArchiveEnabled;
                if (typeof leg0 === 'boolean' && leg0 !== true) return leg0;
            }
            for (let i = defaultPolicyLayers.length - 1; i >= 0; i--) {
                if (typeof defaultPolicyLayers[i].memory?.autoArchiveEnabled === 'boolean') {
                    return defaultPolicyLayers[i].memory!.autoArchiveEnabled!;
                }
            }
            return true;
        })();
        const ancestorAutoArchive = FoldRebaseAwareChain({
            Nodes: ancestors,
            NodeConfigs: ancestorConfigs,
            Seed: seedAncAutoArchive,
            GetNodeValue: (anc, cfg) => {
                const exp = cfg?.memory?.autoArchiveEnabled;
                if (typeof exp === 'boolean') return exp;
                const leg = anc.AutoArchiveEnabled;
                return typeof leg === 'boolean' && leg !== true ? leg : undefined;
            },
            Narrow: (acc, next) => (acc === true && ancestorHasFiniteRetention && next === false ? true : next),
        });
        const targetAutoArchive = targetConfig?.memory?.autoArchiveEnabled ?? Target.AutoArchiveEnabled;
        if (
            shouldEnforceField('AutoArchiveEnabled') &&
            ancestorAutoArchive === true &&
            ancestorHasFiniteRetention &&
            targetAutoArchive === false
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'AutoArchiveEnabled',
                    widenHint('AutoArchiveEnabled', '(false while ancestor enforces finite retention)'),
                    false,
                    ValidationErrorType.Failure
                )
            );
        }

        // 4h. Payload path glob-sets (Downstream, Upstream, SelfRead, SelfWrite)
        const parsePathList = (raw: string | null | undefined): string[] | null => {
            if (!raw || raw.trim().length === 0) return null;
            try {
                const p: unknown = JSON.parse(raw);
                if (Array.isArray(p) && p.every((item): item is string => typeof item === 'string')) {
                    return p;
                }
            } catch {
                return null;
            }
            return null;
        };
        const checkPayloadPathSurface = (args: {
            fieldName:
                | 'PayloadDownstreamPaths'
                | 'PayloadUpstreamPaths'
                | 'PayloadSelfReadPaths'
                | 'PayloadSelfWritePaths';
            jsonPicker: (cfg: IAgentConfiguration | null) => string[] | null | undefined;
            legacyPicker: (a: (typeof ancestors)[number]) => string | null | undefined;
            targetLegacy: string | null | undefined;
            treatWildcardAsDbDefault: boolean;
        }): void => {
            if (!shouldEnforceField(args.fieldName)) return;
            let seed: string[] | null = null;
            for (const layer of defaultPolicyLayers) {
                const lp = args.jsonPicker(layer);
                if (Array.isArray(lp)) {
                    seed = IntersectPayloadPathSets(seed, lp);
                }
            }
            if (ancestors.length > 0) {
                const exp0 = args.jsonPicker(ancestorConfigs[0]);
                if (Array.isArray(exp0)) {
                    seed = IntersectPayloadPathSets(seed, exp0);
                } else {
                    const leg0 = parsePathList(args.legacyPicker(ancestors[0]));
                    if (leg0 !== null) {
                        const isDbWildcard =
                            args.treatWildcardAsDbDefault && leg0.length === 1 && leg0[0] === '*';
                        if (!isDbWildcard) {
                            seed = IntersectPayloadPathSets(seed, leg0);
                        }
                    }
                }
            }
            const ancestorPaths = FoldRebaseAwareChain<
                (typeof ancestors)[number],
                string[] | null
            >({
                Nodes: ancestors,
                NodeConfigs: ancestorConfigs,
                Seed: seed,
                GetNodeValue: (anc, cfg, idx) => {
                    const exp = args.jsonPicker(cfg);
                    if (idx > 0 && cfg?.allowWidenFromBase === true && exp === null) {
                        return null;
                    }
                    if (Array.isArray(exp)) return [...exp];
                    const leg = parsePathList(args.legacyPicker(anc));
                    if (leg !== null) {
                        const isDbWildcard =
                            args.treatWildcardAsDbDefault && leg.length === 1 && leg[0] === '*';
                        if (!isDbWildcard) return leg;
                    }
                    return undefined;
                },
                Narrow: (acc, next) => IntersectPayloadPathSets(acc, next),
                Rebase: (_acc, next) => (next === null ? null : [...next]),
            });

            const expTarget = args.jsonPicker(targetConfig);
            let targetPaths: string[] | null | undefined;
            if (expTarget !== undefined) {
                targetPaths = expTarget;
            } else {
                const legTarget = parsePathList(args.targetLegacy);
                if (legTarget !== null) {
                    const isUntouchedWildcard =
                        args.treatWildcardAsDbDefault &&
                        legTarget.length === 1 &&
                        legTarget[0] === '*' &&
                        Target.DirtyFields &&
                        !Target.DirtyFields.has(args.fieldName);
                    if (!isUntouchedWildcard) {
                        targetPaths = legTarget;
                    }
                }
            }
            if (targetPaths === undefined) return;
            if (!IsPayloadPathSetWithinAncestor(ancestorPaths, targetPaths)) {
                errors.push(
                    new ValidationErrorInfo(
                        args.fieldName,
                        widenHint(
                            args.fieldName,
                            `(${JSON.stringify(targetPaths)} outside ${JSON.stringify(ancestorPaths)})`
                        ),
                        targetPaths,
                        ValidationErrorType.Failure
                    )
                );
            }
        };

        checkPayloadPathSurface({
            fieldName: 'PayloadDownstreamPaths',
            jsonPicker: (cfg) => cfg?.payload?.downstreamPaths,
            legacyPicker: (a) => a.PayloadDownstreamPaths,
            targetLegacy: Target.PayloadDownstreamPaths,
            treatWildcardAsDbDefault: true,
        });
        checkPayloadPathSurface({
            fieldName: 'PayloadUpstreamPaths',
            jsonPicker: (cfg) => cfg?.payload?.upstreamPaths,
            legacyPicker: (a) => a.PayloadUpstreamPaths,
            targetLegacy: Target.PayloadUpstreamPaths,
            treatWildcardAsDbDefault: true,
        });
        checkPayloadPathSurface({
            fieldName: 'PayloadSelfReadPaths',
            jsonPicker: (cfg) => cfg?.payload?.selfReadPaths,
            legacyPicker: (a) => a.PayloadSelfReadPaths,
            targetLegacy: Target.PayloadSelfReadPaths,
            treatWildcardAsDbDefault: false,
        });
        checkPayloadPathSurface({
            fieldName: 'PayloadSelfWritePaths',
            jsonPicker: (cfg) => cfg?.payload?.selfWritePaths,
            legacyPicker: (a) => a.PayloadSelfWritePaths,
            targetLegacy: Target.PayloadSelfWritePaths,
            treatWildcardAsDbDefault: false,
        });

        // 4i. PayloadScope subtree prefix lock
        if (shouldEnforceField('PayloadScope')) {
            let seedScope: string | null = null;
            for (const layer of defaultPolicyLayers) {
                if (typeof layer.payload?.scope === 'string' && layer.payload.scope.trim().length > 0) {
                    seedScope = NarrowPayloadScope(seedScope, layer.payload.scope);
                }
            }
            if (ancestors.length > 0) {
                const s0 = ancestorConfigs[0]?.payload?.scope ?? ancestors[0].PayloadScope ?? null;
                if (typeof s0 === 'string' && s0.trim().length > 0) {
                    seedScope = NarrowPayloadScope(seedScope, s0);
                }
            }
            const ancestorPayloadScope = FoldRebaseAwareChain({
                Nodes: ancestors,
                NodeConfigs: ancestorConfigs,
                Seed: seedScope,
                GetNodeValue: (anc, cfg, idx) => {
                    const exp = cfg?.payload?.scope;
                    if (idx > 0 && cfg?.allowWidenFromBase === true && exp === null) return null;
                    if (typeof exp === 'string' && exp.trim().length > 0) return exp.trim();
                    const leg = anc.PayloadScope?.trim();
                    return leg && leg.length > 0 ? leg : undefined;
                },
                Narrow: (acc, next) => NarrowPayloadScope(acc, next),
                Rebase: (acc, next) => (next === null ? null : HasPathTraversalSegment(next) ? acc : next),
            });
            if (ancestorPayloadScope) {
                const expScope = targetConfig?.payload?.scope;
                const explicitNullClear =
                    expScope === null || (Target.PayloadScope === null && Target.DirtyFields?.has('PayloadScope'));
                const candidateScope =
                    expScope !== undefined ? expScope : Target.PayloadScope !== undefined ? Target.PayloadScope : undefined;
                if (explicitNullClear || (typeof candidateScope === 'string' && candidateScope.trim().length > 0)) {
                    if (!IsPayloadScopeWithinAncestor(ancestorPayloadScope, candidateScope)) {
                        errors.push(
                            new ValidationErrorInfo(
                                'PayloadScope',
                                widenHint(
                                    'PayloadScope',
                                    `('${String(candidateScope)}' outside '${ancestorPayloadScope}')`
                                ),
                                candidateScope,
                                ValidationErrorType.Failure
                            )
                        );
                    }
                }
            }
        }

        // 4j. AttachmentRootPath subtree prefix lock
        if (shouldEnforceField('AttachmentRootPath')) {
            let seedAttachPath: string | null = null;
            for (const layer of defaultPolicyLayers) {
                if (typeof layer.attachments?.rootPath === 'string' && layer.attachments.rootPath.trim().length > 0) {
                    seedAttachPath = NarrowAttachmentRootPath(seedAttachPath, layer.attachments.rootPath);
                }
            }
            if (ancestors.length > 0) {
                const r0 = ancestorConfigs[0]?.attachments?.rootPath ?? ancestors[0].AttachmentRootPath ?? null;
                if (typeof r0 === 'string' && r0.trim().length > 0) {
                    seedAttachPath = NarrowAttachmentRootPath(seedAttachPath, r0);
                }
            }
            const ancestorAttachRoot = FoldRebaseAwareChain({
                Nodes: ancestors,
                NodeConfigs: ancestorConfigs,
                Seed: seedAttachPath,
                GetNodeValue: (anc, cfg, idx) => {
                    const exp = cfg?.attachments?.rootPath;
                    if (idx > 0 && cfg?.allowWidenFromBase === true && exp === null) return null;
                    if (typeof exp === 'string' && exp.trim().length > 0) return exp.trim();
                    const leg = anc.AttachmentRootPath?.trim();
                    return leg && leg.length > 0 ? leg : undefined;
                },
                Narrow: (acc, next) => NarrowAttachmentRootPath(acc, next),
                Rebase: (acc, next) => (next === null ? null : HasPathTraversalSegment(next) ? acc : next),
            });
            if (ancestorAttachRoot) {
                const expRoot = targetConfig?.attachments?.rootPath;
                const explicitNullClear =
                    expRoot === null ||
                    (Target.AttachmentRootPath === null && Target.DirtyFields?.has('AttachmentRootPath'));
                const candidateRoot =
                    expRoot !== undefined
                        ? expRoot
                        : Target.AttachmentRootPath !== undefined
                          ? Target.AttachmentRootPath
                          : undefined;
                if (explicitNullClear || (typeof candidateRoot === 'string' && candidateRoot.trim().length > 0)) {
                    if (!IsAttachmentRootPathWithinAncestor(ancestorAttachRoot, candidateRoot)) {
                        errors.push(
                            new ValidationErrorInfo(
                                'AttachmentRootPath',
                                widenHint(
                                    'AttachmentRootPath',
                                    `('${String(candidateRoot)}' outside '${ancestorAttachRoot}')`
                                ),
                                candidateRoot,
                                ValidationErrorType.Failure
                            )
                        );
                    }
                }
            }
        }

        // 4k. ScopeConfig (`scope.secondaryScopeConfig`) per-key intersection
        if (shouldEnforceField('ScopeConfig')) {
            const parseScopeObj = (raw: string | null | undefined): Record<string, unknown> | null => {
                if (!raw || raw.trim().length === 0) return null;
                const parsed = ParseAgentConfigJsonObject(raw);
                return parsed ? { ...parsed } : null;
            };
            let seedScopeObj: Record<string, unknown> | null = null;
            for (const layer of defaultPolicyLayers) {
                if (layer.scope?.secondaryScopeConfig) {
                    seedScopeObj = NarrowScopeConfigObjects(seedScopeObj, layer.scope.secondaryScopeConfig);
                }
            }
            if (ancestors.length > 0) {
                const s0 = ancestorConfigs[0]?.scope?.secondaryScopeConfig ?? parseScopeObj(ancestors[0].ScopeConfig);
                if (s0) {
                    seedScopeObj = NarrowScopeConfigObjects(seedScopeObj, s0);
                }
            }
            const ancestorScopeObj = FoldRebaseAwareChain({
                Nodes: ancestors,
                NodeConfigs: ancestorConfigs,
                Seed: seedScopeObj,
                GetNodeValue: (anc, cfg, idx) => {
                    if (idx > 0 && cfg?.allowWidenFromBase === true && cfg?.scope?.secondaryScopeConfig === null) {
                        return null;
                    }
                    const exp = cfg?.scope?.secondaryScopeConfig;
                    if (exp && typeof exp === 'object' && !Array.isArray(exp)) return exp;
                    return parseScopeObj(anc.ScopeConfig) ?? undefined;
                },
                Narrow: (acc, next) => NarrowScopeConfigObjects(acc, next),
                Rebase: (_acc, next) => (next ? { ...next } : null),
            });
            if (ancestorScopeObj && Object.keys(ancestorScopeObj).length > 0) {
                const expScopeObj = targetConfig?.scope?.secondaryScopeConfig;
                if (expScopeObj === null || (Target.ScopeConfig === null && Target.DirtyFields?.has('ScopeConfig'))) {
                    errors.push(
                        new ValidationErrorInfo(
                            'ScopeConfig',
                            widenHint('ScopeConfig', '(cleared to null when ancestor enforces scope config)'),
                            null,
                            ValidationErrorType.Failure
                        )
                    );
                } else {
                    const targetScopeObj = expScopeObj ?? parseScopeObj(Target.ScopeConfig);
                    if (targetScopeObj) {
                        const scopeViolations = FindScopeConfigWideningViolations(ancestorScopeObj, targetScopeObj);
                        for (const msg of scopeViolations) {
                            errors.push(
                                new ValidationErrorInfo(
                                    'ScopeConfig',
                                    widenHint('ScopeConfig', `(${msg})`),
                                    targetScopeObj,
                                    ValidationErrorType.Failure
                                )
                            );
                        }
                    }
                }
            }
        }

        // 4l. AgentTypePromptParams gates (`enableHandoff: false`, `enableTaskGraphs: false`)
        if (shouldEnforceField('AgentTypePromptParams')) {
            const ancestorLockedFalseGates = new Set<string>();
            const applyGateMap = (obj: Record<string, unknown> | null | undefined, allowRebase: boolean): void => {
                if (!obj) return;
                for (const gate of NARROW_ONLY_PROMPT_PARAM_GATES) {
                    if (typeof obj[gate] === 'boolean') {
                        if (obj[gate] === false) {
                            ancestorLockedFalseGates.add(gate);
                        } else if (allowRebase && obj[gate] === true) {
                            ancestorLockedFalseGates.delete(gate);
                        }
                    }
                }
            };
            for (const layer of defaultPolicyLayers) {
                applyGateMap(layer.promptDefaults ?? null, false);
            }
            for (let i = 0; i < ancestors.length; i++) {
                const parsed = ParseAgentConfigJsonObject(ancestors[i].AgentTypePromptParams);
                applyGateMap(parsed, i > 0 && ancestorConfigs[i]?.allowWidenFromBase === true);
            }
            const targetPromptParams = ParseAgentConfigJsonObject(Target.AgentTypePromptParams);
            if (targetPromptParams && ancestorLockedFalseGates.size > 0) {
                for (const gate of ancestorLockedFalseGates) {
                    if (targetPromptParams[gate] === true) {
                        errors.push(
                            new ValidationErrorInfo(
                                'AgentTypePromptParams',
                                widenHint(`AgentTypePromptParams.${gate}`, '(true vs disabled false)'),
                                true,
                                ValidationErrorType.Failure
                            )
                        );
                    }
                }
            }
        }
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
        if (!IsAgentAdminOrOwnerUser(user, this.ProviderToUse) && user) {
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
                const deleteResult = new BaseEntityResult(false, '', 'delete');
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
        const isAdmin = IsAgentAdminOrOwnerUser(user, this.ProviderToUse);
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
        const hasPathTraversal =
            HasPathTraversalSegment(this.PayloadScope) ||
            HasPathTraversalSegment(this.AttachmentRootPath) ||
            HasPathTraversalSegment(ParseAgentConfiguration(this.Configuration)?.payload?.scope) ||
            HasPathTraversalSegment(ParseAgentConfiguration(this.Configuration)?.attachments?.rootPath);
        const hasAllowWidenKey =
            JsonHasAllowWidenFromBaseKey(this.Configuration) ||
            JsonHasAllowWidenFromBaseKey(
                (this.GetFieldByName('Configuration')?.OldValue as string | null | undefined) ?? null
            );
        if (this.BaseAgentID || !isAdmin || hasDeclaredHelperPlugins || hasPathTraversal || hasAllowWidenKey) {
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
                    MinExecutionsPerRun: this.MinExecutionsPerRun,
                    MaxExecutionsPerRun: this.MaxExecutionsPerRun,
                    MaxSubAgentConsultRounds: this.MaxSubAgentConsultRounds,
                    PayloadDownstreamPaths: this.PayloadDownstreamPaths,
                    PayloadUpstreamPaths: this.PayloadUpstreamPaths,
                    PayloadSelfReadPaths: this.PayloadSelfReadPaths,
                    PayloadSelfWritePaths: this.PayloadSelfWritePaths,
                    PayloadScope: this.PayloadScope,
                    StartingPayloadValidationMode: this.StartingPayloadValidationMode,
                    FinalPayloadValidationMode: this.FinalPayloadValidationMode,
                    FinalPayloadValidationMaxRetries: this.FinalPayloadValidationMaxRetries,
                    ArtifactCreationMode: this.ArtifactCreationMode,
                    MessageMode: this.MessageMode,
                    MaxMessages: this.MaxMessages,
                    AttachmentRootPath: this.AttachmentRootPath,
                    InlineStorageThresholdBytes: this.InlineStorageThresholdBytes,
                    ContextWindowMaxTokens: this.ContextWindowMaxTokens,
                    MaxNotesToInject: this.MaxNotesToInject,
                    MaxExamplesToInject: this.MaxExamplesToInject,
                    NoteRetentionDays: this.NoteRetentionDays,
                    ExampleRetentionDays: this.ExampleRetentionDays,
                    AutoArchiveEnabled: this.AutoArchiveEnabled,
                    ScopeConfig: this.ScopeConfig,
                    AgentTypePromptParams: this.AgentTypePromptParams,
                    Configuration: this.Configuration,
                    PreSaveConfiguration:
                        (this.GetFieldByName('Configuration')?.OldValue as string | null | undefined) ?? null,
                    TypeConfiguration: this.TypeConfiguration,
                    DirtyFields: dirtyFieldNames,
                    PreSaveLimits: {
                        MaxCostPerRun: oldNum('MaxCostPerRun'),
                        MaxTokensPerRun: oldNum('MaxTokensPerRun'),
                        MaxTimePerRun: oldNum('MaxTimePerRun'),
                        MaxIterationsPerRun: oldNum('MaxIterationsPerRun'),
                        MaxExecutionsPerRun: oldNum('MaxExecutionsPerRun'),
                        MaxSubAgentConsultRounds: oldNum('MaxSubAgentConsultRounds'),
                        ContextWindowMaxTokens: oldNum('ContextWindowMaxTokens'),
                        MaxNotesToInject: oldNum('MaxNotesToInject'),
                        MaxExamplesToInject: oldNum('MaxExamplesToInject'),
                        NoteRetentionDays: oldNum('NoteRetentionDays'),
                        ExampleRetentionDays: oldNum('ExampleRetentionDays'),
                        MaxMessages: oldNum('MaxMessages'),
                        InlineStorageThresholdBytes: oldNum('InlineStorageThresholdBytes'),
                        FinalPayloadValidationMaxRetries: oldNum('FinalPayloadValidationMaxRetries'),
                    },
                },
                User: user,
                Provider: this.ProviderToUse,
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
     *
     * Note (C-R1-1 vs R5-1): On GraphQL creates (`NewRecord()` + `SetMany(input)`), untouched
     * columns arrive with `Dirty === false`, `NeverSet === false`, and their SQL default value.
     * For general overridable columns (e.g. `InjectNotes = true`), `!Dirty` + SQL default is
     * treated as untouched so parent values inherit cleanly (meaning an explicit create write equal
     * to the SQL default under a non-default base inherits the base value unless set via
     * `Configuration` or updated after create). For the 4 strict-default narrow-only columns
     * (`SearchScopeAccess`, `AcceptUnregisteredFiles`, `AcceptsSkills`, `SkillActivationMode`),
     * `NeverSet === true` is required so explicit strict restrictions are never loosened.
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
        const minFiniteRebase = (
            layerPicker: (l: IAgentConfiguration) => number | null | undefined,
            jsonPicker: (cfg: IAgentConfiguration | null) => number | null | undefined,
            legacyPicker: (a: MJAIAgentEntity) => number | null | undefined,
            sqlDefault: number | null = null
        ): number | null => {
            const minVal = (a: number | null, b: number | null | undefined): number | null => {
                if (typeof b !== 'number' || !Number.isFinite(b)) return a;
                return a === null ? b : Math.min(a, b);
            };
            let seed: number | null = null;
            for (const layer of defaultPolicyLayers) {
                seed = minVal(seed, layerPicker(layer));
            }
            if (ancestors.length > 0) {
                const exp0 = jsonPicker(ancestorConfigs[0]);
                const leg0 = legacyPicker(ancestors[0]);
                const leg0Eff =
                    exp0 === undefined && sqlDefault !== null && leg0 === sqlDefault && seed !== null ? null : leg0;
                seed = minVal(seed, exp0);
                seed = minVal(seed, leg0Eff);
            }
            return FoldRebaseAwareChain({
                Nodes: ancestors,
                NodeConfigs: ancestorConfigs,
                Seed: seed,
                GetNodeValue: (anc, cfg, idx) => {
                    const exp = jsonPicker(cfg);
                    const leg = legacyPicker(anc);
                    if (idx > 0 && cfg?.allowWidenFromBase === true) {
                        if (exp === null) return null;
                        if (typeof exp === 'number' && Number.isFinite(exp)) return exp;
                        if (typeof leg === 'number' && Number.isFinite(leg) && leg !== sqlDefault) return leg;
                        return undefined;
                    }
                    if (typeof exp === 'number' && Number.isFinite(exp)) {
                        if (typeof leg === 'number' && Number.isFinite(leg) && leg !== sqlDefault) {
                            return Math.min(exp, leg);
                        }
                        return exp;
                    }
                    if (typeof leg === 'number' && Number.isFinite(leg) && leg !== sqlDefault) return leg;
                    return undefined;
                },
                Narrow: (acc, next) => minVal(acc, next),
            });
        };

        const narrowSkillMode = (
            acc: MJAIAgentEntity['SkillActivationMode'] | null,
            v: MJAIAgentEntity['SkillActivationMode'] | null | undefined
        ): MJAIAgentEntity['SkillActivationMode'] | null => {
            if (v == null) return acc;
            return acc === null || SKILL_ACTIVATION_RANK[v] < SKILL_ACTIVATION_RANK[acc] ? v : acc;
        };
        let seedSkill: MJAIAgentEntity['SkillActivationMode'] | null = null;
        for (const layer of defaultPolicyLayers) {
            seedSkill = narrowSkillMode(seedSkill, layer.skills?.activationMode);
        }
        if (ancestors.length > 0) {
            seedSkill = narrowSkillMode(seedSkill, ancestorConfigs[0]?.skills?.activationMode);
            seedSkill = narrowSkillMode(seedSkill, ancestors[0].SkillActivationMode);
        }
        const strictestSkillMode: MJAIAgentEntity['SkillActivationMode'] =
            FoldRebaseAwareChain({
                Nodes: ancestors,
                NodeConfigs: ancestorConfigs,
                Seed: seedSkill,
                GetNodeValue: (anc, cfg, idx) => {
                    const exp = cfg?.skills?.activationMode ?? null;
                    const leg = anc.SkillActivationMode ?? null;
                    if (idx > 0 && cfg?.allowWidenFromBase === true) {
                        if (exp != null) return exp;
                        return leg != null && leg !== 'RequestedOnly' ? leg : undefined;
                    }
                    if (exp != null && leg != null) {
                        return SKILL_ACTIVATION_RANK[leg] < SKILL_ACTIVATION_RANK[exp] ? leg : exp;
                    }
                    if (exp != null) return exp;
                    const isNonInst = Boolean(anc.BaseAgentID) && (anc.InstantiationMode ?? 'None') === 'None';
                    return leg != null && (leg !== 'RequestedOnly' || !isNonInst) ? leg : undefined;
                },
                Narrow: (acc, next) => narrowSkillMode(acc, next),
            }) ?? baseAgent.SkillActivationMode ?? 'RequestedOnly';

        const ancestorSearchCeiling = computeAncestorSearchScopeCeiling(defaultPolicyLayers, ancestors, ancestorConfigs);
        const strictestSearchAccess: MJAIAgentEntity['SearchScopeAccess'] = ancestorSearchCeiling ?? 'None';

        const strictestAcceptsSkills: MJAIAgentEntity['AcceptsSkills'] = FoldRebaseAwareChain({
            Nodes: ancestors,
            NodeConfigs: ancestorConfigs,
            Seed: ancestors[0]?.AcceptsSkills ?? baseAgent.AcceptsSkills ?? 'None',
            GetNodeValue: (anc) => anc.AcceptsSkills ?? undefined,
            Narrow: (acc, next) => (ACCEPTS_SKILLS_RANK[next] < ACCEPTS_SKILLS_RANK[acc] ? next : acc),
        });

        const foldBoolAndRebase = (
            layerPicker: (l: IAgentConfiguration) => boolean | null | undefined,
            jsonPicker: (cfg: IAgentConfiguration | null) => boolean | null | undefined,
            legacyPicker: (a: MJAIAgentEntity) => boolean | null | undefined,
            sqlDefault: boolean,
            fallback: boolean
        ): boolean => {
            const fAnd = (acc: boolean | null, v: boolean | null | undefined): boolean | null =>
                typeof v !== 'boolean' ? acc : acc === null ? v : acc && v;
            let seed: boolean | null = null;
            for (const layer of defaultPolicyLayers) {
                seed = fAnd(seed, layerPicker(layer));
            }
            if (ancestors.length > 0) {
                const exp0 = jsonPicker(ancestorConfigs[0]);
                const leg0 = legacyPicker(ancestors[0]);
                seed =
                    typeof exp0 === 'boolean' && typeof leg0 === 'boolean'
                        ? fAnd(seed, exp0 && leg0)
                        : fAnd(seed, exp0 ?? leg0);
            }
            return (
                FoldRebaseAwareChain({
                    Nodes: ancestors,
                    NodeConfigs: ancestorConfigs,
                    Seed: seed,
                    GetNodeValue: (anc, cfg, idx) => {
                        const exp = jsonPicker(cfg);
                        const leg = legacyPicker(anc);
                        if (idx > 0 && cfg?.allowWidenFromBase === true) {
                            if (typeof exp === 'boolean') return exp;
                            return typeof leg === 'boolean' && leg !== sqlDefault ? leg : undefined;
                        }
                        if (typeof exp === 'boolean' && typeof leg === 'boolean') return exp && leg;
                        if (typeof exp === 'boolean') return exp;
                        return typeof leg === 'boolean' && leg !== sqlDefault ? leg : undefined;
                    },
                    Narrow: (acc, next) => fAnd(acc, next),
                }) ?? fallback
            );
        };

        const seedReqPlan =
            defaultPolicyLayers.some((l) => l.execution?.requirePlanMode === true) ||
            (ancestors.length > 0 &&
                (ancestorConfigs[0]?.execution?.requirePlanMode === true || ancestors[0].RequirePlanMode === true));
        const strictestRequirePlan = FoldRebaseAwareChain({
            Nodes: ancestors,
            NodeConfigs: ancestorConfigs,
            Seed: seedReqPlan,
            GetNodeValue: (anc, cfg, idx) => {
                const exp = cfg?.execution?.requirePlanMode;
                const leg = anc.RequirePlanMode;
                if (idx > 0 && cfg?.allowWidenFromBase === true) {
                    if (typeof exp === 'boolean') return exp;
                    return leg === true ? true : undefined;
                }
                if (exp === true || leg === true) return true;
                return typeof exp === 'boolean' ? exp : undefined;
            },
            Narrow: (acc, next) => acc || next,
        });

        copyIfNotDirty('ModelSelectionMode');
        copyIfNotDirty('AcceptsSkills', strictestAcceptsSkills);
        copyIfNotDirty('SkillActivationMode', strictestSkillMode);
        copyIfNotDirty('SearchScopeAccess', strictestSearchAccess);
        copyIfNotDirty('ArtifactCreationMode');
        copyIfNotDirty('DefaultArtifactTypeID');
        copyIfNotDirty('InjectNotes');
        copyIfNotDirty(
            'MaxNotesToInject',
            minFiniteRebase(
                (l) => l.memory?.maxNotesToInject,
                (cfg) => cfg?.memory?.maxNotesToInject,
                (a) => a.MaxNotesToInject,
                5 // SQL schema default DF_AIAgent_MaxNotesToInject
            ) ?? baseAgent.MaxNotesToInject
        );
        copyIfNotDirty('NoteInjectionStrategy');
        copyIfNotDirty('InjectExamples');
        copyIfNotDirty(
            'MaxExamplesToInject',
            minFiniteRebase(
                (l) => l.memory?.maxExamplesToInject,
                (cfg) => cfg?.memory?.maxExamplesToInject,
                (a) => a.MaxExamplesToInject,
                3 // SQL schema default DF_AIAgent_MaxExamplesToInject
            ) ?? baseAgent.MaxExamplesToInject
        );
        copyIfNotDirty('ExampleInjectionStrategy');
        copyIfNotDirty(
            'NoteRetentionDays',
            minFiniteRebase(
                (l) => l.memory?.noteRetentionDays,
                (cfg) => cfg?.memory?.noteRetentionDays,
                (a) => a.NoteRetentionDays,
                90 // SQL schema default DF_AIAgent_NoteRetentionDays
            )
        );
        copyIfNotDirty(
            'ExampleRetentionDays',
            minFiniteRebase(
                (l) => l.memory?.exampleRetentionDays,
                (cfg) => cfg?.memory?.exampleRetentionDays,
                (a) => a.ExampleRetentionDays,
                180 // SQL schema default DF_AIAgent_ExampleRetentionDays
            )
        );
        copyIfNotDirty('AutoArchiveEnabled');
        copyIfNotDirty(
            'AllowMemoryWrite',
            foldBoolAndRebase(
                (l) => l.memory?.allowMemoryWrite,
                (cfg) => cfg?.memory?.allowMemoryWrite,
                (a) => a.AllowMemoryWrite,
                true,
                baseAgent.AllowMemoryWrite
            ),
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
            foldBoolAndRebase(
                (l) => l.execution?.supportsPlanMode,
                (cfg) => cfg?.execution?.supportsPlanMode,
                (a) => a.SupportsPlanMode,
                true,
                baseAgent.SupportsPlanMode
            ),
            true
        );
        copyIfNotDirty('RequirePlanMode', strictestRequirePlan, false);
        copyIfNotDirty(
            'AllowEphemeralClientTools',
            foldBoolAndRebase(
                (l) => l.clientTools?.allowEphemeral,
                (cfg) => cfg?.clientTools?.allowEphemeral,
                (a) => a.AllowEphemeralClientTools,
                true,
                baseAgent.AllowEphemeralClientTools
            ),
            true
        );
        copyIfNotDirty(
            'AcceptUnregisteredFiles',
            foldBoolAndRebase(
                (l) => l.attachments?.acceptUnregisteredFiles,
                (cfg) => cfg?.attachments?.acceptUnregisteredFiles,
                (a) => a.AcceptUnregisteredFiles,
                false,
                baseAgent.AcceptUnregisteredFiles
            )
        );
        copyIfNotDirty('MaxCostPerRun', minFiniteRebase(() => undefined, () => undefined, (a) => a.MaxCostPerRun));
        copyIfNotDirty('MaxTokensPerRun', minFiniteRebase(() => undefined, () => undefined, (a) => a.MaxTokensPerRun));
        copyIfNotDirty('MaxTimePerRun', minFiniteRebase(() => undefined, () => undefined, (a) => a.MaxTimePerRun));
        copyIfNotDirty('MaxIterationsPerRun', minFiniteRebase(() => undefined, () => undefined, (a) => a.MaxIterationsPerRun));
        copyIfNotDirty(
            'MaxExecutionsPerRun',
            minFiniteRebase(
                (l) => l.subAgentExecution?.maxExecutionsPerRun,
                (cfg) => cfg?.subAgentExecution?.maxExecutionsPerRun,
                (a) => a.MaxExecutionsPerRun
            )
        );
        copyIfNotDirty(
            'MaxSubAgentConsultRounds',
            minFiniteRebase(
                (l) => l.subAgentExecution?.maxConsultRounds,
                (cfg) => cfg?.subAgentExecution?.maxConsultRounds,
                (a) => a.MaxSubAgentConsultRounds
            )
        );
        copyIfNotDirty('MessageMode');
        copyIfNotDirty(
            'MaxMessages',
            minFiniteRebase(
                (l) => l.attachments?.maxMessages,
                (cfg) => cfg?.attachments?.maxMessages,
                (a) => a.MaxMessages
            )
        );
        copyIfNotDirty('AttachmentRootPath');
        copyIfNotDirty(
            'InlineStorageThresholdBytes',
            minFiniteRebase(
                (l) => l.attachments?.inlineStorageThresholdBytes,
                (cfg) => cfg?.attachments?.inlineStorageThresholdBytes,
                (a) => a.InlineStorageThresholdBytes
            )
        );
        copyIfNotDirty('PayloadDownstreamPaths');
        copyIfNotDirty('PayloadUpstreamPaths');
        copyIfNotDirty('PayloadSelfReadPaths');
        copyIfNotDirty('PayloadSelfWritePaths');
        copyIfNotDirty('PayloadScope');
        copyIfNotDirty('StartingPayloadValidationMode');
        copyIfNotDirty('FinalPayloadValidationMode');
        copyIfNotDirty(
            'FinalPayloadValidationMaxRetries',
            minFiniteRebase(
                (l) => l.payload?.finalValidationMaxRetries,
                (cfg) => cfg?.payload?.finalValidationMaxRetries,
                (a) => a.FinalPayloadValidationMaxRetries,
                3 // SQL schema default DF_AIAgent_FinalPayloadValidationMaxRetries
            ) ?? baseAgent.FinalPayloadValidationMaxRetries
        );
        copyIfNotDirty('ScopeConfig');
        copyIfNotDirty('EnableContextCompression');
        copyIfNotDirty('ContextCompressionMessageThreshold');
        copyIfNotDirty('ContextCompressionPromptID');
        copyIfNotDirty('ContextCompressionMessageRetentionCount');
        copyIfNotDirty('RerankerConfiguration');
        copyIfNotDirty(
            'ContextWindowMaxTokens',
            minFiniteRebase(
                (l) => l.contextWindow?.maxTokens,
                (cfg) => cfg?.contextWindow?.maxTokens,
                (a) => a.ContextWindowMaxTokens
            )
        );
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
        // R5 Follow-up #5 & C-R4-2: single batched RunViews with ResultType: 'simple' + minimal
        // explicit Fields (replaces 7 full-table entity_object queries on derived creates) and
        // fail-closed on read errors OR FLS-omitted requested guard columns.
        const AGENT_GUARD_FIELDS = [
            'ID', 'Name', 'BaseAgentID', 'RootBaseAgentID', 'OwnerUserID', 'Status',
            'CategoryID', 'TypeID', 'InstantiationMode', 'DriverClass', 'Isolation',
            'MaxCostPerRun', 'MaxTokensPerRun', 'MaxTimePerRun', 'MaxIterationsPerRun',
            'Configuration', 'TypeConfiguration', 'AgentTypePromptParams', 'ModelSelectionMode', 'AcceptsSkills',
            'SkillActivationMode', 'SearchScopeAccess', 'ScopeConfig', 'ArtifactCreationMode',
            'DefaultArtifactTypeID', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy',
            'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy',
            'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled',
            'AllowMemoryWrite', 'DeclareActionsAsNativeTools', 'SupportsPlanMode',
            'RequirePlanMode', 'AllowEphemeralClientTools', 'AcceptUnregisteredFiles',
            'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'MaxSubAgentConsultRounds',
            'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths',
            'PayloadSelfWritePaths', 'PayloadScope', 'StartingPayloadValidationMode',
            'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries',
            'MessageMode', 'MaxMessages', 'AttachmentRootPath', 'InlineStorageThresholdBytes',
            'EnableContextCompression', 'ContextCompressionMessageThreshold',
            'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount',
            'RerankerConfiguration', 'ContextWindowMaxTokens', 'CompactionTriggerPercent',
            'CompactionTargetPercent', 'ConversationSummaryPromptID',
        ] as const;
        const PERMISSION_GUARD_FIELDS = [
            'ID', 'AgentID', 'UserID', 'RoleID', 'CanView', 'CanRun', 'CanEdit', 'CanDelete',
        ] as const;
        const CATEGORY_GUARD_FIELDS = ['ID', 'ParentID', 'DefaultConfiguration'] as const;
        const TYPE_GUARD_FIELDS = [
            'ID', 'DefaultAgentConfiguration', 'ContextCompressionMessageThreshold',
            'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount',
            'ContextWindowMaxTokens', 'CompactionTriggerPercent', 'CompactionTargetPercent',
            'ConversationSummaryPromptID',
        ] as const;

        // R7-1: Filter requested guard fields against the active provider's entity metadata so
        // hosts/databases whose schema has not yet received newly added columns (e.g. PostgreSQL
        // prior to the twin migration for AIAgent.Configuration) neither emit "not found in entity"
        // log noise nor misclassify schema-absent columns as field-level security denials.
        const hasEntityLookup = (p: object | null | undefined): p is Pick<IMetadataProvider, 'EntityByName'> =>
            Boolean(p && 'EntityByName' in p && typeof (p as Partial<IMetadataProvider>).EntityByName === 'function');
        const metadataProvider = IsMetadataProvider(this.ProviderToUse)
            ? this.ProviderToUse
            : hasEntityLookup(this.RunViewProviderToUse)
              ? this.RunViewProviderToUse
              : null;
        const filterExistingFields = (entityName: string, requested: readonly string[]): string[] => {
            const entityInfo = metadataProvider?.EntityByName(entityName);
            if (!entityInfo) {
                return [...requested];
            }
            return requested.filter((fieldName) => Boolean(entityInfo.FieldByName(fieldName)));
        };
        const agentFields = filterExistingFields('MJ: AI Agents', AGENT_GUARD_FIELDS);
        const permissionFields = filterExistingFields('MJ: AI Agent Permissions', PERMISSION_GUARD_FIELDS);
        const categoryFields = filterExistingFields('MJ: AI Agent Categories', CATEGORY_GUARD_FIELDS);
        const typeFields = filterExistingFields('MJ: AI Agent Types', TYPE_GUARD_FIELDS);

        const rv = new RunView(this.RunViewProviderToUse);
        const results = await rv.RunViews(
            [
                {
                    EntityName: 'MJ: AI Agents',
                    ResultType: 'simple',
                    Fields: agentFields,
                },
                {
                    EntityName: 'MJ: AI Agent Permissions',
                    ResultType: 'simple',
                    Fields: permissionFields,
                },
                {
                    EntityName: 'MJ: AI Agent Categories',
                    ResultType: 'simple',
                    Fields: categoryFields,
                },
                {
                    EntityName: 'MJ: AI Agent Types',
                    ResultType: 'simple',
                    Fields: typeFields,
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
        // R6 Follow-up #5, C-R4-2 & R7-1: Fail closed if field-level security silently omitted ANY
        // metadata-present requested guard column from a `'simple'` RunView projection (e.g. denied
        // `DefaultConfiguration`, `MaxCostPerRun`, `TypeConfiguration`, `RequirePlanMode`, etc.).
        const requiredGuardFieldsByResult: ReadonlyArray<{ Entity: string; Rows: unknown[]; RequiredFields: readonly string[] }> = [
            { Entity: 'MJ: AI Agents', Rows: results[0].Results, RequiredFields: agentFields },
            { Entity: 'MJ: AI Agent Permissions', Rows: results[1].Results, RequiredFields: permissionFields },
            { Entity: 'MJ: AI Agent Categories', Rows: results[2].Results, RequiredFields: categoryFields },
            { Entity: 'MJ: AI Agent Types', Rows: results[3].Results, RequiredFields: typeFields },
        ];
        for (const check of requiredGuardFieldsByResult) {
            if (check.Rows.length > 0) {
                const sample = check.Rows[0] as Record<string, unknown> | null;
                const missingField = check.RequiredFields.find(
                    (f) => !sample || !Object.prototype.hasOwnProperty.call(sample, f)
                );
                if (missingField) {
                    return {
                        AllAgents: [],
                        AllPermissions: [],
                        AllCategories: [],
                        AllAgentTypes: [],
                        ErrorMessage: `Required security guard field '${missingField}' was omitted from '${check.Entity}' query result (possible field-level security restriction).`,
                    };
                }
            }
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
