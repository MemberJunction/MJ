export declare class ProcessRunParams {
    sourceID: string;
    startTime: Date;
    endTime: Date;
    numItemsProcessed: number;
}
export declare class ContentItemProcessParams {
    text: string;
    name: string;
    modelID: string;
    minTags: number;
    maxTags: number;
    contentItemID: string;
    contentTypeID: string;
    contentFileTypeID: string;
    contentSourceTypeID: string;
}
export declare class ContentItemProcessResults {
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
export interface StructuredPDFContent {
    rawText: string;
    tables: any[];
    hasTabularData: boolean;
    contentType: 'tabular' | 'text' | 'mixed';
    pdfBuffer?: Buffer;
}
export declare class ContentItemProcessParamsExtended extends ContentItemProcessParams {
    structuredData?: StructuredPDFContent;
    preserveTableStructure?: boolean;
    pdfBuffer?: Buffer;
}
export interface ContentDiscoveryResult {
    identifier: string;
    contentSourceId: string;
    lastModified?: Date;
    action: 'create' | 'update';
    sourceType: string;
    metadata?: {
        url?: string;
        [key: string]: any;
    };
}
//# sourceMappingURL=process.types.d.ts.map