/**
 * @file SensitiveValues.ts
 * Masks encrypted field values in a clone plan. The server keeps the real values so Execute can
 * write them; every copy of the plan that leaves the engine (the Plan/Execute output, the clone
 * log's PlanJSON, the plan hash) goes through these helpers first.
 */

import { ENCRYPTED_SENTINEL } from '@memberjunction/global';
import type { CloneFieldChange, ClonePlan } from './types';

/** Replaces a non-empty value with the sentinel MJ uses for encrypted fields on the wire. */
function mask(value: unknown): unknown {
    return value === null || value === undefined ? value : ENCRYPTED_SENTINEL;
}

/** A copy of `change` with its values masked when the field is encrypted; otherwise `change` itself. */
export function MaskSensitiveFieldChange(change: CloneFieldChange): CloneFieldChange {
    if (!change.Sensitive) return change;
    return { ...change, OldValue: mask(change.OldValue), NewValue: mask(change.NewValue) };
}

/** A copy of `plan` safe to return or store: every encrypted field value is masked. */
export function MaskSensitivePlan(plan: ClonePlan): ClonePlan {
    return {
        ...plan,
        Nodes: plan.Nodes.map((n) => ({ ...n, FieldChanges: (n.FieldChanges ?? []).map(MaskSensitiveFieldChange) })),
    };
}
