import type { RubricNodeSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';

export interface ImportedCriterion {
    key: string;
    parentKey: string | null;
    name: string;
    weight: number;
    gate: boolean;
}

/** A requirements matrix. Numbered paths such as 3.2.1 nest under 3.2. A knockout column marks a gate. */
export function importMatrix(csv: string): ImportedCriterion[] {
    const lines = csv.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.toLowerCase().startsWith('path'));
    return lines.map(line => {
        const [path, name, weight, knockout] = line.split(',').map(part => part.trim());
        const segments = (path ?? '').split('.').filter(Boolean);
        const parentKey = segments.length > 1 ? segments.slice(0, -1).join('.') : null;
        return {
            key: path || slug(name ?? ''),
            parentKey,
            name: name || path,
            weight: Number(weight || 1),
            gate: /^(yes|true|1|knockout)$/i.test(knockout ?? ''),
        };
    });
}

/** Vague names, missing anchors, unbalanced weights, and a gate that allows not-applicable. */
export function critiqueRubric(version: RubricVersionSnapshot): string[] {
    const notes: string[] = [];
    const names = new Map<string, number>();
    const leaves = version.nodes.filter(node => node.nodeType !== 'Group');
    const weights = leaves.map(node => node.weight);
    const max = Math.max(0, ...weights);
    for (const node of leaves) {
        names.set(node.name.trim().toLowerCase(), (names.get(node.name.trim().toLowerCase()) ?? 0) + 1);
        if (node.name.trim().length < 4) notes.push(`${node.key}: the name is too vague.`);
        if (!node.anchors || node.anchors.length === 0) notes.push(`${node.key}: no anchors.`);
        if (node.isGate && node.notApplicablePolicy !== 'NotAllowed') notes.push(`${node.key}: a gate should not allow not-applicable.`);
        if (max > 0 && node.weight > 0 && max / node.weight >= 10) notes.push(`${node.key}: the weights are unbalanced.`);
    }
    for (const [name, count] of names) {
        if (count > 1) notes.push(`"${name}" is used by more than one criterion.`);
    }
    return notes;
}

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'criterion';
}

export type { RubricNodeSnapshot };
