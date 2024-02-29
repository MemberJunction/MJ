import { BaseLLM, ChatMessage, ChatParams, ChatResult, ClassifyParams, ClassifyResult, EmbedParams, EmbedResult, GetUserMessageFromChatParams, ModelUsage, SummarizeParams, SummarizeResult } from '@memberjunction/ai';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum, Configuration, CreateEmbeddingRequest, CreateEmbeddingResponse, OpenAIApi } from "openai";
import { RegisterClass } from '@memberjunction/global';
import { EmbeddingModels } from './embeddingModels.types';

@RegisterClass(BaseLLM, 'OpenAILLM')
export class OpenAILLM extends BaseLLM {
    static _openAI;//: OpenAIApi;

    constructor(apiKey: string) {
        super(apiKey);
        const configuration = new Configuration({
            apiKey: apiKey
        });
        if (!OpenAILLM._openAI)
            OpenAILLM._openAI = new OpenAIApi(configuration);
    }

    public async ChatCompletion(params: ChatParams): Promise<ChatResult>{
        const messages = this.ConvertMJToOpenAIChatMessages(params.messages);


        const startTime = new Date();
        const result = await OpenAILLM._openAI.createChatCompletion({
            model: params.model,
            messages: messages,
            temperature: params.temperature,
        });
        const endTime = new Date();
        const timeElapsed = endTime.getTime() - startTime.getTime();

        return {
            data: {
                choices: result.data.choices.map((c: { message: { role: string | number; content: any; }; finish_reason: any; index: any; }) => {
                    return {
                        message: {
                            role: ChatCompletionRequestMessageRoleEnum[c.message.role],
                            content: c.message.content
                        },
                        finish_reason: c.finish_reason,
                        index: c.index
                    }
                }),
                usage: new ModelUsage(result.data.usage.prompt_tokens, result.data.usage.completion_tokens)
            },
            success: result.status === 200,
            statusText: result.statusText,
            startTime: startTime,
            endTime: endTime,
            timeElapsed: timeElapsed,
            errorMessage: null,
            exception: null
        }
    }


    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        const messages = this.ConvertMJToOpenAIChatMessages(params.messages);


        const startTime = new Date();
        const result = await OpenAILLM._openAI.createChatCompletion({
            model: params.model,
            messages: messages
        });
        const endTime = new Date();

        const success = result.data && result.data.choices && result.data.choices.length > 0;
        let summaryText = null;
        if (success)
            summaryText = result.data.choices[0].message.content;

        return new SummarizeResult(GetUserMessageFromChatParams(params), summaryText, success, startTime, endTime);
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }

    public async EmbedText(params: EmbedParams): Promise<EmbedResult> {
        try{
            const request: CreateEmbeddingRequest = {
                model: params.model,
                input: params.text
            };

            const AxiosResponse = await OpenAILLM._openAI.createEmbedding(request);
            const data: CreateEmbeddingResponse = AxiosResponse.data;
            return {
                object: 'object',
                model: params.model,
                ModelUsage: new ModelUsage(data.usage.prompt_tokens, 0),
                data: data.data[0].embedding
            }
        }
        catch(error){
            console.log("error creating embedding:", error.response.data);
            return null;
        }
    }

    public async createEmbedding(text: string, options?: any): Promise<CreateEmbeddingResponse> {
        try{
            const request: CreateEmbeddingRequest = {
                model: options.model || EmbeddingModels.ada,
                input: text
            }

            const AxiosResponse = await OpenAILLM._openAI.createEmbedding(request);
            const data: CreateEmbeddingResponse = AxiosResponse.data;
            return data;
        }
        catch(error){
            console.log("error creating embedding:", error.response.data);
            return null;
        }
    }

    public ConvertMJToOpenAIChatMessages(messages: ChatMessage[]): ChatCompletionRequestMessage[] {
        // add user messages - using types OpenAI likes
        return messages.map(m => {
            return {
                role: this.ConvertMJToOpenAIRole(m.role), 
                content: m.content
            }
        });
    }

    public ConvertMJToOpenAIRole(role: string) {//}: ChatCompletionRequestMessageRoleEnum {
        switch (role.trim().toLowerCase()) {
            case 'system':
                return ChatCompletionRequestMessageRoleEnum.System
            case 'user':
                return ChatCompletionRequestMessageRoleEnum.User
            case 'assistant':
                return ChatCompletionRequestMessageRoleEnum.Assistant
            default:
                throw new Error(`Unknown role ${role}`)
        }
    }
}

export function LoadOpenAILLM() {
    // does nothing, avoid tree shaking that will get rid of this class since there is no static link to this class in the code base as it is loaded dynamically
}
