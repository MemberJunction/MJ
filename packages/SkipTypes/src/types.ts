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
 * * run_existing_script: Use this to run an existing script that was already processed. When this option is used, the script provided is run and the results are provided in the response.
 */
export const SkipRequestPhase = {
    initial_request: 'initial_request',
    clarify_question_response: 'clarify_question_response',
    data_gathering_response: 'data_gathering_response',
    data_gathering_failure: 'data_gathering_failure',
    run_existing_script: 'run_existing_script'
} as const;
export type SkipRequestPhase = typeof SkipRequestPhase[keyof typeof SkipRequestPhase];

export class SkipEntityFieldInfo {
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
    fields: SkipEntityFieldInfo[] =[];
    relatedEntities: SkipEntityRelationshipInfo[] = [];
}

export class SkipQueryInfo {
    id: number;
    name: string;
    description: string;
    categoryID: number;
    sql: string;
    originalSQL: string;
    feedback: string;
    status: 'Pending' | 'In-Review' | 'Approved' | 'Rejected' | 'Obsolete';
    qualityRank: number;
    createdAt: Date;
    updatedAt: Date;
    category: string;
    fields: SkipQueryFieldInfo[];
}
export class SkipQueryFieldInfo {
    name: string;
    queryID: number;
    description: string;
    sequence: number;
    /**
     * The base type, not including parameters, in SQL. For example this field would be nvarchar or decimal, and wouldn't include type parameters. The SQLFullType field provides that information.
     */
    sqlBaseType: string;
    /**
     * The full SQL type for the field, for example datetime or nvarchar(10) etc.
     */
    sqlFullType: string;
    sourceEntityID: number;
    sourceFieldName: string;
    isComputed: boolean;
    computationDescription: string;
    isSummary: boolean;
    summaryDescription: string;
    createdAt: Date;
    updatedAt: Date;
    sourceEntity: string;
}


export class SkipAPIRequestAPIKey {
    /**
     * These are the supported LLM vendors that Skip can use. These driver names map to the
     * registered classes in the MemberJunction AI namespace for example the @memberjunction/ai-openai package includes
     * a class called OpenAILLM that is registered with the MemberJunction AI system as a valid sub-class of BaseLLM
     */
    vendorDriverName: 'OpenAILLM' | 'MistralLLM' | 'GeminiLLM' | 'AnthropicLLM' | 'GroqLLM';
    /**
     * This is the actual API key for the specified vendor. 
     * NOTE: Skip NEVER stores this information, it is only used to make requests to the AI vendor of choice
     */
    apiKey: string;
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
    dataContext: DataContext;
    /**
     * Summary entity metadata that is passed into the Skip Server so that Skip has knowledge of the schema of the calling MJAPI environment
     */
    entities: SkipEntityInfo[];
    /**
     * 
     */
    queries: SkipQueryInfo[];

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

    /**
     * One or more API keys that are used for AI systems that Skip will access on behalf of the API caller
     * NOTE: This is not where you put in the bearer token for the Skip API server itself, that goes in the header of the request
     */
    apiKeys: SkipAPIRequestAPIKey[];
}

export class SkipAPIRunScriptRequest extends SkipAPIRequest {
    /**
     * The script text to run
     */
    scriptText: string;
}

/**
 * Describes the different response phases that are used by the Skip API Server to respond back to the caller (usually the MJAPI server but can be anyone)
 * The response phase indicates if the Skip API server is asking for additional data, a clarifying question, or if the analysis is complete and the information has been provided
 * * clarifying_question: The Skip API server is asking for a clarifying question to be asked to the user - typecast the response to SkipAPIClarifyingQuestionResponse for all of the additional properties that are available in this response phase
 * * data_request: The Skip API server is asking for additional data to be gathered - typecast the response to SkipAPIDataRequestResponse for all of the additional properties that are available in this response phase
 * * analysis_complete: The Skip API server has completed the analysis and is providing the results - typecast the response to SkipAPIAnalysisCompleteResponse for all of the additional properties that are available in this response phase
 */
export const SkipResponsePhase = {
    status_update: "status_update",
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
}

/**
 * Defines an individual filter that will be used to filter the data in the view to the specific row or rows that the user clicked on for a drill down
 */
export class SkipAPIAnalysisDrillDownFilter {
    reportFieldName: string
    viewFieldName: string
}

/**
 * Defines the filtering information necessary for a reporting UI to enable behavior to drill down when a user clicks on a portion of a report like an element of a chart or a row in a table
 */
export class SkipAPIAnalysisDrillDown {
    /**
     * The name of the view in the database that we should drill into whenever a user clicks on an element in the report
     */
    viewName: string;
    /**
     * If the data context that was provided to Skip for generating a report had filtered data related to the drill down view noted in viewName property, then this
     * baseFilter value will be populated with a SQL filter that can be added to a WHERE clause with an AND statement to ensure that the filtering is inclusive of the 
     * data context's in-built filters.
     */
    baseFilter: string;
    /**
     * One or more filters that are used to filter the data in the view to the specific row or rows that the user clicked on
     */
    filters: SkipAPIAnalysisDrillDownFilter[];
}

/**
 * Defines the shape of the data that is returned by the Skip API Server when the responsePhase is 'analysis_complete'
 */
export class SkipAPIAnalysisCompleteResponse extends SkipAPIResponse {
    executionResults?: SkipSubProcessResponse | null;
    /**
     * A user-friendly explanation of what the report does
     */
    userExplanation?: string;
    /**
     * A more detailed technical explanation of what the report does and how it works
     */
    techExplanation?: string;
    /**
     * Describes each column in the report's computed data output that is what is displayed in either a table or a chart
     */
    tableDataColumns?: SkipColumnInfo[];
    /**
     * Zero or more suggested questions that the AI engine suggests might be good follow up questions to ask after reviewing the provided report
     */
    suggestedQuestions?: string[] | null;
    /**
     * The title of the report
     */
    reportTitle?: string | null;
    /**
     * An analysis of the report, the data and the formatted report output.
     */
    analysis?: string | null;
    /**
     * Information that will support a drill-down experience in the reporting UI
     */
    drillDown?: SkipAPIAnalysisDrillDown | null;
    /**
     * The script text that was used to generated the report and can be saved to be run again later
     */
    scriptText?: string | null;
}

/**
 * Defines the shape of the data that is returned by the Skip API Server when the responsePhase is 'clarifying_question'
 */
export class SkipAPIClarifyingQuestionResponse extends SkipAPIResponse {
    /**
     * The question to display to the user from the AI model after a request is made to the AI when the AI needs more information to process the request
     */
    clarifyingQuestion: string;
    /**
     * Zero or more suggested answers that the AI model suggests might be good responses to the clarifying question
     */
    suggestedAnswers: string[];
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
