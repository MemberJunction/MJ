import { RunViewParams, UserInfo } from "@memberjunction/core";
import { EntityDocumentEntity } from "@memberjunction/core-entities";

/**
 * Contains the results of a call to render a template
 */
export class TemplateRenderResult {
    Success: boolean;
    Output: string;
    /**
     * Optional, typically used only for Success=false
     */
    Message?: string;
};

export type RenderTemplateWithParamDataParams = {
    TemplateID: string,
    EntityID: string,
    Data: Record<string, any>;
    ValidateParams: boolean;
    CurrentUser: UserInfo;
    EntityRunViewParams?: RunViewParams;
    TemplateContentID?: string;
};

export type TemplateParamData = {
    ParamName: string;
    Data: any;
};