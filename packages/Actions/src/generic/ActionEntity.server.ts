import { BaseEntity, CodeNameFromString, EntityInfo, EntitySaveOptions, LogError, Metadata } from "@memberjunction/core";
import { ActionEntity, ActionParamEntity, ActionResultCodeEntity } from "@memberjunction/core-entities";
import { CleanJSON, MJGlobal, RegisterClass } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";

import { ActionEngine, GeneratedCode, GlobalActionLibraries } from "./ActionEngine";
import { BaseLLM, ChatParams, GetAIAPIKey } from "@memberjunction/ai";

/**
 * Server-Only custom sub-class for Actions entity. This sub-class handles the process of auto-generation code for the Actions entity. 
 */
@RegisterClass(BaseEntity, 'Actions') // high priority make sure this class is used ahead of other things
export class ActionEntityServerEntity extends ActionEntity {
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
     * Generates a programatically friendly name for the name of the Action.
     */
    public get ProgrammaticName(): string {
        return CodeNameFromString(this.Name);
    }

    /**
     * Returns true if this action is a core MemberJunction framework action, false otherwise.
     */
    public get IsCoreAction(): boolean {
        return this.Category?.trim().toLowerCase() === ActionEngine.Instance.CoreCategoryName.trim().toLowerCase();
    }

    private _resultCodes: ActionResultCodeEntity[] = null;
    /**
     * Provides a list of possible result codes for this action.
     */
    public get ResultCodes(): ActionResultCodeEntity[] {
        if (!this._resultCodes) {
            // load the result codes
            this._resultCodes = ActionEngine.Instance.ActionResultCodes.filter(c => c.ActionID === this.ID);
        }
        return this._resultCodes;
    }

    private _params: ActionParamEntity[] = null;
    public get Params(): ActionParamEntity[] {
        if (!this._params) {
            // load the inputs
            this._params = ActionEngine.Instance.ActionParams.filter(i => i.ActionID === this.ID);
        }
        return this._params;
    }
 

    /**
     * Override of the base Save method to handle the pre-processing to auto generate code whenever an action's UserPrompt is modified.
     * This happens when a new record is created and also whenever the UserPrompt field is changed. 
     * @param options 
     * @returns 
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // make sure the ActionEngine is configured
        await ActionEngine.Instance.Config(false, this.ContextCurrentUser);

        if (this.GetFieldByName('UserPrompt').Dirty|| !this.IsSaved || this.ForceCodeGeneration) {
            // UserPrompt field is dirty, or this is a new record, either way, this is the condition where we want to generate the Code.
            const result = await this.GenerateCode();
            if (result.Success) {
                this.Code = result.Code;
                this.CodeComments = result.Comments;    
                this.CodeApprovalStatus = 'Pending'; // set to pending even if previously approved since we changed the code
                this.CodeApprovedAt = null; // reset the approved at date
                this.CodeApprovedByUserID = null; // reset the approved by user id
            }
            else
                throw new Error(`Failed to generate code for Action ${this.Name}.`);
        }
        this.ForceCodeGeneration = false; // make sure to reset this flag every time we save, it should never live past one run of the Save method, of course if Save fails, below, then it will not be reset
        return super.Save(options);        
    }

    /**
     * This method will generate code using a combination of the UserPrompt field as well as the overall context of how an Action gets executed. Code from the Action is later used by CodeGen to inject into
     * the mj_actions library for each user environment. The mj_actions library will have a class for each action and that class will have certain libraries imported at the top of the file and available for use.
     * That information along with a detailed amount of system prompt steering goes into the AI model in order to generate contextually appropriate and reliable code that maps to the business logic of the user  
     */
    public async GenerateCode(): Promise<GeneratedCode> {
        try {
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
            const result = await llm.ChatCompletion(chatParams);
            if (result && result.data) {
                const llmResponse = result.data.choices[0].message.content;
                if (llmResponse) {
                    // try to parse it as JSON
                    try {
                        const cleansed = CleanJSON(llmResponse);
                        if (!cleansed)
                            throw new Error('Invalid JSON response from AI: ' + llmResponse);
    
                        const parsed = JSON.parse(cleansed);
                        if (parsed.code && parsed.code.length > 0) {
                            const trimmed = parsed.code.trim();
    
                            return  { 
                                        Success: true,
                                        Code: trimmed, 
                                        Comments: parsed.explanation
                                    };
                        }
                        else if (parsed.code !== undefined && parsed.code !== null) {
                            return  { 
                                Success: true,
                                Code: '',  // empty string is valid, it means no code generated
                                Comments: parsed.explanation
                            };
                        }
                        else {
                            // if we get here, no code was provided by the LLM, that is an error
                            throw new Error('Invalid response from AI, no code property found in response: ' + llmResponse);
                        }
                    }
                    catch (e) {
                        LogError(e);
                        throw new Error('Error parsing JSON response from AI: ' + llmResponse);
                    }
                }
                else 
                    throw new Error('Null response from AI');
            }
            else
                throw new Error('No result returned from AI');
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }

 

    public GenerateSysPrompt(): string {
        const prompt: string = `You are an expert in TypeScript coding and business applications. You take great pride in easy to read, commented, and nicely formatted code.
You will be provided a request for how to handle a specific type of action that they want created. An action is a "verb" in the MemberJunction framework that can do basically anything the user asks for.
Your job is to write the TypeScript code that will be taken and inserted into a class as shown below using the classes
for inputs/outputs and the ActionResultSimple class that is provided. The code you write will be used by the MemberJunction engine to execute the action when 
it is called by the user.

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
The following libraries are available for use in your code. THEY ARE ALREADY IMPORTED SO DO NOT IMPORT THEM IN YOUR CODE. 
Use these libraries as needed along with the documentation available at https://docs.memberjunction.org that explains these libraries/objects in detail to generate
code that will conform to our framework and achieve the business logic desired by the user's prompt.
IMPORTANT: DO NOT GENERATE IMPORT STATEMENTS FOR THESE LIBRARIES, THEY ARE ALREADY IMPORTED FOR YOU!
${
    GlobalActionLibraries.map(l => JSON.stringify(l)).join('\n')
}
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
I am a bot and can only understand JSON. Your response must be parsable into this type:
const returnType = {
    code: string, // The typescript code you will create that will work in the context described above. Make sure to include line breaks, but not tabs. That is, pretty format in terms of new lines, but do NOT indent with spaces/tabs, as I'll handle indentation.
    explanation: string // an explanation for a semi-technical person explaining what the code does. Here again use line breaks liberally to make it easy to read but do NOT indent with spaces/tabs as I will handle that. Use * lists and numbered lists as appropriate.
};
</CRITICAL>
**** REMEMBER **** I am a BOT, do not return anything other than JSON to me or I will choke on your response!
`
        return prompt;
    }        

}
 
export function LoadActionEntityServer() {
    // this function is used to force the class to load and register itself with the system
    // this is necessary because the class is not explicitly referenced in the code, it is only registered with the system
    // and the system will only load it when it is needed, this function forces the class to load
}

