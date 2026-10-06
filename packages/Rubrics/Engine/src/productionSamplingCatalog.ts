import { RunView } from '@memberjunction/core';
import { MJAIAgentRubricEntity, MJAIAgentRunEntity, MJEntityEntity, MJRubricEvaluationEntity, MJRubricVersionEntity } from '@memberjunction/core-entities';
import type { ProductionSamplingCatalog } from './sampling.js';

/**
 * Reads Active agent-rubric links, completed agent runs, and evaluations whose
 * subject is an agent run. Purpose filtering stays in productionSamplingLinks.
 *
 * Rows are the generated entity classes (`ResultType: 'entity_object'`), not a
 * hand-rolled field bag. `vwRubricEvaluations` exposes `SubjectEntityID` (the
 * stored uuid) and `SubjectEntity` (`Entity.Name` from
 * `vwRubricEvaluationsGenerated`). The filter uses `SubjectEntityID`. The
 * evaluation stores `RubricVersionID`; `RubricID` on that view is the version's
 * rubric, so the catalog reads the version row instead.
 */
export function ProviderProductionCatalog(provider: unknown, user: unknown): ProductionSamplingCatalog {
    async function read(entityName: 'MJ: AI Agent Rubrics', filter: string): Promise<MJAIAgentRubricEntity[]>;
    async function read(entityName: 'MJ: AI Agent Runs', filter: string): Promise<MJAIAgentRunEntity[]>;
    async function read(entityName: 'MJ: Entities', filter: string): Promise<MJEntityEntity[]>;
    async function read(entityName: 'MJ: Rubric Evaluations', filter: string): Promise<MJRubricEvaluationEntity[]>;
    async function read(entityName: 'MJ: Rubric Versions', filter: string): Promise<MJRubricVersionEntity[]>;
    async function read(entityName: string, filter: string): Promise<Array<MJAIAgentRubricEntity | MJAIAgentRunEntity | MJEntityEntity | MJRubricEvaluationEntity | MJRubricVersionEntity>> {
        const view = RunView.FromMetadataProvider(provider as never);
        const result = await view.RunView({
            EntityName: entityName,
            ExtraFilter: filter,
            ResultType: 'entity_object',
            MaxRows: 5000,
        }, user as never);
        if (!result.Success) throw new Error(result.ErrorMessage || `Could not read ${entityName}.`);
        return (result.Results ?? []) as Array<MJAIAgentRubricEntity | MJAIAgentRunEntity | MJEntityEntity | MJRubricEvaluationEntity | MJRubricVersionEntity>;
    }
    return {
        async links() {
            const rows = await read('MJ: AI Agent Rubrics', "Status = 'Active'");
            return rows.map(row => ({
                agentId: String(row.AgentID ?? ''),
                rubricId: String(row.RubricID ?? ''),
                sampleRate: Number(row.SampleRate ?? 0),
                status: String(row.Status ?? ''),
                purpose: String(row.Purpose ?? ''),
                evaluatorConfig: row.EvaluatorConfig ?? null,
            }));
        },
        async runs(filter) {
            const clauses = ["Status = 'Completed'"];
            if (filter?.since) clauses.push(`StartedAt >= '${filter.since.replace(/'/g, "''")}'`);
            const agentIds = (filter?.agentIds ?? []).filter(id => id.length > 0);
            if (agentIds.length > 0) clauses.push(`AgentID IN (${agentIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ')})`);
            const rows = await read('MJ: AI Agent Runs', clauses.join(' AND '));
            return rows.map(row => ({
                id: String(row.ID ?? ''),
                agentId: String(row.AgentID ?? ''),
                status: String(row.Status ?? ''),
                startedAt: row.StartedAt == null ? undefined : new Date(row.StartedAt).toISOString(),
            }));
        },
        async evaluated(runIds) {
            const entities = await read('MJ: Entities', "Name = 'MJ: AI Agent Runs'");
            const entityId = String(entities[0]?.ID ?? '');
            if (!/^[0-9A-Fa-f-]{36}$/.test(entityId)) throw new Error('MJ: AI Agent Runs has no entity id.');
            if (!runIds || runIds.length === 0) return [];
            const ids = runIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ');
            const rows = await read('MJ: Rubric Evaluations', `SubjectEntityID = '${entityId}' AND SubjectRecordID IN (${ids})`);
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

