import { RunView } from '@memberjunction/core';
import type { ProductionSamplingCatalog } from './sampling.js';

/**
 * Reads Active agent-rubric links, completed agent runs, and evaluations whose
 * subject is an agent run. Purpose filtering stays in productionSamplingLinks.
 *
 * `vwRubricEvaluations` exposes `SubjectEntityID` (the stored uuid) and
 * `SubjectEntity` (`Entity.Name` from `vwRubricEvaluationsGenerated`). The
 * filter uses `SubjectEntityID`. The evaluation stores `RubricVersionID`;
 * `RubricID` on that view is the version's rubric, so the catalog reads the
 * version row instead.
 */
export function providerProductionCatalog(provider: unknown, user: unknown): ProductionSamplingCatalog {
    const read = async (entityName: string, filter: string): Promise<Record<string, unknown>[]> => {
        const view = RunView.FromMetadataProvider(provider as never);
        const result = await view.RunView({
            EntityName: entityName,
            ExtraFilter: filter,
            ResultType: 'simple',
            MaxRows: 5000,
        }, user as never);
        if (!result.Success) throw new Error(result.ErrorMessage || `Could not read ${entityName}.`);
        return (result.Results ?? []) as Record<string, unknown>[];
    };
    return {
        async links() {
            const rows = await read('MJ: AI Agent Rubrics', "Status = 'Active'");
            return rows.map(row => ({
                agentId: String(row.AgentID ?? ''),
                rubricId: String(row.RubricID ?? ''),
                sampleRate: Number(row.SampleRate ?? 0),
                status: String(row.Status ?? ''),
                purpose: String(row.Purpose ?? ''),
            }));
        },
        async runs() {
            const rows = await read('MJ: AI Agent Runs', "Status = 'Completed'");
            return rows.map(row => ({
                id: String(row.ID ?? ''),
                agentId: String(row.AgentID ?? ''),
                status: String(row.Status ?? ''),
            }));
        },
        async evaluated() {
            const entities = await read('MJ: Entities', "Name = 'MJ: AI Agent Runs'");
            const entityId = String(entities[0]?.ID ?? '');
            if (!/^[0-9A-Fa-f-]{36}$/.test(entityId)) throw new Error('MJ: AI Agent Runs has no entity id.');
            const rows = await read('MJ: Rubric Evaluations', `SubjectEntityID = '${entityId}'`);
            return rows.map(row => ({
                runId: String(row.SubjectRecordID ?? ''),
                rubricVersionId: String(row.RubricVersionID ?? ''),
            }));
        },
        async versions() {
            const rows = await read('MJ: Rubric Versions', 'RubricID IS NOT NULL');
            return rows.map(row => ({
                id: String(row.ID ?? ''),
                rubricId: String(row.RubricID ?? ''),
            }));
        },
    };
}
