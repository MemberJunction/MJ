import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ClassifyParams, ClassifyResult, EmbedParams, EmbedResult, ModelUsage, SummarizeParams, SummarizeResult } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import Groq from 'groq-sdk';

@RegisterClass(BaseLLM, "GroqLLM")
export class GroqLLM extends BaseLLM {
    static _client: Groq;
    constructor(apiKey: string) {
        super(apiKey);
        if (!GroqLLM._client){
            GroqLLM._client = new Groq({ apiKey: apiKey });
        }
    }

    public get client(): Groq {return GroqLLM._client;}

    public async ChatCompletion(params: ChatParams): Promise<ChatResult>{
        const startTime = new Date();


        // const completion = await groq.chat.completions.create({
        //     messages: [
        //         {
        //             role: "user",
        //             content: "Explain the importance of low latency LLMs"
        //         }
        //     ],
        //     model: "mixtral-8x7b-32768"
        // }).then((chatCompletion)=>{
        //     process.stdout.write(chatCompletion.choices[0]?.message?.content || "");
        // });

        const chatResponse = await this.client.chat.completions.create({
            model: params.model,
            messages: params.messages
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
        throw new Error("Method not implemented.");
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