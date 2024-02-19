import { EntityFieldInfo, EntityInfo, EntityRelationshipInfo } from '@memberjunction/core';
import { UserViewEntityExtended } from '@memberjunction/core-entities';
import { DataContext } from '@memberjunction/data-context';

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
    ConversationId: number;
  
    /**
     * The Conversation Detail ID for the inbound user message that was passed in with the request. 
     */
    UserMessageConversationDetailId: number;
  
    /**
     * The Conversation Detail ID for the outbound system message that was generated by the Skip API server, stored in the database by the MJ API server, 
     * and is being passed back here.
     */
    AIMessageConversationDetailId: number;
}


/**
 * Whenever Skip executes it's analysis phase, it uses a sandboxed sub-process to execute code securely and
 * this shape of data is used to communicate the results of that sub-process back to the Skip API server. 
 * This data type is in turn used within the SkipAPIAnalysisCompleteResponse type.
 */
export class SkipSubProcessResponse {
    status: "success" | "error";
    resultType: "data" | "plot" | "html" | null;
    tableData: any[] | null; // any array of objects
    plotData: { data: any[]; layout: any } | null; // Compatible with Plotly
    htmlReport: string | null;
    errorMessage: string | null;
}


/**
 * Defines the shape of the individual message that makes up the messages array that is passed back and 
 * forth with the Skip API Server
 */
export class SkipMessage {
    /**
     * The role of the message, either "user" or "system"
     */
    role: "user" | "system";
    /**
     * The content of the message, either the user's input or the system's response
     */
    content: string;
}



/**
 * For each Skip API Analysis result, it is possible for Skip to provide a set of tableDataColumns that describe the data that is being returned in this shape.
 */
export class SkipColumnInfo {
    fieldName: string;
    displayName: string;
    simpleDataType: 'string' | 'number' | 'date' | 'boolean';
    description: string;
}


/**
 * Describes the different request phases that are used to communicate with the Skip API Server
 * The phase of the conversation, defined as follows:
 * * initial_request: The initial request from the user - when a new conversation gets started or after a report is created, pass in this value
 * * clarify_question_response: Sometimes the Skip API server responds back to your request with a responsePhase of 'clarifying_question' - in this situation, the MJAPI server needs to communicate with the UI to ask the follow up question to the user. When you have that feedback from the user gathered and are providing the response to the clarifying question back to Skip API, use this requestPhase
 * * data_gathering_response: Sometimes the Skip API server responds back to your request with a responsePhase of 'data_request' - in this situation, the MJAPI server needs to process the data request, gather whatever additional data the Skip API has asked for, and then return it in the dataContext property of the SkipAPIRequest object. When you are finished gathering data and returning it to the Skip API server, use this requestPhase
 * * data_gathering_failure: When you send an API request to the Skip API server saying there was a data_gathering_failure that means that you attempted to retrieve data Skip requested but there was (typically) an error in the SQL statement that Skip generated and it needs to be regenerated. The MJAPI server code handles this scenario automatically.
 */
export const SkipRequestPhase = {
    initial_request: 'initial_request',
    clarify_question_response: 'clarify_question_response',
    data_gathering_response: 'data_gathering_response',
    data_gathering_failure: 'data_gathering_failure'
} as const;
export type SkipRequestPhase = typeof SkipRequestPhase[keyof typeof SkipRequestPhase];

export class SkipFieldInfo {
    entityID: number;
    sequence: number;
    name: string;
    displayName?: string;
    description?: string;
    isPrimaryKey: boolean;
    isUnique: boolean;
    category?: string;
    type: string;
    length: number;
    precision: number;
    scale: number;
    sqlFullType: string;
    allowsNull: boolean;
    defaultValue: string;
    autoIncrement: boolean;
    valueListType?: string;
    extendedType?: string;
    defaultInView: boolean;
    defaultColumnWidth: number;
    isVirtual: boolean;
    isNameField: boolean;
    relatedEntityID?: number;
    relatedEntityFieldName?: string;
    relatedEntity?: string;
    relatedEntitySchemaName?: string;
    relatedEntityBaseView?: string;
}

export class SkipEntityRelationshipInfo {
    entityID: number;
    relatedEntityID: number;
    type: string;
    entityKeyField: string;
    relatedEntityJoinField: string;
    joinView: string;
    joinEntityJoinField: string;
    joinEntityInverseJoinField: string;
    entity: string;
    entityBaseView: string;
    relatedEntity: string;
    relatedEntityBaseView: string;
}

export class SkipEntityInfo {
    id: number;
    name!: string;
    description?: string;
    schemaName!: string;
    baseView!: string;
    fields: SkipFieldInfo[] =[];
    relatedEntities: SkipEntityRelationshipInfo[] = [];
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
     * The data context, use this to provide all of the data you have in a data context to Skip. You should provide this from cache or refreshed based on the parameters provided by the user.
     */
    dataContext: DataContext;
    /**
     * Summary entity metadata that is passed into the Skip Server so that Skip has knowledge of the schema of the calling MJAPI environment
     */
    entities: SkipEntityInfo[];
    /**
     * The conversation ID
     */
    conversationID: string;
    /**
     * The organization ID - this is part of the Skip API Authentication Request, along with the bearer token in the header (the bearer token is not yet implemented, To-Do!)
     */
    organizationID: number;

    /**
     * The request phase, defined within the SkipRequestPhase type
     */
    requestPhase: SkipRequestPhase;
}


/**
 * Describes the different response phases that are used by the Skip API Server to respond back to the caller (usually the MJAPI server but can be anyone)
 * The response phase indicates if the Skip API server is asking for additional data, a clarifying question, or if the analysis is complete and the information has been provided
 * * clarifying_question: The Skip API server is asking for a clarifying question to be asked to the user - typecast the response to SkipAPIClarifyingQuestionResponse for all of the additional properties that are available in this response phase
 * * data_request: The Skip API server is asking for additional data to be gathered - typecast the response to SkipAPIDataRequestResponse for all of the additional properties that are available in this response phase
 * * analysis_complete: The Skip API server has completed the analysis and is providing the results - typecast the response to SkipAPIAnalysisCompleteResponse for all of the additional properties that are available in this response phase
 */
export const SkipResponsePhase = {
    clarifying_question: "clarifying_question",
    data_request: "data_request",
    analysis_complete: "analysis_complete"
} as const;
export type SkipResponsePhase = typeof SkipResponsePhase[keyof typeof SkipResponsePhase];


/**
 * Defines the shape of the data that is returned by the Skip API Server
 */
export class SkipAPIResponse {
    /**
     * Used for all response phases, to indicate if the API request was successful or not
     */
    success: boolean;
    /**
     * The Skip API server response phase, defined within the SkipResponsePhase type
     */
    responsePhase: SkipResponsePhase;
    /**
     * An array of messages including the messaged passed in with the SkipAPIRequest object as well as 
     * any additional messages that Skip generates as part of the conversation.
     */
    messages: SkipMessage[];
}

/**
 * Defines the shape of the data that is returned by the Skip API Server when the responsePhase is 'analysis_complete'
 */
export class SkipAPIAnalysisCompleteResponse extends SkipAPIResponse {
    executionResults?: SkipSubProcessResponse | null;
    userExplanation?: string;
    techExplanation?: string;
    tableDataColumns?: SkipColumnInfo[];
    suggestedQuestions?: string[] | null;
    reportTitle?: string | null;
    analysis?: string | null;
    scriptText?: string | null;
}

/**
 * Defines the shape of the data that is returned by the Skip API Server when the responsePhase is 'clarifying_question'
 */
export class SkipAPIClarifyingQuestionResponse extends SkipAPIResponse {
    clarifyingQuestion: string;
}

/**
 * Defines the shape of the data that is returned by the Skip API Server when the responsePhase is 'data_request'
 */
export class SkipAPIDataRequestResponse extends SkipAPIResponse {
    dataRequest: SkipDataRequest[];
}


/**
 * Describes the different types of data requests the Skip API server can make for additional data.
 * * sql: The Skip API server is asking for additional data to be gathered using a fully executable SQL statement
 * * stored_query: The Skip API server is asking for additional data to be gathered using a stored query that is defined in the system within the Queries entity.
 */
export const SkipDataRequestType = {
    sql: "sql",
    stored_query: "stored_query"
} as const;
export type SkipDataRequestType = typeof SkipDataRequestType[keyof typeof SkipDataRequestType];

  
/**
 * This type is used to define the requested data whenever the Skip API server asks for additional data to be gathered
 */
export class SkipDataRequest {
    /**
     * The type of request, as defined in the `SkipDataRequestType` type
     */
    type!: SkipDataRequestType;
    /**
     * The text of the request - either a fully executable SQL statement or the name of a stored query
     */
    text!: string;
    /**
     * A description of the request, why it was requested, and what it is expected to provide
     */
    description?: string;
}
