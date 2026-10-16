import { ChatMessage } from "@memberjunction/ai";

export interface ModelPermission {
    id: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    object: 'model_permission';  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    created: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    allow_create_engine: boolean;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    allow_sampling: boolean;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    allow_logprobs: boolean;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    allow_search_indices: boolean;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    allow_view: boolean;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    allow_fine_tuning: boolean;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    organization: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    group: string | null;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    is_blocking: boolean;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
}

export interface Model {
    id: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    object: 'model';  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    created: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    owned_by: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    root: string | null;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    parent: string | null;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    permission: ModelPermission[];  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
}

export interface ListModelsResponse {
    object: 'list';  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    data: Model[];  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
}

export interface TokenUsage {
    prompt_tokens: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    completion_tokens: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    total_tokens: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
}

export type ChatCompletetionRequest = {
    model: string,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    messages: ChatMessage[],  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    temperature?: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    max_tokens?: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    top_p?: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    random_seed?: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    stream?: boolean,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    safe_prompt?: boolean,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    response_format?: any  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
}

export interface ChatCompletionResponseChoice {
    index: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    message: {  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        role: string;
        content: string;
    };
    finish_reason: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
}

export interface ChatCompletionResponseChunkChoice {
    index: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    delta: {  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        role?: string;
        content?: string;
    };
    finish_reason: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
}

export interface ChatCompletionResponse {
    id: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    object: 'chat.completion';  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    created: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    model: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    choices: ChatCompletionResponseChoice[];  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    usage: TokenUsage;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
}

export interface ChatCompletionResponseChunk {
    id: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    object: 'chat.completion.chunk';  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    created: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    model: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    choices: ChatCompletionResponseChunkChoice[];  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
}

export interface Embedding {
    id: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    object: 'embedding';  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    embedding: number[];  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
}

export interface EmbeddingResponse {
    id: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    object: 'list';  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    data: Embedding[];  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    model: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    usage: TokenUsage;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
}