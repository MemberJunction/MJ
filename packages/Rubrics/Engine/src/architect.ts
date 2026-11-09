import { randomUUID } from 'node:crypto';
import type { RubricNodeSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';

export interface ImportedCriterion {
    key: string;
    parentKey: string | null;
    name: string;
    weight: number;
    gate: boolean;
}

/** A requirements matrix. Numbered paths such as 3.2.1 nest under 3.2. A knockout column marks a gate. Quoted cells may contain commas. */
export function ImportMatrix(csv: string): ImportedCriterion[] {
    const lines = csv.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.toLowerCase().startsWith('path'));
    return lines.map(line => {
        const [path, name, weight, knockout] = csvCells(line);
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

/** RFC-style cells. A comma inside quotes is part of the cell, not a column break. */
function csvCells(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (quoted) {
            if (char === '"') {
                if (line[index + 1] === '"') {
                    current += '"';
                    index += 1;
                } else {
                    quoted = false;
                }
            } else {
                current += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            cells.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    cells.push(current.trim());
    return cells;
}

/** Vague names, missing anchors, unbalanced weights, and a gate that allows not-applicable. */
export function CritiqueRubric(version: RubricVersionSnapshot): string[] {
    const notes: string[] = [];
    const names = new Map<string, number>();
    const leaves = version.nodes.filter(node => node.nodeType !== 'Group');
    const weights = leaves.map(node => node.weight);
    const max = Math.max(0, ...weights);
    for (const node of leaves) {
        names.set(node.name.trim().toLowerCase(), (names.get(node.name.trim().toLowerCase()) ?? 0) + 1);
        if (node.name.trim().length < 4) notes.push(`${node.key}: the name is too vague.`);
        if (!node.anchors || node.anchors.length === 0) notes.push(`${node.key}: no anchors.`);
        const policy = node.notApplicablePolicy ?? version.notApplicablePolicy;
        if (node.isGate && policy !== 'NotAllowed') notes.push(`${node.key}: a gate should not allow not-applicable.`);
        if (max > 0 && node.weight > 0 && max / node.weight >= 10) notes.push(`${node.key}: the weights are unbalanced.`);
    }
    for (const [name, count] of names) {
        if (count > 1) notes.push(`"${name}" is used by more than one criterion.`);
    }
    return notes;
}

export interface DraftVersionStore {
    SaveVersion(fields: { name: string; status: 'Draft'; nodes: ImportedCriterion[] }): Promise<string>;
    SaveCriteria(versionId: string, nodes: ImportedCriterion[]): Promise<void>;
}

/** Saves the imported tree as a Draft version and creates its criterion rows. */
export async function SaveImportedDraft(store: DraftVersionStore, name: string, csv: string): Promise<{ id: string; status: 'Draft' }> {
    const draft = DraftFromImport(name, csv);
    const id = await store.SaveVersion({ name: draft.name, status: draft.status, nodes: draft.nodes });
    await store.SaveCriteria(id, draft.nodes);
    return { id, status: 'Draft' };
}

/** Notes from item analysis and agreement. A withheld agreement adds no kappa note. */
export function ImproveFromData(diagnostics: { criterionKey: string; flag: string }[], agreement: { withheld: boolean; kappa?: number }): string[] {
    const notes = diagnostics.map(flag => `${flag.criterionKey}: ${flag.flag}`);
    if (!agreement.withheld && agreement.kappa != null && agreement.kappa < 0.4) notes.push(`Agreement kappa ${agreement.kappa} is low.`);
    return notes;
}

/** The imported tree is a Draft. This path does not publish. */
export function DraftFromImport(name: string, csv: string): { name: string; status: 'Draft'; nodes: ImportedCriterion[] } {
    return { name, status: 'Draft', nodes: ImportMatrix(csv) };
}

/** A description becomes a Draft version. This path does not publish. */
export function DraftTitle(description: string): string {
    return description.trim().replace(/[\r\n,]+/g, ' ').slice(0, 120) || 'Draft rubric';
}

export async function DraftFromDescription(store: DraftVersionStore, description: string): Promise<{ id: string; status: 'Draft' }> {
    const title = DraftTitle(description);
    return SaveImportedDraft(store, title, `1,${title},1,no`);
}

/** Numbered-matrix rows as criterion snapshots. A row that has children is a group. */
export function NodesFromMatrix(csv: string): RubricNodeSnapshot[] {
    const imported = ImportMatrix(csv);
    const ids = new Map(imported.map(row => [row.key, randomUUID()]));
    const parentKeys = new Set(imported.map(row => row.parentKey).filter((key): key is string => !!key));
    return imported.map((row, sequence) => {
        if (row.parentKey && !ids.has(row.parentKey)) {
            throw new Error(`Criterion ${row.key} names parent ${row.parentKey}, which is not in the matrix.`);
        }
        return {
            id: ids.get(row.key) ?? randomUUID(),
            key: row.key,
            parentId: row.parentKey ? ids.get(row.parentKey) ?? null : null,
            name: row.name,
            nodeType: parentKeys.has(row.key) ? 'Group' : 'Criterion',
            weight: row.weight,
            isAdvisory: false,
            isGate: row.gate,
            gateMinimumScore: row.gate ? 1 : null,
            evidenceRequired: false,
            rationaleRequired: false,
            sequence,
        };
    });
}

/** One criterion whose name is the description. This path does not publish. */
export function NodesFromDescription(description: string): RubricNodeSnapshot[] {
    const title = DraftTitle(description);
    return NodesFromMatrix(`1,${title},1,no`);
}

export function PublishImportedDraft(): { ok: false; message: string } {
    return { ok: false, message: 'The architect does not publish.' };
}

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'criterion';
}

export type { RubricNodeSnapshot };
