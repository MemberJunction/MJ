export class ProcessRunParams {
    sourceID;
    startTime;
    endTime;
    numItemsProcessed;
}
export class ContentItemProcessParams {
    text;
    name;
    modelID;
    minTags;
    maxTags;
    contentItemID;
    contentTypeID;
    contentFileTypeID;
    contentSourceTypeID;
}
export class ContentItemProcessResults {
    title;
    author;
    publicationDate;
    keywords;
    content_text;
    processStartTime;
    processEndTime;
    contentItemID;
}
export class ContentItemProcessParamsExtended extends ContentItemProcessParams {
    structuredData;
    preserveTableStructure;
    pdfBuffer; // For vision model processing
}
//# sourceMappingURL=process.types.js.map