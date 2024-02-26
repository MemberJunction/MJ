import { AnthropicLLM, BaseLLM, OpenAILLM } from "@memberjunction/ai";
import { AdvancedGenerationFeature, anthropicAPIKey, configInfo, openAIAPIKey } from "./config";

export type EntityNameResult = { entityName: string, tableName: string }
export type EntityDescriptionResult = { entityDescription: string, tableName: string }
export type PromptDefinition = { feature: string, systemPrompt: string, userMessage: string };
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
    ];

    private static _cachedLLM: BaseLLM = null;

    public get AIModel(): string {
        return configInfo.advancedGeneration?.AIModel;
    }
    public get AIVendor(): string {
        return configInfo.advancedGeneration?.AIVendor;
    }
    public get enabled(): boolean {
        return false; // temporarily disabled because advanced generation isn't at the moment yielding good results from LLMs. Keeping the infrastructure in place as we expect the capabilties to improve rapidly.
    //  return configInfo.advancedGeneration?.enableAdvancedGeneration;
    }

    public getPrompt(feature: string): PromptDefinition {
        const defaultPrompt = AdvancedGeneration._prompts.find(p => p.feature.trim().toLowerCase() === feature.trim().toLowerCase());
        const result: PromptDefinition = {...defaultPrompt};
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
        else {
            switch (configInfo.advancedGeneration?.AIVendor?.toLowerCase().trim()) {
                case "openai":
                    AdvancedGeneration._cachedLLM = new OpenAILLM(openAIAPIKey);
                    break;
                case "anthropic":
                    AdvancedGeneration._cachedLLM = new AnthropicLLM(anthropicAPIKey);
                    break;
                case "mistral":
                    //baseLLM = new MistralLLM();
                    throw new Error("Mistral not supported yet");
                default:
                    throw new Error("Invalid AI Vendor");
            }
            return AdvancedGeneration._cachedLLM;    
        }
    }

    public fillTemplate(template: string, variables: { [key: string]: any }): string {
        return template.replace(/\${(.*?)}/g, (_, g) => variables[g]);
    }

    public features(): AdvancedGenerationFeature[] {
        return configInfo.advancedGeneration?.features;
    }

    public getFeature(featureName: string): AdvancedGenerationFeature {
        return this.features().find(f => f.name === featureName);
    }

    public featureEnabled(featureName: string): boolean {
        return this.enabled && this.getFeature(featureName)?.enabled;
    }    
}
