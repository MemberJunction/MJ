export class ProcessRunParams {
    sourceID: string;
    startTime: Date;
    endTime: Date;
    numItemsProcessed: number;
}

export class ContentItemProcessParams {
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

export interface StructuredPDFContent {
    rawText: string;
    tables: any[]; // Empty array - no longer using table detection
    hasTabularData: boolean;
    contentType: 'tabular' | 'text' | 'mixed';
    pdfBuffer?: Buffer; // For vision model processing
}

export class ContentItemProcessParamsExtended extends ContentItemProcessParams {
    structuredData?: StructuredPDFContent;
    preserveTableStructure?: boolean;
    pdfBuffer?: Buffer; // For vision model processing
}

export interface ContentDiscoveryResult {
    identifier: string;        // Source-specific unique identifier
    contentSourceId: string;   
    lastModified?: Date;
    action: 'create' | 'update';
    sourceType: string;        // 'LocalFileSystem', 'AzureBlob', etc.
    metadata?: {
        url?: string;          // Actual URL when different from identifier
        [key: string]: any;    // Other source-specific data
    };
}