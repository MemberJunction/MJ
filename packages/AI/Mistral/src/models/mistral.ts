import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { MistralClient } from './mistralClient';
import { ChatCompletionResponseChoice, ListModelsResponse } from '../generic/mistral.types';

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

export function LoadMistralLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}