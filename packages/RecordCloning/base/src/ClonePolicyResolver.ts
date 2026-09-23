/**
 * @file ClonePolicyResolver.ts
 * 8-tier precedence hierarchy for clone edge policy resolution.
 * Evaluates Built-in -> Constraint -> Child Entity -> Relationship -> Root Entity -> Preset -> Request.
 * Enforces:
 * - Child Entity NotCloneable wins everywhere unconditionally.
 * - Database constraints (e.g. unique FK) force Deep with CONSTRAINT_FORCED_DEEP.
 * - Locked edges ignore user overrides with LOCKED_EDGE_OVERRIDE_IGNORED.
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

    // TIER 0 / EXCLUSION: NotCloneable on child entity wins unconditionally everywhere!
    const exclusion = EvaluateExclusionClass({
        EntityName: ctx.ChildEntityName,
        NotCloneable: ctx.ChildEntityConfig?.NotCloneable,
        NotCloneableReason: ctx.ChildEntityConfig?.NotCloneableReason,
        AllowCreateAPI: ctx.ChildEntityConfig?.AllowCreateAPI,
    });

    if (exclusion.Excluded) {
        return {
            Policy: 'Skip',
            PolicySource: 'Entity',
            Locked: true,
            Warnings: [
                {
                    Code: 'NOT_CLONEABLE',
                    Severity: 'Warning',
                    NodeKey: ctx.ToKey,
                    Message: exclusion.Reason || `Child entity '${ctx.ChildEntityName}' is excluded or NotCloneable.`,
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
            // Users has over 110 reverse relationships; auto-discovery is never the default for Users (§5.3).
            // Only relationships explicitly configured in CloneConfig.Relationships can be followed.
            if (ctx.ParentEntityName === 'MJ: Users') {
                policy = 'Skip';
            } else {
                policy = ctx.CurrentDepth < ctx.MaxDepth ? 'Deep' : 'Skip';
            }
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
            policy = 'Deep';
            break;
        default:
            policy = 'Skip';
            break;
    }

    // 2. Constraint-Derived Decisions
    let isConstraintForcedDeep = false;
    if (ctx.IsUniqueFK) {
        // A unique constraint on FK column forces Deep because two records cannot point to same FK
        policy = 'Deep';
        policySource = 'Constraint';
        locked = true;
        isConstraintForcedDeep = true;
    }

    // 3. Child Entity Bag (already handled NotCloneable above)

    // 4. Relationship Bag (IEntityRelationshipConfiguration.Clone)
    if (ctx.RelationshipConfig) {
        if (ctx.RelationshipConfig.Locked) {
            locked = true;
        }
        if (!isConstraintForcedDeep && ctx.RelationshipConfig.Policy) {
            policy = ctx.RelationshipConfig.Policy;
            policySource = 'Relationship';
        }
    }

    // 5. Root Entity Bag (Relationships & Descendants)
    if (ctx.RootEntityConfig) {
        const relMatch =
            (ctx.RelationshipID && ctx.RootEntityConfig.Relationships?.[ctx.RelationshipID]) ||
            ctx.RootEntityConfig.Relationships?.[ctx.ChildEntityName];
        if (relMatch) {
            if (relMatch.Locked) locked = true;
            if (!isConstraintForcedDeep && relMatch.Policy) {
                policy = relMatch.Policy;
                policySource = 'Descendant';
            }
        }

        const descMatch = ctx.RootEntityConfig.Descendants?.[ctx.ChildEntityName];
        if (descMatch) {
            if (descMatch.Locked) locked = true;
            if (!isConstraintForcedDeep && descMatch.Policy) {
                policy = descMatch.Policy;
                policySource = 'Descendant';
            }
        }
    }

    // 6. Preset
    if (ctx.PresetConfig?.EdgeOverrides && !isConstraintForcedDeep) {
        const presetOverride = ctx.PresetConfig.EdgeOverrides.find(
            (o) =>
                (ctx.RelationshipID && o.RelationshipID === ctx.RelationshipID) ||
                (o.ChildEntityName && o.ChildEntityName === ctx.ChildEntityName)
        );
        if (presetOverride) {
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
            } else if (isConstraintForcedDeep && reqOverride.Policy !== 'Deep') {
                warnings.push({
                    Code: 'CONSTRAINT_FORCED_DEEP',
                    Severity: 'Warning',
                    NodeKey: ctx.ToKey,
                    Message: `Unique FK constraint on '${ctx.JoinField}' requires Deep clone and cannot be overridden.`,
                });
            } else {
                policy = reqOverride.Policy;
                policySource = 'Request';
            }
        }
    }

    // Re-verify constraint forced deep
    if (isConstraintForcedDeep && policy !== 'Deep') {
        policy = 'Deep';
        policySource = 'Constraint';
        warnings.push({
            Code: 'CONSTRAINT_FORCED_DEEP',
            Severity: 'Warning',
            NodeKey: ctx.ToKey,
            Message: `Unique FK constraint on '${ctx.JoinField}' forced policy to Deep.`,
        });
    }

    return {
        Policy: policy,
        PolicySource: policySource,
        Locked: locked,
        Warnings: warnings,
    };
}
