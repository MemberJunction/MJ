import {
    BaseEntity,
    IMetadataProvider,
    RunView,
    ValidationErrorInfo,
    ValidationErrorType,
} from '@memberjunction/core';
import {
    MJAIAgentActionEntity,
    MJAIAgentClientToolEntity,
    MJAIAgentEntity,
    MJAIAgentModalityEntity,
    MJAIAgentRelationshipEntity,
    MJAIAgentSkillEntity,
} from '@memberjunction/core-entities';
import {
    AGENT_MESSAGE_MODE_RANK,
    DoesAgentAllowWidenFromBase,
    IsPayloadPathSetWithinAncestor,
    MAX_AGENT_INHERITANCE_DEPTH,
} from '@memberjunction/ai-core-plus';
import { EscapeSQLString, IndexByUUID, NormalizeUUID, UUIDsEqual, UUIDSet } from '@memberjunction/global';

export type AgentRelationalGrantKind =
    | 'Action'
    | 'Sub-Agent Relationship'
    | 'Skill'
    | 'Client Tool'
    | 'Modality';

export interface RelationalGrantAgentRow {
    ID: string;
    Name?: string | null;
    BaseAgentID?: string | null;
    ParentID?: string | null;
    Configuration?: string | null;
    Status?: string | null;
}

export interface RelationalGrantValidationInput {
    Kind: AgentRelationalGrantKind;
    FieldName: string;
    TargetAgentID: string;
    GrantTargetID: string;
    /** Whether this row grants/enables access (false = veto/disable, which is always allowed). */
    IsActiveGrant: boolean;
    AllAgents: ReadonlyArray<RelationalGrantAgentRow>;
    /** Existing join rows across the ancestor chain (root..parent), already filtered to relevant direction if Modality. */
    AncestorJoinRows: ReadonlyArray<{
        AgentID: string;
        GrantTargetID: string;
        IsActiveGrant: boolean;
        MaxExecutionsPerRun?: number | null;
        MinExecutionsPerRun?: number | null;
        ResultExpirationTurns?: number | null;
        MessageMode?: MJAIAgentRelationshipEntity['MessageMode'] | null;
        MaxMessages?: number | null;
        SubAgentContextPaths?: string | null;
        MaxSizeBytes?: number | null;
        MaxCountPerMessage?: number | null;
    }>;
    /** Optional per-item bounds on the row being saved (validated against inherited bounds). */
    TargetBounds?: {
        MaxExecutionsPerRun?: number | null;
        MinExecutionsPerRun?: number | null;
        ResultExpirationTurns?: number | null;
        MessageMode?: MJAIAgentRelationshipEntity['MessageMode'] | null;
        MaxMessages?: number | null;
        SubAgentContextPaths?: string | null;
        MaxSizeBytes?: number | null;
        MaxCountPerMessage?: number | null;
    };
}

function parseJsonStringArray(raw: string | null | undefined): string[] | null {
    if (!raw || raw.trim().length === 0) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((item): item is string => typeof item === 'string')) {
            return parsed;
        }
    } catch {
        return null;
    }
    return null;
}

/**
 * Pure validation core enforcing that derived agents (`BaseAgentID != null`) whose
 * `Configuration.allowWidenFromBase !== true` CANNOT attach net-new active relational grants
 * (`Actions`, `Relationships`, `Skills`, `ClientTools`, `Modalities`) or loosen inherited
 * per-grant ceilings. Vetoes (`IsActiveGrant === false`) are always permitted.
 */
export function ValidateDerivedAgentRelationalGrant(
    input: RelationalGrantValidationInput
): ValidationErrorInfo[] {
    if (!input.IsActiveGrant) {
        return [];
    }
    if (!input.TargetAgentID || !input.GrantTargetID) {
        return [];
    }

    const agentsById = IndexByUUID(input.AllAgents);
    const targetAgent = agentsById.Get(input.TargetAgentID);
    if (!targetAgent || !targetAgent.BaseAgentID) {
        return [];
    }
    if (DoesAgentAllowWidenFromBase(targetAgent.Configuration)) {
        return [];
    }

    // Walk ancestor chain (root -> immediate baseAgent)
    const ancestorsBottomUp: RelationalGrantAgentRow[] = [];
    const visited = new UUIDSet([targetAgent.ID]);
    let cursorId: string | null | undefined = targetAgent.BaseAgentID;
    let hops = 0;
    while (cursorId && hops < MAX_AGENT_INHERITANCE_DEPTH) {
        if (visited.Has(cursorId)) {
            break;
        }
        visited.Add(cursorId);
        const parent = agentsById.Get(cursorId);
        if (!parent) {
            break;
        }
        ancestorsBottomUp.push(parent);
        cursorId = parent.BaseAgentID;
        hops++;
    }
    if (ancestorsBottomUp.length === 0) {
        return [];
    }
    const ancestors = ancestorsBottomUp.reverse();
    const baseName = ancestors[ancestors.length - 1].Name ?? targetAgent.BaseAgentID;
    const agentName = targetAgent.Name ?? targetAgent.ID;

    // Fold effective inherited grants across ancestors (root -> baseAgent) using rebase-aware rules
    const rowsByAgent = new Map<string, Array<RelationalGrantValidationInput['AncestorJoinRows'][number]>>();
    for (const row of input.AncestorJoinRows) {
        const key = NormalizeUUID(row.AgentID);
        const list = rowsByAgent.get(key) ?? [];
        list.push(row);
        rowsByAgent.set(key, list);
    }

    interface EffectiveGrantState {
        MaxExecutionsPerRun: number | null;
        MinExecutionsPerRun: number | null;
        ResultExpirationTurns: number | null;
        MessageMode: MJAIAgentRelationshipEntity['MessageMode'] | null;
        MaxMessages: number | null;
        SubAgentContextPaths: string[] | null;
        MaxSizeBytes: number | null;
        MaxCountPerMessage: number | null;
    }

    const effectiveMap = new Map<string, EffectiveGrantState>();
    const minNullable = (a: number | null, b: number | null | undefined): number | null => {
        if (typeof b !== 'number' || !Number.isFinite(b)) return a;
        return a === null ? b : Math.min(a, b);
    };
    const maxNullable = (a: number | null, b: number | null | undefined): number | null => {
        if (typeof b !== 'number' || !Number.isFinite(b)) return a;
        return a === null ? b : Math.max(a, b);
    };

    for (let idx = 0; idx < ancestors.length; idx++) {
        const anc = ancestors[idx];
        const isRoot = idx === 0;
        const canWiden = idx > 0 && DoesAgentAllowWidenFromBase(anc.Configuration);

        // For Sub-Agent Relationship, include structural ParentID children of ancestor
        if (input.Kind === 'Sub-Agent Relationship' && (isRoot || canWiden)) {
            for (const candidate of input.AllAgents) {
                if (candidate.ParentID && UUIDsEqual(candidate.ParentID, anc.ID)) {
                    const normId = NormalizeUUID(candidate.ID);
                    if (!effectiveMap.has(normId)) {
                        effectiveMap.set(normId, {
                            MaxExecutionsPerRun: null,
                            MinExecutionsPerRun: null,
                            ResultExpirationTurns: null,
                            MessageMode: null,
                            MaxMessages: null,
                            SubAgentContextPaths: null,
                            MaxSizeBytes: null,
                            MaxCountPerMessage: null,
                        });
                    }
                }
            }
        }

        const rows = rowsByAgent.get(NormalizeUUID(anc.ID)) ?? [];
        for (const row of rows) {
            const normGrantId = NormalizeUUID(row.GrantTargetID);
            if (!row.IsActiveGrant) {
                effectiveMap.delete(normGrantId);
                continue;
            }
            const prev = effectiveMap.get(normGrantId);
            if (!prev) {
                if (isRoot || canWiden) {
                    effectiveMap.set(normGrantId, {
                        MaxExecutionsPerRun: row.MaxExecutionsPerRun ?? null,
                        MinExecutionsPerRun: row.MinExecutionsPerRun ?? null,
                        ResultExpirationTurns: row.ResultExpirationTurns ?? null,
                        MessageMode: row.MessageMode ?? null,
                        MaxMessages: row.MaxMessages ?? null,
                        SubAgentContextPaths: parseJsonStringArray(row.SubAgentContextPaths),
                        MaxSizeBytes: row.MaxSizeBytes ?? null,
                        MaxCountPerMessage: row.MaxCountPerMessage ?? null,
                    });
                }
                continue;
            }
            if (canWiden) {
                effectiveMap.set(normGrantId, {
                    MaxExecutionsPerRun: row.MaxExecutionsPerRun ?? prev.MaxExecutionsPerRun,
                    MinExecutionsPerRun: row.MinExecutionsPerRun ?? prev.MinExecutionsPerRun,
                    ResultExpirationTurns: row.ResultExpirationTurns ?? prev.ResultExpirationTurns,
                    MessageMode: row.MessageMode ?? prev.MessageMode,
                    MaxMessages: row.MaxMessages ?? prev.MaxMessages,
                    SubAgentContextPaths:
                        parseJsonStringArray(row.SubAgentContextPaths) ?? prev.SubAgentContextPaths,
                    MaxSizeBytes: row.MaxSizeBytes ?? prev.MaxSizeBytes,
                    MaxCountPerMessage: row.MaxCountPerMessage ?? prev.MaxCountPerMessage,
                });
            } else {
                const nextMode = row.MessageMode ?? null;
                const narrowedMode =
                    prev.MessageMode != null && nextMode != null
                        ? AGENT_MESSAGE_MODE_RANK[nextMode] < AGENT_MESSAGE_MODE_RANK[prev.MessageMode]
                            ? nextMode
                            : prev.MessageMode
                        : nextMode ?? prev.MessageMode;
                effectiveMap.set(normGrantId, {
                    MaxExecutionsPerRun: minNullable(prev.MaxExecutionsPerRun, row.MaxExecutionsPerRun),
                    MinExecutionsPerRun: maxNullable(prev.MinExecutionsPerRun, row.MinExecutionsPerRun),
                    ResultExpirationTurns: minNullable(prev.ResultExpirationTurns, row.ResultExpirationTurns),
                    MessageMode: narrowedMode,
                    MaxMessages: minNullable(prev.MaxMessages, row.MaxMessages),
                    SubAgentContextPaths:
                        parseJsonStringArray(row.SubAgentContextPaths) ?? prev.SubAgentContextPaths,
                    MaxSizeBytes: minNullable(prev.MaxSizeBytes, row.MaxSizeBytes),
                    MaxCountPerMessage: minNullable(prev.MaxCountPerMessage, row.MaxCountPerMessage),
                });
            }
        }
    }

    const normTargetGrant = NormalizeUUID(input.GrantTargetID);
    const inherited = effectiveMap.get(normTargetGrant);
    if (!inherited) {
        return [
            new ValidationErrorInfo(
                input.FieldName,
                `Derived agent '${agentName}' cannot add net-new ${input.Kind} grant '${input.GrantTargetID}' not inherited from base agent '${baseName}'. Set Configuration.allowWidenFromBase = true (Admin only) if intentional.`,
                input.GrantTargetID,
                ValidationErrorType.Failure
            ),
        ];
    }

    const errors: ValidationErrorInfo[] = [];
    const bounds = input.TargetBounds;
    if (bounds) {
        if (
            inherited.MaxExecutionsPerRun !== null &&
            typeof bounds.MaxExecutionsPerRun === 'number' &&
            bounds.MaxExecutionsPerRun > inherited.MaxExecutionsPerRun
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'MaxExecutionsPerRun',
                    `Derived agent cannot widen MaxExecutionsPerRun (${bounds.MaxExecutionsPerRun}) beyond base agent '${baseName}' (${inherited.MaxExecutionsPerRun}). Set Configuration.allowWidenFromBase = true (Admin only) if intentional.`,
                    bounds.MaxExecutionsPerRun,
                    ValidationErrorType.Failure
                )
            );
        }
        if (
            inherited.MinExecutionsPerRun !== null &&
            typeof bounds.MinExecutionsPerRun === 'number' &&
            bounds.MinExecutionsPerRun < inherited.MinExecutionsPerRun
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'MinExecutionsPerRun',
                    `Derived agent cannot lower MinExecutionsPerRun (${bounds.MinExecutionsPerRun}) below base agent '${baseName}' (${inherited.MinExecutionsPerRun}). Set Configuration.allowWidenFromBase = true (Admin only) if intentional.`,
                    bounds.MinExecutionsPerRun,
                    ValidationErrorType.Failure
                )
            );
        }
        if (
            inherited.ResultExpirationTurns !== null &&
            typeof bounds.ResultExpirationTurns === 'number' &&
            bounds.ResultExpirationTurns > inherited.ResultExpirationTurns
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'ResultExpirationTurns',
                    `Derived agent cannot widen ResultExpirationTurns (${bounds.ResultExpirationTurns}) beyond base agent '${baseName}' (${inherited.ResultExpirationTurns}). Set Configuration.allowWidenFromBase = true (Admin only) if intentional.`,
                    bounds.ResultExpirationTurns,
                    ValidationErrorType.Failure
                )
            );
        }
        if (
            inherited.MessageMode != null &&
            bounds.MessageMode != null &&
            AGENT_MESSAGE_MODE_RANK[bounds.MessageMode] > AGENT_MESSAGE_MODE_RANK[inherited.MessageMode]
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'MessageMode',
                    `Derived agent cannot widen MessageMode ('${bounds.MessageMode}') beyond base agent '${baseName}' ('${inherited.MessageMode}'). Set Configuration.allowWidenFromBase = true (Admin only) if intentional.`,
                    bounds.MessageMode,
                    ValidationErrorType.Failure
                )
            );
        }
        if (
            inherited.MaxMessages !== null &&
            typeof bounds.MaxMessages === 'number' &&
            bounds.MaxMessages > inherited.MaxMessages
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'MaxMessages',
                    `Derived agent cannot widen MaxMessages (${bounds.MaxMessages}) beyond base agent '${baseName}' (${inherited.MaxMessages}). Set Configuration.allowWidenFromBase = true (Admin only) if intentional.`,
                    bounds.MaxMessages,
                    ValidationErrorType.Failure
                )
            );
        }
        if (inherited.SubAgentContextPaths !== null && bounds.SubAgentContextPaths != null) {
            const childPaths = parseJsonStringArray(bounds.SubAgentContextPaths);
            if (!IsPayloadPathSetWithinAncestor(inherited.SubAgentContextPaths, childPaths)) {
                errors.push(
                    new ValidationErrorInfo(
                        'SubAgentContextPaths',
                        `Derived agent cannot widen SubAgentContextPaths beyond base agent '${baseName}'. Set Configuration.allowWidenFromBase = true (Admin only) if intentional.`,
                        bounds.SubAgentContextPaths,
                        ValidationErrorType.Failure
                    )
                );
            }
        }
        if (
            inherited.MaxSizeBytes !== null &&
            typeof bounds.MaxSizeBytes === 'number' &&
            bounds.MaxSizeBytes > inherited.MaxSizeBytes
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'MaxSizeBytes',
                    `Derived agent cannot widen MaxSizeBytes (${bounds.MaxSizeBytes}) beyond base agent '${baseName}' (${inherited.MaxSizeBytes}). Set Configuration.allowWidenFromBase = true (Admin only) if intentional.`,
                    bounds.MaxSizeBytes,
                    ValidationErrorType.Failure
                )
            );
        }
        if (
            inherited.MaxCountPerMessage !== null &&
            typeof bounds.MaxCountPerMessage === 'number' &&
            bounds.MaxCountPerMessage > inherited.MaxCountPerMessage
        ) {
            errors.push(
                new ValidationErrorInfo(
                    'MaxCountPerMessage',
                    `Derived agent cannot widen MaxCountPerMessage (${bounds.MaxCountPerMessage}) beyond base agent '${baseName}' (${inherited.MaxCountPerMessage}). Set Configuration.allowWidenFromBase = true (Admin only) if intentional.`,
                    bounds.MaxCountPerMessage,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    return errors;
}

/**
 * Returns true when `entity` has a live `IRunViewProvider` (always true in production MJServer;
 * false in lightweight unit-test mocks that only stub `ProviderToUse.GetEntityObject`).
 */
export function HasRelationalGrantGuardProvider(entity: BaseEntity): boolean {
    const rvProvider = entity.RunViewProviderToUse;
    return Boolean(rvProvider && typeof rvProvider.RunView === 'function');
}

/**
 * Live DB loader + validator invoked from the 5 `MJAIAgent*EntityServer.ValidateAsync()` hooks.
 * Short-circuits immediately (zero extra queries) for vetoes (`!isActiveGrant`) or when the target
 * agent is a root agent (`BaseAgentID == null`) or opts into `Configuration.allowWidenFromBase === true`.
 */
export async function ValidateDerivedAgentRelationalGrantLive(
    entity: BaseEntity,
    args: {
        Kind: AgentRelationalGrantKind;
        EntityName:
            | 'MJ: AI Agent Actions'
            | 'MJ: AI Agent Relationships'
            | 'MJ: AI Agent Skills'
            | 'MJ: AI Agent Client Tools'
            | 'MJ: AI Agent Modalities';
        FieldName: string;
        AgentID: string | null | undefined;
        GrantTargetID: string | null | undefined;
        IsActiveGrant: boolean;
        ModalityDirection?: 'Input' | 'Output';
        TargetBounds?: RelationalGrantValidationInput['TargetBounds'];
    }
): Promise<ValidationErrorInfo[]> {
    if (!args.IsActiveGrant || !args.AgentID || !args.GrantTargetID) {
        return [];
    }
    const rvProvider = entity.RunViewProviderToUse;
    if (!rvProvider || typeof rvProvider.RunView !== 'function') {
        return [];
    }
    const rv = new RunView(rvProvider);
    const mdProvider = entity.ProviderToUse as Partial<IMetadataProvider> | null | undefined;
    const agentEntityInfo = mdProvider?.EntityByName?.('MJ: AI Agents');
    const requestedAgentFields = ['ID', 'Name', 'BaseAgentID', 'ParentID', 'Configuration', 'Status'];
    const agentFields = agentEntityInfo
        ? requestedAgentFields.filter((f) => Boolean(agentEntityInfo.FieldByName(f)))
        : requestedAgentFields;

    // Fast path: load the target agent first; root agents and allowWidenFromBase agents return immediately
    const targetRes = await rv.RunView<RelationalGrantAgentRow>(
        {
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `ID='${EscapeSQLString(args.AgentID)}'`,
            Fields: agentFields,
            ResultType: 'simple',
        },
        entity.ContextCurrentUser
    );
    if (!targetRes.Success || targetRes.Results.length === 0) {
        return [];
    }
    const targetRow = targetRes.Results[0];
    if (!targetRow.BaseAgentID || DoesAgentAllowWidenFromBase(targetRow.Configuration)) {
        return [];
    }

    // Load all agents to trace ancestors (and structural ParentID children for Relationships)
    const allAgentsRes = await rv.RunView<RelationalGrantAgentRow>(
        {
            EntityName: 'MJ: AI Agents',
            Fields: agentFields,
            ResultType: 'simple',
        },
        entity.ContextCurrentUser
    );
    if (!allAgentsRes.Success) {
        return [
            new ValidationErrorInfo(
                args.FieldName,
                `Fail-closed: unable to verify ${args.Kind} inheritance bounds (${allAgentsRes.ErrorMessage ?? 'query failed'}).`,
                args.GrantTargetID,
                ValidationErrorType.Failure
            ),
        ];
    }

    // Collect ancestor IDs to query join rows cleanly
    const agentsById = IndexByUUID(allAgentsRes.Results);
    const ancestorIds: string[] = [];
    const seen = new UUIDSet([targetRow.ID]);
    let curId: string | null | undefined = targetRow.BaseAgentID;
    let hops = 0;
    while (curId && hops < MAX_AGENT_INHERITANCE_DEPTH) {
        if (seen.Has(curId)) break;
        seen.Add(curId);
        const p = agentsById.Get(curId);
        if (!p) break;
        ancestorIds.push(p.ID);
        curId = p.BaseAgentID;
        hops++;
    }
    if (ancestorIds.length === 0) {
        return [];
    }

    const inClause = ancestorIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const directionFilter =
        args.EntityName === 'MJ: AI Agent Modalities' && args.ModalityDirection
            ? ` AND Direction='${EscapeSQLString(args.ModalityDirection)}'`
            : '';

    const joinRes = await rv.RunView<
        | MJAIAgentActionEntity
        | MJAIAgentRelationshipEntity
        | MJAIAgentSkillEntity
        | MJAIAgentClientToolEntity
        | MJAIAgentModalityEntity
    >(
        {
            EntityName: args.EntityName,
            ExtraFilter: `AgentID IN (${inClause})${directionFilter}`,
            ResultType: 'simple',
        },
        entity.ContextCurrentUser
    );
    if (!joinRes.Success) {
        return [
            new ValidationErrorInfo(
                args.FieldName,
                `Fail-closed: unable to verify ancestor ${args.Kind} grants (${joinRes.ErrorMessage ?? 'query failed'}).`,
                args.GrantTargetID,
                ValidationErrorType.Failure
            ),
        ];
    }

    const ancestorJoinRows: Array<RelationalGrantValidationInput['AncestorJoinRows'][number]> = [];
    for (const raw of joinRes.Results) {
        if (args.EntityName === 'MJ: AI Agent Actions') {
            const row = raw as MJAIAgentActionEntity;
            if (!row.AgentID || !row.ActionID) continue;
            ancestorJoinRows.push({
                AgentID: row.AgentID,
                GrantTargetID: row.ActionID,
                IsActiveGrant: row.Status === 'Active',
                MaxExecutionsPerRun: row.MaxExecutionsPerRun,
                MinExecutionsPerRun: row.MinExecutionsPerRun,
                ResultExpirationTurns: row.ResultExpirationTurns,
            });
        } else if (args.EntityName === 'MJ: AI Agent Relationships') {
            const row = raw as MJAIAgentRelationshipEntity;
            if (!row.AgentID || !row.SubAgentID) continue;
            ancestorJoinRows.push({
                AgentID: row.AgentID,
                GrantTargetID: row.SubAgentID,
                IsActiveGrant: row.Status === 'Active',
                MessageMode: row.MessageMode,
                MaxMessages: row.MaxMessages,
                SubAgentContextPaths: row.SubAgentContextPaths,
            });
        } else if (args.EntityName === 'MJ: AI Agent Skills') {
            const row = raw as MJAIAgentSkillEntity;
            if (!row.AgentID || !row.SkillID) continue;
            ancestorJoinRows.push({
                AgentID: row.AgentID,
                GrantTargetID: row.SkillID,
                IsActiveGrant: row.Status === 'Active',
            });
        } else if (args.EntityName === 'MJ: AI Agent Client Tools') {
            const row = raw as MJAIAgentClientToolEntity;
            if (!row.AgentID || !row.ClientToolDefinitionID) continue;
            ancestorJoinRows.push({
                AgentID: row.AgentID,
                GrantTargetID: row.ClientToolDefinitionID,
                IsActiveGrant: true,
            });
        } else if (args.EntityName === 'MJ: AI Agent Modalities') {
            const row = raw as MJAIAgentModalityEntity;
            if (!row.AgentID || !row.ModalityID) continue;
            ancestorJoinRows.push({
                AgentID: row.AgentID,
                GrantTargetID: row.ModalityID,
                IsActiveGrant: row.IsAllowed !== false,
                MaxSizeBytes: row.MaxSizeBytes,
                MaxCountPerMessage: row.MaxCountPerMessage,
            });
        }
    }

    return ValidateDerivedAgentRelationalGrant({
        Kind: args.Kind,
        FieldName: args.FieldName,
        TargetAgentID: args.AgentID,
        GrantTargetID: args.GrantTargetID,
        IsActiveGrant: args.IsActiveGrant,
        AllAgents: allAgentsRes.Results,
        AncestorJoinRows: ancestorJoinRows,
        TargetBounds: args.TargetBounds,
    });
}
