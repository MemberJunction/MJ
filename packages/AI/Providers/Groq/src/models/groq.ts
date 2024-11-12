import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import Groq from 'groq-sdk';

/**
 * Groq implementation of the BaseLLM class
 */
@RegisterClass(BaseLLM, "GroqLLM")
export class GroqLLM extends BaseLLM {
    private _client: Groq;
    constructor(apiKey: string) {
        super(apiKey);
        this._client = new Groq({ apiKey: apiKey });
    }

    /**
     * Read only getter method to get the Groq client instance
     */
    public get GroqClient(): Groq {
        return this._client;
    }

    /**
     * Read only getter method to get the Groq client instance, deprecated
     * @deprecated
     */
    public get client(): Groq {
        return this.GroqClient;
    }

    public async ChatCompletion(params: ChatParams): Promise<ChatResult>{
        const startTime = new Date();


        const chatResponse = await this.client.chat.completions.create({
            model: params.model,
            messages: params.messages, 
            max_tokens: params.maxOutputTokens
        });
        const endTime = new Date();

        let choices: ChatResultChoice[] = chatResponse.choices.map((choice: any) => {
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
}
 
export function LoadGroqLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}