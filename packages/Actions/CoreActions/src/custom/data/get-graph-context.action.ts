import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { Metadata } from '@memberjunction/core';
import {
    CanonGraphEngine,
    GraphEngine,
    GraphNodeRef,
    GraphSubgraphResult,
    GraphTraversalOptions,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

/**
 * Action that expands and formats a governed semantic subgraph around a natural-language
 * question, concept names, or explicit entity/record seed nodes.
 *
 * Defaults to `"MJ Canon"` so agents can retrieve authoritative concept definitions,
 * canonical `Alternate Base Views`, governed `Queries`, and `Preferred Over` precedence rules
 * in a single call.
 */
@RegisterClass(BaseAction, 'Get Graph Context')
export class GetGraphContextAction extends BaseAction {
    protected override async InternalRunAction(
        params: RunActionParams,
    ): Promise<ActionResultSimple> {
        try {
            const rawGraphName = this.getStringParam(params, 'graphname');
            const graphName = CanonGraphEngine.Instance.ResolveCanonGraphName(rawGraphName);
            const question = this.getStringParam(params, 'question');
            const entityName = this.getStringParam(params, 'entityname');
            const recordID = this.getStringParam(params, 'recordid');
            const conceptNamesRaw = this.getStringParam(params, 'conceptnames');
            const seedNodesRaw = this.getParamValue(params, 'seednodes');

            const traversalOptions: GraphTraversalOptions = {
                Direction: this.parseDirection(this.getStringParam(params, 'direction')),
                EdgeTypes: this.parseStringList(this.getParamValue(params, 'edgetypes')),
                MinWeight: this.getOptionalNumericParam(params, 'minweight'),
                IncludeProposed: this.getBooleanParam(params, 'includeproposed', false),
                Depth: this.getNumericParam(params, 'depth', 2),
                MaxNodes: this.getNumericParam(params, 'maxnodes', 50),
            };

            const explicitSeeds = this.collectExplicitSeeds(
                entityName,
                recordID,
                conceptNamesRaw,
                seedNodesRaw,
                graphName,
                params,
            );

            let subgraph: GraphSubgraphResult;
            if (question && explicitSeeds.length === 0) {
                subgraph = await CanonGraphEngine.Instance.CanonContext(
                    question,
                    traversalOptions,
                    params.ContextUser,
                    graphName,
                );
            } else {
                const combinedSeeds = [...explicitSeeds];
                if (question) {
                    const questionConcepts = CanonGraphEngine.Instance.FindConcepts(
                        question,
                        params.ContextUser,
                        graphName,
                    );
                    for (const c of questionConcepts) {
                        combinedSeeds.push({
                            EntityName: 'MJ: Graph Concepts',
                            RecordID: c.RecordID,
                        });
                    }
                }

                if (combinedSeeds.length === 0) {
                    return {
                        Success: false,
                        ResultCode: 'MISSING_SEEDS',
                        Message:
                            'At least one of Question, ConceptNames, SeedNodes, or EntityName is required.',
                    };
                }

                subgraph = await GraphEngine.Instance.Subgraph(
                    graphName,
                    combinedSeeds,
                    traversalOptions,
                    params.ContextUser,
                );
            }

            const promptDescription = GraphEngine.Instance.DescribeForPrompt(subgraph);
            this.setOutputParam(params, 'Subgraph', subgraph);
            this.setOutputParam(params, 'PromptDescription', promptDescription);
            this.setOutputParam(params, 'NodeCount', subgraph.Nodes.length);
            this.setOutputParam(params, 'EdgeCount', subgraph.Edges.length);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: promptDescription,
                GraphName: graphName,
                Subgraph: subgraph,
                PromptDescription: promptDescription,
                NodeCount: subgraph.Nodes.length,
                EdgeCount: subgraph.Edges.length,
            } as ActionResultSimple;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                ResultCode: 'GRAPH_CONTEXT_FAILED',
                Message: `Get Graph Context failed: ${errorMessage}`,
            };
        }
    }

    private collectExplicitSeeds(
        entityName: string | undefined,
        recordID: string | undefined,
        conceptNamesRaw: string | undefined,
        seedNodesRaw: unknown,
        graphName: string,
        params: RunActionParams,
    ): GraphNodeRef[] {
        const seeds: GraphNodeRef[] = [];

        if (entityName) {
            if (recordID) {
                seeds.push({ EntityName: entityName, RecordID: recordID });
            } else {
                const md = params.Provider ?? new Metadata();
                const entity = md.EntityByName(entityName);
                if (entity) {
                    seeds.push({ EntityName: 'MJ: Entities', RecordID: entity.ID });
                }
            }
        }

        if (conceptNamesRaw) {
            const names = this.parseStringList(conceptNamesRaw) ?? [];
            for (const name of names) {
                const matched = CanonGraphEngine.Instance.FindConcepts(
                    name,
                    params.ContextUser,
                    graphName,
                );
                for (const m of matched) {
                    seeds.push({ EntityName: 'MJ: Graph Concepts', RecordID: m.RecordID });
                }
            }
        }

        for (const seed of this.parseSeedNodes(seedNodesRaw)) {
            seeds.push(seed);
        }

        return seeds;
    }

    private parseSeedNodes(raw: unknown): GraphNodeRef[] {
        if (!raw) {
            return [];
        }
        let parsed: unknown = raw;
        if (typeof raw === 'string') {
            try {
                parsed = JSON.parse(raw);
            } catch {
                return [];
            }
        }
        if (!Array.isArray(parsed)) {
            return [];
        }
        const results: GraphNodeRef[] = [];
        for (const item of parsed) {
            if (typeof item === 'object' && item !== null) {
                const rec = item as Record<string, unknown>;
                const eName = rec['EntityName'] ?? rec['entityName'];
                const rID = rec['RecordID'] ?? rec['recordID'] ?? rec['recordId'];
                if (typeof eName === 'string' && eName.trim() && rID != null && String(rID).trim()) {
                    results.push({ EntityName: eName.trim(), RecordID: String(rID).trim() });
                }
            }
        }
        return results;
    }

    private parseDirection(raw?: string): 'Out' | 'In' | 'Both' {
        const normalized = raw?.trim().toLowerCase();
        if (normalized === 'out') {
            return 'Out';
        }
        if (normalized === 'in') {
            return 'In';
        }
        return 'Both';
    }

    private parseStringList(raw: unknown): string[] | undefined {
        if (!raw) {
            return undefined;
        }
        if (Array.isArray(raw)) {
            const list = raw.map(v => String(v).trim()).filter(Boolean);
            return list.length > 0 ? list : undefined;
        }
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (!trimmed) {
                return undefined;
            }
            if (trimmed.startsWith('[')) {
                try {
                    const parsed: unknown = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        const list = parsed.map(v => String(v).trim()).filter(Boolean);
                        return list.length > 0 ? list : undefined;
                    }
                } catch {
                    // Fall through to comma split
                }
            }
            const list = trimmed
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
            return list.length > 0 ? list : undefined;
        }
        return undefined;
    }

    private getParamValue(params: RunActionParams, paramName: string): unknown {
        const param = params.Params.find(
            p => p.Name.toLowerCase() === paramName.toLowerCase() && p.Type === 'Input',
        );
        return param?.Value;
    }

    private getStringParam(params: RunActionParams, paramName: string): string | undefined {
        const val = this.getParamValue(params, paramName);
        return val != null && String(val).trim() !== '' ? String(val).trim() : undefined;
    }

    private getNumericParam(
        params: RunActionParams,
        paramName: string,
        defaultValue: number,
    ): number {
        const val = this.getParamValue(params, paramName);
        if (val != null) {
            const num = Number(val);
            return Number.isNaN(num) ? defaultValue : num;
        }
        return defaultValue;
    }

    private getOptionalNumericParam(
        params: RunActionParams,
        paramName: string,
    ): number | undefined {
        const val = this.getParamValue(params, paramName);
        if (val != null && String(val).trim() !== '') {
            const num = Number(val);
            return Number.isNaN(num) ? undefined : num;
        }
        return undefined;
    }

    private getBooleanParam(
        params: RunActionParams,
        paramName: string,
        defaultValue: boolean,
    ): boolean {
        const val = this.getParamValue(params, paramName);
        if (val != null) {
            const s = String(val).toLowerCase().trim();
            if (s === 'true' || s === '1' || s === 'yes') return true;
            if (s === 'false' || s === '0' || s === 'no') return false;
        }
        return defaultValue;
    }

    private setOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params.find(
            p => p.Name.toLowerCase() === name.toLowerCase() && p.Type === 'Output',
        );
        if (existing) {
            existing.Value = value;
        } else {
            params.Params.push({
                Name: name,
                Value: value,
                Type: 'Output',
            });
        }
    }
}
