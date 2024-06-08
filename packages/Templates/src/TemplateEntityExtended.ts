import { BaseEntity, ValidationResult } from "@memberjunction/core";
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
     * This method is different from the Validate() method which validates the state of the Template itself. This method validates the data object provided meets the requirements for the template's parameter definitions.
     * @param data - the data object to validate against the template's parameter definitions
     */
    public ValidateTemplateInput(data: any): ValidationResult {
        const result = new ValidationResult();
        this.Params.forEach((p) => {
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
        // now set result's top level success falg based on the existence of ANY failure record within the errors collection
        result.Success = result.Errors.some(e => e.Type === 'Failure') ? false : true;
        return result;
    }
}