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
    correctedPdfBuffer?: Buffer; // Add buffer to pass corrected PDF through processing chain
}


export interface JsonObject {
    [key: string]: any;
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