

// Google Gemini Import
import { GoogleGenerativeAI, InputContent, Part } from "@google/generative-ai";

// MJ stuff
import { BaseLLM, ChatMessage, ChatParams, ChatResult, SummarizeParams, SummarizeResult } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseLLM, "GeminiLLM")
export class GeminiLLM extends BaseLLM {
    private static _gemini: GoogleGenerativeAI;

    constructor(apiKey: string) {
        super(apiKey);
        if (!GeminiLLM._gemini) {
            GeminiLLM._gemini = new GoogleGenerativeAI(apiKey);
        }
    }

    public async ChatCompletion(params: ChatParams): Promise<ChatResult> {
        try {
            // For text-only input, use the gemini-pro model
            const startTime = new Date();
            const config = {
                temperature: params.temperature || 0.5,
            };
            const model = GeminiLLM._gemini.getGenerativeModel({ model: params.model || "gemini-pro", generationConfig: config});
            const allMessagesButLast = params.messages.slice(0, -1);
            const chat = model.startChat({
                history: allMessagesButLast.map(m => GeminiLLM.MapMJMessageToGeminiHistoryEntry(m))
            });
            const latestMessage = params.messages[params.messages.length - 1].content;
            const result = await chat.sendMessage(latestMessage);
            const endTime = new Date();
            return {
                success: true,
                statusText: "OK",
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                data: {
                    choices: [{
                        message: { role: 'assistant', content: result.response.text() },
                        finish_reason: "completed",
                        index: 0
                    }],
                    usage: {
                        totalTokens: 0,
                        promptTokens: 0,
                        completionTokens: 0 // to do map this from google
                    }
                },
                errorMessage: "",
                exception: null,
            }
        }
        catch (e) {
            return {
                success: false,
                statusText: e && e.message ? e.message : "Error",
                startTime: new Date(),
                endTime: new Date(),
                timeElapsed: 0,
                data: {
                    choices: [],
                    usage: {
                        totalTokens: 0,
                        promptTokens: 0,
                        completionTokens: 0
                    }
                },
                errorMessage: e.message,
                exception: e
            
            }
        }
    }
    SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error("Method not implemented.");
    }
    ClassifyText(params: any): Promise<any> {
        throw new Error("Method not implemented.");   
    }

    public static MapMJMessageToGeminiHistoryEntry(message: ChatMessage): InputContent {
        return {
            role: message.role === 'assistant' ? 'model' : 'user', // google calls all messages other than the replies from the model 'user' which would include the system prompt
            parts: message.content
        }
    }
}
 

export function LoadGeminiLLM() {
    // does nothing, avoid tree shaking that will get rid of this class since there is no static link to this class in the code base as it is loaded dynamically
}