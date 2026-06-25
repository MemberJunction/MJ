/**
 * @fileoverview `CreateBridgeRoomTranscriptSink` — the app-layer implementation of the bridge engine's
 * transcript sink. Persists a **unified per-room meeting transcript** into `MJ: Conversations` (one
 * "Meeting Room" conversation per LiveKit room, keyed by the room's external id) + `MJ: Conversation Details`
 * (one row per final utterance). The bridge engine elects ONE scribe per room and feeds its final transcript
 * lines here, so the room records a single copy — not N (one per agent).
 *
 * Lives in `@memberjunction/ai-agents` (which owns the realtime/Conversations knowledge), NOT the bridge
 * engine — the engine only emits neutral lines + the `(ConversationType, ApplicationScope, ...)` choices come
 * from the binding site (the MJServer resolver), so nothing about "Meeting Room" or app scoping leaks into
 * the generic engine. See `plans/realtime/realtime-session-lifecycle-and-followups.md` §5.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { IMetadataProvider, UserInfo, RunView, LogError, LogStatus } from '@memberjunction/core';
import { MJConversationEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';

/** The conversation `ApplicationScope` values (mirrors the entity union). `'Application'` hides it from the main chat list. */
export type ConversationApplicationScope = 'Global' | 'Both' | 'Application';

/** Options that shape the room conversation — supplied by the binding site so the engine stays generic. */
export interface BridgeRoomTranscriptSinkOptions {
    /** The `MJ: Conversations.Type` to stamp (e.g. `'Meeting Room'`) — the semantic label for room transcripts. */
    ConversationType: string;
    /** Scope of the room conversation. `'Application'` keeps it OUT of the normal chat list. Default `'Application'`. */
    ApplicationScope?: ConversationApplicationScope;
    /** Optional owning application id (e.g. the Meet app) so its surface can list its rooms. */
    ApplicationID?: string;
    /**
     * Optional owning application NAME (e.g. `'Meet'`) — resolved to an id lazily on first use (cached), so
     * the binding site doesn't hardcode a seed GUID. Ignored when {@link ApplicationID} is supplied.
     */
    ApplicationName?: string;
}

/**
 * One transcript line the engine emits (structurally matches `BridgeTranscriptLine` in
 * `@memberjunction/ai-bridge-server`; mirrored here to avoid a package dependency, resolved structurally at
 * the resolver binding site).
 */
export interface BridgeTranscriptLineInput {
    /** The room grouping (driver external connection id) — one room = one unified transcript. */
    RoomKey: string;
    /** The scribe's agent-session id (attribution for its own speech). */
    AgentSessionID: string;
    /** The scribe's agent id, when known. */
    AgentID?: string;
    /** `true` for the scribe's OWN speech, `false` for anything it heard. */
    IsAgentSpeech: boolean;
    /** The speaker's participant id (the scribe's own bot id for its speech; absent for heard speech). */
    SpeakerParticipantID?: string;
    /** The final transcript text. */
    Text: string;
}

/** The sink signature (matches the engine's `BridgeTranscriptSink`). */
export type BridgeRoomTranscriptSink = (
    line: BridgeTranscriptLineInput,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
) => Promise<void>;

const CONVERSATION_ENTITY = 'MJ: Conversations';
const CONVERSATION_DETAIL_ENTITY = 'MJ: Conversation Details';

/**
 * Builds a {@link BridgeRoomTranscriptSink}. Bind the result onto `AIBridgeEngine.SetTranscriptSink(...)` at
 * startup. Internally caches the room→conversation mapping (lazy get-or-create), dedupes concurrent creates
 * per room, and serializes detail writes per conversation so transcript order is preserved.
 *
 * @param options The room-conversation shape (`Type`, scope, optional app id).
 * @returns The sink function.
 */
export function CreateBridgeRoomTranscriptSink(options: BridgeRoomTranscriptSinkOptions): BridgeRoomTranscriptSink {
    const scope: ConversationApplicationScope = options.ApplicationScope ?? 'Application';
    /** Lazily-resolved owning application id (explicit id wins; else resolved-by-name once and cached). */
    let resolvedApplicationID: string | undefined = options.ApplicationID;
    let applicationResolved = !!options.ApplicationID || !options.ApplicationName;
    /** roomKey(lower) → resolved ConversationID (populated once get-or-create settles). */
    const roomToConversation = new Map<string, string>();
    /** roomKey(lower) → in-flight get-or-create promise (dedupes concurrent first lines for a room). */
    const ensureInFlight = new Map<string, Promise<string | null>>();
    /** ConversationID → serial write chain (preserves detail ordering, error-isolated). */
    const writeChains = new Map<string, Promise<void>>();

    return async (line, contextUser, provider) => {
        if (!contextUser || !provider) {
            return; // a server-side write needs a user + provider; nothing to do without them
        }
        // Resolve the owning application by name once (e.g. 'Meet' → its id) so its surface can list the rooms.
        if (!applicationResolved) {
            applicationResolved = true; // attempt once; a miss just leaves it unlinked (still scoped-out of chat)
            resolvedApplicationID = (await resolveApplicationIdByName(options.ApplicationName!, contextUser, provider)) ?? undefined;
        }
        const conversationID = await ensureRoomConversation(line.RoomKey, options.ConversationType, scope, resolvedApplicationID, roomToConversation, ensureInFlight, contextUser, provider);
        if (!conversationID) {
            return;
        }
        const prior = writeChains.get(conversationID) ?? Promise.resolve();
        const next = prior.then(() => writeTranscriptDetail(conversationID, line, contextUser, provider));
        writeChains.set(conversationID, next.then(() => undefined, () => undefined));
        await next;
    };
}

/** Resolves (cache → existing row → create) the room's `MJ: Conversations` id, deduping concurrent creates. */
async function ensureRoomConversation(
    roomKey: string,
    conversationType: string,
    scope: ConversationApplicationScope,
    applicationID: string | undefined,
    cache: Map<string, string>,
    inFlight: Map<string, Promise<string | null>>,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<string | null> {
    const key = roomKey.trim().toLowerCase();
    const cached = cache.get(key);
    if (cached) {
        return cached;
    }
    const pending = inFlight.get(key);
    if (pending) {
        return pending;
    }
    const task = resolveOrCreateConversation(roomKey, conversationType, scope, applicationID, contextUser, provider)
        .then((id) => {
            if (id) {
                cache.set(key, id);
            }
            return id;
        })
        .finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
}

/** Finds an existing non-archived room conversation by `ExternalID` + `Type`, else creates one. */
async function resolveOrCreateConversation(
    roomKey: string,
    conversationType: string,
    scope: ConversationApplicationScope,
    applicationID: string | undefined,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<string | null> {
    const rv = new RunView();
    const found = await rv.RunView<{ ID: string }>({
        EntityName: CONVERSATION_ENTITY,
        ExtraFilter: `ExternalID='${escapeSql(roomKey)}' AND Type='${escapeSql(conversationType)}' AND (IsArchived IS NULL OR IsArchived=0)`,
        Fields: ['ID'],
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: 1,
        ResultType: 'simple',
    }, contextUser);
    if (found.Success && found.Results.length > 0) {
        return found.Results[0].ID;
    }

    const conversation = await provider.GetEntityObject<MJConversationEntity>(CONVERSATION_ENTITY, contextUser);
    conversation.NewRecord();
    conversation.UserID = contextUser.ID;
    conversation.Name = `Meeting Room ${roomKey}`;
    conversation.Type = conversationType;
    conversation.ExternalID = roomKey;
    conversation.ApplicationScope = scope;
    if (applicationID) {
        conversation.ApplicationID = applicationID;
    }
    if (await conversation.Save()) {
        LogStatus(`CreateBridgeRoomTranscriptSink: created '${conversationType}' conversation ${conversation.ID} for room ${roomKey}.`);
        return conversation.ID;
    }
    LogError(`CreateBridgeRoomTranscriptSink: failed to create room conversation: ${conversation.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return null;
}

/** Writes one `MJ: Conversation Details` row for a transcript line (Role mapped; agent speech attributed). */
async function writeTranscriptDetail(
    conversationID: string,
    line: BridgeTranscriptLineInput,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<void> {
    const detail = await provider.GetEntityObject<MJConversationDetailEntity>(CONVERSATION_DETAIL_ENTITY, contextUser);
    detail.NewRecord();
    detail.ConversationID = conversationID;
    // The scribe's own speech is the agent ('AI'); everything it heard (humans + other agents) is 'User'.
    detail.Role = line.IsAgentSpeech ? 'AI' : 'User';
    detail.Message = line.Text;
    if (line.SpeakerParticipantID) {
        detail.ExternalID = line.SpeakerParticipantID;
    }
    if (line.IsAgentSpeech) {
        detail.AgentSessionID = line.AgentSessionID;
        if (line.AgentID) {
            detail.AgentID = line.AgentID;
        }
    }
    if (!(await detail.Save())) {
        LogError(`CreateBridgeRoomTranscriptSink: failed to write transcript detail: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

/** Resolves an `MJ: Applications` id by Name (e.g. `'Meet'`). Returns `null` if absent (room stays unlinked). */
async function resolveApplicationIdByName(
    name: string,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<string | null> {
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: Applications',
        ExtraFilter: `Name='${escapeSql(name)}'`,
        Fields: ['ID'],
        MaxRows: 1,
        ResultType: 'simple',
    }, contextUser);
    if (result.Success && result.Results.length > 0) {
        return result.Results[0].ID;
    }
    LogStatus(`CreateBridgeRoomTranscriptSink: application '${name}' not found — room transcripts stay unlinked (still scoped out of normal chat).`);
    return null;
}

/** Escapes single quotes for safe embedding in an `ExtraFilter` literal. */
function escapeSql(value: string): string {
    return value.replace(/'/g, "''");
}
