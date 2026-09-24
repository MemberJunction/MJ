/**
 * @file ClonePlanner.ts
 * Computes deterministic clone plans for entity records using graph traversal.
 * Enforces caps, permissions, unique key classification, field transformations, and plan hashing.
 * @see plans/record-cloning/README.md §5, §7, §13.1
 */

import {
    CompositeKey,
    EntityInfo,
    IMetadataProvider,
    Metadata,
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
    ComputeClonePlanHash,
    DetectIntraPlanCollisions,
    GenerateUUID,
    MapFieldsForClone,
    PlannedRecordNode,
    RecordCloneRequest,
    ResolveEdgePolicy,
    ResolveEffectiveCloneOptions,
    NormalizeClonePresets,
} from '@memberjunction/record-cloning-base';
import { CloneAuthorizer } from './CloneAuthorization';

export interface ClonePlannerOptions {
    Provider?: IMetadataProvider;
}

interface CompositeKeyLike {
    KeyValuePairs: Array<CompositeKey['KeyValuePairs'][number]>;
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
                        ChildEntityConfig: targetConfig ? {
                            NotCloneable: targetConfig.Enabled === false || targetConfig.NotCloneable === true,
                            AllowCreateAPI: targetEntity.AllowCreateAPI,
                        } : undefined,
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

        // Flatten graph nodes
        const flatGraphNodes = walker.FlattenTopological(rootNode);

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

        // Allocate target keys & build key map for Created nodes only
        const keyMap: Record<string, string> = {};
        for (const depNode of flatGraphNodes) {
            const nodeKey = `${depNode.EntityName}::${depNode.RecordID}`;
            if (referenceNodeKeys.has(nodeKey)) {
                // Referenced nodes retain their existing identity; do not remap foreign keys pointing to them
                continue;
            }

            const entInfo = depNode.EntityInfo;
            const pkField = entInfo.FirstPrimaryKey?.Name;
            const targetUuid = GenerateUUID();
            keyMap[depNode.RecordID] = targetUuid;
            if (pkField) {
                keyMap[`${depNode.EntityName}::${depNode.RecordID}`] = targetUuid;
            }

            // Map single-column scalar primary key value so foreign key remapping matches
            if (depNode.RecordKey?.KeyValuePairs?.length === 1) {
                const scalarVal = String(depNode.RecordKey.KeyValuePairs[0].Value ?? '');
                if (scalarVal) {
                    keyMap[scalarVal] = targetUuid;
                    keyMap[`${depNode.EntityName}::${scalarVal}`] = targetUuid;
                }
            }
            if (typeof depNode.RecordKey?.ToCompactURLSegment === 'function') {
                const compact = depNode.RecordKey.ToCompactURLSegment();
                if (compact) {
                    keyMap[compact] = targetUuid;
                    keyMap[`${depNode.EntityName}::${compact}`] = targetUuid;
                }
            }
        }

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

            const targetKey = keyMap[depNode.RecordID];

            const fieldMappingResult = MapFieldsForClone({
                EntityName: depNode.EntityName,
                Fields: entInfo.Fields.map((f) => ({
                    Name: f.Name,
                    IsPrimaryKey: f.IsPrimaryKey,
                    IsIdentity: f.AutoIncrement === true,
                    IsNameField: (entInfo.NameField?.Name.toLowerCase() === f.Name.toLowerCase()) || f.Name.toLowerCase() === 'name',
                    IsUnique: f.IsUnique,
                    RelatedEntityID: f.RelatedEntityID,
                    RelatedEntity: f.RelatedEntity,
                    RelatedEntityJoinField: f.RelatedEntityFieldName,
                    EntityIDFieldName: f.EntityIDFieldName,
                    Type: f.Type,
                    IsSPParameter: (upd: boolean) => (f.IsSPParameter ? f.IsSPParameter(upd) : true),
                    DefaultValue: f.DefaultValue,
                    AllowsNull: f.AllowsNull,
                    IsCreatedAtField: f.Name === '__mj_CreatedAt',
                    IsUpdatedAtField: f.Name === '__mj_UpdatedAt',
                    IsSoftDeleteField: false,
                })),
                SourceRecord: depNode.RecordData,
                CurrentUserId: contextUser.ID,
                KeyMap: keyMap,
                NamingOptions: {
                    Template: isRoot
                        ? (request.Options?.Naming?.Template || request.Options?.NamingTemplate || rootConfig?.Naming?.Template)
                        : (rootConfig?.Descendants?.[depNode.EntityName]?.Naming?.Template || entInfo.CloneConfig?.Naming?.Template || (entInfo as unknown as { CloneConfiguration?: import('@memberjunction/core').IEntityCloneConfiguration }).CloneConfiguration?.Naming?.Template),
                    Strategy: isRoot
                        ? (request.Options?.Naming?.Strategy || request.Options?.NamingStrategy || rootConfig?.Naming?.Strategy || 'suffix')
                        : (rootConfig?.Descendants?.[depNode.EntityName]?.Naming?.Strategy || entInfo.CloneConfig?.Naming?.Strategy || (entInfo as unknown as { CloneConfiguration?: import('@memberjunction/core').IEntityCloneConfiguration }).CloneConfiguration?.Naming?.Strategy || (rootConfig?.Descendants?.[depNode.EntityName]?.Naming?.Template || entInfo.CloneConfig?.Naming?.Template ? 'suffix' : 'none')),
                    UserName: contextUser.Name,
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
                RequestOverrides: isRoot ? (request.FieldOverrides ?? request.Options?.FieldOverrides) : undefined,
                PromptedValues: isRoot ? (request.PromptedValues ?? request.Options?.PromptedValues) : undefined,
                IsRoot: isRoot,
                HierarchyParentField: entInfo.Fields.find((f) => f.IsHierarchy)?.Name,
                NewParentKey: isRoot ? (request.Options?.NewParentKey ?? null) : undefined,
            });

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

        const rootTargetKey = keyMap[key.ToConcatenatedString()] ?? GenerateUUID();

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
}
