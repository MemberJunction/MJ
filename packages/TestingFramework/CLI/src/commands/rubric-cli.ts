import { RunView, type UserInfo } from '@memberjunction/core';
import { IsValidUUID, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { GetMJProvider } from '../lib/mj-provider';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';

/** `name`, `id`, `name@1.2.0`, or `id@version-id`. */
export function ParseRubricRef(value: string): { rubric: string; version?: string } {
    const at = value.lastIndexOf('@');
    if (at <= 0) return { rubric: value.trim() };
    return { rubric: value.slice(0, at).trim(), version: value.slice(at + 1).trim() };
}

export function ResolveRubricRef(
    rubrics: { id: string; name: string }[],
    versions: { id: string; rubricId: string; major: number; minor: number; patch: number }[],
    ref: string,
): { rubricId: string; versionId?: string } | { error: string } {
    const parsed = ParseRubricRef(ref);
    const rubric = rubrics.find(row => UUIDsEqual(row.id, parsed.rubric) || row.name === parsed.rubric);
    if (!rubric) return { error: `Rubric "${parsed.rubric}" was not found.` };
    if (!parsed.version) return { rubricId: rubric.id };
    const parts = parsed.version.split('.');
    if (parts.length === 3 && parts.every(part => /^\d+$/.test(part))) {
        const [major, minor, patch] = parts.map(Number);
        const match = versions.find(row => UUIDsEqual(row.rubricId, rubric.id) && row.major === major && row.minor === minor && row.patch === patch);
        if (!match) return { error: `Version ${parsed.version} was not found on ${rubric.name}.` };
        return { rubricId: rubric.id, versionId: match.id };
    }
    const byId = versions.find(row => UUIDsEqual(row.id, parsed.version) && UUIDsEqual(row.rubricId, rubric.id));
    if (!byId) return { error: `Version "${parsed.version}" was not found on ${rubric.name}.` };
    return { rubricId: rubric.id, versionId: byId.id };
}

/** One line per criterion from a rubric or inline-judge oracle result. */
export function FormatCriterionReport(oracleResults: { oracleType?: string; type?: string; Name?: string; details?: unknown; Details?: unknown }[] | null | undefined): string {
    const list = oracleResults ?? [];
    const chosen = list.find(oracle => kind(oracle) === 'rubric' && criteria(oracle).length > 0)
        ?? list.find(oracle => kind(oracle).includes('judge') && criteria(oracle).length > 0);
    if (!chosen) return 'No rubric result.';
    return criteria(chosen).map((row, index) => {
        const key = String(row.Key ?? row.key ?? `c${index}`);
        const score = row.NormalizedScore ?? row.normalizedScore;
        const rationale = row.Rationale ?? row.rationale;
        const scoreText = typeof score === 'number' ? score.toFixed(3) : '—';
        return rationale ? `${key}  ${scoreText}  ${rationale}` : `${key}  ${scoreText}`;
    }).join('\n');
}

export function FormatVersionDiff(result: { computedBump: string | null; changes: { bump: string; subject: string; property: string }[] }): string {
    const lines = [result.computedBump ?? 'none'];
    for (const change of result.changes) lines.push(`${change.bump}  ${change.subject}  ${change.property}`);
    return lines.join('\n');
}

export function ValidateSnapshot(version: { nodes?: { id?: string; key?: string; parentId?: string | null; weight?: number; isGate?: boolean; gateMinimumScore?: number | null; scaleId?: string | null; nodeType?: string }[]; scales?: { id: string }[] }): string[] {
    const errors: string[] = [];
    const nodes = version.nodes ?? [];
    if (nodes.length === 0) errors.push('The rubric has no criteria.');
    const keys = new Set<string>();
    const scaleIds = new Set((version.scales ?? []).map(scale => scale.id));
    for (const node of nodes) {
        const key = node.key || '(no key)';
        if (!node.key) errors.push('A criterion has no key.');
        else if (keys.has(node.key)) errors.push(`Duplicate key ${node.key}.`);
        else keys.add(node.key);
        if (node.nodeType === 'Group') {
            if (node.scaleId) errors.push(`${key}: a group must not have a scale.`);
        } else {
            if (!node.scaleId) errors.push(`${key}: a criterion needs a scale.`);
            else if (!scaleIds.has(node.scaleId)) errors.push(`${key}: scale ${node.scaleId} is not on this version.`);
            if (typeof node.weight !== 'number' || !Number.isFinite(node.weight) || node.weight < 0) errors.push(`${key}: weight must be a number that is at least 0.`);
            if (node.isGate && (typeof node.gateMinimumScore !== 'number' || node.gateMinimumScore < 0 || node.gateMinimumScore > 1)) errors.push(`${key}: a gate needs a minimum from 0 to 1.`);
        }
        if (node.parentId && !nodes.some(other => UUIDsEqual(other.id, node.parentId))) errors.push(`${key}: parent is not in the file.`);
        else if (node.parentId && parentIsDescendant(nodes, node)) errors.push(`${key}: parent is its own descendant.`);
    }
    return errors;
}

function parentIsDescendant(nodes: { id?: string; parentId?: string | null }[], node: { id?: string; parentId?: string | null }): boolean {
    const byId = new Map(nodes.filter(item => item.id).map(item => [NormalizeUUID(item.id), item]));
    const seen = new Set<string>();
    let current = node.parentId ?? null;
    while (current) {
        const key = NormalizeUUID(current);
        if (UUIDsEqual(current, node.id) || seen.has(key)) return true;
        seen.add(key);
        current = byId.get(key)?.parentId ?? null;
    }
    return false;
}

/** A version snapshot for RubricVersionDiff, including parents, scales, levels, and bands. */
export function SnapshotFromRows(
    version: Record<string, unknown>,
    criteria: Record<string, unknown>[],
    scales: Record<string, unknown>[],
    levels: Record<string, unknown>[],
    bands: Record<string, unknown>[],
): RubricVersionSnapshot {
    return {
        id: String(version.ID),
        rubricId: String(version.RubricID),
        notApplicablePolicy: (version.NotApplicablePolicy as RubricVersionSnapshot['notApplicablePolicy']) ?? 'ExcludeAndRedistribute',
        passThreshold: version.PassThreshold == null ? null : Number(version.PassThreshold),
        scoreDisplayMin: version.ScoreDisplayMin == null ? 0 : Number(version.ScoreDisplayMin),
        scoreDisplayMax: version.ScoreDisplayMax == null ? 100 : Number(version.ScoreDisplayMax),
        nodes: criteria.map(row => ({
            id: String(row.ID),
            key: String(row.Key),
            parentId: row.ParentID == null || row.ParentID === '' ? null : String(row.ParentID),
            name: String(row.Name ?? row.Key),
            nodeType: row.NodeType === 'Group' ? 'Group' as const : 'Criterion' as const,
            scaleId: row.ScaleID == null || row.ScaleID === '' ? null : String(row.ScaleID),
            weight: Number(row.Weight ?? 1),
            isAdvisory: row.IsAdvisory === true || row.IsAdvisory === 1,
            isGate: row.IsGate === true || row.IsGate === 1,
            gateMinimumScore: row.GateMinimumScore == null ? null : Number(row.GateMinimumScore),
            evidenceRequired: row.EvidenceRequired === true || row.EvidenceRequired === 1,
            rationaleRequired: row.RationaleRequired === true || row.RationaleRequired === 1,
            sequence: Number(row.Sequence ?? 0),
        })),
        scales: scales.map(scale => ({
            id: String(scale.ID),
            scaleType: scale.ScaleType === 'Numeric' ? 'Numeric' as const : 'Levels' as const,
            minValue: scale.MinValue == null ? null : Number(scale.MinValue),
            maxValue: scale.MaxValue == null ? null : Number(scale.MaxValue),
            step: scale.Step == null ? null : Number(scale.Step),
            higherIsBetter: scale.HigherIsBetter !== false && scale.HigherIsBetter !== 0,
            levels: levels.filter(level => UUIDsEqual(level.ScaleID == null ? null : String(level.ScaleID), scale.ID == null ? null : String(scale.ID))).map(level => ({
                id: String(level.ID),
                label: String(level.Label ?? ''),
                value: Number(level.Value ?? 0),
                normalizedValue: Number(level.NormalizedValue ?? 0),
                description: level.Description == null ? null : String(level.Description),
                sequence: Number(level.Sequence ?? 0),
            })),
        })),
        bands: bands.map(band => ({
            id: String(band.ID),
            label: String(band.Label ?? ''),
            description: band.Description == null ? null : String(band.Description),
            minScore: Number(band.MinScore ?? 0),
            maxScore: Number(band.MaxScore ?? 1),
            displayTone: String(band.DisplayTone ?? 'Neutral'),
            sequence: Number(band.Sequence ?? 0),
        })),
    };
}

/** A name is compared to Name. A uuid is compared to ID. One predicate, so a name is never cast to uniqueidentifier. */
export function RubricIdentityFilter(value: string): string {
    const escaped = value.replace(/'/g, "''");
    return IsValidUUID(value) ? `ID='${escaped}'` : `Name='${escaped}'`;
}

/** A failed view is an error. An empty result is not. */
export function RequireViewSuccess(result: { Success?: boolean; ErrorMessage?: string }, entityName: string): void {
    if (result.Success) return;
    throw new Error(result.ErrorMessage || `Could not read ${entityName}.`);
}

/** Loads the rubric and, when a version was named, that version's id. */
export async function LookupRubricOverride(ref: string, user: UserInfo): Promise<{ rubricId: string; versionId?: string }> {
    const parsed = ParseRubricRef(ref);
    const view = RunView.FromMetadataProvider(GetMJProvider());
    const found = await view.RunView({
        EntityName: 'MJ: Rubrics',
        ExtraFilter: RubricIdentityFilter(parsed.rubric),
        ResultType: 'simple',
        MaxRows: 5,
    }, user);
    RequireViewSuccess(found, 'MJ: Rubrics');
    const rubrics = ((found.Results ?? []) as Record<string, unknown>[]).map(row => ({ id: String(row.ID), name: String(row.Name) }));
    let versions: { id: string; rubricId: string; major: number; minor: number; patch: number }[] = [];
    const rubric = rubrics.find(row => UUIDsEqual(row.id, parsed.rubric) || row.name === parsed.rubric);
    if (parsed.version && rubric) {
        const rows = await view.RunView({
            EntityName: 'MJ: Rubric Versions',
            ExtraFilter: `RubricID='${rubric.id.replace(/'/g, "''")}'`,
            ResultType: 'simple',
            MaxRows: 50,
        }, user);
        RequireViewSuccess(rows, 'MJ: Rubric Versions');
        versions = ((rows.Results ?? []) as Record<string, unknown>[]).map(row => ({
            id: String(row.ID),
            rubricId: String(row.RubricID),
            major: Number(row.MajorVersion ?? 0),
            minor: Number(row.MinorVersion ?? 0),
            patch: Number(row.PatchVersion ?? 0),
        }));
    }
    const resolved = ResolveRubricRef(rubrics, versions, ref);
    if ('error' in resolved) throw new Error(resolved.error);
    return resolved;
}

function kind(oracle: { oracleType?: string; type?: string; Name?: string }): string {
    return String(oracle.oracleType ?? oracle.type ?? oracle.Name ?? '').toLowerCase();
}

function criteria(oracle: { details?: unknown; Details?: unknown }): Record<string, unknown>[] {
    const details = oracle.details ?? oracle.Details;
    if (!details || typeof details !== 'object') return [];
    const rows = (details as { Criteria?: unknown }).Criteria;
    return Array.isArray(rows) ? rows.filter(row => row && typeof row === 'object') as Record<string, unknown>[] : [];
}
