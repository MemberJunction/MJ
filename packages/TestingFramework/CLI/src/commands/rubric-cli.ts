import type { UserInfo } from '@memberjunction/core';

/** `name`, `id`, `name@1.2.0`, or `id@version-id`. */
export function parseRubricRef(value: string): { rubric: string; version?: string } {
    const at = value.lastIndexOf('@');
    if (at <= 0) return { rubric: value.trim() };
    return { rubric: value.slice(0, at).trim(), version: value.slice(at + 1).trim() };
}

export function resolveRubricRef(
    rubrics: { id: string; name: string }[],
    versions: { id: string; rubricId: string; major: number; minor: number; patch: number }[],
    ref: string,
): { rubricId: string; versionId?: string } | { error: string } {
    const parsed = parseRubricRef(ref);
    const rubric = rubrics.find(row => row.id === parsed.rubric || row.name === parsed.rubric);
    if (!rubric) return { error: `Rubric "${parsed.rubric}" was not found.` };
    if (!parsed.version) return { rubricId: rubric.id };
    const parts = parsed.version.split('.');
    if (parts.length === 3 && parts.every(part => /^\d+$/.test(part))) {
        const [major, minor, patch] = parts.map(Number);
        const match = versions.find(row => row.rubricId === rubric.id && row.major === major && row.minor === minor && row.patch === patch);
        if (!match) return { error: `Version ${parsed.version} was not found on ${rubric.name}.` };
        return { rubricId: rubric.id, versionId: match.id };
    }
    const byId = versions.find(row => row.id === parsed.version && row.rubricId === rubric.id);
    if (!byId) return { error: `Version "${parsed.version}" was not found on ${rubric.name}.` };
    return { rubricId: rubric.id, versionId: byId.id };
}

/** One line per criterion from a rubric or inline-judge oracle result. */
export function formatCriterionReport(oracleResults: { oracleType?: string; type?: string; Name?: string; details?: unknown; Details?: unknown }[] | null | undefined): string {
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

export function formatVersionDiff(result: { computedBump: string | null; changes: { bump: string; subject: string; property: string }[] }): string {
    const lines = [result.computedBump ?? 'none'];
    for (const change of result.changes) lines.push(`${change.bump}  ${change.subject}  ${change.property}`);
    return lines.join('\n');
}

export function validateSnapshot(version: { nodes?: { key?: string; weight?: number; isGate?: boolean; gateMinimumScore?: number | null; scaleId?: string | null; nodeType?: string }[]; scales?: { id: string }[] }): string[] {
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
        if (node.nodeType === 'Group') continue;
        if (typeof node.weight !== 'number' || !Number.isFinite(node.weight) || node.weight < 0) errors.push(`${key}: weight must be a number that is at least 0.`);
        if (node.isGate && (typeof node.gateMinimumScore !== 'number' || node.gateMinimumScore < 0 || node.gateMinimumScore > 1)) errors.push(`${key}: a gate needs a minimum from 0 to 1.`);
        if (node.scaleId && !scaleIds.has(node.scaleId)) errors.push(`${key}: scale ${node.scaleId} is not on this version.`);
    }
    return errors;
}

/** Loads the rubric and, when a version was named, that version's id. */
export async function lookupRubricOverride(ref: string, user: UserInfo): Promise<{ rubricId: string; versionId?: string }> {
    const { RunView } = await import('@memberjunction/core');
    const parsed = parseRubricRef(ref);
    const view = new RunView();
    const escaped = parsed.rubric.replace(/'/g, "''");
    const found = await view.RunView({
        EntityName: 'MJ: Rubrics',
        ExtraFilter: `ID='${escaped}' OR Name='${escaped}'`,
        ResultType: 'simple',
        MaxRows: 5,
    }, user);
    const rubrics = ((found.Results ?? []) as Record<string, unknown>[]).map(row => ({ id: String(row.ID), name: String(row.Name) }));
    let versions: { id: string; rubricId: string; major: number; minor: number; patch: number }[] = [];
    const rubric = rubrics.find(row => row.id === parsed.rubric || row.name === parsed.rubric);
    if (parsed.version && rubric) {
        const rows = await view.RunView({
            EntityName: 'MJ: Rubric Versions',
            ExtraFilter: `RubricID='${rubric.id.replace(/'/g, "''")}'`,
            ResultType: 'simple',
            MaxRows: 50,
        }, user);
        versions = ((rows.Results ?? []) as Record<string, unknown>[]).map(row => ({
            id: String(row.ID),
            rubricId: String(row.RubricID),
            major: Number(row.MajorVersion ?? 0),
            minor: Number(row.MinorVersion ?? 0),
            patch: Number(row.PatchVersion ?? 0),
        }));
    }
    const resolved = resolveRubricRef(rubrics, versions, ref);
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
