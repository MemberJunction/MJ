import { gql } from "graphql-request";
import { GraphQLDataProvider } from "./graphQLDataProvider";

/** One persisted step of an agent run, as returned by the durable tail query. */
export interface ConversationRunEvent {
    /** Monotonic position within the run — the cursor value to page from. */
    Seq: number;
    StepType: string;
    StepName: string;
    Status: string;
    Success?: boolean;
    ErrorMessage?: string;
    StartedAt: string;
    CompletedAt?: string;
}

/** Result of one tail call. */
export interface ConversationTailResult {
    Success: boolean;
    Message: string;
    Events: ConversationRunEvent[];
    /** Cursor to pass as `sinceSeq` next time. Never rewinds. */
    LatestSeq: number;
    /** True while the run is still executing. False means terminal — stop tailing. */
    IsInFlight: boolean;
    RunID?: string;
    RunStatus?: string;
    /** The run's persisted result, populated only once the run is terminal. */
    FinalPayload?: string;
    /** `ConversationDetail.Status` — what the chat UI renders from. */
    DetailStatus?: string;
}

const TAIL_QUERY = gql`
    query TailConversationEvents($conversationDetailID: String!, $sinceSeq: Int) {
        TailConversationEvents(conversationDetailID: $conversationDetailID, sinceSeq: $sinceSeq) {
            Success
            Message
            Events {
                Seq
                StepType
                StepName
                Status
                Success
                ErrorMessage
                StartedAt
                CompletedAt
            }
            LatestSeq
            IsInFlight
            RunID
            RunStatus
            FinalPayload
            DetailStatus
        }
    }
`;

/**
 * Client for the durable, resumable read of a conversation's agent-run progress (MJ #4222).
 *
 * The `statusUpdates` subscription is the only live path a conversation has and it has no replay:
 * the server topic is an in-memory PubSub and the client subject is unbuffered. Anything published
 * while the socket was half-open is gone, and the client cannot tell "nothing happened" from
 * "I missed everything". This query is the durable counterpart — a client keeps the `LatestSeq`
 * it has seen and re-reads from there after any interruption.
 *
 * Runs over plain HTTP, so it works while the WebSocket is still dead. That is the property the
 * whole recovery path depends on.
 */
export class GraphQLConversationClient {
    private _dataProvider: GraphQLDataProvider;

    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Read agent-run events for a conversation detail from a cursor forward.
     *
     * @param conversationDetailID The message to tail.
     * @param sinceSeq Highest `Seq` already seen; 0 or omitted reads from the start.
     * @returns Never throws — a transport failure comes back as `Success: false` with the caller's
     *     cursor preserved, because this IS the recovery path and throwing from it would break the
     *     reconciliation it exists to serve.
     */
    public async TailConversationEvents(conversationDetailID: string, sinceSeq: number = 0): Promise<ConversationTailResult> {
        const from = Math.max(0, Math.floor(sinceSeq));
        try {
            const result = await this._dataProvider.ExecuteGQL(TAIL_QUERY, { conversationDetailID, sinceSeq: from });
            const response = (result as { TailConversationEvents?: ConversationTailResult })?.TailConversationEvents;
            if (!response) {
                return this.failure(from, 'Invalid response from server');
            }
            return {
                ...response,
                Events: response.Events ?? [],
                LatestSeq: typeof response.LatestSeq === 'number' ? response.LatestSeq : from
            };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return this.failure(from, `TailConversationEvents failed: ${message}`);
        }
    }

    private failure(sinceSeq: number, message: string): ConversationTailResult {
        return {
            Success: false,
            Message: message,
            Events: [],
            // Hold the caller's cursor. Resetting to 0 on a transient failure would replay the
            // whole run on the next successful call.
            LatestSeq: sinceSeq,
            // Fail safe: an unread run is assumed still running. Reporting terminal from a failed
            // read would let the caller mark a live message complete with no answer on it.
            IsInFlight: true
        };
    }
}
