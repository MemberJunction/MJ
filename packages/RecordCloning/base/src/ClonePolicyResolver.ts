/**
 * @file ClonePolicyResolver.ts
 * 8-tier precedence hierarchy for clone edge policy resolution.
 * Evaluates Built-in -> Constraint -> Child Entity -> Relationship -> Root Entity -> Preset -> Request.
 * Enforces:
 * - A child entity marked NotCloneable (or AllowCreateAPI=false) is skipped everywhere, unconditionally.
 * - Name heuristics (runs, logs, per-user state) skip a child only when no configuration names that edge.
 * - Unlisted relationships are Skip: each configuration opts in to what it copies. There are no
 *   entity-specific defaults.
 * - A self-relationship is Deep only when its join column is a hierarchy (IsHierarchy) field.
 * - A unique FK makes Reference impossible, so it turns Reference into Deep; it never overrides Skip.
 * - Locked edges ignore preset and request overrides (LOCKED_EDGE_OVERRIDE_IGNORED).
 * @see plans/record-cloning/README.md §4.4, §5.3–§5.5, §13.1
 */

import {
    CloneEdgeKind,
    CloneEdgePolicy,
    CloneWarning,
} from './types';
import { EvaluateExclusionClass } from './ExclusionClasses';

export interface EdgePolicyResolutionContext {
    FromKey: string;
    ToKey: string;
    Kind: CloneEdgeKind;
    ParentEntityName: string;
    ChildEntityName: string;
    JoinField: string;
    RelationshipID?: string;
    CollectionName?: string;
    IsSoftLink?: boolean;
    CurrentDepth: number;
    MaxDepth: number;

    // Database / Physical constraints
    IsUniqueFK?: boolean;
    /** The child's join column is flagged IsHierarchy (a parent/child tree within one entity). */
    IsHierarchyField?: boolean;
    IsWriteOnce?: boolean;

    // Configurations
    ChildEntityConfig?: {
        NotCloneable?: boolean;
        NotCloneableReason?: string;
        AllowCreateAPI?: boolean;
    };
    RelationshipConfig?: {
        Policy?: CloneEdgePolicy;
        Locked?: boolean;
    };
    RootEntityConfig?: {
        Relationships?: Record<string, { Policy?: CloneEdgePolicy; Locked?: boolean }>;
        Descendants?: Record<string, { Policy?: CloneEdgePolicy; Locked?: boolean }>;
    };
    /**
     * The `Relationships` of the entity the edge starts from, for edges below the root: a prompt's
     * template follows `MJ: Templates`' own configuration. The root's configuration still wins.
     */
    ParentEntityConfig?: {
        Relationships?: Record<string, { Policy?: CloneEdgePolicy; Locked?: boolean }>;
    };
    PresetConfig?: {
        EdgeOverrides?: Array<{
            RelationshipID?: string;
            ChildEntityName?: string;
            Policy: CloneEdgePolicy;
        }>;
    };
    RequestOverrides?: Array<{
        FromKey?: string;
        ToKey?: string;
        RelationshipID?: string;
        Policy: CloneEdgePolicy;
    }>;
    AllowUserOverrides?: boolean;
}

export interface EdgePolicyResolutionResult {
    Policy: CloneEdgePolicy;
    PolicySource: 'BuiltIn' | 'Constraint' | 'Entity' | 'Relationship' | 'Descendant' | 'Request';
    Locked: boolean;
    Warnings: CloneWarning[];
}

/**
 * Resolves the edge traversal policy according to the 8-tier precedence hierarchy.
 */
export function ResolveEdgePolicy(ctx: EdgePolicyResolutionContext): EdgePolicyResolutionResult {
    const warnings: CloneWarning[] = [];

    const configuredPolicy =
        ctx.RelationshipConfig?.Policy ??
        (ctx.RelationshipID ? ctx.RootEntityConfig?.Relationships?.[ctx.RelationshipID]?.Policy : undefined) ??
        ctx.RootEntityConfig?.Relationships?.[`${ctx.ChildEntityName}.${ctx.JoinField}`]?.Policy ??
        ctx.RootEntityConfig?.Relationships?.[ctx.ChildEntityName]?.Policy ??
        ctx.RootEntityConfig?.Descendants?.[ctx.ChildEntityName]?.Policy ??
        parentRelationship(ctx)?.Policy;

    // TIER 0 / EXCLUSION. Explicit NotCloneable and AllowCreateAPI=false win unconditionally.
    // The name heuristics only apply when no configuration says what to do with this edge.
    const exclusion = EvaluateExclusionClass({
        EntityName: ctx.ChildEntityName,
        NotCloneable: ctx.ChildEntityConfig?.NotCloneable,
        NotCloneableReason: ctx.ChildEntityConfig?.NotCloneableReason,
        AllowCreateAPI: ctx.ChildEntityConfig?.AllowCreateAPI,
        HeuristicsOnly: false,
    });
    const heuristic = configuredPolicy
        ? { Excluded: false as const }
        : EvaluateExclusionClass({ EntityName: ctx.ChildEntityName, HeuristicsOnly: true });

    for (const result of [exclusion, heuristic]) {
        if (!result.Excluded) continue;
        return {
            Policy: 'Skip',
            PolicySource: 'Entity',
            Locked: true,
            Warnings: [
                {
                    Code: 'NOT_CLONEABLE',
                    Severity: 'Warning',
                    NodeKey: ctx.ToKey,
                    Message: result.Reason || `Child entity '${ctx.ChildEntityName}' is excluded or NotCloneable.`,
                },
            ],
        };
    }

    // 1. Engine Built-in Default
    let policy: CloneEdgePolicy = 'Skip';
    let policySource: EdgePolicyResolutionResult['PolicySource'] = 'BuiltIn';
    let locked = false;

    switch (ctx.Kind) {
        case 'IsASubtype':
        case 'Embedded':
        case 'Collection':
            policy = 'Deep';
            break;
        case 'Relationship':
            // Unlisted one-to-many relationships are not followed: CodeGen creates one for every FK,
            // so following them by default copies (and grafts rows onto) records the clone doesn't own.
            policy = 'Skip';
            break;
        case 'ForwardFK':
        case 'SelfPointer':
            policy = 'Reference';
            break;
        case 'InboundFK':
        case 'SoftLink':
            policy = 'Skip';
            break;
        case 'Hierarchy':
            // A self-relationship is a tree only when its join column is flagged IsHierarchy.
            policy = ctx.IsHierarchyField ? 'Deep' : 'Skip';
            break;
        default:
            policy = 'Skip';
            break;
    }

    // 2. Constraint-derived decisions are applied at the end: a unique FK only rules out Reference.

    // 3. Child Entity Bag (already handled NotCloneable above)

    // 4. Relationship Bag (IEntityRelationshipConfiguration.Clone)
    if (ctx.RelationshipConfig) {
        if (ctx.RelationshipConfig.Locked) {
            locked = true;
        }
        if (ctx.RelationshipConfig.Policy) {
            policy = ctx.RelationshipConfig.Policy;
            policySource = 'Relationship';
        }
    }

    // 4b. The parent entity's own configuration, below the root
    const parentMatch = parentRelationship(ctx);
    if (parentMatch) {
        if (parentMatch.Locked) locked = true;
        if (parentMatch.Policy) {
            policy = parentMatch.Policy;
            policySource = 'Entity';
        }
    }

    // 5. Root Entity Bag (Relationships & Descendants)
    if (ctx.RootEntityConfig) {
        const relMatch =
            (ctx.RelationshipID && ctx.RootEntityConfig.Relationships?.[ctx.RelationshipID]) ||
            ctx.RootEntityConfig.Relationships?.[`${ctx.ChildEntityName}.${ctx.JoinField}`] ||
            ctx.RootEntityConfig.Relationships?.[ctx.ChildEntityName];
        if (relMatch) {
            if (relMatch.Locked) locked = true;
            if (relMatch.Policy) {
                policy = relMatch.Policy;
                policySource = 'Descendant';
            }
        }

        const descMatch = ctx.RootEntityConfig.Descendants?.[ctx.ChildEntityName];
        if (descMatch) {
            if (descMatch.Locked) locked = true;
            if (descMatch.Policy) {
                policy = descMatch.Policy;
                policySource = 'Descendant';
            }
        }
    }

    // 6. Preset (a Locked edge keeps its configured policy)
    if (ctx.PresetConfig?.EdgeOverrides) {
        const presetOverride = ctx.PresetConfig.EdgeOverrides.find(
            (o) =>
                (ctx.RelationshipID && o.RelationshipID === ctx.RelationshipID) ||
                (o.ChildEntityName && o.ChildEntityName === ctx.ChildEntityName)
        );
        if (presetOverride && locked) {
            warnings.push({
                Code: 'LOCKED_EDGE_OVERRIDE_IGNORED',
                Severity: 'Warning',
                NodeKey: ctx.ToKey,
                Message: `Preset policy '${presetOverride.Policy}' for edge to '${ctx.ChildEntityName}' was ignored because the edge is locked.`,
            });
        } else if (presetOverride) {
            policy = presetOverride.Policy;
            policySource = 'Descendant';
        }
    }

    // 7. Request Overrides
    if (ctx.RequestOverrides && ctx.RequestOverrides.length > 0) {
        const reqOverride = ctx.RequestOverrides.find((o) => {
            if (o.RelationshipID && ctx.RelationshipID && o.RelationshipID === ctx.RelationshipID) {
                return true;
            }
            if (o.FromKey && o.ToKey && o.FromKey === ctx.FromKey && o.ToKey === ctx.ToKey) {
                return true;
            }
            return false;
        });

        if (reqOverride) {
            if (locked) {
                // Locked edge: user override is ignored with warning
                warnings.push({
                    Code: 'LOCKED_EDGE_OVERRIDE_IGNORED',
                    Severity: 'Warning',
                    NodeKey: ctx.ToKey,
                    Message: `Override to '${reqOverride.Policy}' for edge to '${ctx.ChildEntityName}' was ignored because the edge is locked.`,
                });
            } else {
                policy = reqOverride.Policy;
                policySource = 'Request';
            }
        }
    }

    // Unique FK: the child row can belong to one parent only, so pointing the copy at the same
    // child (Reference) is impossible. Deep is the only way to follow it; Skip is always safe.
    if (ctx.IsUniqueFK && policy === 'Reference') {
        policy = 'Deep';
        policySource = 'Constraint';
        warnings.push({
            Code: 'CONSTRAINT_FORCED_DEEP',
            Severity: 'Warning',
            NodeKey: ctx.ToKey,
            Message: `Unique FK constraint on '${ctx.JoinField}' makes Reference impossible; the child is copied instead.`,
        });
    }

    return {
        Policy: policy,
        PolicySource: policySource,
        Locked: locked,
        Warnings: warnings,
    };
}

/** The parent entity's own entry for this edge: by relationship ID, "<Child>.<JoinField>", or child name. */
function parentRelationship(ctx: EdgePolicyResolutionContext): { Policy?: CloneEdgePolicy; Locked?: boolean } | undefined {
    const rels = ctx.ParentEntityConfig?.Relationships;
    if (!rels) return undefined;
    return (ctx.RelationshipID ? rels[ctx.RelationshipID] : undefined) ?? rels[`${ctx.ChildEntityName}.${ctx.JoinField}`] ?? rels[ctx.ChildEntityName];
}
