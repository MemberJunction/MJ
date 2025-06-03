/**
 * @fileoverview Specific API response types for Skip API
 * 
 * This file contains specialized response types that extend the base SkipAPIResponse for different
 * response phases and scenarios. These types define the structure for:
 * 
 * - Analysis completion responses (SkipAPIAnalysisCompleteResponse)
 * - Clarifying question responses (SkipAPIClarifyingQuestionResponse)  
 * - Data request responses (SkipAPIDataRequestResponse)
 * - Chat with record responses (SkipAPIChatWithRecordResponse)
 * - Drill-down functionality for components (SkipAPIAnalysisDrillDown, SkipAPIAnalysisDrillDownFilter)
 * 
 * Each response type corresponds to a specific responsePhase value and contains additional
 * properties relevant to that particular type of response. These specialized response types
 * allow clients to access type-safe, context-specific data based on the response phase.
 * 
 * The analysis complete response is particularly comprehensive, containing component data,
 * explanations, column metadata, drill-down information, and component options.
 * 
 * @author MemberJunction
 * @since 2.0.0
 */

import { SkipAPIResponse } from './api-types';
import type { SkipSubProcessResponse } from './conversation-types';
import type { SkipColumnInfo } from './entity-metadata-types';
import type { SkipDataRequest } from './query-types';
import type { SkipAPIArtifactRequest } from './artifact-types';
import { SimpleDataContext } from './shared';
import { SkipComponentOption } from './component-types';

/**
 * Defines an individual filter that will be used to filter the data in the view to the specific row or rows that the user clicked on for a drill down
 */
export class SkipAPIAnalysisDrillDownFilter {
    componentFieldName: string
    viewFieldName: string
}

/**
 * Defines the filtering information necessary for a component UI to enable behavior to drill down when a user clicks on a portion of a component like an element of a chart or a row in a table
 */
export class SkipAPIAnalysisDrillDown {
    /**
     * The name of the view in the database that we should drill into whenever a user clicks on an element in the component
     */
    viewName: string;
    /**
     * If the data context that was provided to Skip for generating a component had filtered data related to the drill down view noted in viewName property, then this
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
    /**
     * The data context that was passed in with the request, this is used to know the source data at the time the process was executed and for simple persistence.
     */
    dataContext: SimpleDataContext;
    /**
     * The type of component generated, data is a simple table, plot is a chart and html is a custom HTML component
     * For data/plot types, the results will be server-generated and available in the executionResults property
     * For html type, the executionResults will be null because the server generates an HTML component that is intended to run on the client.
     */
    resultType: "data" | "plot" | "html" | null;
    /**
     * The results of the execution of the sub-process to run the server-side script
     */
    executionResults?: SkipSubProcessResponse | null;
    /**
     * A user-friendly explanation of what the component does
     */
    userExplanation?: string;
    /**
     * A more detailed technical explanation of what the component does and how it works
     */
    techExplanation?: string;
    /**
     * Describes each column in the component's computed data output that is what is displayed in either a table or a chart
     */
    tableDataColumns?: SkipColumnInfo[];
    /**
     * Zero or more suggested questions that the AI engine suggests might be good follow up questions to ask after reviewing the provided component
     */
    suggestedQuestions?: string[] | null;
    /**
     * The title of the component
     */
    componentTitle?: string | null;
    /**
     * An analysis of the component, the data and the formatted component output.
     */
    analysis?: string | null;
    /**
     * Information that will support a drill-down experience in the component UI
     */
    drillDown?: SkipAPIAnalysisDrillDown | null;
    /**
     * The script text that was used to generated the component and can be saved to be run again later
     */
    scriptText?: string | null;
    /**
     * When provided, this array of data requests indicate to the caller of the Skip API that Skip was able to retrieve, on his own, additional data
     * BEYOND what was provided in the SkipAPIRequest object. The caller of the Skip API should update its internal representation of its data context
     * to include these new data items so that they will be run and provided to Skip for future iterations/requests and for re-running components as well.
     */
    newDataItems?: SkipDataRequest[];

    /**
     * Contains a list of all the possible components that were generated (1 or more) for the given request.
     */
    componentOptions?: SkipComponentOption[];

    /**
     * If the AI Agent decides it would be best to display the result in an artifact, this information can be used by the calling application to properly
     * associate this specific response with the artifact that is being created. This is typically used for output that is likely to have iterations where 
     * artifacts are a clean way of managing a UI in the calling application where you can show multiple versions/etc.
     */
    artifactRequest?: SkipAPIArtifactRequest;
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
 * Defines the shape of the data that is returned by the Skip API Server when the responsePhase is 'chat_with_a_record_complete'
 */
export class SkipAPIChatWithRecordResponse extends SkipAPIResponse {
    /**
     * The response from the AI model regarding the user request
     */
    response: string
}