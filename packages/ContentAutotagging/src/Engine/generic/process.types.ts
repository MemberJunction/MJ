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
    /** The owning ContentSource ID — used to resolve the source-level classification context. */
    contentSourceID?: string;
    /**
     * Effective classification-context string assembled from the org/content-type/source
     * scopes and injected into the autotagging prompt as `classificationContext`. Resolved
     * once per item before chunking so the (async) lookup isn't repeated per chunk.
     */
    classificationContext?: string;
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