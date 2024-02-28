import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { BaseLLM, ChatMessage, ChatMessageRole, ChatParams, ChatResult, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseLLM, "MistralLLM")
export class MistralLLM extends BaseLLM {
    private apiBaseURL: string;
    private enableSafePrompt: boolean;

    constructor(apiKey: string) {
        super(apiKey);
        // need to do this another way, we don't want classes to rely on .env files directly
        // this.apiBaseURL = process.env.MISTRAL_API_BASE_URL || "";
        this.enableSafePrompt = process.env.MISTRAL_ENABLE_SAFE_PROMPT === "true";
    }

    public async ChatCompletion(params: ChatParams): Promise<ChatResult>{
        const config: AxiosRequestConfig = {
            method: "post",
            baseURL: this.apiBaseURL,
            url: "/chat/completions",
            headers: {
                Authorization: `Bearer ${this.apiKey}`
            },
            data: {
                model: params.model,
                messages: params.messages,
                safe_prompt: this.enableSafePrompt
            }
        };
        let result: any = await this.callApi(config);
        console.log(result);
        console.log(result.choices);
        return result;
    }
 
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error("Method not implemented.");
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }

    /**
     * Helper function to ask a simple question and return the response
     * @param prompt 
     */
    public async Ask(prompt: string): Promise<void> {
        let response: ChatCompletionResponse = await this.ChatSingle(prompt, undefined, MistralModels.Tiny);
        console.log(response);
        response.choices.forEach((choice: ChatCompletionResponseChoice) => {
            console.log(choice.message.content);
        });
    }

    /**
     * Returns a list of available models
     * @returns {Promise<AvailableModelInfo>}
     */
    public async ListModels(): Promise<ListModelsResponse> {
        const request: AxiosRequestConfig = this.createAxiosRequestConfig('get', 'models');
        let response: ListModelsResponse = await this.callApi(request); 
        return response;
    }

    public async ChatSingle(
        message: string, 
        role: string = MistralRoles.User, 
        model: string = MistralModels.Medium,
        temperature: number = null,
        maxTokens: number = null,
        topP: number = null,
        randomSeed: number = null,
        safePrompt: boolean = this.enableSafePrompt
        ): Promise<ChatCompletionResponse> {
            const chatMessage: ChatMessage[] = [
                {
                    role: <ChatMessageRole>role,
                    content: message
                }
            ];
            return await this.Chat(chatMessage, model, temperature, maxTokens, topP, randomSeed, safePrompt);
    }

    public async Chat( 
        messages: ChatMessage[],
        model: string = MistralModels.Medium,
        temperature: number = null,
        maxTokens: number = null,
        topP: number = null,
        randomSeed: number = null,
        safePrompt: boolean = this.enableSafePrompt
        ): Promise<ChatCompletionResponse> {
        
        const request: ChatCompletetionRequest = this.MakeChatCompletionRequest(model, messages, temperature, maxTokens, topP, randomSeed, false, safePrompt);
        const axiosRequest: AxiosRequestConfig = this.createAxiosRequestConfig('post', "chat/completions", request);
        return await this.callApi<ChatCompletionResponse>(axiosRequest);
    }

    private MakeChatCompletionRequest (
        model: string,
        messages: ChatMessage[],
        temperature: number = null,
        maxTokens: number = null,
        topP: number = null,
        randomSeed: number = null,
        stream: boolean = null,
        safePrompt: boolean = null,
      ): ChatCompletetionRequest {
        return {
          model: model,
          messages: messages,
          temperature: temperature ?? undefined,
          max_tokens: maxTokens ?? undefined,
          top_p: topP ?? undefined,
          random_seed: randomSeed ?? undefined,
          stream: stream ?? undefined,
          safe_prompt: safePrompt ?? undefined,
        };
    };

    private createAxiosRequestConfig(method: string, path: string, options: ChatCompletetionRequest = null): AxiosRequestConfig {
        return {
            method: method,
            baseURL: this.apiBaseURL,
            url: `/${path}`,
            headers: {
                Accept: options?.stream? 'text/event-stream': 'application/json',
                ContentType: 'application/json',
                Authorization: `Bearer ${this.apiKey}`
            },
            data: method !== 'get' ? options : null,
            timeout: 120 * 1000
        }
    }

    private async callApi<T>(data: AxiosRequestConfig): Promise<T> {
        try {
          const response: AxiosResponse = await axios(data);
          return response.data;
        } catch (error) {
            console.log(error);
            console.error("An error occured when making request to", data.baseURL + data.url, ":\n", error.data?.message);
            return null;
        }
    };

    public createChatMessages(prompts: string[], role: string = 'user'): ChatMessage[] {
        let messages: ChatMessage[] = [];
        prompts.forEach((prompt: string) => {
            messages.push({
                role: <ChatMessageRole>role,
                content: prompt 
            });
        });

        return messages;
    }
}

export const MistralRoles = {
    User: 'user',
    System: 'system'
}

export const MistralModels = {
    Tiny: "mistral-tiny",
    Small: "mistral-small",
    Medium: "mistral-medium"
}

export interface ModelPermission {
    id: string;
    object: 'model_permission';
    created: number;
    allow_create_engine: boolean;
    allow_sampling: boolean;
    allow_logprobs: boolean;
    allow_search_indices: boolean;
    allow_view: boolean;
    allow_fine_tuning: boolean;
    organization: string;
    group: string | null;
    is_blocking: boolean;
}

export interface Model {
    id: string;
    object: 'model';
    created: number;
    owned_by: string;
    root: string | null;
    parent: string | null;
    permission: ModelPermission[];
}

export interface ListModelsResponse {
    object: 'list';
    data: Model[];
}

export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export type ChatCompletetionRequest = {
    model: string,
    messages: ChatMessage[],
    temperature: number,
    max_tokens: number,
    top_p: number,
    random_seed: number,
    stream: boolean,
    safe_prompt: boolean
}

export interface ChatCompletionResponseChoice {
    index: number;
    message: {
        role: string;
        content: string;
    };
    finish_reason: string;
}

export interface ChatCompletionResponseChunkChoice {
    index: number;
    delta: {
        role?: string;
        content?: string;
    };
    finish_reason: string;
}

export interface ChatCompletionResponse {
    id: string;
    object: 'chat.completion';
    created: number;
    model: string;
    choices: ChatCompletionResponseChoice[];
    usage: TokenUsage;
}

export interface ChatCompletionResponseChunk {
    id: string;
    object: 'chat.completion.chunk';
    created: number;
    model: string;
    choices: ChatCompletionResponseChunkChoice[];
}

export interface Embedding {
    id: string;
    object: 'embedding';
    embedding: number[];
}

export interface EmbeddingResponse {
    id: string;
    object: 'list';
    data: Embedding[];
    model: string;
    usage: TokenUsage;
}