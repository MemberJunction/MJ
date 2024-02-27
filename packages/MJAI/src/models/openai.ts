import { ModelUsage } from "../generic/baseModel";
import { ChatParams, ChatResult } from "../generic/chat.types";
import { SummarizeParams, SummarizeResult } from '../generic/summarize.types';
import { ClassifyParams, ClassifyResult } from '../generic/classify.types';
import { BaseLLM } from '../generic/baseLLM';
import { RegisterClass } from '@memberjunction/global'

const { ChatCompletionRequestMessageRoleEnum, Configuration, OpenAIApi } = require("openai");

@RegisterClass(BaseLLM, null, 1)
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
        const messages = []; 

        // add system prompt if we have one
        if (params.systemPrompt && params.systemPrompt.length > 0)
            messages.push({  
                role: ChatCompletionRequestMessageRoleEnum.System, 
                content: params.systemPrompt
            });

        // add user messages - using types OpenAI likes
        params.messages.forEach(m => {
            messages.push({
                role: this.convertRole(m.role), 
                content: m.content
            })
        });

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
            status: result.status,
            statusText: result.statusText,
            startTime: startTime,
            endTime: endTime,
            timeElapsed: timeElapsed,
            errorMessage: null,
            exception: null
        }
    }

    protected convertRole(role: string) {//}: ChatCompletionRequestMessageRoleEnum {
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

    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        const messages = []; 

        // load up the system message first 
        if (params.systemPrompt && params.systemPrompt.length > 0)
            messages.push({
                role: ChatCompletionRequestMessageRoleEnum.System,
                content: params.systemPrompt
            })

        // load up the user message(s)
        messages.push({
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: params.userMessage
        })

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

        return new SummarizeResult(params.userMessage, summaryText, success, startTime, endTime);
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }
}
