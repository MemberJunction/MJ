import { RunView, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { GetMJProvider } from '../lib/mj-provider';

export {
    FormatCriterionReport,
    FormatVersionDiff,
    ParseRubricRef,
    RequireViewSuccess,
    ResolveRubricRef,
    RubricIdentityFilter,
    SnapshotFromRows,
    ValidateSnapshot,
} from '@memberjunction/rubrics';

import { ParseRubricRef, RequireViewSuccess, ResolveRubricRef, RubricIdentityFilter } from '@memberjunction/rubrics';

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
