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

export interface TableColumn {
    name: string;
    values: string[];
    dataType?: 'number' | 'currency' | 'text' | 'date';
}

export interface TableStructure {
    title?: string;
    headers: string[];
    rows: string[][];
    columns: TableColumn[];
    metadata?: {
        totalRows: number;
        totalColumns: number;
        hasSteps?: boolean;
        stepColumn?: string;
        salaryColumns?: string[];
    };
}

export interface StructuredPDFContent {
    rawText: string;
    tables: TableStructure[];
    hasTabularData: boolean;
    contentType: 'tabular' | 'text' | 'mixed';
}

export class ContentItemProcessParamsExtended extends ContentItemProcessParams {
    structuredData?: StructuredPDFContent;
    preserveTableStructure?: boolean;
}