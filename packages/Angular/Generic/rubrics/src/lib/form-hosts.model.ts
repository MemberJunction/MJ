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
