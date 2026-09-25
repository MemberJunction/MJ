/**
 * @file ClonePlanner.ts
 * Computes deterministic clone plans for entity records using graph traversal.
 * Enforces caps, permissions, unique key classification, field transformations, and plan hashing.
 * @see plans/record-cloning/README.md §5, §7, §13.1
 */

import {
    CompositeKey,
    EntityInfo,
    ICloneRowExclusion,
    IEntityCloneConfiguration,
    IMetadataProvider,
    Metadata,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { DependencyGraphWalker, DependencyNode, GraphEdgeCandidate } from '@memberjunction/record-graph';
import {
    CloneEdgeKind,
    CloneEdgePolicy,
    ClonePlan,
    ClonePlanEdge,
    ClonePlanNode,
    CloneRequestOptions,
    CloneWarning,
    DetectIntraPlanCollisions,
    GenerateUUID,
    MapFieldsForClone,
    PlannedRecordNode,
    RecordCloneRequest,
    ResolveEdgePolicy,
    ResolveEffectiveCloneOptions,
    NormalizeClonePresets,
    FieldMetaFromEntity,
    CloneConfigMetaFromEntity,
    CloneConfigValidator,
    IsRenameField,
    NameCollisionPrefix,
    NameTemplateOptions,
    RowMatchesExclusion,
} from '@memberjunction/record-cloning-base';
import { EscapeSQLString } from '@memberjunction/global';
import { CloneAuthorizer } from './CloneAuthorization';
import { ComputeClonePlanHash } from './ClonePlanHash';
import { DeriveTargetKey, IsUuidColumn, KeyStrategyFor, ToRecordKeyString } from './CloneKeys';

export interface ClonePlannerOptions {
    Provider?: IMetadataProvider;
}

interface CompositeKeyLike {
    KeyValuePairs: Array<CompositeKey['KeyValuePairs'][number]>;
}

/**
 * Fields the user may not read or may not supply on create, for entities with field-level security.
 * The mapper leaves them out, so a clone never copies a value its user couldn't see or set.
 */
function fieldLevelDenials(entity: EntityInfo, user: UserInfo): { DeniedReadFields: string[]; DeniedCreateFields: string[] } | undefined {
    if (!entity.EnableFieldLevelSecurity) return undefined;
    const deniedRead = entity.GetDeniedReadFields(user);
    const deniedCreate = entity.GetDeniedCreateFields(user);
    const names = (denied: Set<string>) => entity.Fields.filter((f) => denied.has(f.Name.toLowerCase())).map((f) => f.Name);
    return { DeniedReadFields: names(deniedRead), DeniedCreateFields: names(deniedCreate) };
}

export class ClonePlanner {
    private _provider?: IMetadataProvider;

    public constructor(options?: ClonePlannerOptions) {
        this._provider = options?.Provider;
    }

    protected get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Generates a fully calculated ClonePlan for the requested record.
     */
    public async Plan(
        request: RecordCloneRequest,
        contextUser: UserInfo
    ): Promise<ClonePlan> {
        const md = this.Provider;
        const entityName = request.EntityName || request.Roots?.[0]?.EntityName;
        if (!entityName) {
            throw new Error(`RecordCloneRequest must specify EntityName or Roots.`);
        }

        const sourceRecordKey = request.SourceRecordKey || request.Roots?.[0]?.Key;
        if (!sourceRecordKey) {
            throw new Error(`RecordCloneRequest must specify SourceRecordKey or Roots.`);
        }

        const rootEntityInfo = md.EntityByName(entityName);
        if (!rootEntityInfo) {
            throw new Error(`Entity '${entityName}' not found in metadata.`);
        }

        const warnings: CloneWarning[] = [];
        let planBlocked = false;

        const rootConfig = rootEntityInfo.CloneConfig ?? (rootEntityInfo as unknown as { CloneConfiguration?: import('@memberjunction/core').IEntityCloneConfiguration }).CloneConfiguration ?? null;
        const authorizer = new CloneAuthorizer(md);

        // The configuration is checked here, not only in the Entities form: an invalid bag (a bad
        // policy, a cap that isn't a positive integer, a rule on a missing field) blocks the plan.
        if (rootConfig) {
            const findings = CloneConfigValidator.Validate(
                CloneConfigMetaFromEntity(rootEntityInfo, { ...rootConfig, Enabled: true }),
                md.Entities.map((e) => ({ Name: e.Name, Fields: [] }))
            );
            for (const finding of findings) {
                // A relationship key that matches nothing only means that edge isn't configured
                // (a stale key, say): report it, but don't refuse every clone of the entity over it.
                const blocking = finding.Severity === 'Error' && !finding.PropertyPath.startsWith('Relationships[');
                warnings.push({
                    Code: 'CONFIG_INVALID',
                    Severity: blocking ? 'Error' : 'Warning',
                    Field: finding.PropertyPath,
                    Message: `Clone configuration for '${entityName}': ${finding.Message}`,
                });
                if (blocking) planBlocked = true;
            }
        }

        // A preset (Clone.Presets, looked up by Key) contributes options under the request's own
        // options and edge policy overrides by related entity name.
        const presetKey = request.Preset || request.Options?.Preset;
        const preset = presetKey ? NormalizeClonePresets(rootConfig?.Presets).find((p) => p.Key === presetKey) : undefined;
        if (presetKey && !preset) {
            warnings.push({
                Code: 'OPTION_OVERRIDE_IGNORED',
                Severity: 'Warning',
                Field: 'Preset',
                Message: `Preset '${presetKey}' is not defined for '${entityName}'.`,
            });
        }
        // A preset is configured by the entity's owner, so its options act as configuration (they may
        // widen scope for anyone); only the request's own options go through the override rules.
        const configWithPreset = preset?.Options ? { ...(rootConfig ?? {}), ...preset.Options } : rootConfig;
        const presetEdgeOverrides: Array<{ ChildEntityName?: string; RelationshipID?: string; Policy: CloneEdgePolicy }> | undefined =
            preset?.Relationships
                ? Object.entries(preset.Relationships).map(([ChildEntityName, cfg]) => ({ ChildEntityName, Policy: cfg.Policy }))
                : undefined;

        // The entity's configuration supplies the defaults; UserEditable and the Fire Hooks
        // authorization decide which request values may change them (plan §4.1, §9.4).
        const resolved = ResolveEffectiveCloneOptions(configWithPreset, request.Options, {
            CanFireHooks: authorizer.CanFireHooks(contextUser),
            CanOverrideScope: authorizer.CanOverrideScope(contextUser),
        });
        const effectiveOptions: ClonePlan['EffectiveOptions'] = resolved.Options;
        warnings.push(...resolved.Warnings);

        // Per-edge request overrides follow the same rule as the scope options: Skip and
        // Reference narrow the copy (allowed when UserEditable permits, or for an override
        // holder); Deep widens it and needs Clone Records: Override Scope.
        const canOverrideScope = authorizer.CanOverrideScope(contextUser);
        const editable = rootConfig?.UserEditable ?? 'all';
        const mayNarrowEdges = editable === 'scope' || editable === 'all' || canOverrideScope;
        const edgeOverrides = (request.EdgeOverrides ?? []).filter((o) => {
            if (o.Policy === 'Deep' ? canOverrideScope : mayNarrowEdges) return true;
            warnings.push({
                Code: o.Policy === 'Deep' ? 'SCOPE_OVERRIDE_FORBIDDEN' : 'OPTION_OVERRIDE_IGNORED',
                Severity: 'Warning',
                Field: 'EdgeOverrides',
                Message: o.Policy === 'Deep'
                    ? `Copying a relationship the configuration leaves out needs the 'Clone Records: Override Scope' authorization.`
                    : `Relationship overrides were ignored: this entity's clone configuration sets UserEditable to '${editable}'.`,
            });
            return false;
        });
        const maxDepth = effectiveOptions.MaxDepth;
        const maxRecords = effectiveOptions.MaxRecords;

        // An entity is a clone ROOT only when its configuration enables it (plan §4.1).
        if (rootConfig?.Enabled !== true || rootConfig?.NotCloneable === true) {
            warnings.push({
                Code: 'NOT_CLONEABLE',
                Severity: 'Error',
                Message: rootConfig?.NotCloneableReason
                    || `Cloning is not enabled for '${entityName}'. Set Configuration.Clone.Enabled on its MJ: Entities record.`,
            });
            planBlocked = true;
        }

        const rootAuth = authorizer.CanCloneEntity(rootEntityInfo, contextUser);
        if (!rootAuth.Granted) {
            warnings.push({
                Code: 'FORBIDDEN',
                Severity: 'Error',
                Message: `Cloning '${entityName}' requires the '${rootAuth.Name}' authorization.`,
            });
            planBlocked = true;
        }

        // Verify root authorization / RequiredUserType
        if (rootConfig?.RequiredUserType && contextUser.Type?.trim() !== rootConfig.RequiredUserType?.trim()) {
            warnings.push({
                Code: 'REQUIRED_USER_TYPE_MISMATCH',
                Severity: 'Error',
                Message: `Cloning entity '${entityName}' requires user type '${rootConfig.RequiredUserType}', current user is '${contextUser.Type}'.`,
            });
            planBlocked = true;
        }

        const rootPerms = rootEntityInfo.GetUserPermisions(contextUser);
        if (!rootPerms.CanCreate) {
            warnings.push({
                Code: 'NO_CREATE_PERMISSION',
                Severity: 'Error',
                Message: `User '${contextUser.Email || contextUser.Name}' lacks CanCreate permission on root entity '${entityName}'.`,
            });
            planBlocked = true;
        }

        if (planBlocked) {
            return {
                PlanVersion: 1,
                EffectiveOptions: effectiveOptions,
                Hash: '',
                Roots: [typeof sourceRecordKey === 'string' ? sourceRecordKey : ''],
                RootEntityName: entityName,
                RootSourceKey: typeof sourceRecordKey === 'string' ? sourceRecordKey : '',
                RootTargetKey: '',
                Nodes: [],
                Edges: [],
                Excluded: [],
                Counts: {
                    ByEntity: { [entityName]: { Create: 0, Reference: 0, Skip: 0 } },
                    Create: 0,
                    Total: 0,
                },
                Warnings: warnings,
                Blocked: true,
            };
        }

        const key = new CompositeKey();
        if (sourceRecordKey instanceof CompositeKey) {
            key.KeyValuePairs = sourceRecordKey.KeyValuePairs.map((kvp) => ({
                FieldName: kvp.FieldName,
                Value: kvp.Value,
            }));
        } else if (
            typeof sourceRecordKey === 'object' &&
            sourceRecordKey !== null &&
            'KeyValuePairs' in sourceRecordKey &&
            Array.isArray((sourceRecordKey as CompositeKeyLike).KeyValuePairs)
        ) {
            key.KeyValuePairs = (sourceRecordKey as CompositeKeyLike).KeyValuePairs.map((kvp) => ({
                FieldName: kvp.FieldName,
                Value: kvp.Value,
            }));
        } else if (typeof sourceRecordKey === 'string') {
            key.LoadFromURLSegment(rootEntityInfo, sourceRecordKey);
        } else {
            key.LoadFromEntityInfoAndRecord(rootEntityInfo, sourceRecordKey);
        }

        const walker = new DependencyGraphWalker(md);
        const candidateEdges: ClonePlanEdge[] = [];
        const excludedNodes: Array<{ EntityName: string; SourceKey: string; Reason: string }> = [];

        // Traverse graph with EdgePolicy callback
        const rootNode = await walker.WalkDependents(
            entityName,
            key,
            {
                MaxDepth: maxDepth,
                RequireTrackRecordChanges: false,
                IncludeSubtypes: effectiveOptions.Subtypes === 'include',
                IncludeSoftLinks: effectiveOptions.SoftLinks === 'include',
                FollowHierarchies: effectiveOptions.Hierarchy === 'subtree',
                EdgePolicy: (candidate: GraphEdgeCandidate): 'Deep' | 'Reference' | 'Skip' => {
                    const targetEntity = md.EntityByName(candidate.TargetEntityName);
                    const joinFieldInfo = targetEntity?.Fields.find(
                        (f) => f.Name.toLowerCase() === candidate.JoinField.toLowerCase()
                    );

                    // Check server-generated children on parent
                    const sourceEnt = md.EntityByName(candidate.SourceEntityName);
                    const parentConfig = sourceEnt?.CloneConfig ?? (sourceEnt as unknown as { CloneConfiguration?: import('@memberjunction/core').IEntityCloneConfiguration }).CloneConfiguration ?? null;
                    if (parentConfig?.Hooks?.ServerGeneratedChildren?.includes(candidate.TargetEntityName)) {
                        warnings.push({
                            Code: 'SERVER_GENERATED_CHILD_SKIPPED',
                            Severity: 'Warning',
                            Message: `Relationship to '${candidate.TargetEntityName}' skipped because parent creates it in server Save() hooks.`,
                        });
                        excludedNodes.push({
                            EntityName: candidate.TargetEntityName,
                            SourceKey: candidate.TargetKey ? candidate.TargetKey.ToConcatenatedString() : '',
                            Reason: `Skipped because parent creates it in server Save() hooks.`,
                        });
                        return 'Skip';
                    }

                    const relPolicy = candidate.Relationship?.CloneConfig ?? (candidate.Relationship as { CloneConfiguration?: import('@memberjunction/core').ICloneRelationshipPolicy } | null | undefined)?.CloneConfiguration ?? undefined;
                    const targetConfig = targetEntity?.CloneConfig ?? (targetEntity as { CloneConfiguration?: import('@memberjunction/core').IEntityCloneConfiguration } | null | undefined)?.CloneConfiguration ?? null;

                    const resolution = ResolveEdgePolicy({
                        FromKey: `${candidate.SourceEntityName}::${candidate.SourceKey.ToConcatenatedString()}`,
                        ToKey: `${candidate.TargetEntityName}::${candidate.TargetKey ? candidate.TargetKey.ToConcatenatedString() : 'pending'}`,
                        Kind: candidate.Kind as CloneEdgeKind,
                        ParentEntityName: candidate.SourceEntityName,
                        ChildEntityName: candidate.TargetEntityName,
                        JoinField: candidate.JoinField,
                        RelationshipID: candidate.Relationship?.ID,
                        RelationshipConfig: relPolicy,
                        // Enabled=false only means "not a clone root"; NotCloneable is what keeps a child out.
                        ChildEntityConfig: {
                            NotCloneable: targetConfig?.NotCloneable === true,
                            NotCloneableReason: targetConfig?.NotCloneableReason,
                            AllowCreateAPI: targetEntity?.AllowCreateAPI,
                        },
                        IsHierarchyField: joinFieldInfo?.IsHierarchy === true,
                        RootEntityConfig: rootConfig ? {
                            Relationships: rootConfig.Relationships,
                        } : undefined,
                        PresetConfig: presetEdgeOverrides ? {
                            EdgeOverrides: presetEdgeOverrides,
                        } : undefined,
                        RequestOverrides: edgeOverrides.map((o) => ({
                            RelationshipID: o.RelationshipID,
                            Policy: o.Policy,
                        })),
                        IsUniqueFK: joinFieldInfo?.IsUnique,
                        CurrentDepth: candidate.Depth,
                        MaxDepth: maxDepth,
                    });

                    warnings.push(...resolution.Warnings);

                    candidateEdges.push({
                        FromKey: `${candidate.SourceEntityName}::${candidate.SourceKey.ToConcatenatedString()}`,
                        ToKey: `${candidate.TargetEntityName}::${candidate.TargetKey ? candidate.TargetKey.ToConcatenatedString() : 'pending'}`,
                        Kind: candidate.Kind as CloneEdgeKind,
                        RelatedEntityName: candidate.TargetEntityName,
                        Policy: resolution.Policy,
                        PolicySource: resolution.PolicySource,
                        Locked: resolution.Locked,
                        JoinField: candidate.JoinField,
                        RelationshipID: candidate.Relationship?.ID,
                    });

                    if (resolution.Policy === 'Skip') {
                        excludedNodes.push({
                            EntityName: candidate.TargetEntityName,
                            SourceKey: candidate.TargetKey ? candidate.TargetKey.ToConcatenatedString() : '',
                            Reason: `Edge policy resolved to Skip from ${resolution.PolicySource}`,
                        });
                    }

                    return resolution.Policy;
                },
            },
            contextUser
        );

        // Flatten graph nodes, leaving out rows a relationship's ExcludeRows names (and everything under them)
        const flatGraphNodes = this.dropExcludedRows(walker.FlattenTopological(rootNode), rootConfig, excludedNodes, warnings);

        // Build concrete edges connecting discovered graph nodes
        const edges: ClonePlanEdge[] = [];
        for (const depNode of flatGraphNodes) {
            if (depNode.DiscoveringEdge) {
                const disc = depNode.DiscoveringEdge;
                const cand = candidateEdges.find(
                    (c) =>
                        c.FromKey === disc.FromKey &&
                        c.RelatedEntityName === disc.TargetEntityName &&
                        c.JoinField.toLowerCase() === disc.JoinField.toLowerCase()
                );
                edges.push({
                    FromKey: disc.FromKey,
                    ToKey: disc.ToKey,
                    Kind: disc.Kind as CloneEdgeKind,
                    RelatedEntityName: disc.TargetEntityName,
                    Policy: cand?.Policy ?? 'Deep',
                    PolicySource: cand?.PolicySource ?? 'Entity',
                    Locked: cand?.Locked ?? false,
                    JoinField: disc.JoinField,
                    RelationshipID: disc.Relationship?.ID ?? cand?.RelationshipID,
                });
            }
        }
        for (const cand of candidateEdges) {
            if (!edges.some(e => e.FromKey === cand.FromKey && e.ToKey === cand.ToKey && e.JoinField.toLowerCase() === cand.JoinField.toLowerCase())) {
                edges.push(cand);
            }
        }

        // Identify which nodes are 'Reference' nodes vs 'Create' candidates
        // Root node (depth 0) is always Create candidate.
        // Child node is Reference if reached via a 'Reference' edge or if its parent is Reference.
        const referenceNodeKeys = new Set<string>();
        for (const depNode of flatGraphNodes) {
            const nodeKey = `${depNode.EntityName}::${depNode.RecordID}`;
            if (depNode.Depth === 0) {
                continue;
            }
            const disc = depNode.DiscoveringEdge;
            const parentKey = disc ? disc.FromKey : null;
            const isParentReference = parentKey ? (referenceNodeKeys.has(parentKey) || referenceNodeKeys.has(parentKey.split('::')[1] ?? '')) : false;

            const matchingEdge = disc ? edges.find(e =>
                e.FromKey === disc.FromKey &&
                e.ToKey === disc.ToKey &&
                e.JoinField.toLowerCase() === disc.JoinField.toLowerCase()
            ) : null;
            const edgePolicy = matchingEdge?.Policy ?? (disc?.Kind === 'ForwardFK' || disc?.Kind === 'SelfPointer' ? 'Reference' : 'Deep');

            if (isParentReference || edgePolicy === 'Reference') {
                referenceNodeKeys.add(nodeKey);
                referenceNodeKeys.add(depNode.RecordID);
            }
        }

        // Check MaxRecords cap (only counts created nodes per spec §5.5)
        const createCandidateNodes = flatGraphNodes.filter(n => !referenceNodeKeys.has(`${n.EntityName}::${n.RecordID}`));
        if (createCandidateNodes.length > maxRecords) {
            warnings.push({
                Code: 'CAP_EXCEEDED',
                Severity: 'Error',
                Message: `Clone plan creates ${createCandidateNodes.length} records, which exceeds the configured MaxRecords cap of ${maxRecords}.`,
            });
            planBlocked = true;
        }

        // Allocate target keys for Created nodes (see CloneKeys.ts). Minted UUID keys go first and
        // into the key map, so derived keys (composite or natural) can remap their FK columns to them.
        const keyMap: Record<string, string> = {};
        const targetKeys = new Map<string, string | null>();
        const unchangedKeyNodes = new Set<string>();
        const createNodes = flatGraphNodes.filter((n) => !referenceNodeKeys.has(`${n.EntityName}::${n.RecordID}`));

        for (const depNode of createNodes) {
            if (KeyStrategyFor(depNode.EntityInfo) !== 'mint') continue;
            const nodeKey = `${depNode.EntityName}::${depNode.RecordID}`;
            const targetUuid = GenerateUUID();
            targetKeys.set(nodeKey, targetUuid);
            // Single-column key: map the source value (and the record id) to the new UUID so FK columns remap.
            const sourceValue = String(depNode.RecordKey?.KeyValuePairs?.[0]?.Value ?? '');
            for (const k of [depNode.RecordID, sourceValue]) {
                if (!k) continue;
                keyMap[k] = targetUuid;
                keyMap[`${depNode.EntityName}::${k}`] = targetUuid;
            }
        }

        // Rows whose key the database assigns: FK key columns pointing at them are filled at save.
        const serverAssigned = new Set<string>();
        for (const depNode of createNodes) {
            if (KeyStrategyFor(depNode.EntityInfo) !== 'server') continue;
            const sourceValue = String(depNode.RecordKey?.KeyValuePairs?.[0]?.Value ?? '');
            if (sourceValue) serverAssigned.add(`${depNode.EntityName}::${sourceValue}`);
        }

        for (const depNode of createNodes) {
            const nodeKey = `${depNode.EntityName}::${depNode.RecordID}`;
            const strategy = KeyStrategyFor(depNode.EntityInfo);
            if (strategy === 'server') {
                targetKeys.set(nodeKey, null); // the database assigns it on insert
            } else if (strategy === 'derived') {
                const derived = DeriveTargetKey(depNode.EntityInfo, depNode.RecordKey, keyMap, serverAssigned);
                const pks = depNode.EntityInfo.PrimaryKeys ?? [];
                const onlyKey = pks.length === 1 ? depNode.EntityInfo.Fields.find((f) => f.Name === pks[0].Name) ?? pks[0] : null;
                if (!derived.Changed && onlyKey && IsUuidColumn(onlyKey)) {
                    // A single UUID key that is also an FK (an IS-A subtype) whose parent is not in the
                    // clone: mint it; saving the subtype creates its parent row under the same ID.
                    const targetUuid = GenerateUUID();
                    targetKeys.set(nodeKey, targetUuid);
                    keyMap[depNode.RecordID] = targetUuid;
                    keyMap[`${depNode.EntityName}::${String(depNode.RecordKey.KeyValuePairs[0]?.Value ?? '')}`] = targetUuid;
                    continue;
                }
                targetKeys.set(nodeKey, ToRecordKeyString(derived.Key));
                if (!derived.Changed) unchangedKeyNodes.add(nodeKey);
            }
        }

        // Retarget: point a root foreign key at another record. Only the fields the entity offers
        // for it (Clone.UI.RetargetFields) apply; they then go through the field-override rules.
        const retargetable = new Set((rootConfig?.UI?.RetargetFields ?? []).map((f) => f.toLowerCase()));
        const retargetOverrides: Record<string, unknown> = {};
        for (const r of request.Options?.Retarget ?? []) {
            if (r.EntityName === entityName && retargetable.has(r.Field.toLowerCase())) {
                retargetOverrides[r.Field] = r.Value;
            } else {
                warnings.push({
                    Code: 'OPTION_OVERRIDE_IGNORED',
                    Severity: 'Warning',
                    Field: r.Field,
                    Message: `Retarget of '${r.EntityName}.${r.Field}' was ignored: the entity's clone configuration doesn't offer that field for retargeting.`,
                });
            }
        }

        // Naming for each row, and the names already taken, so a repeat clone doesn't collide at save.
        const cloneConfigOf = (e: EntityInfo) => e.CloneConfig ?? (e as unknown as { CloneConfiguration?: IEntityCloneConfiguration }).CloneConfiguration ?? null;
        const namingFor = (depNode: DependencyNode): NameTemplateOptions => {
            if (depNode.Depth === 0) {
                return {
                    Template: request.Options?.Naming?.Template || request.Options?.NamingTemplate || rootConfig?.Naming?.Template,
                    Strategy: request.Options?.Naming?.Strategy || request.Options?.NamingStrategy || rootConfig?.Naming?.Strategy || 'suffix',
                    Context: { UserName: contextUser.Name },
                };
            }
            const template = rootConfig?.Descendants?.[depNode.EntityName]?.Naming?.Template || cloneConfigOf(depNode.EntityInfo)?.Naming?.Template;
            return {
                Template: template,
                Strategy: rootConfig?.Descendants?.[depNode.EntityName]?.Naming?.Strategy || cloneConfigOf(depNode.EntityInfo)?.Naming?.Strategy || (template ? 'suffix' : 'none'),
                Context: { UserName: contextUser.Name },
            };
        };
        const existingNames = await this.loadExistingNames(createNodes, namingFor, contextUser);

        // Map nodes
        const nodes: ClonePlanNode[] = [];
        const plannedNodesForCollisionCheck: PlannedRecordNode[] = [];

        for (const depNode of flatGraphNodes) {
            const nodeKey = `${depNode.EntityName}::${depNode.RecordID}`;
            const isReference = referenceNodeKeys.has(nodeKey);
            const entInfo = depNode.EntityInfo;
            const isRoot = depNode.Depth === 0;
            const disc = depNode.DiscoveringEdge;
            const viaEdge = disc ? edges.find(e =>
                e.FromKey === disc.FromKey &&
                e.ToKey === disc.ToKey &&
                e.JoinField.toLowerCase() === disc.JoinField.toLowerCase()
            ) ?? null : null;

            if (isReference) {
                const planNode: ClonePlanNode = {
                    Key: nodeKey,
                    NodeKey: nodeKey,
                    EntityName: depNode.EntityName,
                    SourceKey: depNode.RecordID,
                    TargetKey: null,
                    Action: 'Reference',
                    Reason: 'Referenced existing record',
                    Depth: depNode.Depth,
                    ParentKey: disc ? disc.FromKey : null,
                    Via: viaEdge,
                    DisplayName: (depNode.RecordData?.[entInfo.NameField?.Name || 'Name'] ? String(depNode.RecordData[entInfo.NameField?.Name || 'Name']) : null) || depNode.EntityName,
                    FieldChanges: [],
                    Warnings: [],
                    Route: 'Sidecar',
                };
                nodes.push(planNode);
                continue;
            }

            const perms = entInfo.GetUserPermisions(contextUser);
            let nodeBlocked = false;

            if (!perms.CanCreate) {
                warnings.push({
                    Code: 'NO_CREATE_PERMISSION',
                    Severity: 'Error',
                    NodeKey: nodeKey,
                    Message: `User lacks CanCreate permission on entity '${depNode.EntityName}'.`,
                });
                nodeBlocked = true;
                planBlocked = true;
            }

            // Every created row is checked against its own entity's clone authorization (plan §9.1).
            // The root's own check ran above; repeating it would only duplicate the warning.
            const nodeAuth = isRoot ? rootAuth : authorizer.CanCloneEntity(entInfo, contextUser);
            if (!isRoot && !nodeAuth.Granted) {
                warnings.push({
                    Code: 'FORBIDDEN',
                    Severity: 'Error',
                    NodeKey: nodeKey,
                    Message: `Copying '${depNode.EntityName}' rows requires the '${nodeAuth.Name}' authorization. Set that relationship to Reference or Skip, or ask for the authorization.`,
                });
                nodeBlocked = true;
                planBlocked = true;
            }

            const targetKey = targetKeys.get(nodeKey) ?? null;

            // A derived key with no remapped column equals the source key; saving would collide.
            if (unchangedKeyNodes.has(nodeKey)) {
                warnings.push({
                    Code: 'TARGET_KEY_UNCHANGED',
                    Severity: 'Error',
                    NodeKey: nodeKey,
                    Message: `A copy of this '${depNode.EntityName}' row would keep the same primary key (${depNode.EntityInfo.PrimaryKeys.map((k) => k.Name).join(', ')}), because none of its key columns point at a record being cloned. Skip that relationship, or clone it from a parent whose key it contains.`,
                });
                nodeBlocked = true;
                planBlocked = true;
            }

            const fieldMappingResult = MapFieldsForClone({
                EntityName: depNode.EntityName,
                Fields: FieldMetaFromEntity(entInfo),
                SourceRecord: depNode.RecordData,
                CurrentUserId: contextUser.ID,
                KeyMap: keyMap,
                NamingOptions: {
                    ...namingFor(depNode),
                    UserName: contextUser.Name,
                    ExistingNamesByField: existingNames.get(depNode.EntityName),
                },
                FieldRules: (() => {
                    const entConfig = entInfo.CloneConfig ?? (entInfo as unknown as { CloneConfiguration?: import('@memberjunction/core').IEntityCloneConfiguration }).CloneConfiguration ?? null;
                    const descConfig = !isRoot ? rootConfig?.Descendants?.[depNode.EntityName] : undefined;

                    const entOwnership = entConfig?.Fields?.Ownership || (entConfig as { Ownership?: string[] } | null)?.Ownership;
                    const descOwnership = descConfig?.Fields?.Ownership || (descConfig as { Ownership?: string[] } | undefined)?.Ownership;
                    const combinedOwnership = [
                        ...(entOwnership || []),
                        ...(descOwnership || []),
                    ];

                    const combinedExclude = [
                        ...(entConfig?.Fields?.Exclude || []),
                        ...(descConfig?.Fields?.Exclude || []),
                    ];

                    const combinedReset: Record<string, unknown> = {
                        ...(entConfig?.Fields?.Reset || {}),
                        ...(descConfig?.Fields?.Reset || {}),
                    };

                    const combinedServerAllocated = [
                        ...(entConfig?.Fields?.ServerAllocated || []),
                        ...(descConfig?.Fields?.ServerAllocated || []),
                    ];

                    const combinedPromptFor = [
                        ...(entConfig?.Fields?.PromptFor || []),
                        ...(descConfig?.Fields?.PromptFor || []),
                    ];

                    const hasRules =
                        combinedOwnership.length > 0 ||
                        combinedExclude.length > 0 ||
                        Object.keys(combinedReset).length > 0 ||
                        combinedServerAllocated.length > 0 ||
                        combinedPromptFor.length > 0 ||
                        entConfig?.Fields?.Rules ||
                        descConfig?.Fields?.Rules ||
                        entConfig?.Fields?.JsonRemap;

                    if (!hasRules) return undefined;

                    return {
                        Exclude: combinedExclude.length > 0 ? combinedExclude : undefined,
                        Reset: Object.keys(combinedReset).length > 0 ? combinedReset : undefined,
                        Ownership: combinedOwnership.length > 0 ? combinedOwnership : undefined,
                        ServerAllocated: combinedServerAllocated.length > 0 ? combinedServerAllocated : undefined,
                        PromptFor: combinedPromptFor.length > 0 ? combinedPromptFor : undefined,
                        Rules: (descConfig?.Fields?.Rules ?? entConfig?.Fields?.Rules) as import('@memberjunction/record-cloning-base').CloneFieldMappingContext['FieldRules']['Rules'],
                        JsonRemap: entConfig?.Fields?.JsonRemap
                            ? (Array.isArray(entConfig.Fields.JsonRemap)
                                ? entConfig.Fields.JsonRemap
                                : Object.entries(entConfig.Fields.JsonRemap).map(([Field, Rules]) => ({
                                      Field,
                                      Rules: Rules as import('@memberjunction/record-cloning-base').JsonRemapRule[],
                                  })))
                            : undefined,
                    };
                })(),
                RequestOverrides: isRoot ? { ...(request.FieldOverrides ?? request.Options?.FieldOverrides ?? {}), ...retargetOverrides } : undefined,
                PromptedValues: isRoot ? (request.PromptedValues ?? request.Options?.PromptedValues) : undefined,
                RequestFieldsEditable: ['fields', 'all'].includes(rootConfig?.UserEditable ?? 'all'),
                FLS: fieldLevelDenials(entInfo, contextUser),
                IsRoot: isRoot,
                HierarchyParentField: entInfo.Fields.find((f) => f.IsHierarchy)?.Name,
                NewParentKey: isRoot ? (request.Options?.NewParentKey ?? null) : undefined,
            });

            for (const ignored of fieldMappingResult.IgnoredRequestValues) {
                warnings.push({
                    Code: 'OPTION_OVERRIDE_IGNORED',
                    Severity: 'Warning',
                    NodeKey: nodeKey,
                    Field: ignored.Field,
                    Message: `${ignored.Kind === 'Prompt' ? 'Prompted value' : 'Override'} for '${ignored.Field}' was ignored: ${ignored.Reason}.`,
                });
            }

            const planNode: ClonePlanNode = {
                Key: nodeKey,
                NodeKey: nodeKey,
                EntityName: depNode.EntityName,
                SourceKey: depNode.RecordID,
                TargetKey: targetKey,
                Action: nodeBlocked ? 'Blocked' : 'Create',
                Reason: nodeBlocked ? 'Permission error' : 'Clone record',
                Depth: depNode.Depth,
                ParentKey: depNode.DiscoveringEdge ? depNode.DiscoveringEdge.FromKey : null,
                Via: viaEdge,
                DisplayName: (depNode.RecordData?.[entInfo.NameField?.Name || 'Name'] ? String(depNode.RecordData[entInfo.NameField?.Name || 'Name']) : null) || depNode.EntityName,
                FieldChanges: fieldMappingResult.FieldChanges,
                Warnings: [],
                Route: isRoot ? 'RootSave' : 'Collection',
            };

            nodes.push(planNode);

            plannedNodesForCollisionCheck.push({
                NodeKey: planNode.NodeKey ?? planNode.Key,
                EntityName: planNode.EntityName,
                Values: fieldMappingResult.MappedValues,
            });
        }

        // Intra-plan collision detection across siblings
        const uniqueKeysByEntity: Record<string, import('@memberjunction/record-cloning-base').UniqueKeyDefinition[]> = {};
        for (const depNode of flatGraphNodes) {
            const nodeKey = `${depNode.EntityName}::${depNode.RecordID}`;
            if (referenceNodeKeys.has(nodeKey)) {
                continue;
            }
            if (!uniqueKeysByEntity[depNode.EntityName]) {
                const uqs: import('@memberjunction/record-cloning-base').UniqueKeyDefinition[] = [];
                if (depNode.EntityInfo.CloneConfig?.Fields?.UniqueKeys && depNode.EntityInfo.CloneConfig.Fields.UniqueKeys.length > 0) {
                    uqs.push(...depNode.EntityInfo.CloneConfig.Fields.UniqueKeys);
                } else {
                    for (const f of depNode.EntityInfo.Fields) {
                        if (f.IsUnique && !f.IsPrimaryKey && !f.RelatedEntityID) {
                            uqs.push({
                                Fields: [f.Name],
                                Scope: 'Global',
                            });
                        }
                    }
                }
                uniqueKeysByEntity[depNode.EntityName] = uqs;
            }
        }
        const intraPlanCollisions = DetectIntraPlanCollisions(plannedNodesForCollisionCheck, uniqueKeysByEntity);
        if (intraPlanCollisions.length > 0) {
            for (const col of intraPlanCollisions) {
                warnings.push({
                    Code: 'INTRA_PLAN_COLLISION',
                    Severity: 'Error',
                    NodeKey: col.NodeKeyB,
                    Message: `Intra-plan collision detected between '${col.NodeKeyA}' and '${col.NodeKeyB}' on unique fields: [${col.Fields.join(', ')}].`,
                });
                planBlocked = true;
            }
        }

        // Calculate Plan Hash (ignoring TargetKey values)
        const planHash = ComputeClonePlanHash({
            Nodes: nodes,
            Edges: edges,
            Excluded: excludedNodes,
        });

        const byEntity: Record<string, { Create: number; Reference: number; Skip: number }> = {};
        for (const n of nodes) {
            if (!byEntity[n.EntityName]) {
                byEntity[n.EntityName] = { Create: 0, Reference: 0, Skip: 0 };
            }
            if (n.Action === 'Create') byEntity[n.EntityName].Create++;
            else if (n.Action === 'Reference') byEntity[n.EntityName].Reference++;
            else if (n.Action === 'Skip') byEntity[n.EntityName].Skip++;
        }
        const createCount = nodes.filter((n) => n.Action === 'Create').length;

        // The root's own planned key; empty when the database assigns it on insert.
        const rootTargetKey = targetKeys.get(`${entityName}::${key.ToConcatenatedString()}`) ?? '';

        return {
            PlanVersion: 1,
            Hash: planHash,
            PlanHash: planHash,
            Roots: [`${entityName}::${key.ToConcatenatedString()}`],
            RootEntityName: entityName,
            RootSourceKey: key.ToConcatenatedString(),
            RootTargetKey: rootTargetKey,
            Nodes: nodes,
            Edges: edges,
            Excluded: excludedNodes,
            Counts: {
                ByEntity: byEntity,
                Create: createCount,
                Total: nodes.length,
            },
            Warnings: warnings,
            Blocked: planBlocked,
            EffectiveOptions: effectiveOptions,
            Overrides: resolved.Overrides,
        };
    }

    /**
     * Values already taken in each field a clone renames, per entity, found with one prefix query
     * per (entity, field). Without them the rename can't avoid "Sales (copy)" on the second clone.
     */
    private async loadExistingNames(
        createNodes: DependencyNode[],
        namingFor: (node: DependencyNode) => NameTemplateOptions,
        contextUser: UserInfo
    ): Promise<Map<string, Record<string, Set<string>>>> {
        const prefixes = new Map<string, { entity: string; field: string; prefixes: Set<string> }>();
        for (const node of createNodes) {
            const naming = namingFor(node);
            for (const field of FieldMetaFromEntity(node.EntityInfo).filter(IsRenameField)) {
                const value = node.RecordData?.[field.Name];
                if (value === null || value === undefined || value === '') continue;
                const prefix = NameCollisionPrefix(String(value), { ...naming, MaxLength: field.MaxLength });
                if (!prefix) continue;
                const k = `${node.EntityName}\u0000${field.Name}`;
                if (!prefixes.has(k)) prefixes.set(k, { entity: node.EntityName, field: field.Name, prefixes: new Set() });
                prefixes.get(k)!.prefixes.add(prefix);
            }
        }

        const result = new Map<string, Record<string, Set<string>>>();
        const rv = RunView.FromMetadataProvider(this.Provider);
        for (const { entity, field, prefixes: set } of prefixes.values()) {
            const all = [...set];
            const taken = new Set<string>();
            for (let i = 0; i < all.length; i += 50) {
                const filter = all.slice(i, i + 50).map((p) => `${field} LIKE '${EscapeSQLString(p)}%'`).join(' OR ');
                const res = await rv.RunView<Record<string, unknown>>(
                    { EntityName: entity, Fields: [field], ExtraFilter: `(${filter})`, ResultType: 'simple', MaxRows: 5000 },
                    contextUser
                );
                for (const row of res?.Success ? res.Results ?? [] : []) {
                    if (row[field] !== null && row[field] !== undefined) taken.add(String(row[field]));
                }
            }
            if (!result.has(entity)) result.set(entity, {});
            result.get(entity)![field] = taken;
        }
        return result;
    }

    /**
     * Drops rows matching their relationship's `ExcludeRows`, with every row discovered beneath them.
     * The root's `Relationships` entry wins over the relationship's own bag. One Info warning per relationship.
     */
    private dropExcludedRows(
        nodes: DependencyNode[],
        rootConfig: IEntityCloneConfiguration | null,
        excludedNodes: Array<{ EntityName: string; SourceKey: string; Reason: string }>,
        warnings: CloneWarning[]
    ): DependencyNode[] {
        const dropped = new Set<string>();
        const counts = new Map<string, number>();
        const isDropped = (key: string) => dropped.has(key) || dropped.has(key.split('::')[1] ?? '');
        const kept: DependencyNode[] = [];

        for (const node of nodes) {
            const edge = node.DiscoveringEdge;
            if (!edge) {
                kept.push(node);
                continue;
            }
            const rules: ICloneRowExclusion[] | undefined =
                rootConfig?.Relationships?.[`${edge.TargetEntityName}.${edge.JoinField}`]?.ExcludeRows ??
                rootConfig?.Relationships?.[edge.TargetEntityName]?.ExcludeRows ??
                edge.Relationship?.CloneConfig?.ExcludeRows;
            const matched = RowMatchesExclusion(node.RecordData ?? {}, rules);
            if (!matched && !isDropped(edge.FromKey)) {
                kept.push(node);
                continue;
            }
            dropped.add(`${node.EntityName}::${node.RecordID}`);
            dropped.add(node.RecordID);
            excludedNodes.push({
                EntityName: node.EntityName,
                SourceKey: node.RecordID,
                Reason: matched ? 'Row matches the relationship\'s ExcludeRows.' : 'Parent row was excluded.',
            });
            if (matched) counts.set(node.EntityName, (counts.get(node.EntityName) ?? 0) + 1);
        }

        for (const [entityName, count] of counts) {
            warnings.push({
                Code: 'ROWS_EXCLUDED',
                Severity: 'Info',
                Message: `${count} ${entityName} row${count === 1 ? '' : 's'} left out by the configuration (per-person or per-device data).`,
            });
        }
        return kept;
    }
}
