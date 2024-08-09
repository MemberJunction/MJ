export class ContentItemProcessParams {
    text: string;
    modelID: string;
    minTags: number;
    maxTags: number;
    contentItemID: number;
    contentTypeID: number;
    contentFileTypeID: number;
    contentSourceTypeID: number;
}

export class ContentItemProcessResults {
    title: string;
    author: string[];
    publicationDate: Date;
    keywords: string[];
    content_text: string;
    processStartTime: Date;
    processEndTime: Date;
    contentItemID: number;
}