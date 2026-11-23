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
    MAX_AGENT_INHERITANCE_DEPTH,
    MJAIAgentEntityExtended,
    ParseAgentInstantiationConfig,
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

    // Walk up BaseAgentID chain to detect cycles and enforce max depth (5 hops)
    const visited = new UUIDSet(Target.ID ? [Target.ID] : []);
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

        const instCfg = ParseAgentInstantiationConfig(baseAgent.TypeConfiguration);
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

    // 4. Non-admin runtime capability & bounds sandbox against baseAgent
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

        const baseDriver = baseAgent.DriverClass?.trim() || null;
        const targetDriver = Target.DriverClass?.trim() || null;
        if (Target.DriverClassDirty && targetDriver !== null && targetDriver !== baseDriver) {
            errors.push(
                new ValidationErrorInfo(
                    'DriverClass',
                    'Non-administrator users cannot set a custom DriverClass on a derived agent instance.',
                    Target.DriverClass,
                    ValidationErrorType.Failure
                )
            );
        }

        const baseIsoRank = ISOLATION_RANK[baseAgent.Isolation ?? 'InProcess'] ?? 0;
        const targetIsoRank = ISOLATION_RANK[Target.Isolation ?? 'InProcess'] ?? 0;
        if (targetIsoRank < baseIsoRank) {
            errors.push(
                new ValidationErrorInfo(
                    'Isolation',
                    `Derived agent Isolation ('${Target.Isolation}') cannot be less strict than base agent Isolation ('${baseAgent.Isolation}').`,
                    Target.Isolation,
                    ValidationErrorType.Failure
                )
            );
        }

        const checkUpperBound = (
            fieldName: 'MaxCostPerRun' | 'MaxTokensPerRun' | 'MaxTimePerRun' | 'MaxIterationsPerRun',
            baseLimit: number | null,
            childLimit: number | null
        ): void => {
            if (baseLimit != null && childLimit != null && childLimit > baseLimit) {
                errors.push(
                    new ValidationErrorInfo(
                        fieldName,
                        `Derived agent ${fieldName} (${childLimit}) cannot exceed base agent ceiling (${baseLimit}).`,
                        childLimit,
                        ValidationErrorType.Failure
                    )
                );
            }
        };

        checkUpperBound('MaxCostPerRun', baseAgent.MaxCostPerRun, Target.MaxCostPerRun);
        checkUpperBound('MaxTokensPerRun', baseAgent.MaxTokensPerRun, Target.MaxTokensPerRun);
        checkUpperBound('MaxTimePerRun', baseAgent.MaxTimePerRun, Target.MaxTimePerRun);
        checkUpperBound('MaxIterationsPerRun', baseAgent.MaxIterationsPerRun, Target.MaxIterationsPerRun);
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

        // 1. BaseAgentID inheritance & non-admin sandbox checks
        const user = this.ContextCurrentUser;
        const isAdmin = IsAgentAdminOrOwnerUser(user);
        if (this.BaseAgentID || !isAdmin) {
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
            if (field && !field.Dirty) {
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
