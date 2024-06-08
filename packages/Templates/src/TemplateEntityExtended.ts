import { BaseEntity } from "@memberjunction/core";
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
}