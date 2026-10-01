import { randomUUID } from 'node:crypto';
import type { RubricNodeSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';

export interface ImportedCriterion {
    key: string;
    parentKey: string | null;
    name: string;
    weight: number;
    gate: boolean;
}

/** A requirements matrix. Numbered paths such as 3.2.1 nest under 3.2. A knockout column marks a gate. */
export function ImportMatrix(csv: string): ImportedCriterion[] {
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

/** @deprecated Use {@link ImportMatrix}. */
export function importMatrix(csv: string): ImportedCriterion[] {
    return ImportMatrix(csv);
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

/** @deprecated Use {@link CritiqueRubric}. */
export function critiqueRubric(version: RubricVersionSnapshot): string[] {
    return CritiqueRubric(version);
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

/** @deprecated Use {@link SaveImportedDraft}. */
export async function saveImportedDraft(store: DraftVersionStore, name: string, csv: string): Promise<{ id: string; status: 'Draft' }> {
    return SaveImportedDraft(store, name, csv);
}

/** Notes from item analysis and agreement. A withheld agreement adds no kappa note. */
export function ImproveFromData(diagnostics: { criterionKey: string; flag: string }[], agreement: { withheld: boolean; kappa?: number }): string[] {
    const notes = diagnostics.map(flag => `${flag.criterionKey}: ${flag.flag}`);
    if (!agreement.withheld && agreement.kappa != null && agreement.kappa < 0.4) notes.push(`Agreement kappa ${agreement.kappa} is low.`);
    return notes;
}

/** @deprecated Use {@link ImproveFromData}. */
export function improveFromData(diagnostics: { criterionKey: string; flag: string }[], agreement: { withheld: boolean; kappa?: number }): string[] {
    return ImproveFromData(diagnostics, agreement);
}

/** The imported tree is a Draft. This path does not publish. */
export function DraftFromImport(name: string, csv: string): { name: string; status: 'Draft'; nodes: ImportedCriterion[] } {
    return { name, status: 'Draft', nodes: ImportMatrix(csv) };
}

/** @deprecated Use {@link DraftFromImport}. */
export function draftFromImport(name: string, csv: string): { name: string; status: 'Draft'; nodes: ImportedCriterion[] } {
    return DraftFromImport(name, csv);
}

/** A description becomes a Draft version. This path does not publish. */
export async function DraftFromDescription(store: DraftVersionStore, description: string): Promise<{ id: string; status: 'Draft' }> {
    const title = description.trim().replace(/[\r\n,]+/g, ' ').slice(0, 120) || 'Draft rubric';
    return SaveImportedDraft(store, title, `1,${title},1,no`);
}

/** @deprecated Use {@link DraftFromDescription}. */
export async function draftFromDescription(store: DraftVersionStore, description: string): Promise<{ id: string; status: 'Draft' }> {
    return DraftFromDescription(store, description);
}

/** Numbered-matrix rows as criterion snapshots. A row that has children is a group. */
export function NodesFromMatrix(csv: string): RubricNodeSnapshot[] {
    const imported = ImportMatrix(csv);
    const ids = new Map(imported.map(row => [row.key, randomUUID()]));
    const parentKeys = new Set(imported.map(row => row.parentKey).filter((key): key is string => !!key));
    return imported.map((row, sequence) => ({
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
    }));
}

/** @deprecated Use {@link NodesFromMatrix}. */
export function nodesFromMatrix(csv: string): RubricNodeSnapshot[] {
    return NodesFromMatrix(csv);
}

/** One criterion whose name is the description. This path does not publish. */
export function NodesFromDescription(description: string): RubricNodeSnapshot[] {
    const title = description.trim().replace(/[\r\n,]+/g, ' ').slice(0, 120) || 'Draft rubric';
    return NodesFromMatrix(`1,${title},1,no`);
}

/** @deprecated Use {@link NodesFromDescription}. */
export function nodesFromDescription(description: string): RubricNodeSnapshot[] {
    return NodesFromDescription(description);
}

export function PublishImportedDraft(): { ok: false; message: string } {
    return { ok: false, message: 'The architect does not publish.' };
}

/** @deprecated Use {@link PublishImportedDraft}. */
export function publishImportedDraft(): { ok: false; message: string } {
    return PublishImportedDraft();
}

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'criterion';
}

export type { RubricNodeSnapshot };
