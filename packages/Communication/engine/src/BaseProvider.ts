import { ProcessedMessage } from "@memberjunction/communication-types";
import { LogError, UserInfo } from "@memberjunction/core";
import { TemplateEngineServer } from '@memberjunction/templates';
  
/**
 * Server side implementation that calls the templating engine to process the message
 */
export class ProcessedMessageServer extends ProcessedMessage {
    public async Process(forceTemplateRefresh?: boolean, contextUser?: UserInfo): Promise<{Success: boolean, Message?: string}> {
        if (this.BodyTemplate || this.SubjectTemplate || this.HTMLBodyTemplate)
            await TemplateEngineServer.Instance.Config(forceTemplateRefresh, contextUser); // make sure the template engine is configured if we are using either template

        if (this.BodyTemplate) {
            // process the body template
            const regularContent = this.BodyTemplate.GetHighestPriorityContent('Text');
            if (!regularContent)
                return {
                    Success: false,
                    Message: 'BodyTemplate does not have a Text option and this is required for processing the body of the message.'
                };

            const result = await TemplateEngineServer.Instance.RenderTemplate(this.BodyTemplate, regularContent, this.ContextData);
            if (result && result.Success) {
                this.ProcessedBody = result.Output;
            }
            else {
                LogError(`Failed to render template for body: ${result.Message}`);
                return {
                    Success: false,
                    Message: result.Message                
                };
            }

            if (!this.HTMLBodyTemplate) { // if we have an HTMLBodyTemplate, we will process it separately below
                const htmlContent = this.BodyTemplate.GetHighestPriorityContent('HTML');
                if (htmlContent) {
                    const result = await TemplateEngineServer.Instance.RenderTemplate(this.BodyTemplate, htmlContent, this.ContextData);
                    if (result && result.Success) {
                        this.ProcessedHTMLBody = result.Output;
                    }
                    else {
                        LogError(`Failed to render template for html body: ${result.Message}`);
                        return {
                            Success: false,
                            Message: result.Message
                        }
                    }    
                }
                else {
                    // our BodyTemplate does NOT have an HTML option, so we will use the regular content to render the HTML
                    this.ProcessedHTMLBody = this.ProcessedBody;
                }
            }
        }
        else {
            this.ProcessedBody = this.Body;
        }

        if (this.HTMLBodyTemplate) {
            // process the subject template
            const htmlContent = this.HTMLBodyTemplate.GetHighestPriorityContent('HTML');
            if (htmlContent) {
                const result = await TemplateEngineServer.Instance.RenderTemplate(this.HTMLBodyTemplate, htmlContent, this.ContextData);
                if (result && result.Success) {
                    this.ProcessedHTMLBody = result.Output;
                }
                else {
                    LogError(`Failed to render template for html body 2: ${result.Message}`);
                    return {
                        Success: false,
                        Message: result.Message
                    }
                }    
            }
            else {
                return {
                    Success: false,
                    Message: 'HTMLBodyTemplate does not have an HTML option and this is required for processing the HTML body of the message.'
                }
            }
        }

        if (this.SubjectTemplate) {
            // process the subject template
            const subjectContent = this.SubjectTemplate.GetHighestPriorityContent('HTML');
            if (subjectContent) {
                const result = await TemplateEngineServer.Instance.RenderTemplate(this.SubjectTemplate, subjectContent, this.ContextData);
                if (result && result.Success) {
                    this.ProcessedSubject = result.Output;
                }
                else {
                    LogError(`Failed to render template for subject: ${result.Message}`);
                    return {
                        Success: false,
                        Message: result.Message
                    }
                }
            }
            else {
                return {
                    Success: false,
                    Message: 'SubjectTemplate does not have an associated HTML Template Content option and this is required for processing the subject of the message.'
                }
            }
        }
        else {
            this.ProcessedSubject = this.Subject || '';
        }

        return {
            Success: true
        }
    }
}
 
 