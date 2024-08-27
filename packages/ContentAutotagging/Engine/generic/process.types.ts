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

export const ModelTokenLimits: Record<string, number> = {
    // OpenAI
    "gpt-3.5-turbo": 16385,
    "gpt-4-turbo-preview": 128000,
    "gpt-4o": 128000,
    "gpt-4o-mini": 1000,
    // Anthropic
    "claude-3-haiku-20240307": 200000,
    "claude-3-sonnet-20240229": 200000,
    "claude-3-opus-20240229": 200000,
    "claude-3-5-sonnet-20240620": 200000,
    // Mistral
    "mixtral-8x7b-32768": 32000,
    "open-mistral-7b": 32000,
    // Groq
    "llama2-70b-4096": 4096,
    "llama3-70b-8192": 8192,
    "llama-3.1-8b-instant": 12800,
    "llama-3.1-70b-versatile": 128000,
    "llama-3.1-405b-reasoning": 128000,
    // Google
    "gemini-1.5-pro-latest": 2097152,
    "gemini-ultra": 2097152
}