/**
 * @fileoverview Pure data layer for the Realtime "Voice Transcripts" view. Loads the unified per-room
 * meeting transcripts the bridge writes (one `MJ: Conversations` of `Type='Meeting Room'` per room +
 * `MJ: Conversation Details` per utterance), and resolves each line's speaker — agent lines via `AgentID`,
 * heard ('User') lines via the diarized `ExternalID` → the room's `AIAgentSessionBridgeParticipant` roster
 * (DisplayName + IsAgent). No Angular imports — RunView(s) + client-side aggregation only.
 *
 * @module @memberjunction/ng-dashboards
 */
import { IMetadataProvider, RunView } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

const CONVERSATION_ENTITY = 'MJ: Conversations';
const CONVERSATION_DETAIL_ENTITY = 'MJ: Conversation Details';
const BRIDGE_ENTITY = 'MJ: AI Agent Session Bridges';
const PARTICIPANT_ENTITY = 'MJ: AI Agent Session Bridge Participants';

/** One meeting-room transcript in the list view. */
export interface MeetingRoomSummary {
    ConversationID: string;
    Name: string;
    /** The room's external connection id (`ExternalID`) — the join key to the bridge/participant rows. */
    RoomKey: string;
    CreatedAt: Date;
    LastActivity: Date;
}

/** A speaker-attributed transcript line for the drill-in view. */
export interface TranscriptLine {
    ID: string;
    /** `'agent'` = an agent spoke; `'human'` = a human/participant spoke; `'error'` = an error row. */
    Kind: 'agent' | 'human' | 'error';
    /** Resolved display name of the speaker (agent name, participant name, or a sensible fallback). */
    Speaker: string;
    Message: string;
    At: Date;
}

const escapeSql = (v: string): string => v.replace(/'/g, "''");
const toDate = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v ?? '')));

/**
 * Loads the meeting-room transcript LIST (light — no per-room detail load). Newest activity first.
 *
 * @param provider The request-scoped metadata provider.
 * @param maxRows Cap on rooms returned (default 500).
 */
export async function LoadMeetingRooms(provider: IMetadataProvider, maxRows = 500): Promise<MeetingRoomSummary[]> {
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<Record<string, unknown>>(
        {
            EntityName: CONVERSATION_ENTITY,
            ExtraFilter: `Type='Meeting Room'`,
            Fields: ['ID', 'Name', 'ExternalID', '__mj_CreatedAt', '__mj_UpdatedAt'],
            OrderBy: '__mj_UpdatedAt DESC',
            MaxRows: maxRows,
            ResultType: 'simple',
        },
        provider.CurrentUser,
    );
    if (!result.Success) {
        return [];
    }
    return result.Results.map((r) => ({
        ConversationID: String(r['ID']),
        Name: String(r['Name'] ?? 'Meeting Room'),
        RoomKey: String(r['ExternalID'] ?? ''),
        CreatedAt: toDate(r['__mj_CreatedAt']),
        LastActivity: toDate(r['__mj_UpdatedAt']),
    }));
}

/**
 * Loads + speaker-attributes one room's transcript. Resolves agent lines via `AgentID` (AIEngine cache) and
 * heard lines via the diarized `ExternalID` against the room's participant roster (so a `User` line reads as
 * the actual person, and another agent heard in the room reads as that agent — not a generic "User").
 *
 * @param provider The request-scoped metadata provider.
 * @param conversationID The room conversation id.
 * @param roomKey The room's external id (to load its bridge participants for attribution).
 */
export async function LoadRoomTranscript(
    provider: IMetadataProvider,
    conversationID: string,
    roomKey: string,
): Promise<TranscriptLine[]> {
    const rv = RunView.FromMetadataProvider(provider);
    const [detailResult, bridgeResult] = await rv.RunViews([
        {
            EntityName: CONVERSATION_DETAIL_ENTITY,
            ExtraFilter: `ConversationID='${escapeSql(conversationID)}'`,
            Fields: ['ID', 'Role', 'Message', 'AgentID', 'ExternalID', 'Error', '__mj_CreatedAt'],
            OrderBy: '__mj_CreatedAt ASC',
            MaxRows: 5000,
            ResultType: 'simple',
        },
        {
            EntityName: BRIDGE_ENTITY,
            ExtraFilter: roomKey ? `ExternalConnectionID='${escapeSql(roomKey)}'` : `1=0`,
            Fields: ['ID'],
            MaxRows: 100,
            ResultType: 'simple',
        },
    ], provider.CurrentUser);

    const participantNames = await loadParticipantNames(provider, rv, (bridgeResult?.Results ?? []).map((b) => String(b['ID'])));
    const agentName = buildAgentNameLookup();

    const details = detailResult?.Success ? detailResult.Results : [];
    return details.map((d) => attributeLine(d, participantNames, agentName));
}

/** roomBridges → a map of `ExternalParticipantID → { name, isAgent }` for diarized-line attribution. */
async function loadParticipantNames(
    provider: IMetadataProvider,
    rv: RunView,
    bridgeIds: string[],
): Promise<Map<string, { name: string; isAgent: boolean }>> {
    const map = new Map<string, { name: string; isAgent: boolean }>();
    if (bridgeIds.length === 0) {
        return map;
    }
    const inClause = bridgeIds.map((id) => `'${escapeSql(id)}'`).join(',');
    const result = await rv.RunView<Record<string, unknown>>(
        {
            EntityName: PARTICIPANT_ENTITY,
            ExtraFilter: `SessionBridgeID IN (${inClause})`,
            Fields: ['ExternalParticipantID', 'DisplayName', 'IsAgent'],
            MaxRows: 1000,
            ResultType: 'simple',
        },
        provider.CurrentUser,
    );
    if (result.Success) {
        for (const p of result.Results) {
            const id = String(p['ExternalParticipantID'] ?? '').toLowerCase();
            if (!id) {
                continue;
            }
            // Each agent appears on multiple bridges' rosters — `IsAgent=1` only on its OWN bridge (where it's
            // the bot), `IsAgent=0` where another agent merely heard it. OR-reduce so it resolves to an agent,
            // and keep the most specific (non-fallback) DisplayName we've seen for the identity.
            const isAgent = p['IsAgent'] === true;
            const name = String(p['DisplayName'] ?? '');
            const prev = map.get(id);
            map.set(id, {
                name: name || prev?.name || 'Participant',
                isAgent: (prev?.isAgent ?? false) || isAgent,
            });
        }
    }
    return map;
}

/** AgentID → agent name, from the AIEngine cache (agents are always loaded for the analytics shell). */
function buildAgentNameLookup(): Map<string, string> {
    const map = new Map<string, string>();
    for (const a of AIEngineBase.Instance.Agents ?? []) {
        map.set(a.ID.toLowerCase(), a.Name ?? 'Agent');
    }
    return map;
}

/**
 * Resolves one raw detail row into a display-ready, speaker-attributed line — the diarization-attribution
 * core. Exported for unit testing (the maps are easy to construct directly, no RunView mocking needed).
 *
 * @param d The raw `MJ: Conversation Details` row.
 * @param participantNames `ExternalParticipantID(lower) → { name, isAgent }` from the room roster.
 * @param agentName `AgentID(lower) → agent name`.
 */
export function attributeLine(
    d: Record<string, unknown>,
    participantNames: Map<string, { name: string; isAgent: boolean }>,
    agentName: Map<string, string>,
): TranscriptLine {
    const role = String(d['Role'] ?? 'User');
    const externalId = String(d['ExternalID'] ?? '').toLowerCase();
    const base = {
        ID: String(d['ID']),
        Message: String(d['Message'] ?? d['Error'] ?? ''),
        At: toDate(d['__mj_CreatedAt']),
    };
    if (role === 'Error') {
        return { ...base, Kind: 'error', Speaker: 'Error' };
    }
    if (role === 'AI') {
        const agentId = String(d['AgentID'] ?? '').toLowerCase();
        return { ...base, Kind: 'agent', Speaker: agentName.get(agentId) ?? 'Agent' };
    }
    // 'User' — diarized to a participant when we have the speaker label; another agent heard reads as agent.
    const participant = externalId ? participantNames.get(externalId) : undefined;
    if (participant) {
        return { ...base, Kind: participant.isAgent ? 'agent' : 'human', Speaker: participant.name };
    }
    return { ...base, Kind: 'human', Speaker: 'Participant' };
}
