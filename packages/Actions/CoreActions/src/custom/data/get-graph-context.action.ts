import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { LogError, UserInfo } from '@memberjunction/core';
import {
    CanonGraphEngine,
    GraphEngine,
    type GraphNodeRef,
    type GraphSubgraph,
    type GraphTraversalOptions,
} from '@memberjunction/core-entities';
import { RegisterClass, IndexByUUID } from '@memberjunction/global';

/**
 * Result returned by {@link GetGraphContextAction}.
 */
export interface GetGraphContextActionResult extends ActionResultSimple {
    Subgraph?: GraphSubgraph;
    PromptText?: string;
    NodeCount?: number;
    EdgeCount?: number;
}

/**
 * Action that expands a bounded semantic subgraph from a named graph (`GraphName`, default `'MJ Canon'`)
 * starting from a natural-language `Question` (resolved via `CanonGraphEngine.Instance.FindConcepts`)
 * and/or explicit `Seeds` (`[{ EntityName, RecordID }]` or concept names).
 */
@RegisterClass(BaseAction, 'Get Graph Context')
export class GetGraphContextAction extends BaseAction {
    private static readonly DEFAULT_GRAPH_NAME = 'MJ Canon';
    private static readonly DEFAULT_DEPTH = 2;
    private static readonly MAX_DEPTH = 4;
    private static readonly DEFAULT_MAX_NODES = 50;
    private static readonly MAX_NODES_CAP = 200;

    protected async InternalRunAction(params: RunActionParams): Promise<GetGraphContextActionResult> {
        try {
            if (!params.ContextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: 'ContextUser is required to run Get Graph Context.',
                };
            }

            // GraphEngine is lazily configured; on a server it loads as the system user, and every node it
            // returns is checked as ContextUser at the hop it is reached.
            await CanonGraphEngine.Instance.EnsureConfigured(params.ContextUser, params.Provider);

            const graphName =
                this.getStringParam(params, 'GraphName')?.trim() || GetGraphContextAction.DEFAULT_GRAPH_NAME;
            const graph = GraphEngine.Instance.GetGraph(graphName);
            if (!graph) {
                return {
                    Success: false,
                    ResultCode: 'GRAPH_NOT_FOUND',
                    Message: `Graph '${graphName}' was not found or is not active.`,
                };
            }
            const question = this.getStringParam(params, 'Question')?.trim();
            const rawSeeds = this.getParamValue(params, 'Seeds');

            const requestedDepth = this.getNumericParam(params, 'Depth', GetGraphContextAction.DEFAULT_DEPTH);
            const depth = Math.max(1, Math.min(GetGraphContextAction.MAX_DEPTH, Math.floor(requestedDepth)));

            const requestedMaxNodes = this.getNumericParam(
                params,
                'MaxNodes',
                GetGraphContextAction.DEFAULT_MAX_NODES,
            );
            const maxNodes = Math.max(1, Math.min(GetGraphContextAction.MAX_NODES_CAP, Math.floor(requestedMaxNodes)));

            const edgeTypes = this.parseEdgeTypesParam(this.getParamValue(params, 'EdgeTypes'));
            const minWeightRaw = this.getParamValue(params, 'MinWeight');
            const minWeight =
                minWeightRaw != null && Number.isFinite(Number(minWeightRaw))
                    ? Math.max(0, Math.min(1, Number(minWeightRaw)))
                    : undefined;
            const includeProposed = this.getBooleanParam(params, 'IncludeProposed', false);

            const seeds = await this.resolveSeeds(question, rawSeeds, graph.Name, params);
            if (!question && seeds.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: 'Either Question or Seeds must be provided to Get Graph Context.',
                };
            }

            const options: GraphTraversalOptions = {
                Depth: depth,
                MaxNodes: maxNodes,
                Direction: 'Both',
                EdgeTypes: edgeTypes,
                MinWeight: minWeight,
                IncludeProposed: includeProposed,
            };

            const subgraph: GraphSubgraph =
                seeds.length > 0
                    ? await GraphEngine.Instance.Subgraph(graph.Name, seeds, options, params.ContextUser)
                    : { Nodes: [], Edges: [] };

            const promptText = GraphEngine.Instance.DescribeForPrompt(subgraph);
            const nodeCount = subgraph.Nodes.length;
            const edgeCount = subgraph.Edges.length;

            this.addOutputParam(params, 'Subgraph', subgraph);
            this.addOutputParam(params, 'PromptText', promptText);
            this.addOutputParam(params, 'NodeCount', nodeCount);
            this.addOutputParam(params, 'EdgeCount', edgeCount);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message:
                    nodeCount > 0
                        ? promptText
                        : `No matching graph nodes found in '${graph.Name}' for the supplied inputs.${subgraph.Message ? ` ${subgraph.Message}` : ''}`,
                Subgraph: subgraph,
                PromptText: promptText,
                NodeCount: nodeCount,
                EdgeCount: edgeCount,
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`GetGraphContextAction failed: ${msg}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Get Graph Context failed: ${msg}`,
            };
        }
    }

    /**
     * Seeds from the question (concept matches the caller can see, in `graphName`) and from explicit
     * `Seeds` (record references, or concept names/IDs). Every seed is checked again as the caller when
     * the traversal admits it.
     */
    private async resolveSeeds(
        question: string | undefined,
        rawSeeds: unknown,
        graphName: string,
        params: RunActionParams,
    ): Promise<GraphNodeRef[]> {
        const user: UserInfo = params.ContextUser;
        const resolved: GraphNodeRef[] = [];
        const seenKeys = new Set<string>();

        const pushSeed = (ref: GraphNodeRef): void => {
            const key = `${ref.EntityName.trim().toLowerCase()}:${ref.RecordID.trim().toLowerCase()}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                resolved.push(ref);
            }
        };
        const conceptSearch = { GraphNames: [graphName], provider: params.Provider };

        if (question && question.length > 0) {
            const matched = await CanonGraphEngine.Instance.FindConcepts(question, user, conceptSearch);
            for (const c of matched.slice(0, 5)) {
                pushSeed({
                    EntityName: c.EntityName,
                    EntityID: c.EntityID,
                    RecordID: c.RecordID,
                });
            }
        }

        const parsedList = this.parseRawSeedList(rawSeeds);
        const concepts = GraphEngine.Instance.Concepts;
        const conceptsById = IndexByUUID(concepts);
        const conceptsByName = new Map(concepts.map((c) => [c.Name.trim().toLowerCase(), c]));
        for (const item of parsedList) {
            if (typeof item === 'string') {
                const trimmed = item.trim();
                if (!trimmed) {
                    continue;
                }
                const lower = trimmed.toLowerCase();
                const exactConcept = conceptsByName.get(lower) ?? conceptsById.Get(trimmed);
                if (exactConcept) {
                    pushSeed({
                        EntityName: 'MJ: Graph Concepts',
                        RecordID: exactConcept.ID,
                    });
                } else {
                    const fuzzyConcepts = await CanonGraphEngine.Instance.FindConcepts(trimmed, user, conceptSearch);
                    for (const fc of fuzzyConcepts.slice(0, 3)) {
                        pushSeed({
                            EntityName: fc.EntityName,
                            EntityID: fc.EntityID,
                            RecordID: fc.RecordID,
                        });
                    }
                }
            } else if (item && typeof item === 'object') {
                const obj = item as Record<string, unknown>;
                const entityName =
                    typeof obj['EntityName'] === 'string'
                        ? obj['EntityName'].trim()
                        : typeof obj['entityName'] === 'string'
                          ? obj['entityName'].trim()
                          : '';
                const recordId =
                    obj['RecordID'] != null
                        ? String(obj['RecordID']).trim()
                        : obj['recordId'] != null
                          ? String(obj['recordId']).trim()
                          : '';
                if (entityName && recordId) {
                    pushSeed({
                        EntityName: entityName,
                        EntityID: typeof obj['EntityID'] === 'string' ? obj['EntityID'] : undefined,
                        RecordID: recordId,
                    });
                }
            }
        }

        return resolved;
    }

    private parseRawSeedList(rawSeeds: unknown): unknown[] {
        if (rawSeeds == null) {
            return [];
        }
        if (Array.isArray(rawSeeds)) {
            return rawSeeds;
        }
        if (typeof rawSeeds === 'string') {
            const trimmed = rawSeeds.trim();
            if (!trimmed) {
                return [];
            }
            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                try {
                    const parsed: unknown = JSON.parse(trimmed);
                    return Array.isArray(parsed) ? parsed : [parsed];
                } catch {
                    return [trimmed];
                }
            }
            return trimmed
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
        }
        if (typeof rawSeeds === 'object') {
            return [rawSeeds];
        }
        return [];
    }

    private parseEdgeTypesParam(raw: unknown): string[] | undefined {
        if (raw == null) {
            return undefined;
        }
        if (Array.isArray(raw)) {
            const list = raw.map((x) => String(x).trim()).filter(Boolean);
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
                        const list = parsed.map((x) => String(x).trim()).filter(Boolean);
                        return list.length > 0 ? list : undefined;
                    }
                } catch {
                    // fall through to CSV split
                }
            }
            const list = trimmed
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            return list.length > 0 ? list : undefined;
        }
        return undefined;
    }

    private getParamValue(params: RunActionParams, name: string): unknown {
        const lower = name.trim().toLowerCase();
        const found = params.Params?.find((p) => p.Name.trim().toLowerCase() === lower);
        return found?.Value;
    }

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const val = this.getParamValue(params, name);
        return val != null ? String(val) : undefined;
    }

    private getNumericParam(params: RunActionParams, name: string, defaultValue: number): number {
        const val = this.getParamValue(params, name);
        if (val != null) {
            const num = Number(val);
            if (Number.isFinite(num)) {
                return num;
            }
        }
        return defaultValue;
    }

    private getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const val = this.getParamValue(params, name);
        if (typeof val === 'boolean') {
            return val;
        }
        if (val != null) {
            const str = String(val).trim().toLowerCase();
            if (str === 'true' || str === '1' || str === 'yes') {
                return true;
            }
            if (str === 'false' || str === '0' || str === 'no') {
                return false;
            }
        }
        return defaultValue;
    }

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        if (!params.Params) {
            return;
        }
        const existing = params.Params.find(
            (p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase() && p.Type === 'Output',
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
