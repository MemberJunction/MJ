/**
 * @file UniqueKeyClassifier.ts
 * Classification, validation, and collision detection for unique keys.
 * Handles global unique keys, parent-scoped uniques, live-state uniques, and server-allocated fields.
 * @see plans/record-cloning/README.md §7.3, §13.1
 */

import { CloneWarning, CloneWarningCode } from './types';

export type UniqueKeyClassification =
    | 'GlobalString'
    | 'GlobalNonString'
    | 'ParentScoped'
    | 'LiveState'
    | 'ServerAllocated';

export interface UniqueKeyDefinition {
    Fields: string[];
    Scope?: 'Global' | 'Parent' | 'LiveState';
    ScopeField?: string; // For Parent scope (parent FK field) or LiveState scope (state flag field)
}

export interface UniqueKeyResolutionRequest {
    EntityName: string;
    KeyDef: UniqueKeyDefinition;
    IsStringField?: (fieldName: string) => boolean;
    ServerAllocatedFields?: string[];
    PromptForFields?: string[];
    PromptedValues?: Record<string, unknown>;
    ResetFields?: Record<string, unknown>;
}

export interface UniqueKeyResolutionResult {
    Classification: UniqueKeyClassification;
    IsResolved: boolean;
    ActionRequired?: 'Rename' | 'Reset' | 'Prompt' | 'VerifyParent' | 'None';
    Blocked: boolean;
    Warning?: CloneWarning;
}

/**
 * Classifies a unique key and determines how it will be resolved during cloning.
 */
export function ClassifyAndResolveUniqueKey(
    req: UniqueKeyResolutionRequest
): UniqueKeyResolutionResult {
    const {
        EntityName,
        KeyDef,
        IsStringField,
        ServerAllocatedFields = [],
        PromptForFields = [],
        PromptedValues = {},
        ResetFields = {},
    } = req;

    // 1. Server-Allocated fields (e.g. OrderNumber, DealNumber)
    const isServerAllocated = KeyDef.Fields.some((f) =>
        ServerAllocatedFields.includes(f)
    );
    if (isServerAllocated) {
        return {
            Classification: 'ServerAllocated',
            IsResolved: true,
            ActionRequired: 'Reset',
            Blocked: false,
        };
    }

    // 2. Parent-Scoped (composite unique with parent FK, e.g. [ParentID, Name])
    if (KeyDef.Scope === 'Parent' || (KeyDef.Fields.length > 1 && KeyDef.ScopeField)) {
        return {
            Classification: 'ParentScoped',
            IsResolved: true,
            ActionRequired: 'VerifyParent',
            Blocked: false,
        };
    }

    // 3. Live-State Filtered (e.g. FormVersion one Published per form, or AIAgentConfiguration.IsDefault)
    if (KeyDef.Scope === 'LiveState') {
        const stateField = KeyDef.ScopeField || KeyDef.Fields[0];
        const hasReset = stateField in ResetFields;
        if (hasReset) {
            return {
                Classification: 'LiveState',
                IsResolved: true,
                ActionRequired: 'Reset',
                Blocked: false,
            };
        }

        // Live-state without Reset rule leaves multiple rows in active state -> Blocked
        return {
            Classification: 'LiveState',
            IsResolved: false,
            ActionRequired: 'Reset',
            Blocked: true,
            Warning: {
                Code: 'ROW_DISABLED',
                Severity: 'Error',
                Field: stateField,
                Message: `Live-state unique field '${stateField}' on entity '${EntityName}' must be reset to avoid duplicate active state.`,
            },
        };
    }

    // 4. Global Single-Field or Multi-Field Unique Keys
    const firstField = KeyDef.Fields[0];
    const isString = IsStringField ? IsStringField(firstField) : true;

    if (isString && KeyDef.Fields.length === 1) {
        // Global string unique: resolved via Naming template and collision probe
        return {
            Classification: 'GlobalString',
            IsResolved: true,
            ActionRequired: 'Rename',
            Blocked: false,
        };
    }

    // Global non-string (or multi-field) unique (e.g. User.Email, SKU, Code)
    const isPrompted =
        PromptForFields.includes(firstField) || firstField in PromptedValues;
    const isReset = firstField in ResetFields;

    if (isPrompted) {
        return {
            Classification: 'GlobalNonString',
            IsResolved: true,
            ActionRequired: 'Prompt',
            Blocked: false,
        };
    }

    if (isReset) {
        return {
            Classification: 'GlobalNonString',
            IsResolved: true,
            ActionRequired: 'Reset',
            Blocked: false,
        };
    }

    // No rule to resolve global non-string unique -> plan is Blocked
    return {
        Classification: 'GlobalNonString',
        IsResolved: false,
        ActionRequired: 'Prompt',
        Blocked: true,
        Warning: {
            Code: 'UNIQUE_PROMPT_REQUIRED',
            Severity: 'Error',
            Field: firstField,
            Message: `Unique field '${firstField}' on entity '${EntityName}' requires a prompt or reset rule to avoid unique constraint collision.`,
        },
    };
}

export interface PlannedRecordNode {
    NodeKey: string;
    EntityName: string;
    ParentKey?: string | null;
    Values: Record<string, unknown>;
}

export interface IntraPlanCollision {
    NodeKeyA: string;
    NodeKeyB: string;
    EntityName: string;
    Fields: string[];
    Values: Record<string, unknown>;
}

/**
 * Pre-validates planned rows to detect if two rows under the same parent
 * (or across global scope) have colliding planned values.
 */
export function DetectIntraPlanCollisions(
    nodes: PlannedRecordNode[],
    uniqueKeysByEntity: Record<string, UniqueKeyDefinition[]> = {}
): IntraPlanCollision[] {
    const collisions: IntraPlanCollision[] = [];

    // Group nodes by entity
    const nodesByEntity = new Map<string, PlannedRecordNode[]>();
    for (const node of nodes) {
        let list = nodesByEntity.get(node.EntityName);
        if (!list) {
            list = [];
            nodesByEntity.set(node.EntityName, list);
        }
        list.push(node);
    }

    for (const [entityName, entityNodes] of nodesByEntity.entries()) {
        const uqs = uniqueKeysByEntity[entityName];
        if (!uqs || uqs.length === 0) continue;

        for (const uq of uqs) {
            const seenValues = new Map<string, PlannedRecordNode>();

            for (const node of entityNodes) {
                // For parent-scoped uniques, prefix the fingerprint with parent key
                const prefix =
                    uq.Scope === 'Parent' ? `PARENT:${node.ParentKey ?? 'ROOT'}::` : '';

                // Extract values of the unique fields
                const valueParts: string[] = [];
                let hasNull = false;
                for (const field of uq.Fields) {
                    const v = node.Values[field];
                    if (v === null || v === undefined) {
                        hasNull = true;
                    }
                    valueParts.push(`${field}=${String(v ?? '')}`);
                }

                // In SQL, unique indexes ignore multi-column tuples with nulls unless unique index doesn't ignore nulls
                // But for explicit collision detection:
                const fingerprint = prefix + valueParts.join('|');

                const existingNode = seenValues.get(fingerprint);
                if (existingNode) {
                    collisions.push({
                        NodeKeyA: existingNode.NodeKey,
                        NodeKeyB: node.NodeKey,
                        EntityName: entityName,
                        Fields: uq.Fields,
                        Values: node.Values,
                    });
                } else {
                    seenValues.set(fingerprint, node);
                }
            }
        }
    }

    return collisions;
}
