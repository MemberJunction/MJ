import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { LogError, Metadata } from '@memberjunction/core';
import { CanonGraphEngine, GraphEngine, SaveDomainProposals, type DomainProposal, type ProposeEntityDomainsOptions } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import {
    GetGraphActionBoolean,
    GetGraphActionNumber,
    GetGraphActionParam,
    GetGraphActionString,
    ParseGraphActionStringList,
    SetGraphActionOutput,
} from './graph-action-params';

/** Result returned by {@link ProposeCanonDomainsAction}. */
export interface ProposeCanonDomainsActionResult extends ActionResultSimple {
    Proposals?: DomainProposal[];
    ConceptsCreated?: number;
    EdgesCreated?: number;
}

/**
 * Action `Propose Canon Domains`: groups entities into candidate business domains by community
 * detection over their foreign-key and IS-A links (deterministic, no AI call), through
 * {@link CanonGraphEngine.ProposeDomainConcepts}.
 *
 * With `DryRun` (the default) it only returns the proposals. With `DryRun = false` it writes each as
 * a `Proposed` `Domain` concept with `Inferred` + `Proposed` `Describes` edges from its member
 * entities, for a person to rename, approve or reject. A domain name already in the graph is never
 * proposed again, so a rejected proposal stays rejected.
 */
@RegisterClass(BaseAction, 'Propose Canon Domains')
export class ProposeCanonDomainsAction extends BaseAction {
    private static readonly DEFAULT_GRAPH_NAME = 'MJ Canon';

    protected async InternalRunAction(params: RunActionParams): Promise<ProposeCanonDomainsActionResult> {
        try {
            if (!params.ContextUser) {
                return { Success: false, ResultCode: 'MISSING_PARAMETER', Message: 'ContextUser is required to run Propose Canon Domains.' };
            }
            const provider = params.Provider ?? Metadata.Provider;
            await CanonGraphEngine.Instance.EnsureConfigured(params.ContextUser, provider);
            const graphName = GetGraphActionString(params, 'GraphName') ?? ProposeCanonDomainsAction.DEFAULT_GRAPH_NAME;
            const graph = GraphEngine.Instance.GetGraph(graphName);
            if (!graph) {
                return { Success: false, ResultCode: 'GRAPH_NOT_FOUND', Message: `Graph '${graphName}' was not found or is not active.` };
            }
            const proposals = await CanonGraphEngine.Instance.ProposeDomainConcepts(graph.Name, params.ContextUser, this.readOptions(params), provider);
            SetGraphActionOutput(params, 'Proposals', proposals);
            if (proposals.length === 0) {
                return { Success: true, ResultCode: 'NO_PROPOSALS', Message: `No new domains to propose for '${graph.Name}'.`, Proposals: [] };
            }
            if (GetGraphActionBoolean(params, 'DryRun', true)) {
                return { Success: true, ResultCode: 'SUCCESS', Message: this.summarize(proposals, 'Would propose'), Proposals: proposals };
            }
            const saved = await SaveDomainProposals(graph, proposals, params.ContextUser, provider);
            SetGraphActionOutput(params, 'ConceptsCreated', saved.ConceptIDs.length);
            SetGraphActionOutput(params, 'EdgesCreated', saved.EdgeCount);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `${this.summarize(proposals, 'Proposed')} They await review in '${graph.Name}'.`,
                Proposals: proposals,
                ConceptsCreated: saved.ConceptIDs.length,
                EdgesCreated: saved.EdgeCount,
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`ProposeCanonDomainsAction failed: ${msg}`);
            return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: `Propose Canon Domains failed: ${msg}` };
        }
    }

    private readOptions(params: RunActionParams): ProposeEntityDomainsOptions {
        const options: ProposeEntityDomainsOptions = { SchemaNames: ParseGraphActionStringList(GetGraphActionParam(params, 'SchemaNames')) };
        const minSize = GetGraphActionNumber(params, 'MinClusterSize', NaN);
        const maxDomains = GetGraphActionNumber(params, 'MaxDomains', NaN);
        const resolution = GetGraphActionNumber(params, 'Resolution', NaN);
        if (Number.isFinite(minSize)) {
            options.MinClusterSize = Math.floor(minSize);
        }
        if (Number.isFinite(maxDomains)) {
            options.MaxDomains = Math.floor(maxDomains);
        }
        if (Number.isFinite(resolution) && resolution > 0) {
            options.Resolution = resolution;
        }
        return options;
    }

    private summarize(proposals: readonly DomainProposal[], verb: string): string {
        const lines = proposals.map((p) => `- ${p.Name}: ${p.Members.length} entities, ${Math.round(p.Cohesion * 100)}% cohesion`);
        return `${verb} ${proposals.length} domain${proposals.length === 1 ? '' : 's'}:\n${lines.join('\n')}`;
    }
}
