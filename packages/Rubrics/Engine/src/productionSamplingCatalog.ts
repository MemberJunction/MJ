import { RunView } from '@memberjunction/core';
import type { ProductionSamplingCatalog } from './sampling.js';

/**
 * Reads Active agent-rubric links, completed agent runs, and evaluations whose
 * subject is an agent run. Purpose filtering stays in productionSamplingLinks.
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
            const rows = await read('MJ: Rubric Evaluations', "SubjectEntity = 'MJ: AI Agent Runs'");
            return rows.map(row => ({
                runId: String(row.SubjectRecordID ?? ''),
                rubricId: String(row.RubricID ?? ''),
            }));
        },
    };
}
