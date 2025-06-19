import { BaseEntity, EntitySaveOptions, ValidationResult } from "@memberjunction/core";
import { TemplateContentEntity, TemplateEntity, TemplateParamEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseEntity, 'Templates')
export class TemplateEntityExtended extends TemplateEntity {
    private _Content: TemplateContentEntity[] = [];
    public get Content(): TemplateContentEntity[] {
        return this._Content;
    }
    public set Content(value: TemplateContentEntity[]) {
        this._Content = value;
    }

    private _Params: TemplateParamEntity[] = [];
    public get Params(): TemplateParamEntity[] {
        return this._Params;
    }
    public set Params(value: TemplateParamEntity[]) {
        this._Params = value;
    }

    /**
     * Returns all content for a given type for the template
     * @param type 
     * @returns 
     */
    public GetContentByType(type: string): TemplateContentEntity[] {
        return this.Content.filter(c => c.Type.trim().toLowerCase() === type.trim().toLowerCase());
    }

    /**
     * Returns the highest priority content for the template
     * @param type If provided, returns the highest priority content of the specified type
     * @returns 
     */
    public GetHighestPriorityContent(type?: string): TemplateContentEntity {
        if (type) {
            return this.Content.filter(c => c.Type.trim().toLowerCase() === type.trim().toLowerCase())
                .sort((a, b) => a.Priority - b.Priority)[0];
        }
        else {
            return this.Content.sort((a, b) => a.Priority - b.Priority)[0];
        }
    }

    /**
     * Returns all parameters that apply to a specific template content.
     * This includes both global parameters (where TemplateContentID is NULL) 
     * and content-specific parameters for the given contentId.
     * 
     * @param contentId - The ID of the template content. If not provided, returns only global parameters.
     * @returns Array of TemplateParamEntity objects that apply to the specified content
     * 
     * @example
     * // Get all parameters for a specific content
     * const params = template.GetParametersForContent('content-uuid');
     * 
     * @example
     * // Get only global parameters (that apply to all contents)
     * const globalParams = template.GetParametersForContent();
     */
    public GetParametersForContent(contentId?: string): TemplateParamEntity[] {
        if (!contentId) {
            // Return only global parameters (TemplateContentID is null)
            return this.Params.filter(p => !(p as any).TemplateContentID);
        }
        
        // Return both global parameters and content-specific parameters
        return this.Params.filter(p => 
            !(p as any).TemplateContentID || // Global param (applies to all contents)
            (p as any).TemplateContentID === contentId // Content-specific param
        );
    }

    /**
     * This method is different from the Validate() method which validates the state of the Template itself. 
     * This method validates the data object provided meets the requirements for the template's parameter definitions.
     * 
     * @param data - the data object to validate against the template's parameter definitions
     * @param contentId - Optional: The ID of the template content to validate against. 
     *                    If provided, validates against parameters specific to that content.
     *                    If not provided, validates against all parameters.
     * @returns ValidationResult with success status and any validation errors
     * 
     * @example
     * // Validate against all parameters
     * const result = template.ValidateTemplateInput(inputData);
     * 
     * @example
     * // Validate against parameters for a specific content
     * const result = template.ValidateTemplateInput(inputData, 'content-uuid');
     */
    public ValidateTemplateInput(data: any, contentId?: string): ValidationResult {
        const result = new ValidationResult();
        
        // Get the relevant parameters based on contentId
        const paramsToValidate = contentId ? 
            this.GetParametersForContent(contentId) : 
            this.Params;
        
        paramsToValidate.forEach((p) => {
            if (p.IsRequired) {
                if (!data ||
                    data[p.Name] === undefined || 
                    data[p.Name] === null || 
                    (typeof data[p.Name] === 'string' && data[p.Name].toString().trim() === ''))
                    result.Errors.push({
                        Source: p.Name,
                        Message: `Parameter ${p.Name} is required.`,
                        Value: data[p.Name],
                        Type: 'Failure'
                    });
            }
        });
        // now set result's top level success flag based on the existence of ANY failure record within the errors collection
        result.Success = result.Errors.some(e => e.Type === 'Failure') ? false : true;
        return result;
    }
}

export function LoadTemplateEntityExtended() {
    // this does nothing but prevents the class from being removed by the tree shaker
}