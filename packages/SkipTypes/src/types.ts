import { EntityInfo } from '@memberjunction/core';
import { UserViewEntityExtended } from '@memberjunction/core-entities';
import { DataContext } from '@memberjunction/data-context';

export class SubProcessResponse {
    status: "success" | "error";
    resultType: "data" | "plot" | "html" | null;
    tableData: any[] | null; // any array of objects
    plotData: { data: any[]; layout: any } | null; // Compatible with Plotly
    htmlReport: string | null;
    analysis: string | null; // analysis of the data from the sub-process
    errorMessage: string | null;
}


/**
 * Defines the shape of the individual message that makes up the messages array that is passed back and forth with the Skip API Server
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
     * The conversation ID
     */
    conversationID: string;
    /**
     * The organization ID - this is part of the Skip API Authentication Request, along with the bearer token in the header (the bearer token is not yet implemented, To-Do!)
     */
    organizationID: number;

    /**
     * The phase of the conversation, defined as follows:
     * * initial_request: The initial request from the user - when a new conversation gets started or after a report is created, pass in this value
     * * clarify_question_response: Sometimes the Skip API server responds back to your request with a responsePhase of 'clarifying_question' - in this situation, the MJAPI server needs to communicate with the UI to ask the follow up question to the user. When you have that feedback from the user gathered and are providing the response to the clarifying question back to Skip API, use this requestPhase
     * * data_gathering_response: Sometimes the Skip API server responds back to your request with a responsePhase of 'data_request' - in this situation, the MJAPI server needs to process the data request, gather whatever additional data the Skip API has asked for, and then return it in the dataContext property of the SkipAPIRequest object. When you are finished gathering data and returning it to the Skip API server, use this requestPhase
     * * data_gathering_failure: When you send an API request to the Skip API server saying there was a data_gathering_failure that means that you attempted to retrieve data Skip requested but there was (typically) an error in the SQL statement that Skip generated and it needs to be regenerated. The MJAPI server code handles this scenario automatically.
     */
    requestPhase: 'initial_request' | 'clarify_question_response' | 'data_gathering_response' | 'data_gathering_failure';
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
     * The response phase indicates if the Skip API server is asking for additional data, a clarifying question, or if the analysis is complete and the information has been provided
     * * clarifying_question: The Skip API server is asking for a clarifying question to be asked to the user - typecast the response to SkipAPIClarifyingQuestionResponse for all of the additional properties that are available in this response phase
     * * data_request: The Skip API server is asking for additional data to be gathered - typecast the response to SkipAPIDataRequestResponse for all of the additional properties that are available in this response phase
     * * analysis_complete: The Skip API server has completed the analysis and is providing the results - typecast the response to SkipAPIAnalysisCompleteResponse for all of the additional properties that are available in this response phase
     */
    responsePhase: "clarifying_question" | "data_request" | "analysis_complete"
    messages: SkipMessage[];
}

/**
 * Defines the shape of the data that is returned by the Skip API Server when the responsePhase is 'analysis_complete'
 */
export class SkipAPIAnalysisCompleteResponse extends SkipAPIResponse {
    executionResults?: SubProcessResponse | null;
    userExplanation?: string;
    techExplanation?: string;
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
 * This type is used to define the requested data whenever the Skip API server asks for additional data to be gathered
 */
export class SkipDataRequest {
    /**
     * The type of request, either "sql" or "stored_query". Stored query refers to the name of a query that is stored in the system and can be executed to gather data. SQL refers to a fully executable SQL statement that can be executed to gather data.
     */
    type!: "sql" | "stored_query"
    /**
     * The text of the request - either a fully executable SQL statement or the name of a stored query
     */
    text!: string;
    /**
     * A description of the request, why it was requested, and what it is expected to provide
     */
    description?: string;
}
