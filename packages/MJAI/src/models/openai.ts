import { ModelUsage } from "../generic/baseModel";
import { ChatMessage, ChatParams, ChatResult, GetUserMessageFromChatParams } from "../generic/chat.types";
import { SummarizeParams, SummarizeResult } from '../generic/summarize.types';
import { ClassifyParams, ClassifyResult } from '../generic/classify.types';
import { BaseLLM } from '../generic/baseLLM';
import { RegisterClass } from '@memberjunction/global'
import { ChatCompletionRequestMessage } from "openai";

const { ChatCompletionRequestMessageRoleEnum, Configuration, OpenAIApi } = require("openai");

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
            messages: messages
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
