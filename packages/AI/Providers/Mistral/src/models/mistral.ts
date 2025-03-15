import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { Mistral } from "@mistralai/mistralai";
import { ChatCompletionChoice, ResponseFormat } from '@mistralai/mistralai/models/components';

@RegisterClass(BaseLLM, "MistralLLM")
export class MistralLLM extends BaseLLM {
    private _client: Mistral;

    constructor(apiKey: string) {
        super(apiKey);
        this._client = new Mistral({
            apiKey: apiKey
        });
    }

    public get Client(): Mistral {return this._client;}

    public async ChatCompletion(params: ChatParams): Promise<ChatResult>{
        const startTime = new Date();

        let responseFormat: ResponseFormat | undefined = undefined;
        if (params.responseFormat) {
            if(params.responseFormat === 'JSON') {
                responseFormat = { type: "json_object" };
            }
        }

        const chatResponse = await this.Client.chat.complete({
            model: params.model,
            messages: params.messages, 
            maxTokens: params.maxOutputTokens,
            responseFormat: responseFormat
        });

        const endTime = new Date();

        let choices: ChatResultChoice[] = chatResponse.choices.map((choice: ChatCompletionChoice) => {
            let content: string = "";

            if(choice.message.content && typeof choice.message.content === 'string') {
                content = choice.message.content;
            }
            else if(choice.message.content && Array.isArray(choice.message.content)) {
                content = choice.message.content.join(' ');
            }

            const res: ChatResultChoice = {
                message: {
                    role: 'assistant',
                    content: content
                },
                finish_reason: choice.finishReason,
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
                    totalTokens: chatResponse.usage.totalTokens,
                    promptTokens: chatResponse.usage.promptTokens,
                    completionTokens: chatResponse.usage.completionTokens
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

export function LoadMistralLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}