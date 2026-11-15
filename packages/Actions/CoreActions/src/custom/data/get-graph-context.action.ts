import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { LogError } from '@memberjunction/core';
import {
    CanonGraphEngine,
    GraphEngine,
    type ConceptMatch,
    type FindConceptsOptions,
    type GraphNodeRef,
    type GraphSubgraph,
    type GraphTraversalOptions,
} from '@memberjunction/core-entities';
import { IndexByUUID, RegisterClass } from '@memberjunction/global';
import {
    DescribeConceptCandidates,
    GetGraphActionBoolean,
    GetGraphActionNumber,
    GetGraphActionParam,
    GetGraphActionString,
    GetGraphActionWeight,
    ParseGraphActionItemList,
    ParseGraphActionStringList,
    ParseGraphRecordRef,
    SetGraphActionOutput,
} from './graph-action-params';

/**
 * Result returned by {@link GetGraphContextAction}.
 */
export interface GetGraphContextActionResult extends ActionResultSimple {
    Subgraph?: GraphSubgraph;
    PromptText?: string;
    NodeCount?: number;
    EdgeCount?: number;
    /** How the question and concept seeds resolved: `Matched`, `Ambiguous` or `NoMatch`. */
    Resolution?: 'Matched' | 'Ambiguous' | 'NoMatch';
    /** The concepts the question (or a concept seed) fits about equally well, when ambiguous. */
    Candidates?: ConceptMatch[];
}

/** Seeds resolved from the inputs, and any concepts a piece of text fitted equally well. */
interface ResolvedSeeds {
    Seeds: GraphNodeRef[];
    Ambiguous: ConceptMatch[];
}

/**
 * Action that expands a bounded semantic subgraph from a named graph (`GraphName`, default `'MJ Canon'`)
 * starting from a natural-language `Question` (resolved via `CanonGraphEngine.Instance.ResolveConcepts`)
 * and/or explicit `Seeds` (`[{ EntityName, RecordID }]` or concept names).
 *
 * Result codes tell an agent what kind of answer it got:
 * - `SUCCESS`: the inputs resolved and the context is returned.
 * - `AMBIGUOUS_CONCEPT`: the text fits several concepts about equally well. The context covers all of
 *   them and `Candidates` lists them, so the agent can ask which one is meant instead of guessing.
 * - `NO_MATCH`: nothing the caller may see matched. This is an answer, not an error.
 */
@RegisterClass(BaseAction, 'Get Graph Context')
export class GetGraphContextAction extends BaseAction {
    private static readonly DEFAULT_GRAPH_NAME = 'MJ Canon';
    private static readonly DEFAULT_DEPTH = 2;
    private static readonly MAX_DEPTH = 4;
    private static readonly DEFAULT_MAX_NODES = 50;
    private static readonly MAX_NODES_CAP = 200;
    private static readonly QUESTION_SEEDS = 5;
    private static readonly SEED_TEXT_MATCHES = 3;

    protected async InternalRunAction(params: RunActionParams): Promise<GetGraphContextActionResult> {
        try {
            if (!params.ContextUser) {
                return { Success: false, ResultCode: 'MISSING_PARAMETER', Message: 'ContextUser is required to run Get Graph Context.' };
            }

            // GraphEngine is lazily configured; on a server it loads as the system user, and every node it
            // returns is checked as ContextUser at the hop it is reached.
            await CanonGraphEngine.Instance.EnsureConfigured(params.ContextUser, params.Provider);

            const graphName = GetGraphActionString(params, 'GraphName') ?? GetGraphContextAction.DEFAULT_GRAPH_NAME;
            const graph = GraphEngine.Instance.GetGraph(graphName);
            if (!graph) {
                return { Success: false, ResultCode: 'GRAPH_NOT_FOUND', Message: `Graph '${graphName}' was not found or is not active.` };
            }
            const question = GetGraphActionString(params, 'Question');
            const rawSeeds = GetGraphActionParam(params, 'Seeds');
            if (!question && ParseGraphActionItemList(rawSeeds).length === 0) {
                return { Success: false, ResultCode: 'MISSING_PARAMETER', Message: 'Either Question or Seeds must be provided to Get Graph Context.' };
            }

            const options = this.buildTraversalOptions(params);
            const conceptSearch: FindConceptsOptions = { GraphNames: [graph.Name], IncludeProposed: options.IncludeProposed === true, provider: params.Provider };
            const resolved = await this.resolveSeeds(question, rawSeeds, conceptSearch, params);
            const subgraph: GraphSubgraph =
                resolved.Seeds.length > 0
                    ? await GraphEngine.Instance.Subgraph(graph.Name, resolved.Seeds, options, params.ContextUser, params.Provider)
                    : { Nodes: [], Edges: [] };
            return this.buildResult(params, graph.Name, question, subgraph, resolved);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`GetGraphContextAction failed: ${msg}`);
            return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: `Get Graph Context failed: ${msg}` };
        }
    }

    private buildTraversalOptions(params: RunActionParams): GraphTraversalOptions {
        const depth = GetGraphActionNumber(params, 'Depth', GetGraphContextAction.DEFAULT_DEPTH);
        const maxNodes = GetGraphActionNumber(params, 'MaxNodes', GetGraphContextAction.DEFAULT_MAX_NODES);
        return {
            Depth: Math.max(1, Math.min(GetGraphContextAction.MAX_DEPTH, Math.floor(depth))),
            MaxNodes: Math.max(1, Math.min(GetGraphContextAction.MAX_NODES_CAP, Math.floor(maxNodes))),
            Direction: 'Both',
            EdgeTypes: ParseGraphActionStringList(GetGraphActionParam(params, 'EdgeTypes')),
            MinWeight: GetGraphActionWeight(params, 'MinWeight'),
            IncludeProposed: GetGraphActionBoolean(params, 'IncludeProposed', false),
        };
    }

    private buildResult(
        params: RunActionParams,
        graphName: string,
        question: string | undefined,
        subgraph: GraphSubgraph,
        resolved: ResolvedSeeds,
    ): GetGraphContextActionResult {
        const promptText = GraphEngine.Instance.DescribeForPrompt(subgraph);
        const nodeCount = subgraph.Nodes.length;
        const edgeCount = subgraph.Edges.length;
        const resolution: GetGraphContextActionResult['Resolution'] =
            resolved.Ambiguous.length > 0 ? 'Ambiguous' : nodeCount > 0 ? 'Matched' : 'NoMatch';

        SetGraphActionOutput(params, 'Subgraph', subgraph);
        SetGraphActionOutput(params, 'PromptText', promptText);
        SetGraphActionOutput(params, 'NodeCount', nodeCount);
        SetGraphActionOutput(params, 'EdgeCount', edgeCount);
        SetGraphActionOutput(params, 'Resolution', resolution);
        SetGraphActionOutput(params, 'Candidates', DescribeConceptCandidates(resolved.Ambiguous));

        const base = { Subgraph: subgraph, PromptText: promptText, NodeCount: nodeCount, EdgeCount: edgeCount, Resolution: resolution, Candidates: resolved.Ambiguous };
        if (resolution === 'Ambiguous') {
            const names = resolved.Ambiguous.map((c) => `"${c.Node.Label}"`).join(', ');
            const subject = question ? `"${question}"` : 'A concept seed';
            return {
                ...base,
                Success: true,
                ResultCode: 'AMBIGUOUS_CONCEPT',
                Message:
                    `${subject} fits several concepts about equally well: ${names}. The context below covers all of them. ` +
                    `Ask which one is meant, or call again with Seeds set to that concept's name.\n\n${promptText}`,
            };
        }
        if (resolution === 'NoMatch') {
            return {
                ...base,
                Success: true,
                ResultCode: 'NO_MATCH',
                Message: `No matching graph nodes found in '${graphName}' for the supplied inputs.${subgraph.Message ? ` ${subgraph.Message}` : ''}`,
            };
        }
        return { ...base, Success: true, ResultCode: 'SUCCESS', Message: promptText };
    }

    /**
     * Seeds from the question (concepts the caller can see, in the graph) and from explicit `Seeds`
     * (record references, or concept names/IDs). Every seed is checked again as the caller when the
     * traversal admits it. Text that fits several concepts equally well seeds all of them and is
     * reported as ambiguous.
     */
    private async resolveSeeds(
        question: string | undefined,
        rawSeeds: unknown,
        conceptSearch: FindConceptsOptions,
        params: RunActionParams,
    ): Promise<ResolvedSeeds> {
        const result: ResolvedSeeds = { Seeds: [], Ambiguous: [] };
        const seenKeys = new Set<string>();
        const pushSeed = (ref: GraphNodeRef): void => {
            const key = `${ref.EntityName.trim().toLowerCase()}:${ref.RecordID.trim().toLowerCase()}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                result.Seeds.push(ref);
            }
        };
        if (question) {
            await this.addTextSeeds(question, GetGraphContextAction.QUESTION_SEEDS, conceptSearch, params, result, pushSeed);
        }
        const conceptsById = IndexByUUID(GraphEngine.Instance.Concepts);
        const conceptsByName = new Map(GraphEngine.Instance.Concepts.map((c) => [c.Name.trim().toLowerCase(), c]));
        for (const item of ParseGraphActionItemList(rawSeeds)) {
            const record = ParseGraphRecordRef(item);
            if (record) {
                pushSeed(record);
            } else if (typeof item === 'string' && item.trim()) {
                const text = item.trim();
                const exact = conceptsByName.get(text.toLowerCase()) ?? conceptsById.Get(text);
                if (exact) {
                    pushSeed({ EntityName: 'MJ: Graph Concepts', RecordID: exact.ID });
                } else {
                    await this.addTextSeeds(text, GetGraphContextAction.SEED_TEXT_MATCHES, conceptSearch, params, result, pushSeed);
                }
            }
        }
        return result;
    }

    /** Seed from concepts matching `text`: the tied candidates when ambiguous, else the best `limit`. */
    private async addTextSeeds(
        text: string,
        limit: number,
        conceptSearch: FindConceptsOptions,
        params: RunActionParams,
        result: ResolvedSeeds,
        pushSeed: (ref: GraphNodeRef) => void,
    ): Promise<void> {
        const resolution = await CanonGraphEngine.Instance.ResolveConcepts(text, params.ContextUser, conceptSearch);
        const chosen = resolution.Status === 'Ambiguous' ? resolution.Candidates : resolution.Matches.slice(0, limit);
        if (resolution.Status === 'Ambiguous') {
            result.Ambiguous.push(...resolution.Candidates);
        }
        for (const match of chosen) {
            pushSeed({ EntityName: match.Node.EntityName, EntityID: match.Node.EntityID, RecordID: match.Node.RecordID });
        }
    }
}
