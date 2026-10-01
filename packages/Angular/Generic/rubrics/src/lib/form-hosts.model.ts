import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';

/** A version snapshot that includes the scales, levels, and bands the diff widget reads. */
export function hostSnapshot(
    version: Record<string, unknown>,
    criteria: Record<string, unknown>[],
    scales: Record<string, unknown>[],
    levels: Record<string, unknown>[],
    bands: Record<string, unknown>[],
): RubricVersionSnapshot {
    return {
        id: String(version.ID),
        rubricId: String(version.RubricID),
        majorVersion: version.MajorVersion == null || version.MajorVersion === '' ? null : Number(version.MajorVersion),
        minorVersion: version.MinorVersion == null || version.MinorVersion === '' ? null : Number(version.MinorVersion),
        patchVersion: version.PatchVersion == null || version.PatchVersion === '' ? null : Number(version.PatchVersion),
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
            evidenceRequired: false,
            rationaleRequired: false,
            sequence: Number(row.Sequence ?? 0),
        })),
        scales: scales.map(scale => ({
            id: String(scale.ID),
            name: String(scale.Name ?? ''),
            scaleType: scale.ScaleType === 'Numeric' ? 'Numeric' as const : 'Levels' as const,
            higherIsBetter: scale.HigherIsBetter !== false && scale.HigherIsBetter !== 0,
            levels: levels.filter(level => String(level.ScaleID) === String(scale.ID)).map(level => ({
                id: String(level.ID),
                label: String(level.Label ?? ''),
                value: Number(level.Value ?? 0),
                normalizedValue: Number(level.NormalizedValue ?? 0),
                sequence: Number(level.Sequence ?? 0),
            })),
        })),
        bands: bands.map(band => ({
            id: String(band.ID),
            label: String(band.Label ?? ''),
            minScore: Number(band.MinScore ?? 0),
            maxScore: Number(band.MaxScore ?? 1),
            displayTone: String(band.DisplayTone ?? 'Neutral'),
            sequence: Number(band.Sequence ?? 0),
        })),
    };
}

export interface VersionRow {
    id: string;
    status: string;
    basedOnId: string | null;
    major: number;
    minor: number;
    patch: number;
}

/** The version this one was based on, otherwise the newest other published version of the rubric. */
export function priorPublishedVersion(versions: VersionRow[], currentId: string): string | null {
    const current = versions.find(version => version.id === currentId);
    if (current?.basedOnId) return current.basedOnId;
    const published = versions
        .filter(version => version.id !== currentId && version.status === 'Published')
        .sort((left, right) => right.major - left.major || right.minor - left.minor || right.patch - left.patch);
    return published[0]?.id ?? null;
}

export interface CategoryRow {
    id: string;
    name: string;
    parentId: string | null;
}

/** Other categories, excluding this record and anything nested under it. */
export function categoryParentChoices(rows: CategoryRow[], selfId: string): { id: string; name: string }[] {
    const children = new Map<string, string[]>();
    for (const row of rows) {
        if (!row.parentId) continue;
        const list = children.get(row.parentId) ?? [];
        list.push(row.id);
        children.set(row.parentId, list);
    }
    const excluded = new Set<string>([selfId]);
    const pending = [selfId];
    while (pending.length > 0) {
        const id = pending.pop() as string;
        for (const child of children.get(id) ?? []) {
            if (excluded.has(child)) continue;
            excluded.add(child);
            pending.push(child);
        }
    }
    return rows.filter(row => !excluded.has(row.id)).map(row => ({ id: row.id, name: row.name }));
}

/** A level is frozen only when a published version uses its scale. */
export function scaleIsFrozen(publishedScaleIds: Iterable<string>, scaleId: string | null): boolean {
    if (!scaleId) return false;
    for (const id of publishedScaleIds) {
        if (id === scaleId) return true;
    }
    return false;
}
