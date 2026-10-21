import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import type { RubricBandSnapshot, RubricNodeSnapshot, RubricScaleSnapshot } from './types.js';

/** Six decimal places, the same rounding scoring uses before a band boundary. */
export function Round6(value: number): number {
    return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

/**
 * Half-open band ranges. A score equal to a band's max belongs to the next band.
 * The band whose max is 1 also contains 1. The score and the bounds are rounded
 * to six decimal places before the comparison.
 */
export function BandFor(normalized: number | null, bands: RubricBandSnapshot[]): RubricBandSnapshot | null {
    if (normalized === null) return null;
    const rounded = Round6(normalized);
    const ordered = [...bands].sort((left, right) => left.minScore - right.minScore || left.maxScore - right.maxScore);
    for (const band of ordered) {
        const min = Round6(band.minScore);
        const max = Round6(band.maxScore);
        const top = max === 1 && rounded === 1;
        if (rounded >= min && (rounded < max || top)) return band;
    }
    return null;
}

/** Live weight share among a node's included siblings, as a percent. Advisory nodes are left out. */
export function WeightShares(nodes: RubricNodeSnapshot[]): Map<string, number> {
    const shares = new Map<string, number>();
    const groups = new Map<string, RubricNodeSnapshot[]>();
    for (const node of nodes) {
        const key = NormalizeUUID(node.parentId);
        const list = groups.get(key) ?? [];
        list.push(node);
        groups.set(key, list);
    }
    for (const siblings of groups.values()) {
        const included = siblings.filter(node => !node.isAdvisory);
        const total = included.reduce((sum, node) => sum + node.weight, 0);
        for (const node of siblings) {
            if (node.isAdvisory || total <= 0) {
                shares.set(node.id, 0);
                continue;
            }
            shares.set(node.id, (node.weight / total) * 100);
        }
    }
    return shares;
}

/** Problems that block a draft from being a publishable tree. */
export function DraftProblems(nodes: RubricNodeSnapshot[], scales: RubricScaleSnapshot[]): string[] {
    const problems: string[] = [];
    const keys = new Set<string>();
    for (const node of nodes) {
        if (keys.has(node.key)) problems.push(`Duplicate key ${node.key}.`);
        keys.add(node.key);
        if (node.parentId && !nodes.some(item => UUIDsEqual(item.id, node.parentId))) {
            problems.push(`${node.key} points at a missing parent.`);
        }
        if (ancestorOf(nodes, node.id, node.parentId ?? null)) problems.push(`${node.key} is inside its own descendant.`);
        if (node.nodeType === 'Criterion' && !node.scaleId) problems.push(`${node.key} needs a scale.`);
        if (node.scaleId && !scales.some(scale => UUIDsEqual(scale.id, node.scaleId))) {
            problems.push(`${node.key} names a missing scale.`);
        }
        if (node.isGate && (node.gateMinimumScore === undefined || node.gateMinimumScore === null)) {
            problems.push(`${node.key} is a gate with no minimum.`);
        }
    }
    return problems;
}

/** A scale is frozen when a published version uses it. A missing scale id is not frozen. */
export function Frozen(publishedScaleIds: Iterable<string>, scaleId: string | null): boolean {
    if (!scaleId) return false;
    for (const id of publishedScaleIds) {
        if (UUIDsEqual(id, scaleId)) return true;
    }
    return false;
}

/** True when `ancestorId` sits on the parent chain of `nodeId`, including a cycle back to itself. */
function ancestorOf(nodes: RubricNodeSnapshot[], ancestorId: string, nodeId: string | null): boolean {
    const byId = new Map(nodes.map(node => [NormalizeUUID(node.id), node]));
    const seen = new Set<string>();
    let current = nodeId;
    while (current) {
        if (UUIDsEqual(current, ancestorId)) return true;
        const key = NormalizeUUID(current);
        if (seen.has(key)) return false;
        seen.add(key);
        current = byId.get(key)?.parentId ?? null;
    }
    return false;
}
