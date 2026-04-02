export class ContentItemParams {
    contentSourceID: string;
    name: string;
    description?: string;
    ContentTypeID: string;
    ContentSourceTypeID: string;
    ContentFileTypeID: string;
    URL: string;
    AIModelID?: string;
    minTags?: number;
    maxTags?: number;
}

export class ContentSourceParams {
    contentSourceID: string;
    name?: string;
    description?: string;
    ContentTypeID: string;
    ContentSourceTypeID: string;
    ContentFileTypeID: string;
    URL: string;
    AIModelID?: string;
    minTags?: number;
    maxTags?: number;
}

export type ContentSourceTypeParamValue = string | number | boolean | string[] | RegExp;

export class ContentSourceTypeParams {
    contentSourceID: string;
    contentSourceTypeID: string;
    name: string;
    value: ContentSourceTypeParamValue;
    type: string;
}