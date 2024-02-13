import { EntityInfo } from '@memberjunction/core';
import { UserViewEntityExtended } from '@memberjunction/core-entities';

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
    dataContext: SkipDataContext;
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
  
export class SkipDataContextFieldInfo {
    Name!: string;
    Type!: string;
    Description?: string;
}

export class SkipDataContextItem {
    /**
     * The type of the item, either "view", "query", "full_entity", or "sql", or "single_record"
     */
    Type!: 'view' | 'query' | 'full_entity' | 'sql' | 'single_record';

    /**
     * The ID of the view, query, entity, or single record in the system
     */
    RecordID!: number;

    /**
     * The name of the view, query, or entity in the system. If Type = sql, this is the full SQL statement
     */
    RecordName!: string;
  
    /**
     * The name of the entity in the system, only used if type = 'full_entity', 'view', or 'single_record' --- for type of 'query' or 'sql' this property is not used as results can come from any number of entities in combination
     */
    EntityName?: string;

    /*
    * The fields in the view, query, or entity
    */
    Fields: SkipDataContextFieldInfo[] = [];    

    /**
     * This field can be used at run time to stash the record ID in the database of the Data Context Item, if it was already saved. For items that haven't/won't be saved, this property can be ignored.
     */
    DataContextItemID?: number;

    /**
     * ViewEntity - the object instantiated that contains the metadata for the UserView being used - only populated if the type is 'view', also this is NOT to be sent to/from the API server, it is a placeholder that can be used 
     *              within a given tier like in the MJAPI server or Skip Server or in the UI.
     */
    ViewEntity?: UserViewEntityExtended;

    /**
     * Entity - the object that contains metadata for the entity being used, only populated if the type is 'full_entity' or 'view' - also this is NOT to be sent to/from the API server, it is a placeholder that can be used
     *          within a given tier like in the MJAPI server or Skip Server or in the UI.
     */
    Entity?: EntityInfo;

    /** Additional Description has any other information that might be useful for someone (or an LLM) intepreting the contents of this data item */
    AdditionalDescription?: string;

    /**
     * Generated description of the item  which is dependent on the type of the item
     */
    get Description(): string {
        let ret: string = '';
        switch (this.Type) {
            case 'view':
                ret = `View: ${this.RecordName}, From Entity: ${this.EntityName}`;
                break;
            case 'query':
                ret = `Query: ${this.RecordName}`;
                break;
            case 'full_entity':
                ret = `Full Entity - All Records: ${this.EntityName}`;
                break;
            case 'sql':
                ret = `SQL Statement: ${this.RecordName}`;
                break;
            default:
                ret = `Unknown Type: ${this.Type}`;
                break;
        }
        if (this.AdditionalDescription && this.AdditionalDescription.length > 0) 
            ret += ` (More Info: ${this.AdditionalDescription})`;
        return ret;
    }
  
    /**
     * Populate the SkipDataContextItem from a UserViewEntity class instance
     * @param viewEntity 
     */
    public static FromViewEntity(viewEntity: UserViewEntityExtended) {
        const instance = new SkipDataContextItem();
        // update our data from the viewEntity definition
        instance.ViewEntity = viewEntity;
        instance.Entity = viewEntity.ViewEntityInfo;
        instance.Type= 'view';
        instance.EntityName = viewEntity.ViewEntityInfo.Name;
        instance.RecordID = viewEntity.ID;
        instance.RecordName = viewEntity.Name;
        instance.Fields = viewEntity.ViewEntityInfo.Fields.map(f => {
            return {
                Name: f.Name,
                Type: f.Type,
                Description: f.Description
            }
        });
        return instance;
    }


  
    Data?: any[];
  
    public ValidateDataExists(): boolean {
        return this.Data ? this.Data.length >= 0 : false; // can have 0 to many rows, just need to make sure we have a Data object to work with
    }
}

export class SkipDataContext {
    Items: SkipDataContextItem[] = [];
  
    public ValidateDataExists(): boolean {
        if (this.Items)
            return !this.Items.some(i => !i.ValidateDataExists()); // if any data item is invalid, return false
        else    
            return false;
    }
  
    public ConvertToSimpleObject(): any {
        // Return a simple object that will have a property for each item in our Items array. We will name each item sequentially as data_item_1, data_item_2, etc.
        const ret: any = {};
        for (let i = 0; i < this.Items.length; i++) {
            ret[`data_item_${i}`] = this.Items[i].Data;
        }
        return ret;
    }
  
    public CreateSimpleObjectTypeDefinition(): string {
        let sOutput: string = "";
        for (let i = 0; i < this.Items.length; i++) {
            const item = this.Items[i];
            sOutput += `data_item_${i}: []; // ${item.Description}\n`;
        }
        return `{${sOutput}}`;
    }
}   
  