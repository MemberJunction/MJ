export class ProcessRunParams {
    sourceID: string;
    startTime: Date;
    endTime: Date;
    numItemsProcessed: number;
}

export class ContentItemProcessParams {
    text: string;
    modelID: string;
    minTags: number;
    maxTags: number;
    contentItemID: string;
    contentTypeID: string;
    contentFileTypeID: string;
    contentSourceTypeID: string;
}

export class ContentItemProcessResults {
    title: string;
    author: string[];
    publicationDate: Date;
    keywords: string[];
    content_text: string;
    processStartTime: Date;
    processEndTime: Date;
    contentItemID: string;
}

export interface JsonObject {
    [key: string]: any;
}