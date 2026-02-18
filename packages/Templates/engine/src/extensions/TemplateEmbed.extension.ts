import { LogError, UserInfo } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { NunjucksCallback, TemplateExtensionBase } from "./TemplateExtensionBase";
import { MJTemplateContentEntity, TemplateEntityExtended } from "@memberjunction/core-entities";
import { TemplateEngineServer } from '../TemplateEngine';

// TODO: Add type defs based on nunjucks classes used for extensions
type Parser = any;
type Nodes = any;
type Lexer = any;
type Context = any;

/**
 * Configuration options for template embedding
 */
export type TemplateEmbedConfig = {
    /**
     * Specific content type to use for the embedded template.
     * If not provided, inherits from current template's content type.
     */
    type?: string;
    /**
     * Additional data to merge with or override the current template's data context.
     * This data will be available to the embedded template.
     */
    data?: any;
};

/**
 * Context tracking for cycle detection during template rendering.
 * Tracks the chain of templates being rendered to prevent infinite recursion.
 */
interface RenderContext {
    /**
     * Stack of template names currently being rendered
     */
    templateStack: string[];
    /**
     * Current content type being rendered
     */
    currentContentType?: string;
}

/**
 * Extension that enables recursive template embedding using {% template "TemplateName" %} syntax.
 * 
 * Features:
 * - Recursive template inclusion with cycle detection
 * - Content type inheritance with intelligent fallbacks
 * - Data context passing and merging
 * - Error handling for missing templates
 * 
 * Usage:
 * {% template "TemplateName" %}
 * {% template "TemplateName", type="HTML" %}
 * {% template "TemplateName", data={extra: "value"} %}
 * {% template "TemplateName", type="PlainText", data={key: "value"} %}
 */
@RegisterClass(TemplateExtensionBase, 'TemplateEmbed')
export class TemplateEmbedExtension extends TemplateExtensionBase {

    constructor(contextUser: UserInfo) {
        super(contextUser);
        this.tags = ['template'];
    }
    
    public parse(parser: Parser, nodes: Nodes, lexer: Lexer) {
        // Get the tag token
        const tok = parser.nextToken();

        // Parse the arguments - template name and optional parameters
        const params = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);

        // Template embedding is a self-closing tag, no body content to parse
        // Return a CallExtensionAsync node with the parsed parameters
        return new nodes.CallExtensionAsync(this, 'run', params);    
    }

    /**
     * Executes the template embedding logic with recursive template inclusion.
     * 
     * **Parameter Mapping from CallExtensionAsync:**
     * - In parse(): `new nodes.CallExtensionAsync(this, 'run', params)`
     * - Results in: `run(context, body, callBack)`
     * 
     * The `body` parameter will be undefined since TemplateEmbed is a self-closing tag
     * that doesn't parse body content. The template name and configuration come from
     * the parsed parameters instead.
     * 
     * @param context - Nunjucks template rendering context containing variables and data
     * @param body - Will be undefined for self-closing template tags (not used)
     * @param callBack - Async callback function to return results or errors
     * 
     * @example
     * ```nunjucks
     * {% template "HeaderTemplate" %}
     * {% template "UserCard", type="HTML" %}
     * {% template "Footer", data={year: 2024} %}
     * ```
     */
    public run(context: Context, body: any, callBack: NunjucksCallback) {
        try {
            // Extract template name (first parameter)
            const bodyString: string = body ? body : '';
            const params = bodyString.split(',');

            /*
                Possible Formats for the body of the template tag:

                Basic Usage:

                {% template "TemplateName" %}

                With Optional Parameters:

                {% template "TemplateName", type="HTML" %}
                {% template "TemplateName", data={key: "value"} %}
                {% template "TemplateName", type="PlainText", data={extra: "data"} %}              


                So we need to take the params array we have above and each item is either just a string
                ' e.g. the TemplateName, or a key-value pair like 'type="HTML"' or 'data={key: "value"}'
                We will parse these into a structured object for easier handling.
             */
            const parsedParams: Array<{propertyName: string, value: string}> = params.map(param => {
                // Split by the first '=' to separate property name and value
                const [propertyName, ...valueParts] = param.split('=');
                const value = valueParts.join('=').trim().replace(/^"|"$/g, ''); // Remove surrounding quotes if any
                if (value.trim() === '') {
                    return { propertyName: 'template', value: propertyName.trim() }; // Default to 'template' if no value provided
                }
                else {
                    return { propertyName: propertyName.trim(), value: value };
                }
            });

            if (!parsedParams || parsedParams.length === 0) {
                throw new Error('Template name is required for template embedding');
            }

            const templateName = parsedParams.find(param => param.propertyName === 'template')?.value || parsedParams[0].value;
            if (!templateName || typeof templateName !== 'string') {
                throw new Error('Template name must be a non-empty string');
            }

            // Parse optional configuration parameters
            let config: TemplateEmbedConfig = {};
            if (params.length > 1) {
                // Additional parameters should be key-value pairs
                for (let i = 1; i < params.length; i += 2) {
                    if (i + 1 < params.length) {
                        const key = params[i];
                        const value = params[i + 1];
                        config[key] = value;
                    }
                }
            }

            // Get the template engine instance
            const templateEngine = TemplateEngineServer.Instance;
            
            // Initialize render context for cycle detection
            let renderContext: RenderContext = context.ctx._mjRenderContext;
            if (!renderContext) {
                renderContext = {
                    templateStack: [],
                    currentContentType: undefined
                };
                context.ctx._mjRenderContext = renderContext;
            }

            // Check for cycles before proceeding
            if (renderContext.templateStack.includes(templateName)) {
                const cyclePath = [...renderContext.templateStack, templateName].join(' → ');
                throw new Error(`Cycle detected in template embedding: ${cyclePath}`);
            }

            // Find the target template
            const targetTemplate = templateEngine.FindTemplate(templateName);
            if (!targetTemplate) {
                throw new Error(`Template "${templateName}" not found`);
            }

            // Determine the content type to use
            const contentType = this.resolveContentType(config.type, renderContext.currentContentType, targetTemplate);
            const templateContent = this.getTemplateContent(targetTemplate, contentType);
            
            if (!templateContent) {
                throw new Error(`No suitable content found for template "${templateName}" with type "${contentType}"`);
            }

            // Prepare data context for the embedded template
            const embeddedData = this.prepareDataContext(context.ctx, config.data);

            // Add current template to the stack to prevent cycles
            renderContext.templateStack.push(templateName);
            const originalContentType = renderContext.currentContentType;
            renderContext.currentContentType = templateContent.Type;

            // Render the embedded template asynchronously
            this.renderEmbeddedTemplate(templateEngine, templateContent, embeddedData)
                .then((result) => {
                    // Remove template from stack after successful rendering
                    renderContext.templateStack.pop();
                    renderContext.currentContentType = originalContentType;
                    callBack(null, result);
                })
                .catch((error) => {
                    // Remove template from stack on error as well
                    renderContext.templateStack.pop();
                    renderContext.currentContentType = originalContentType;
                    LogError(error);
                    callBack(error);
                });

        } catch (error) {
            LogError(error);
            callBack(error);
        }
    }

    /**
     * Resolves the content type to use for the embedded template.
     * Priority order:
     * 1. Explicit type parameter
     * 2. Current template's content type
     * 3. Highest priority content available in target template
     */
    private resolveContentType(explicitType: string | undefined, currentType: string | undefined, targetTemplate: TemplateEntityExtended): string {
        // 1. Use explicit type if provided
        if (explicitType) {
            return explicitType;
        }

        // 2. Use current content type if available
        if (currentType) {
            const matchingContent = targetTemplate.GetContentByType(currentType);
            if (matchingContent && matchingContent.length > 0) {
                return currentType;
            }
        }

        // 3. Fall back to highest priority content
        const highestPriorityContent = targetTemplate.GetHighestPriorityContent();
        if (highestPriorityContent) {
            return highestPriorityContent.Type;
        }

        // This should not happen if template has any content, but provide a fallback
        throw new Error(`No content available for template "${targetTemplate.Name}"`);
    }

    /**
     * Gets the template content for the specified type with fallback logic.
     */
    private getTemplateContent(template: TemplateEntityExtended, contentType: string): MJTemplateContentEntity | null {
        // Try to get content of the specified type
        const contentByType = template.GetContentByType(contentType);
        if (contentByType && contentByType.length > 0) {
            // Return highest priority content of this type
            return contentByType.sort((a, b) => b.Priority - a.Priority)[0];
        }

        // Fall back to highest priority content of any type
        return template.GetHighestPriorityContent();
    }

    /**
     * Prepares the data context for the embedded template by merging current context with additional data.
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
     * Renders the embedded template content with the provided data context.
     */
    private async renderEmbeddedTemplate(templateEngine: any, templateContent: MJTemplateContentEntity, data: any): Promise<string> {
        // Use the template engine's simple rendering method which handles Nunjucks environment setup
        const result = await templateEngine.RenderTemplateSimple(templateContent.TemplateText, data);
        
        if (!result.Success) {
            throw new Error(`Failed to render embedded template: ${result.Message}`);
        }

        return result.Output;
    }
}