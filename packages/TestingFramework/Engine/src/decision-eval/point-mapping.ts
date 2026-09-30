/**
 * @fileoverview Maps a corpus point to the routing decision's input, through the same builders the
 * chat uses (`@memberjunction/ai-core-plus`), so the eval asks exactly what production asks.
 *
 * @module @memberjunction/testing-engine
 */

import {
    BuildRecentTurnParts,
    BuildRecentTurns,
    BuildRoutingArtifactVersions,
    CollectRoutingParticipants,
    type RoutingAgent,
    type RoutingArtifactSummary,
    type RoutingCatalogAgent,
    type RoutingDecisionInput,
    type RoutingHistoryRow
} from '@memberjunction/ai-core-plus';
import { UUIDsEqual } from '@memberjunction/global';
import type { DecisionCorpusArtifact, DecisionCorpusPoint } from './types';

/** The agents the mapping can resolve: the engine's, in the driver. */
export interface DecisionEvalAgentCatalog {
    /**
     * Looks an agent up by ID, with its status: as in the chat, an agent that isn't active, or is
     * restricted, is not offered. Undefined when the catalog doesn't have it; the mapping then falls
     * back to the name (and, for the previous agent, the description) the point itself records.
     */
    FindAgent(agentId: string): RoutingCatalogAgent | undefined;
    /** The conversation manager (Sage), offered as "someone else". Null when the catalog doesn't have it. */
    ConversationManager: RoutingAgent | null;
}

/**
 * The routing decision's input for one corpus point:
 * - `Message` is the point's new message, and `ContinuityAgentId` its previous agent;
 * - `Participants` are the history's agents, newest first, from the shared builder;
 * - `RecentTurns` (and `RecentTurnParts`) come from the history through the shared builders;
 * - `ArtifactVersions` (and `ContinuityArtifacts`) are the point's artifacts, as the previous agent's;
 * - `AllowedAgentIDs` is null: the eval runs as a chat with no allowed list.
 *
 * Agents resolve through the catalog by ID, falling back to the point's own names. The history is
 * the conversation before the new message; a history row that is the new message itself (the
 * point's ID, or a trailing user row with the same text) is dropped, as the chat drops it.
 *
 * @param point The corpus point.
 * @param catalog The agents to resolve against.
 */
export function MapPointToRoutingInput(point: DecisionCorpusPoint, catalog: DecisionEvalAgentCatalog): RoutingDecisionInput {
    const history = HistoryBeforeMessage(point);
    const findAgent = (agentId: string): RoutingCatalogAgent | undefined => catalog.FindAgent(agentId) ?? pointAgent(point, agentId);
    const manager = catalog.ConversationManager;
    const previousAgent = findAgent(point.previous_agent.id) ?? fromPreviousAgent(point);
    const artifacts = point.artifacts.map(ToRoutingArtifactSummary);
    return {
        Message: point.latest_message,
        ContinuityAgentId: point.previous_agent.id,
        Participants: CollectRoutingParticipants(history, manager?.ID ?? null, null, findAgent),
        ConversationManager: manager,
        RecentTurns: BuildRecentTurns(history, findAgent),
        RecentTurnParts: BuildRecentTurnParts(history, findAgent),
        ArtifactVersions: BuildRoutingArtifactVersions([{ Agent: previousAgent, Artifacts: artifacts }]),
        AllowedAgentIDs: null,
        ContinuityArtifacts: artifacts
    };
}

/**
 * The point's history as routing rows, oldest first, without the new message. The corpus should
 * already exclude it; this drops a row carrying the point's own ID, and a trailing user row whose
 * text is the new message, in case it doesn't.
 *
 * @param point The corpus point.
 */
export function HistoryBeforeMessage(point: DecisionCorpusPoint): RoutingHistoryRow[] {
    const rows = point.history.filter(row => !UUIDsEqual(row.id, point.id));
    const last = rows[rows.length - 1];
    if (last && last.role === 'User' && last.message.trim() === point.latest_message.trim()) {
        rows.pop();
    }
    return rows.map(row => ({ ID: row.id, Role: row.role, AgentID: row.agent_id, Message: row.message }));
}

/**
 * A corpus artifact in the shape the routing builders read.
 *
 * @param artifact The corpus artifact.
 */
export function ToRoutingArtifactSummary(artifact: DecisionCorpusArtifact): RoutingArtifactSummary {
    return { artifactName: artifact.artifactName, ArtifactType: artifact.artifactType, Versions: artifact.versions };
}

/**
 * The status an agent the catalog doesn't have is given: routable. The point records it answering in
 * this conversation, and nothing says it has since been disabled. An agent the catalog has keeps the
 * catalog's status.
 */
const POINT_AGENT_STATUS: Pick<RoutingCatalogAgent, 'Status' | 'IsRestricted'> = { Status: 'Active', IsRestricted: false };

/** An agent as the point records it: the previous agent in full, or a history row's name. */
function pointAgent(point: DecisionCorpusPoint, agentId: string): RoutingCatalogAgent | undefined {
    if (UUIDsEqual(agentId, point.previous_agent.id)) {
        return { ...fromPreviousAgent(point), ...POINT_AGENT_STATUS };
    }
    const named = [...point.history].reverse().find(row => UUIDsEqual(row.agent_id, agentId) && !!row.agent_name?.trim());
    return named ? { ID: agentId, Name: named.agent_name, Description: null, ...POINT_AGENT_STATUS } : undefined;
}

/** The previous agent as the point records it. */
function fromPreviousAgent(point: DecisionCorpusPoint): RoutingAgent {
    return { ID: point.previous_agent.id, Name: point.previous_agent.name, Description: point.previous_agent.description };
}
