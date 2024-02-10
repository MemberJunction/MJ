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
 * Defines the shape of the data that is expected by the Skip API Server when making a request
 */
export class SkipAPIRequest {
    /**
     * The user's input
     */
    userInput: string;
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
     */
    requestPhase: 'initial_request' | 'clarify_question_response' | 'data_gathering_response';
}

/**
 * Defines the shape of the data that is returned by the Skip API Server
 */
export class SkipAPIResponse {
    success: boolean;
    executionResults: SubProcessResponse | null;
    userExplanation: string;
    techExplanation: string;
    suggestedQuestions: string[] | null;
    reportTitle: string | null;
    analysis: string | null;
    scriptText: string | null;
    responsePhase: "clarifying_question" | "data_request" | "analysis_complete"
}
  
  
export class SkipDataContextFieldInfo {
    Name!: string;
    Type!: string;
    Description?: string;
}

export class SkipDataContextItem {
    Type!: 'view' | 'query' | 'full_entity';
    /**
     * The ID of the view, query, or entity in the system
     */
    RecordID!: number;
    /**
     * The name of the view, query, or entity in the system
     */
    RecordName!: string;
  
    /**
     * The name of the entity in the system, only used if type = 'full_entity' or type = 'view' --- for type of 'query' this is not used as query can come from any number of entities in combination
     */
    EntityName?: string;
    /*
    * The fields in the view, query, or entity
    */
    Fields: SkipDataContextFieldInfo[] = [];    
  
    /**
     * Generated description of the item  which is dependent on the type of the item
     */
    get Description(): string {
        switch (this.Type) {
            case 'view':
                return `View: ${this.RecordName}, From Entity: ${this.EntityName}`;
            case 'query':
                return `Query: ${this.RecordName}`;
            case 'full_entity':
                return `Full Entity - All Records: ${this.EntityName}`;
            default:
                return `Unknown Type: ${this.Type}`;
        }
    }
  
    /**
     * Populate the SkipDataContextItem from a UserViewEntity class instance
     * @param viewEntity 
     */
    public static FromViewEntity(viewEntity: UserViewEntityExtended) {
        const instance = new SkipDataContextItem();
        // update our data from the viewEntity definition
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
        return this.Data ? this.Data.length > 0 : false;
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
            sOutput += `data_item_${i}: []; // array of data items\n`;
        }
        return `{${sOutput}}`;
    }
}   
  