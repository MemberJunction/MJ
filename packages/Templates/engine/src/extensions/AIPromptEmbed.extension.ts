import { LogError, UserInfo, Metadata } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { NunjucksCallback, TemplateExtensionBase } from "./TemplateExtensionBase";
import { TemplateEngineServer } from "../TemplateEngine";
import { AIPromptEntity } from "@memberjunction/core-entities";
import { AIEngine } from "@memberjunction/aiengine";

// TODO: Add type defs based on nunjucks classes used for extensions
type Parser = any;
type Nodes = any;
type Lexer = any;
type Context = any;

/**
 * Configuration options for AI prompt embedding
 */
export type AIPromptEmbedConfig = {
    /**
     * Optional data to merge with or override the current template's data context.
     * This data will be available to the AI prompt during rendering.
     */
    data?: any;
    /**
     * Whether to render only the prompt content without role-specific formatting
     * Default: false (includes role-based formatting)
     */
    contentOnly?: boolean;
};

/**
 * Extension that enables AI prompt embedding using {% PromptEmbed "promptName" %} syntax.
 * 
 * Features:
 * - Embed AI prompts into system prompts or other templates
 * - Data context passing and merging
 * - Validation to ensure proper prompt compatibility
 * - Error handling for missing prompts
 * - Support for both rendered content and raw template text
 * 
 * Usage:
 * {% PromptEmbed "PromptName" %}
 * {% PromptEmbed "PromptName", data={extra: "value"} %}
 * {% PromptEmbed "PromptName", contentOnly=true %}
 * {% PromptEmbed "PromptName", data={key: "value"}, contentOnly=false %}
 */
@RegisterClass(TemplateExtensionBase, 'PromptEmbed')
export class PromptEmbedExtension extends TemplateExtensionBase {

    constructor(contextUser: UserInfo) {
        super(contextUser);
        this.tags = ['PromptEmbed'];
    }
    
    public parse(parser: Parser, nodes: Nodes, lexer: Lexer) {
        // Get the tag token
        const tok = parser.nextToken();

        // Parse the arguments - prompt name and optional parameters
        const params = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);

        // AI prompt embedding is a self-closing tag, no body content to parse
        // Return a CallExtensionAsync node with the parsed parameters
        return new nodes.CallExtensionAsync(this, 'run', params);    
    }

    /**
     * Executes the AI prompt embedding logic.
     * 
     * **Parameter Mapping from CallExtensionAsync:**
     * - In parse(): `new nodes.CallExtensionAsync(this, 'run', params)`
     * - Results in: `run(context, body, callBack)`
     * 
     * The `body` parameter will be undefined since AIPromptEmbed is a self-closing tag
     * that doesn't parse body content. The prompt name and configuration come from
     * the parsed parameters instead.
     * 
     * @param context - Nunjucks template rendering context containing variables and data
     * @param body - Will be undefined for self-closing prompt tags (not used)
     * @param callBack - Async callback function to return results or errors
     * 
     * @example
     * ```nunjucks
     * {% PromptEmbed "CodeReviewPrompt" %}
     * {% PromptEmbed "UserGreeting", data={userName: "John"} %}
     * {% PromptEmbed "SystemInstructions", contentOnly=true %}
     * ```
     */
    public run(context: Context, body: any, callBack: NunjucksCallback) {
        try {
            // Extract prompt name (first parameter)
            const bodyString: string = body ? body : '';
            const params = bodyString.split(',');

            /*
                Possible Formats for the body of the PromptEmbed tag:

                Basic Usage:
                {% PromptEmbed "PromptName" %}

                With Optional Parameters:
                {% PromptEmbed "PromptName", data={key: "value"} %}
                {% PromptEmbed "PromptName", contentOnly=true %}
                {% PromptEmbed "PromptName", data={extra: "data"}, contentOnly=false %}              

                So we need to take the params array we have above and each item is either just a string
                e.g. the PromptName, or a key-value pair like 'data={key: "value"}' or 'contentOnly=true'
                We will parse these into a structured object for easier handling.
             */
            const parsedParams: Array<{propertyName: string, value: string}> = params.map(param => {
                // Split by the first '=' to separate property name and value
                const [propertyName, ...valueParts] = param.split('=');
                const value = valueParts.join('=').trim().replace(/^\"|\"$/g, ''); // Remove surrounding quotes if any
                if (value.trim() === '') {
                    return { propertyName: 'prompt', value: propertyName.trim() }; // Default to 'prompt' if no value provided
                }
                else {
                    return { propertyName: propertyName.trim(), value: value };
                }
            });

            if (!parsedParams || parsedParams.length === 0) {
                throw new Error('AI prompt name is required for prompt embedding');
            }

            const promptName = parsedParams.find(param => param.propertyName === 'prompt')?.value || parsedParams[0].value;
            if (!promptName || typeof promptName !== 'string') {
                throw new Error('AI prompt name must be a non-empty string');
            }

            // Parse optional configuration parameters
            let config: AIPromptEmbedConfig = {};
            if (params.length > 1) {
                // Additional parameters should be key-value pairs
                for (let i = 1; i < params.length; i += 2) {
                    if (i + 1 < params.length) {
                        const key = params[i];
                        const value = params[i + 1];
                        
                        // Parse boolean values
                        if (key === 'contentOnly') {
                            config[key] = value.toLowerCase() === 'true';
                        } else {
                            config[key] = value;
                        }
                    }
                }
            }

            // Get the AI prompt from the AI Engine
            this.embedAIPrompt(promptName, context.ctx, config)
                .then((result) => {
                    callBack(null, result);
                })
                .catch((error) => {
                    LogError(error);
                    callBack(error);
                });

        } catch (error) {
            LogError(error);
            callBack(error);
        }
    }

    /**
     * Embeds an AI prompt by name with the provided data context.
     * 
     * @param promptName - Name of the AI prompt to embed
     * @param currentContext - Current template data context
     * @param config - Configuration options for embedding
     * @returns Promise resolving to the rendered prompt content
     */
    private async embedAIPrompt(promptName: string, currentContext: any, config: AIPromptEmbedConfig): Promise<string> {
        try {
            // Ensure AI Engine is configured
            if (!AIEngine.Instance.Prompts || AIEngine.Instance.Prompts.length === 0) {
                throw new Error('AI Engine not properly configured or no prompts available');
            }

            // Find the target AI prompt
            const aiPrompt = AIEngine.Instance.Prompts.find(p => 
                p.Name.trim().toLowerCase() === promptName.trim().toLowerCase()
            );

            if (!aiPrompt) {
                throw new Error(`AI prompt "${promptName}" not found`);
            }

            // Validate that this prompt can be embedded (basic validation)
            // More sophisticated validation will be added in the validation logic task
            if (!this.canPromptBeEmbedded(aiPrompt)) {
                throw new Error(`AI prompt "${promptName}" cannot be embedded into templates`);
            }

            // Prepare data context for the AI prompt
            const embeddedData = this.prepareDataContext(currentContext, config.data);

            // Get the prompt template content
            const promptContent = await this.getPromptContent(aiPrompt, embeddedData);

            // Return content based on configuration
            if (config.contentOnly) {
                return promptContent;
            } else {
                // Include any role-specific formatting if needed
                return this.formatPromptForEmbedding(promptContent, aiPrompt);
            }

        } catch (error) {
            LogError(`Failed to embed AI prompt "${promptName}": ${error.message}`);
            throw error;
        }
    }

    /**
     * Basic validation to check if a prompt can be embedded.
     * This is a placeholder for more sophisticated validation logic.
     * 
     * @param prompt - The AI prompt to validate
     * @returns True if the prompt can be embedded
     */
    private canPromptBeEmbedded(prompt: AIPromptEntity): boolean {
        // Basic validation - more sophisticated logic will be added later
        // For now, allow all prompts except those marked as system-only
        return prompt.Name !== null && prompt.Name.trim() !== '';
    }

    /**
     * Prepares the data context for the AI prompt by merging current context with additional data.
     */
    private prepareDataContext(currentContext: any, additionalData?: any): any {
        if (!additionalData) {
            return currentContext;
        }

        // Create a new context object that merges current context with additional data
        // Additional data takes precedence over current context
        return { ...currentContext, ...additionalData };
    }

    /**
     * Gets the rendered content of an AI prompt.
     * 
     * @param aiPrompt - The AI prompt entity
     * @param data - Data context for rendering
     * @returns Promise resolving to the rendered prompt content
     */
    private async getPromptContent(aiPrompt: AIPromptEntity, data: any): Promise<string> {
        try {
            // AI prompts are linked to templates, so we need to load the template and get its content
            if (!aiPrompt.TemplateID) {
                throw new Error(`AI prompt "${aiPrompt.Name}" has no associated template`);
            }

            // Get template engine and load the template
            await TemplateEngineServer.Instance.Config(false, this.ContextUser);
            
            const template = TemplateEngineServer.Instance.FindTemplate(aiPrompt.TemplateID);
            if (!template) {
                throw new Error(`Template with ID ${aiPrompt.TemplateID} not found for AI prompt "${aiPrompt.Name}"`);
            }

            // Get the highest priority template content
            const templateContent = template.GetHighestPriorityContent();
            if (!templateContent) {
                throw new Error(`No template content found for AI prompt "${aiPrompt.Name}"`);
            }

            // Render the template content with the provided data
            const result = await TemplateEngineServer.Instance.RenderTemplate(template, templateContent, data);
            
            if (!result.Success) {
                throw new Error(`Failed to render AI prompt template: ${result.Message}`);
            }
            
            return result.Output;

        } catch (error) {
            LogError(`Error getting prompt content for "${aiPrompt.Name}": ${error.message}`);
            throw error;
        }
    }

    /**
     * Formats the prompt content for embedding into templates.
     * 
     * @param content - The rendered prompt content
     * @param prompt - The original AI prompt entity
     * @returns Formatted content ready for embedding
     */
    private formatPromptForEmbedding(content: string, prompt: AIPromptEntity): string {
        // For now, return content as-is
        // Future enhancements could add role-specific formatting, indentation, etc.
        return content;
    }
}

export function LoadPromptEmbedExtension() {
    // This function ensures the extension class isn't tree-shaken
}