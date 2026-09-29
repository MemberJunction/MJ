/**
 * @fileoverview Target candidate validation for Decision Feature Pipeline escalation (§3.6 rule 8).
 * Checks whether a candidate pipeline can serve as an escalation target: row constraints (Active, Infer,
 * same entity) and spec constraints (LLM pipeline, produces every Decision output with matching targets).
 *
 * Free of @memberjunction/core and entity classes: operates on plain row shapes and DataFeatureSpec.
 *
 * @module @memberjunction/feature-pipelines
 */

import { UUIDsEqual } from '@memberjunction/global';
import {
    IsLLMPipelineType,
    type DataFeatureOutput,
    type DataFeatureSpec,
} from './data-feature-spec.js';
import type { OutputTarget } from './output-target.js';

/**
 * Minimal row shape for checking an escalation target candidate without depending on @memberjunction/core-entities.
 */
export interface MinimalEscalationTargetRow {
    ID: string;
    Name: string;
    WorkType?: string | null;
    Status?: string | null;
    EntityID?: string | null;
    Entity?: string | null;
}

/**
 * Checks the target row itself: it must be an Active Infer pipeline on the Decision pipeline's entity.
 * @returns What is wrong, worded to follow the pipeline's name, or null.
 */
export function FindEscalationTargetRowProblem(row: MinimalEscalationTargetRow, entityID: string): string | null {
    if (row.WorkType !== 'Infer') {
        return `has WorkType '${row.WorkType}'; only an Infer Feature Pipeline can be escalated to`;
    }
    if (row.Status !== 'Active') {
        return `is ${row.Status}; only an Active pipeline can be escalated to`;
    }
    if (!UUIDsEqual(row.EntityID, entityID)) {
        return `is on entity '${row.Entity ?? row.EntityID}' (${row.EntityID}), not the Decision pipeline's entity (${entityID})`;
    }
    return null;
}

/**
 * Checks the target's spec: its type must be LLM (absent means LLM), and it must produce every output
 * the Decision pipeline has, with the same name and the same target (mode, and field for a field target).
 * @returns What is wrong, worded to follow the pipeline's name, or null.
 */
export function FindEscalationTargetSpecProblem(
    targetSpec: DataFeatureSpec | undefined,
    decisionOutputs: DataFeatureOutput[]
): string | null {
    if (!IsLLMPipelineType(targetSpec?.PipelineType)) {
        return `is a '${targetSpec?.PipelineType}' pipeline; only an LLM pipeline can be escalated to`;
    }
    const targetOutputs = targetSpec?.Outputs ?? [];
    const missing = decisionOutputs
        .map((output) => DescribeMissingOutput(output, targetOutputs))
        .filter((problem): problem is string => problem !== null);
    if (missing.length > 0) {
        return `does not produce every output of the Decision pipeline: ${missing.join('; ')}`;
    }
    return null;
}

/** Why the target does not produce one Decision output, or null when it does. */
export function DescribeMissingOutput(output: DataFeatureOutput, targetOutputs: DataFeatureOutput[]): string | null {
    const match = FindOutputByName(targetOutputs, output.Name);
    if (!match) {
        return `it has no output named '${output.Name}'`;
    }
    if (!SameTarget(match.Target, output.Target)) {
        return `its output '${output.Name}' targets ${DescribeTarget(match.Target)}, not ${DescribeTarget(output.Target)}`;
    }
    return null;
}

/** Finds an output by name, case-insensitively, as `ValidateSpec` compares output names. */
export function FindOutputByName(outputs: DataFeatureOutput[], name: string): DataFeatureOutput | undefined {
    const wanted = name.trim().toLowerCase();
    return outputs.find((o) => o.Name?.trim().toLowerCase() === wanted);
}

/** Whether two targets are the same mode and, for field targets, the same field (case-insensitive). */
export function SameTarget(a: OutputTarget | undefined, b: OutputTarget | undefined): boolean {
    if (!a || !b || a.Mode !== b.Mode) {
        return false;
    }
    if (a.Mode === 'field' && b.Mode === 'field') {
        return a.EntityFieldName?.trim().toLowerCase() === b.EntityFieldName?.trim().toLowerCase();
    }
    return true;
}

/** A target, for a message. */
export function DescribeTarget(target: OutputTarget | undefined): string {
    if (!target) {
        return 'nothing';
    }
    return target.Mode === 'field' ? `field '${target.EntityFieldName}'` : `mode '${target.Mode}'`;
}
