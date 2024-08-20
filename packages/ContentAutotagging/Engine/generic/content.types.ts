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

export class ContentSourceTypeParams {
    contentSourceID: string;
    contentSourceTypeID: string;
    name: string;
    value: string;
    type: string;
}