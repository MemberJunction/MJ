/**
 * This file contains the fundamental API request and response types used for communication
 * between client applications and the Skip API server. These types define the core data
 * structures for:
 * 
 * - Main API requests and responses (SkipAPIRequest, SkipAPIResponse)
 * - API result wrapper for MJ API server responses (MJAPISkipResult)
 * - Request and response phase enumerations
 * - Special API request types (SkipAPIRunScriptRequest)
 * 
 * These types form the foundation of the Skip API communication protocol and are used
 * across all Skip API interactions regardless of the specific functionality being invoked.
 */

import { DataContext } from '@memberjunction/data-context';
import type { SkipMessage } from './conversation-types';
import type { SkipEntityInfo } from './entity-metadata-types';
import type { SkipQueryInfo } from './query-types';
import type { SkipAPIRequestAPIKey } from './auth-types';
import type { SkipAPIArtifact } from './artifact-types';
import type { SkipAPIAgentNote, SkipAPIAgentNoteType } from './agent-types';

/**
 * Describes the different request phases that are used to communicate with the Skip API Server
 * The phase of the conversation, defined as follows:
 * * initial_request: The initial request from the user - when a new conversation gets started or after a report is created, pass in this value
 * * clarify_question_response: Sometimes the Skip API server responds back to your request with a responsePhase of 'clarifying_question' - in this situation, the MJAPI server needs to communicate with the UI to ask the follow up question to the user. When you have that feedback from the user gathered and are providing the response to the clarifying question back to Skip API, use this requestPhase
 * * data_gathering_response: Sometimes the Skip API server responds back to your request with a responsePhase of 'data_request' - in this situation, the MJAPI server needs to process the data request, gather whatever additional data the Skip API has asked for, and then return it in the dataContext property of the SkipAPIRequest object. When you are finished gathering data and returning it to the Skip API server, use this requestPhase
 * * data_gathering_failure: When you send an API request to the Skip API server saying there was a data_gathering_failure that means that you attempted to retrieve data Skip requested but there was (typically) an error in the SQL statement that Skip generated and it needs to be regenerated. The MJAPI server code handles this scenario automatically.
 * * run_existing_script: Use this to run an existing script that was already processed. When this option is used, the script provided is run and the results are provided in the response.
 * * chat_with_a_record: This is used for the simple record chatting feature that is separate from other Skip API features. This is used for having a chat conversation with Skip about a specific record in the database that the user is typically looking at in a UI.
 */
export const SkipRequestPhase = {
    initial_request: 'initial_request',
    clarify_question_response: 'clarify_question_response',
    data_gathering_response: 'data_gathering_response',
    data_gathering_failure: 'data_gathering_failure',
    run_existing_script: 'run_existing_script',
    chat_with_a_record: 'chat_with_a_record'
} as const;
export type SkipRequestPhase = typeof SkipRequestPhase[keyof typeof SkipRequestPhase];

/**
 * Describes the different response phases that are used by the Skip API Server to respond back to the caller (usually the MJAPI server but can be anyone)
 * The response phase indicates if the Skip API server is asking for additional data, a clarifying question, or if the analysis is complete and the information has been provided
 * * queued: The request is waiting in the queue (sent by queue infrastructure, not Skip API) - indicates queue position and estimated wait time
 * * status_update: The Skip API server is providing a status update during processing
 * * clarifying_question: The Skip API server is asking for a clarifying question to be asked to the user - typecast the response to SkipAPIClarifyingQuestionResponse for all of the additional properties that are available in this response phase
 * * data_request: The Skip API server is asking for additional data to be gathered - typecast the response to SkipAPIDataRequestResponse for all of the additional properties that are available in this response phase
 * * analysis_complete: The Skip API server has completed the analysis and is providing the results - typecast the response to SkipAPIAnalysisCompleteResponse for all of the additional properties that are available in this response phase
 * * chat_with_a_record_complete: The Skip API server has completed the chat with a record and is providing the results - typecast the response to SkipAPIChatWithRecordResponse for all of the additional properties that are available in this response phase
 */
export const SkipResponsePhase = {
    queued: "queued",
    status_update: "status_update",
    clarifying_question: "clarifying_question",
    data_request: "data_request",
    analysis_complete: "analysis_complete",
    chat_with_a_record_complete: "chat_with_a_record_complete"
} as const;
export type SkipResponsePhase = typeof SkipResponsePhase[keyof typeof SkipResponsePhase];

/**
 * This type defines the shape of data that is passed back from the MJ API server to callers, typically the MJ Explorer UI
 */
export class MJAPISkipResult {
    /**
     * Indicates if the API request was successful or not, true if successful, false if not
     */
    Success: boolean;
  
    /**
     * Contains a more detailed status of the API request. This is typically used to provide additional information about the request, such as an error message if the request was not successful
     */
    Status: string; // required
  
    /**
     * The phase of the conversation, defined in the SkipResponsePhase type
     */
    ResponsePhase: SkipResponsePhase;

    /**
     * Contains the JSON data that is returned from the Skip API server. 
     * This can be a SkipAPIAnalysisCompleteResponse, SkipAPIClarifyingQuestionResponse, or SkipAPIDataRequestResponse.
     * To determine which type it is and to access the properties of the response, you will need to typecast 
     * this property to the appropriate type. For example:
     * 
     * if (result.ResponsePhase === 'analysis_complete') {
     *    // typecast the MJAPISkipResult object Result property
     *    const resultData = <SkipAPIAnalysisCompleteResponse>JSON.parse(result.Result);
     *    // now you can access the properties of the SkipAPIAnalysisCompleteResponse type in a strongly typed manner
     *    // and do whatever you want to do.
     * }
     */
    Result: string;
  
    /**
     * The MemberJunction Conversation ID assigned to this conversation. This is used to track the 
     * conversation in the database, used for conversation history, and will be generated by the MJ API server if
     * no existing Conversation ID was passed in with the request.
     */
    ConversationId: string;
  
    /**
     * The Conversation Detail ID for the inbound user message that was passed in with the request. 
     */
    UserMessageConversationDetailId: string;
  
    /**
     * The Conversation Detail ID for the outbound system message that was generated by the Skip API server, stored in the database by the MJ API server, 
     * and is being passed back here.
     */
    AIMessageConversationDetailId: string;
}

/**
 * Defines the shape of the data that is expected by the Skip API Server when making a request
 */
export class SkipAPIRequest {
    /**
     * An array of 1 or more messages that are part of the conversation. The Skip API server will use these messages to understand the context of the conversation. 
     * When Skip responds to a request, he provides a messages array as well that will include the input messages as well as additional messages that he has generated as part of the conversation.
     * In future requests for the same conversation it is important to include ALL of the messages that have been part of the conversation so far, so that Skip can understand the full context of the conversation.
     */
    messages: SkipMessage[];

    /**
     * This is an optional string parameter where you can tell Skip anything you'd like to share about your organization, structure, database schema, and anything else
     * that might be helpful for him to be aware of. Keep in mind that this organizationInfo will be incorprorated into every request Skip makes to the underlying AI
     * services which can add cost and processing time to your requests. Including this information is extremely helpful as a very simple method of 
     * contextualizing Skip for your organization. In the Pro and above Skip plans, there are far more granular and effect methods of training Skip beyond this organizationInfo parameter, contact
     * the team at MemberJunction.com for more information if you're interested.
     */
    organizationInfo?: string;
    
    /**
     * The data context, use this to provide all of the data you have in a data context to Skip. You should provide this from cache or refreshed based on the parameters provided by the user.
     */
    dataContext?: DataContext;
    /**
     * Summary entity metadata that is passed into the Skip Server so that Skip has knowledge of the schema of the calling MJAPI environment
     */
    entities: SkipEntityInfo[];
    /**
     * Stored queries in the MJ metadata that Skip can use and learn from
     */
    queries: SkipQueryInfo[];

    /**
     * The conversation ID
     */
    conversationID: string;

    /**
     * The user email of the person making the request - this is part of the Skip API Authentication Request, along with the bearer token in the header
     */
    userEmail: string;  

    /**
     * The organization ID - this is part of the Skip API Authentication Request, along with the bearer token in the header
     */
    organizationID: string;

    /**
     * The request phase, defined within the SkipRequestPhase type
     */
    requestPhase: SkipRequestPhase;

    /**
     * One or more API keys that are used for AI systems that Skip will access on behalf of the API caller
     * NOTE: This is not where you put in the bearer token for the Skip API server itself, that goes in the header of the request
     */
    apiKeys: SkipAPIRequestAPIKey[];

    /**
     * Optional, array of artifacts that already exist for the given conversation. 
     */
    artifacts?: SkipAPIArtifact[];

    /**
     * Optional notes that can be passed to Skip for additional context
     */
    notes?: SkipAPIAgentNote[];

    /**
     * Optional, list of the possible types of notes that an agent can store in the source MJ system
     */
    noteTypes?: SkipAPIAgentNoteType[];

    /**
     * Optional, if the calling server wants to enable the AI agent to call back to interact and request data or otherwise, this is the URL that the AI agent can use to call back to the source server
     */
    callingServerURL?: string

    /**
     * Optional, if the calling server wants to enable the AI agent to call back to interact and request data or otherwise, this is the API key that the AI agent can use to call back to the source server
     */
    callingServerAPIKey?: string

    /**
     * Optional, if the calling server requires the use of an additional short-lived access token beyond the API key, this is the token that the AI agent can use to call back to the source server during the lifecycle
     * of the request
     */
    callingServerAccessToken?: string;

    /**
     * Optional payload data that was returned from a previous response. When the Skip API returns a response
     * with a payload (e.g., a PRD from Requirements Expert), the client should pass that payload back in the
     * next request so the agent can continue building on it.
     *
     * This enables incremental artifact building where structured data accumulates throughout the conversation.
     * The payload is separate from artifacts - it represents work-in-progress data that hasn't been finalized yet.
     */
    payload?: Record<string, any>;
}

/**
 * Defines the shape of the data that is returned by the Skip API Server
 */
export class SkipAPIResponse {
    /**
     * Used for all response phases, to indicate if the API request was successful or not
     */
    success: boolean;
    /**
     * This property is only used if success is false, and contains an error message that describes the reason for the failure
     */
    error: string;
    /**
     * The Skip API server response phase, defined within the SkipResponsePhase type
     */
    responsePhase: SkipResponsePhase;
    /**
     * An array of messages including the messaged passed in with the SkipAPIRequest object as well as
     * any additional messages that Skip generates as part of the conversation.
     */
    messages: SkipMessage[];

    /**
     * Optional payload data from the agent. When provided, the calling application can render this
     * payload as an artifact for the user to review/edit. This enables incremental artifact building
     * where the payload is passed back and forth between the user and agent, accumulating structured
     * data throughout the conversation.
     *
     * Common use case: Requirements Expert emits a PRD with functionalRequirements, title, type,
     * userExplanation etc. in the payload. The client renders this as an artifact for user review.
     * When user responds, the client passes the payload back in the next SkipAPIRequest.payload field.
     */
    payload?: Record<string, any>;
}

/**
 * Special API request type that extends the base SkipAPIRequest to include script execution capabilities.
 * Used when the requestPhase is 'run_existing_script' to execute pre-defined script text.
 */
export class SkipAPIRunScriptRequest extends SkipAPIRequest {
    /**
     * The script text to run
     */
    scriptText: string;
}