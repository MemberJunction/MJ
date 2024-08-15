export class ContentItemParams {
    contentSourceID: number;
    name: string;
    description?: string;
    ContentTypeID: number;
    ContentSourceTypeID: number;
    ContentFileTypeID: number;
    URL: string;
    AIModelID?: string;
    minTags?: number;
    maxTags?: number;
}

export class ContentSourceParams {
    contentSourceID: number;
    name?: string;
    description?: string;
    ContentTypeID: number;
    ContentSourceTypeID: number;
    ContentFileTypeID: number;
    URL: string;
    AIModelID?: string;
    minTags?: number;
    maxTags?: number;
}

export class ContentSourceTypeParams {
    contentSourceID: number;
    contentSourceTypeID: number;
    name: string;
    value: string;
    type: string;
}