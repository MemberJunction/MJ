import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { LogError } from '@memberjunction/core';
import {
    CanonGraphEngine,
    GraphEngine,
    type ConceptMatch,
    type GraphPath,
    type GraphPathRequestResult,
    type GraphTraversalOptions,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import {
    DescribeConceptCandidates,
    GetGraphActionBoolean,
    GetGraphActionNumber,
    GetGraphActionParam,
    GetGraphActionString,
    GetGraphActionWeight,
    ParseGraphActionStringList,
    ParseGraphEndpoint,
    SetGraphActionOutput,
} from './graph-action-params';

/** Result returned by {@link FindGraphPathAction}. */
export interface FindGraphPathActionResult extends ActionResultSimple {
    Path?: GraphPath;
    PromptText?: string;
    HopCount?: number;
    /** The concepts an endpoint fits about equally well, when `ResultCode` is `AMBIGUOUS_ENDPOINT`. */
    Candidates?: ConceptMatch[];
}

/**
 * Action `Find Graph Path`: how two things are connected in a semantic graph (default `'MJ Canon'`).
 *
 * `From` and `To` are each a record (`{ EntityName, RecordID }`) or a concept (its name, a synonym, or
 * its ID). Returns the fewest-hop path the caller may see, as JSON and as prompt text, through
 * {@link GraphEngine.FindPath}.
 *
 * Result codes:
 * - `SUCCESS`: a path was found.
 * - `NO_PATH`: no connection the caller may see within the limits. An answer, not an error; a
 *   record the caller cannot see gives this same answer.
 * - `AMBIGUOUS_ENDPOINT`: an endpoint names several concepts about equally well; `Candidates` lists
 *   them so the agent can ask which one is meant.
 * - `ENDPOINT_NOT_FOUND`: an endpoint names no concept the caller may see.
 */
@RegisterClass(BaseAction, 'Find Graph Path')
export class FindGraphPathAction extends BaseAction {
    private static readonly DEFAULT_GRAPH_NAME = 'MJ Canon';
    private static readonly MAX_DEPTH = 4;
    private static readonly MAX_NODES_CAP = 200;

    protected async InternalRunAction(params: RunActionParams): Promise<FindGraphPathActionResult> {
        try {
            if (!params.ContextUser) {
                return { Success: false, ResultCode: 'MISSING_PARAMETER', Message: 'ContextUser is required to run Find Graph Path.' };
            }
            const from = ParseGraphEndpoint(GetGraphActionParam(params, 'From'));
            const to = ParseGraphEndpoint(GetGraphActionParam(params, 'To'));
            if (!from || !to) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: 'Both From and To are required: each is a concept name or ID, or an object { EntityName, RecordID }.',
                };
            }
            const graphName = GetGraphActionString(params, 'GraphName') ?? FindGraphPathAction.DEFAULT_GRAPH_NAME;
            const result = await CanonGraphEngine.Instance.FindPathBetween(
                graphName,
                from,
                to,
                this.buildTraversalOptions(params),
                params.ContextUser,
                params.Provider,
            );
            return this.buildResult(params, graphName, result);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`FindGraphPathAction failed: ${msg}`);
            return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: `Find Graph Path failed: ${msg}` };
        }
    }

    private buildTraversalOptions(params: RunActionParams): GraphTraversalOptions {
        const depth = GetGraphActionNumber(params, 'Depth', FindGraphPathAction.MAX_DEPTH);
        const maxNodes = GetGraphActionNumber(params, 'MaxNodes', FindGraphPathAction.MAX_NODES_CAP);
        return {
            Depth: Math.max(1, Math.min(FindGraphPathAction.MAX_DEPTH, Math.floor(depth))),
            MaxNodes: Math.max(1, Math.min(FindGraphPathAction.MAX_NODES_CAP, Math.floor(maxNodes))),
            Direction: 'Both',
            EdgeTypes: ParseGraphActionStringList(GetGraphActionParam(params, 'EdgeTypes')),
            MinWeight: GetGraphActionWeight(params, 'MinWeight'),
            IncludeProposed: GetGraphActionBoolean(params, 'IncludeProposed', false),
        };
    }

    /** Map the engine's outcome to the result code an agent reads. */
    private buildResult(params: RunActionParams, graphName: string, result: GraphPathRequestResult): FindGraphPathActionResult {
        const path = result.Path;
        switch (result.Status) {
            case 'GraphNotFound':
                return { Success: false, ResultCode: 'GRAPH_NOT_FOUND', Message: `Graph '${graphName}' was not found or is not active.` };
            case 'AmbiguousEndpoint': {
                const names = result.Candidates.map((c) => `"${c.Node.Label}"`).join(', ');
                SetGraphActionOutput(params, 'Candidates', DescribeConceptCandidates(result.Candidates));
                return {
                    Success: false,
                    ResultCode: 'AMBIGUOUS_ENDPOINT',
                    Message: `${result.Endpoint} fits several concepts about equally well: ${names}. Ask which one is meant, then call again with ${result.Endpoint} set to that concept's exact name.`,
                    Candidates: result.Candidates,
                };
            }
            case 'EndpointNotFound':
                return { Success: false, ResultCode: 'ENDPOINT_NOT_FOUND', Message: `${result.Endpoint ?? 'An endpoint'} does not name a concept in this graph that you can see.` };
            default:
                return this.pathResult(params, graphName, path);
        }
    }

    private pathResult(params: RunActionParams, graphName: string, path: GraphPath): FindGraphPathActionResult {
        const promptText = GraphEngine.Instance.DescribePathForPrompt(path, params.Provider);
        const hopCount = path.Found ? path.Edges.length : 0;
        SetGraphActionOutput(params, 'Path', path);
        SetGraphActionOutput(params, 'PromptText', promptText);
        SetGraphActionOutput(params, 'HopCount', hopCount);
        if (!path.Found) {
            return {
                Success: true,
                ResultCode: 'NO_PATH',
                Message: `No connection found in '${graphName}' between the two endpoints. ${path.Message ?? ''}`.trim(),
                Path: path,
                PromptText: promptText,
                HopCount: 0,
            };
        }
        return { Success: true, ResultCode: 'SUCCESS', Message: promptText, Path: path, PromptText: promptText, HopCount: hopCount };
    }
}
