import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ClassifyParams, ClassifyResult, EmbedParams, EmbedResult, ModelUsage, SummarizeParams, SummarizeResult } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { ChatCompletionResponseChoice, EmbeddingResponse, ListModelsResponse, MistralClient } from './mistralClient';

@RegisterClass(BaseLLM, "MistralLLM")
export class MistralLLM extends BaseLLM {
    static _client: MistralClient;
    constructor(apiKey: string) {
        super(apiKey);
        if (!MistralLLM._client){
            MistralLLM._client = new MistralClient({ apiKey });
        }
    }

    public get client(): MistralClient {return MistralLLM._client;}

    public async ChatCompletion(params: MistralChatParams): Promise<ChatResult>{
        const startTime = new Date();
        const chatResponse = await this.client.chat({
            model: params.model,
            messages: params.messages
        });
        const endTime = new Date();

        let choices: ChatResultChoice[] = chatResponse.choices.map((choice: ChatCompletionResponseChoice) => {
            const res: ChatResultChoice = {
                message: {
                    role: 'assistant',
                    content: choice.message.content
                },
                finish_reason: choice.finish_reason,
                index: choice.index
            };
            return res;
        });
        
        return {
            success: true,
            statusText: "OK",
            startTime: startTime,
            endTime: endTime,
            timeElapsed: endTime.getTime() - startTime.getTime(),
            data: {
                choices: choices,
                usage: {
                    totalTokens: chatResponse.usage.total_tokens,
                    promptTokens: chatResponse.usage.prompt_tokens,
                    completionTokens: chatResponse.usage.completion_tokens
                }
            },
            errorMessage: "",
            exception: null,
        }

    }
 
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error("Method not implemented.");
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }

    public async createEmbedding(model: string, text: string): Promise<EmbeddingResponse> {
        const response: EmbeddingResponse = await this.client.embeddings(model, text);
        return response;
    }

    public async EmbedText(params: EmbedParams): Promise<EmbedResult> {
        const response: EmbeddingResponse = await this.client.embeddings(params.model, params.text);
        return {
            object: 'object',
            model: params.model || "mistral-embed", //hard coded for now as theres only one available embedding model
            ModelUsage: new ModelUsage(response.usage.prompt_tokens, response.usage.completion_tokens),
            data: response.data[0].embedding
        }
    }

    /**
     * Returns a list of available models
     * @returns {Promise<AvailableModelInfo>}
     */
    public async listModels(): Promise<ListModelsResponse> {
        const listModelsResponse: ListModelsResponse = await this.client.listModels();
        return listModelsResponse;
    }
}

export class MistralChatParams extends ChatParams {
    model: string;
}