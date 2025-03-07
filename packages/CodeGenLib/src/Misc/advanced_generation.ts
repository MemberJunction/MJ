import { BaseLLM, GetAIAPIKey } from "@memberjunction/ai";
import { AdvancedGenerationFeature, configInfo } from "../Config/config";
import { MJGlobal, RegisterClass } from "@memberjunction/global";
import { LogError } from "@memberjunction/core";

export type EntityNameResult = { entityName: string, tableName: string }
export type EntityDescriptionResult = { entityDescription: string, tableName: string }
export type PromptDefinition = { feature: string, systemPrompt: string, userMessage: string };

/**
 * This class is responsible for managing the advanced generation capabilities of the system. You can override the class to provide your own implementation.
 */
@RegisterClass(AdvancedGeneration)
export class AdvancedGeneration {
    private static _prompts: PromptDefinition[] = [
        {
            feature: 'EntityNames',
            systemPrompt: `I am a bot. I am trying to generate a new entity name for the table \${TableName}. In our system, an entity name is plural and is user-facing so it should have spaces if the table name is camel case or has underscores or other similar delimiter-style. 
                           I am a bot and need you to response with this JSON format only. I will not be able to read anything else. 

                            TypeScript type provided here:                      
                                type EntityNameResult = { 
                                    entityName: string, 
                                    tableName: string 
                                } 

                            IMPORTANT: DO NOT USE MARKDOWN - Just emit pure JSON with no preceding or trailing text. I must be able to pass your response directly to JSON.parse()`,
            userMessage: "The table name for the new entity is ${TableName}, please provide me a suggested entity name using the rules I provided."
        },
        {
            feature: 'EntityDescriptions',
            systemPrompt: `I am a bot. I am going to provide you with a table name and entity name as well as the list of fields. 
                           Using your knowledge of the world and the table name and field list, create a brief description for the entity that an end-user would understand.
                           I am a bot and need you to response with this JSON format only.  

                            TypeScript type provided here:                      
                                type EntityDescriptionResult = { 
                                    entityDescription: string, 
                                    tableName: string 
                                } 

                            IMPORTANT: DO NOT USE MARKDOWN - Just emit pure JSON with no preceding or trailing text. I must be able to pass your response directly to JSON.parse()`,
            userMessage: ""
        },
        {
            feature: 'CheckConstraintParser',
            systemPrompt: `You are an SQL CHECK constraint parser and TypeScript code generator. Each User Message will contain the text of a single SQL Check Constraint. Your task is to take a single SQL CHECK constraint and output a JSON object with two keys: "Description" and "TypeScriptImplementation".
1. "Description": Provide a plain-language, non-technical description explaining what the constraint enforces. This description should be understandable to business users.
2. "Code": Generate a TypeScript class method that can be called from the Validate() method of a BaseEntity sub-class. Assume that the class has getter properties for each database field (e.g., for a column TaxRate, use this.TaxRate). 
  Use if/else statements to implement the check. If the validation fails, the code should add an error to provided method parameter called "result". 
  Within the result object there is an "errors" array. For each error or warning, you create a new ValidationErrorInfo object and populating it with the information
  needed to know what the issue is. The ValidationErrorInfo object has a constructor that takes in the following 4 parameters:
    * Source: The name of the field that caused the error.
    * Message: A message that describes the error.
    * Value: The value of the field that caused the error.
    * Type: The type of error (ValidationErrorType.Failure or ValidationErrorType.Warning).
  NOTE: For TypeScript code, use multiline quotes with \` so that you can use nice formatting so the code is super easy to read and include comments if needed for more complex code. Also use a single tab to indent each line of the code as shown in the example below.
3. "MethodName": Provide the string here for the name of the method you created, use the pattern of Validate{FieldName} where FieldName is the name of the field that the constraint is for.

**** IMPORTANT: If you return anything other than the JSON below, the system will break ***** 
Here's an example of the JSON you should return for the following input:
ALTER TABLE Customers
ADD CONSTRAINT CHK_Customers_Deactivation CHECK (
    (IsActive = 1 AND DeactivationDate IS NULL)
    OR
    (IsActive = 0 AND DeactivationDate IS NOT NULL)
);


RETURN THIS JSON FOR THE ABOVE INPUT:
{
  "Description": "This rule ensures that if a customer is marked as active, they cannot have a deactivation date. If a customer is marked as inactive, they must have a deactivation date.",
  "Code": \`
    public ValidateDeactivationDate(result: ValidationResult) {
        if (this.IsActive === 1 && this.DeactivationDate !== null) {
            result.errors.push(new ValidationErrorInfo('DeactivationDate', 'An active customer cannot have a deactivation date.', this.DeactivationDate, ValidationErrorType.Failure));
        } 
        else if (this.IsActive === 0 && this.DeactivationDate === null) {
            result.errors.push(new ValidationErrorInfo('DeactivationDate', 'An inactive customer must have a deactivation date.', this.DeactivationDate, ValidationErrorType.Failure));
        }
    }
\`,
 "MethodName": "ValidateDeactivationDate"
}`,
            userMessage: ""
        },
    ];

    private static _cachedLLM: BaseLLM = null!;

    public get AIModel(): string {
        return configInfo.advancedGeneration!.AIModel;
    }
    public get AIVendor(): string {
        return configInfo.advancedGeneration!.AIVendor;
    }
    public get enabled(): boolean {
        return false; // temporarily disabled because advanced generation isn't at the moment yielding good results from LLMs. Keeping the infrastructure in place as we expect the capabilties to improve rapidly.
    //  return configInfo.advancedGeneration?.enableAdvancedGeneration;
    }

    public getPrompt(feature: string): PromptDefinition {
        const defaultPrompt = AdvancedGeneration._prompts.find(p => p.feature.trim().toLowerCase() === feature.trim().toLowerCase());
        const result: PromptDefinition = {...defaultPrompt} as any;
        const featureInfo = this.getFeature(feature);
        if (featureInfo && featureInfo.systemPrompt) {
            result.systemPrompt = featureInfo.systemPrompt;
        }
        if (featureInfo && featureInfo.userMessage) {
            result.userMessage = featureInfo.userMessage;
        }
        return result;
    }

    public get LLM(): BaseLLM {
        if (AdvancedGeneration._cachedLLM) {
            return AdvancedGeneration._cachedLLM;
        }
        else if (configInfo.advancedGeneration!.AIVendor && configInfo.advancedGeneration!.AIVendor.length > 0) {
            AdvancedGeneration._cachedLLM = MJGlobal.Instance.ClassFactory.CreateInstance(BaseLLM, configInfo.advancedGeneration!.AIVendor, GetAIAPIKey(configInfo.advancedGeneration!.AIVendor))!;
            return AdvancedGeneration._cachedLLM;    
        }
        else {
            LogError("AdvancedGeneration", "No AI vendor specified in Configuration Settings under 'advancedGeneration.AIVendor'");
            return null!;
        }
    }

    /**
     * A template can be populated with any number of variable placeholders in the form ${variableName}. This function will replace all the placeholders with the values provided in the variables object.
     * @param template 
     * @param variables 
     * @returns 
     */
    public fillTemplate(template: string, variables: { [key: string]: any }): string {
        return template.replace(/\${(.*?)}/g, (_, g) => variables[g]);
    }

    public features(): AdvancedGenerationFeature[] | undefined {
        return configInfo.advancedGeneration?.features;
    }

    public getFeature(featureName: string): AdvancedGenerationFeature {
        return this.features()!.find(f => f.name === featureName)!;
    }

    public featureEnabled(featureName: string): boolean {
        return this.enabled && this.getFeature(featureName)?.enabled;
    }    
}
