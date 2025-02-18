import { BaseEntity, CodeNameFromString, EntityInfo, EntitySaveOptions, LogError, Metadata, RunView } from "@memberjunction/core";
import { ActionLibraryEntity, ActionParamEntity, ActionResultCodeEntity } from "@memberjunction/core-entities";
import { CleanJSON, MJEventType, MJGlobal, RegisterClass } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";

import { BaseLLM, ChatMessage, ChatParams, GetAIAPIKey } from "@memberjunction/ai";
import { DocumentationEngine, LibraryEntityExtended, LibraryItemEntityExtended } from "@memberjunction/doc-utils";
import { ActionEngineBase, ActionEntityExtended, ActionLibrary, GeneratedCode } from "@memberjunction/actions-base";

/**
 * Server-Only custom sub-class for Actions entity. This sub-class handles the process of auto-generation code for the Actions entity.
 */
@RegisterClass(BaseEntity, 'Actions') // high priority make sure this class is used ahead of other things
export class ActionEntityServerEntity extends ActionEntityExtended {
    constructor(Entity: EntityInfo) {
        super(Entity); // call super

        const md = new Metadata();
        if (md.ProviderType !== 'Database')
            throw new Error('This class is only supported for server-side/database providers. Remove this package from your application.');
    }
    /**
     * Default implementation simply returns 'OpenAI' - override this in your subclass if you are using a different AI vendor.
     * @returns
     */
    protected get AIVendorName(): string {
        return 'OpenAI';
    }


    /**
     * Override of the base Save method to handle the pre-processing to auto generate code whenever an action's UserPrompt is modified.
     * This happens when a new record is created and also whenever the UserPrompt field is changed.
     * @param options
     * @returns
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // make sure the ActionEngine is configured
        await ActionEngineBase.Instance.Config(false, this.ContextCurrentUser);
        await DocumentationEngine.Instance.Config(false, this.ContextCurrentUser);

        let newCodeGenerated: boolean = false;
        let codeLibraries: ActionLibrary[] = [];
        if ( this.Type === 'Generated' && // only generate when the type is Generated
             !this.CodeLocked && // only generate when the code is not locked
             (this.GetFieldByName('UserPrompt').Dirty || !this.IsSaved || this.ForceCodeGeneration)  // only generate when the UserPrompt field is dirty or this is a new record or we are being asked to FORCE code generation
           ) {
            // UserPrompt field is dirty, or this is a new record, either way, this is the condition where we want to generate the Code.
            const result = await this.GenerateCode();
            if (result.Success) {
                this.Code = result.Code;
                this.CodeComments = result.Comments;
                this.CodeApprovalStatus = 'Pending'; // set to pending even if previously approved since we changed the code
                this.CodeApprovedAt = null; // reset the approved at date
                this.CodeApprovedByUserID = null; // reset the approved by user id
                newCodeGenerated = true; // flag for post-save processing of libraries
                codeLibraries = result.LibrariesUsed;
            }
            else
                throw new Error(`Failed to generate code for Action ${this.Name}.`);
        }

        this.ForceCodeGeneration = false; // make sure to reset this flag every time we save, it should never live past one run of the Save method, of course if Save fails, below, then it will not be reset
        const wasNewRecord = !this.IsSaved;
        if (await super.Save(options)) {
            if (newCodeGenerated)
                return this.manageLibraries(codeLibraries, wasNewRecord);
            else
                return true;
        }
        else
            return false;
    }

    protected async manageLibraries(codeLibraries: ActionLibrary[], wasNewRecord: boolean): Promise<boolean> {
        // new code was generated, we need to sync up the ActionLibraries table with the libraries used in the code for this Action
        // get a list of existing ActionLibrary records that match this Action
        const existingLibraries: ActionLibraryEntity[] = [];
        if (!wasNewRecord) {
            const rv = new RunView();
            const libResult = await rv.RunView(
                {
                    EntityName: 'Action Libraries',
                    ExtraFilter: `ActionID = '${this.ID}'`,
                    ResultType: 'entity_object'
                },
                this.ContextCurrentUser
            );
            if (libResult.Success && libResult.Results.length > 0) {
                existingLibraries.push(...libResult.Results);
            }
        }

        // now we need to go through the libraries we ARE currently using in the current code and make sure they are in the ActionLibraries table
        // and make sure nothing is in the table that we are not using
        const librariesToAdd = codeLibraries.filter(l => !existingLibraries.some(el => el.Library.trim().toLowerCase() === l.LibraryName.trim().toLowerCase()));
        const librariesToRemove = existingLibraries.filter(el => !codeLibraries.some(l => l.LibraryName.trim().toLowerCase() === el.Library.trim().toLowerCase()));
        const librariesToUpdate = existingLibraries.filter(el => codeLibraries.some(l => l.LibraryName.trim().toLowerCase() === el.Library.trim().toLowerCase()));
        const md = new Metadata();
        const tg = await md.CreateTransactionGroup();
        for (const lib of librariesToAdd) {
            const libMetadata = md.Libraries.find(l => l.Name.trim().toLowerCase() === lib.LibraryName.trim().toLowerCase());
            if (libMetadata) {
                const newLib = await md.GetEntityObject<ActionLibraryEntity>('Action Libraries', this.ContextCurrentUser);
                newLib.ActionID = this.ID;
                newLib.LibraryID = libMetadata.ID;
                newLib.ItemsUsed = lib.ItemsUsed.join(',');
                newLib.TransactionGroup = tg;
                await newLib.Save(); 
            }
        }

        // now update the libraries that were already in place to ensure the ItemsUsed are up to date
        for (const lib of librariesToUpdate) {
            const newCode = codeLibraries.find(l => l.LibraryName.trim().toLowerCase() === lib.Library.trim().toLowerCase());
            lib.ItemsUsed = newCode.ItemsUsed.join(',');
            lib.TransactionGroup = tg;
            await lib.Save();  
        }

        // now remove the libraries that are no longer used
        for (const lib of librariesToRemove) {
            // each lib in this array iteration is already a BaseEntity derived object
            lib.TransactionGroup = tg;
            await lib.Delete();  
        }

        // now commit the transaction
        if (await tg.Submit())
            return true;
        else
            return false;
    }

    protected SendMessage(message: string) {
        MJGlobal.Instance.RaiseEvent({
            args: { message },
            eventCode: 'Actions',
            event: MJEventType.ComponentEvent,
            component: this
        });
    }
    /**
     * This method will generate code using a combination of the UserPrompt field as well as the overall context of how an Action gets executed. Code from the Action is later used by CodeGen to inject into
     * the mj_actions library for each user environment. The mj_actions library will have a class for each action and that class will have certain libraries imported at the top of the file and available for use.
     * That information along with a detailed amount of system prompt steering goes into the AI model in order to generate contextually appropriate and reliable code that maps to the business logic of the user
     */
    public async GenerateCode(maxAttempts: number = 3): Promise<GeneratedCode> {
        try {
            this.SendMessage('Generating code... ');

            const model = await AIEngine.Instance.GetHighestPowerModel(this.AIVendorName, 'llm', this.ContextCurrentUser)
            const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, GetAIAPIKey(model.DriverClass));

            const chatParams: ChatParams = {
                model: model.APINameOrName,
                messages: [
                    {
                        role: 'system',
                        content: this.GenerateSysPrompt()
                    },
                    {
                        role: 'user',
                        content: this.UserPrompt,
                    },
                ],
            }
            let result: GeneratedCode = await this.InternalGenerateCode(llm, chatParams, maxAttempts);
            if(result.Success){
                //now run the code through the QA agent to make sure the code is valid
                let qaResult: GeneratedCode = await this.ValidateCode(llm, this.UserPrompt, result, maxAttempts);
                return qaResult;
            }
            else{
                //something went wrong in the first pass, just return the error
                return result;
            }
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }

    protected async InternalGenerateCode(llm: BaseLLM, chatParams: ChatParams, attemptsRemaining: number): Promise<GeneratedCode> {
        try {
            const result = await llm.ChatCompletion(chatParams);
            if (result && result.data) {
                const llmResponse = result.data.choices[0].message.content;
                if (llmResponse) {
                    // try to parse it as JSON
                    const cleansed: string = CleanJSON(llmResponse);
                    if (!cleansed)
                        throw new Error('Invalid JSON response from AI: ' + llmResponse);

                    const parsed = JSON.parse(cleansed);
                    if (parsed.code && parsed.code.length > 0) {
                        const trimmed = parsed.code.trim();
                        let comments: string = parsed.explanation;
                        if(parsed.reflection){
                            comments = comments + `\n ${parsed.reflection}`;
                        }
                        const result: GeneratedCode = {
                            Success: true,
                            Code: trimmed,
                            Comments: parsed.explanation,
                            LibrariesUsed: parsed.libraries
                        };

                        return result;
                    }
                    else {
                        throw new Error('Invalid JSON response from AI: ' + llmResponse);
                    }
                }
                else
                    throw new Error('No response from AI');
            }
            else
                throw new Error('No response from AI');
        }
        catch (e) {
            LogError(e);
            if (attemptsRemaining > 1) {
                // try again
                return await this.InternalGenerateCode(llm, chatParams, attemptsRemaining - 1);
            }
            else
                return {
                    Success: false,
                    Code: '',
                    Comments: `Error communicating with AI: ${e.message}`,
                    LibrariesUsed: []
                }
        }
    }

    protected async ValidateCode(llm: BaseLLM, userRequest: string, generatedCode: GeneratedCode, attemptsRemaining: number): Promise<GeneratedCode> {
        this.SendMessage(`Reviewing code...`);
        const model = await AIEngine.Instance.GetHighestPowerModel(this.AIVendorName, 'llm', this.ContextCurrentUser)
        const promptMessage: string = this.GenerateValidateCodePrompt(userRequest, generatedCode);
        const validatePrompt: ChatMessage = {
            role: 'system',
            content: promptMessage
        };

        let chatParams: ChatParams = new ChatParams();
        chatParams.messages = [validatePrompt];
        chatParams.model = model.APINameOrName;

        let result: GeneratedCode = await this.InternalGenerateCode(llm, chatParams, attemptsRemaining);
        if(result.Success){
            return result;
        }
        else if (attemptsRemaining > 1) {
            return this.ValidateCode(llm, userRequest, generatedCode, attemptsRemaining - 1);
        }
        else {
            return {
                Success: false,
                Code: '',
                Comments: `Error communicating with AI: ${result.Comments}`,
                LibrariesUsed: []
            }
        }
    }

    public GenerateSysPrompt(): string {
        const prompt: string = `<RETURN_FORMAT>
    * CRITICAL - I am a bot, I can ONLY understand fully formed JSON responses
    * YOUR RESPONSE MUST BE A JSON OBJECT
    * MORE INFO BELOW
</RETURN_FORMAT>

<INTRODUCTION>
You are an expert in TypeScript coding and business applications. You take great pride in easy to read, commented, and nicely formatted code.
You will be provided a request for how to handle a specific type of action that they want created. An action is a "verb" in the MemberJunction framework that can do basically anything the user asks for.
Your job is to write the TypeScript code that will be taken and inserted into a class as shown below using the classes
for inputs/outputs and the ActionResultSimple class that is provided. The code you write will be used by the MemberJunction engine to execute the action when
it is called by the user.
</INTRODUCTION>

 ${this.GenerateContextInfo()}

Your response must be JSON and parsable into this type:
const returnType = {
    code: string, // The typescript code you will create that will work in the context described above. Make sure to include line breaks, but not tabs. That is, pretty format in terms of new lines, but do NOT indent with spaces/tabs, as I'll handle indentation.
    explanation: string // an explanation for a semi-technical person explaining what the code does. Here again use line breaks liberally to make it easy to read but do NOT indent with spaces/tabs as I will handle that. Use * lists and numbered lists as appropriate.
    libraries: [
        {LibraryName: string, ItemsUsed: string[]}, // tell me the libraries you have used in the code you created here in this array of libraries. I need this info to properly import them in the final code.
    ]
};
</CRITICAL>
**** REMEMBER **** I am a BOT, do not return anything other than the above JSON format to me or I will choke on your response!
`
        return prompt;
    }

    public GenerateValidateCodePrompt(userRequest: string, generatedCode: GeneratedCode): string {
        return `<RETURN_FORMAT>
    * CRITICAL - I am a bot, I can ONLY understand fully formed JSON responses
    * YOUR RESPONSE MUST BE A JSON OBJECT
    * MORE INFO BELOW
</RETURN_FORMAT>

        <INTRODUCTION>
You are an expert in TypeScript coding and business applications. You take great pride in easy to read, commented, and nicely formatted code.
You are also exceptional in catching errors in other people's code and providing clear and easy to understand bug fixes, with comments explaining the
issues and how you corrected it.
You will be provided a request for how to handle a specific type of action that they want created, as well code written by someone else that attempts
to satisfy the request. An action is a "verb" in the MemberJunction framework that can do basically anything the user asks for.
Your job is to:
1 - Verify that the given code can successfully compile and run, using the provided libraries and parameters.
2- Verify that the given code satifies the user's request.
</INTRODUCTION>

The user's original request was:
${userRequest}

The generated code is below:
<GENERATEDCODE>
${generatedCode.Code}
</GENERATEDCODE>

Here are some comments about the above code:
<CODECOMMENTS>
${generatedCode.Comments}
</CODECOMMENTS>

As well as the libraries used in the above code:
<LIBRARIESUSED>
${JSON.stringify(generatedCode.LibrariesUsed, null, 2)}
</LIBRARIESUSED>

<CONTEXTINFO>
Here is some additional info to help you:
${this.GenerateContextInfo()}
</CONTEXTINFO>

<RUNVIEWINFO>
Here is some additonal info regarding the RunViewParams object
${this.GenerateRunViewParamsInfo()}
</RUNVIEWINFO>

Your response must be JSON and parsable into this type:
    const returnType = {
        reflection: string, //Jot down your notes here on why you think the given code was valid or not. If it wasnt, write down why it isnt. Is it because there are syntax or logic errors, or because it doesnt satisfy the user's request?
        success: boolean //whether or not the above code is valid and can successfully compile and run, using the given libraries and data types
        code: string, // REMEMBER: your code will be inserted INTO an existing method so do not generate the method signature, just the code that I will drop into my existing method as shown in the <CONTEXTINFO>
        explanation: string // If the code is not valid, you will provide an explanation for a semi-technical person explaining what the corrected code does. Here again use line breaks liberally to make it easy to read but do NOT indent with spaces/tabs as I will handle that. Use * lists and numbered lists as appropriate.
        libraries: [
            {LibraryName: string, ItemsUsed: string[]}, // If the code is not valid, tell me the libraries you have used in the corrected code you created here in this array of libraries. I need this info to properly import them in the final code.
        ]
};
`;
    }

    public GenerateContextInfo(): string {
        return `
        <CODE_EXAMPLE>
export class ${this.ProgrammaticName}Action extends BaseAction {
    public async Run(params: RunActionParams): Promise<ActionResultSimple> {
        // IMPORTANT: your code will go here, do not generate the method signature, just the code inside the method
        /* FOR THE RETURN VALUE you should return a JavaScript object that has these properties:
            {
                Success: boolean // or false if the action failed
                ResultCode: ${this.ResultCodes && this.ResultCodes.length > 0 ? this.ResultCodes.map(rc => `'${rc.ResultCode}'`).join(" | ") : 'string'} // The result of the action
                Message: string // a message to show the user
            }
        */
    }
}
</CODE_EXAMPLE>

<AVAILABLE_PARAMETERS>
The params parameter into the Run method has a property called Params which is an array of ActionParam objects. These objects have a Name and Value property and map to the defined parameters for this action. The parameters for this
action are as shown below. For parameters shown as output, make sure you generate the code to handle this and place a new item in the Params array with the Name and Value set to the output parameter name and value respectively. If
the parameter has a type of input/output, you will receive the value as an input, and you can update it if the program you create needs to pass back a different value.
    ${
        JSON.stringify(this.Params)
    }
</AVAILABLE_PARAMETERS>

<AVAILABLE_LIBRARIES>
The following libraries are available for use in your code. THEY ARE ALREADY IMPORTED. **DO NOT IMPORT THEM IN YOUR CODE**
Use the code examples and reference information shown below, only use properties and methods shown in the documentation/examples.
IMPORTANT: DO NOT GENERATE IMPORT STATEMENTS FOR THESE LIBRARIES, THEY ARE ALREADY IMPORTED FOR YOU!
${DocumentationEngine.Instance.Libraries.map((library: LibraryEntityExtended) => {
    return library.Items.map((item: LibraryItemEntityExtended) => {
      return `
      {
          "LibraryName": ${item.Name},
          "Content": ${item.HTMLContent}
      }
      `
    });
  })}
</AVAILABLE_LIBRARIES>

<REFERENCE_TYPES>
    /**
     * Class that has the result of the individual action execution and used by the engine or other caller
     */
    export class ActionResultSimple {
        /**
            * Indicates if the action was successful or not.
            */
        public Success: boolean;

        /**
            * A string that indicates the strucutred output/results of the action
            */
        public ResultCode: string;

        /**
            * Optional, additional information about the result of the action
            */
        public Message?: string;

        /**
            * Some actions return output parameters. If the action that was run has outputs, they will be provided here.
            */
        public Outputs?: ActionParam[];
    }
    /**
     * Generic class for holding parameters for an action for both inputs and outputs
     */
    export class ActionParam {
        /**
        * The name of the parameter
        */
        public Name: string;
        /**
        * The value of the parameter. This can be any type of object.
        */
        public Value: any;
    }
    /**
     * Class that holds the parameters for an action to be run. This is passed to the Run method of an action.
     */
    export class RunActionParams {
        public Action: ActionEntity;
        public ContextUser: UserInfo;
        /**
        * Optional, a list of filters that should be run before the action is executed.
        */
        public Filters: ActionFilterEntity[];
        /**
        * Optional, the input and output parameters as defined in the metadata for the action.
        */
        public Params: ActionParam[];
    }
</REFERENCE_TYPES>

<ENTITIES>
Entities in MemberJunction are storage objects and roughly map to database tables. Here are the entities in the system to give you additional context to understand the request:
${
    JSON.stringify(Metadata.Provider.Entities.map(e => {
        // for each entity, get the name, description and base view
        return {
            Entity: e.Name,
            SchemaName: e.SchemaName,
            Description: e.Description,
            BaseView: e.BaseView
        }
    }))
}
</ENTITIES>
The next message, which will be a user message in the conversation, will contain the sys admin's requested behavior for this entity.

<CRITICAL>
I am a bot and can only understand FULLY FORMED JSON responses that can be parsed with JSON.parse().
        `;
    }

    public GenerateRunViewParamsInfo(): string {
        return `/**
 * Parameters for running either a stored or dynamic view.
 * A stored view is a view that is saved in the database and can be run either by ID or Name.
 * A dynamic view is one that is not stored in the database and you provide parameters to return data as
 * desired programatically.
 */
export type RunViewParams = {
    /**
     * optional - ID of the UserView record to run, if provided, ViewName is ignored
     */
    ViewID?: number
    /**
     * optional - Name of the UserView record to run, if you are using this, make sure to use a naming convention
     * so that your view names are unique. For example use a prefix like __Entity_View_ etc so that you're
     * likely to have a single result. If more than one view is available that matches a provided view name an
     * exception will be thrown.
     */
    ViewName?: string
    /**
     * optional - this is the loaded instance of the BaseEntity (UserViewEntityComplete or a subclass of it).
     * This is the preferred parameter to use IF you already have a view entity object loaded up in your code
     * becuase by passing this in, the RunView() method doesn't have to lookup all the metadata for the view and it is faster.
     * If you provide ViewEntity, ViewID/ViewName are ignored.
     */
    ViewEntity?: BaseEntity
    /**
     * optional - this is only used if ViewID/ViewName/ViewEntity are not provided, it is used for
     * Dynamic Views in combination with the optional ExtraFilter
     */
    EntityName?: string
    /**
     * An optional SQL WHERE clause that you can add to the existing filters on a stored view. For dynamic views, you can either
     * run a view without a filter (if the entity definition allows it with AllowAllRowsAPI=1) or filter with any valid SQL WHERE clause.
     */
    ExtraFilter?: string
    /**
     * An optional SQL ORDER BY clause that you can use for dynamic views, as well as to OVERRIDE the stored view's sorting order.
     */
    OrderBy?: string
    /**
     * An optional array of field names that you want returned. The RunView() function will always return ID so you don't need to ask for that. If you leave this null then
     * for a dynamic view all fields are returned, and for stored views, the fields stored in it view configuration are returned.
      */
    Fields?: string[]
    /**
     * optional - string that represents a user "search" - typically from a text search option in a UI somewhere. This field is then used in the view filtering to search whichever fields are configured to be included in search in the Entity Fields definition.
     * Search String is combined with the stored view filters as well as ExtraFilter with an AND.
     */
    UserSearchString?: string
    /**
     * optional - if provided, records that were returned in the specified UserViewRunID will NOT be allowed in the result set.
     * This is useful if you want to run a particular view over time and exclude a specific prior run's resulting data set. If you
     * want to exclude ALL data returned from ALL prior runs, use the ExcludeDataFromAllPriorViewRuns property instead.
     */
    ExcludeUserViewRunID?: number
    /**
     * optional - if set to true, the resulting data will filter out ANY records that were ever returned by this view, when the SaveViewResults property was set to true.
     * This is useful if you want to run a particular view over time and make sure the results returned each time are new to the view.
     */
    ExcludeDataFromAllPriorViewRuns?: boolean
    /**
     * optional - if you are providing the optional ExcludeUserViewRunID property, you can also optionally provide
     * this filter which will negate the specific list of record IDs that are excluded by the ExcludeUserViewRunID property.
     * This can be useful if you want to ensure a certain class of data is always allowed into your view and not filtered out
     * by a prior view run.
     *
     */
    OverrideExcludeFilter?: string
    /**
     * optional - if set to true, the LIST OF ID values from the view run will be stored in the User View Runs entity and the
     * newly created UserViewRun.ID value will be returned in the RunViewResult that the RunView() function sends back to ya.
     */
    SaveViewResults?: boolean
    /**
     * optional - if set to true, if there IS any UserViewMaxRows property set for the entity in question, it will be IGNORED. This is useful in scenarios where you
     * want to programmatically run a view and get ALL the data back, regardless of the MaxRows setting on the entity.
     */
    IgnoreMaxRows?: boolean

    /**
     * optional - if provided, and if IgnoreMaxRows = false, this value will be used to constrain the total # of rows returned by the view. If this is not provided, either the default settings at the entity-level will be used, or if the entity has no UserViewMaxRows setting, all rows will be returned that match any filter, if provided.
     */
    MaxRows?: number
    /**
     * optional - if set to true, the view run will ALWAYS be logged to the Audit Log, regardless of the entity's property settings for logging view runs.
     */
    ForceAuditLog?: boolean
    /**
     * optional - if provided and either ForceAuditLog is set, or the entity's property settings for logging view runs are set to true, this will be used as the Audit Log Description.
     */
    AuditLogDescription?: string

    /**
     * Result Type is: 'simple', 'entity_object', or 'count_only' and defaults to 'simple'. If 'entity_object' is specified, the Results[] array will contain
     * BaseEntity-derived objects instead of simple objects. This is useful if you want to work with the data in a more strongly typed manner and/or
     * if you plan to do any update/delete operations on the data after it is returned. The 'count_only' option will return no rows, but the TotalRowCount property of the RunViewResult object will be populated.
     */
    ResultType?: 'simple' | 'entity_object' | 'count_only';
}
        `;
    }
}

export function LoadActionEntityServer() {
    // this function is used to force the class to load and register itself with the system
    // this is necessary because the class is not explicitly referenced in the code, it is only registered with the system
    // and the system will only load it when it is needed, this function forces the class to load
}

