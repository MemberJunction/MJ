

// Google Gemini Import
import { GoogleGenerativeAI, InputContent, Part } from "@google/generative-ai";

// MJ stuff
import { BaseLLM, ChatMessage, ChatParams, ChatResult, EmbedParams, EmbedResult, SummarizeParams, SummarizeResult } from "@memberjunction/ai";
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

    protected geminiMessageSpacing(messages: ChatMessage[]): ChatMessage[] {
        // this method is simple, it makes sure that we alternate messages between user and assistant, otherwise Anthropic will
        // have a problem. If we find two user messages in a row, we insert an assistant message between them with just "OK"
        const result: ChatMessage[] = [];
        let lastRole = "assistant";
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === lastRole) {
                result.push({
                    role: "assistant", // we are using the ChatMessage type from the MJ package, so we need to use the role "assistant" instead of "model"
                                       // later on the role will be converted to "model" in the MapMJMessageToGeminiHistoryEntry method
                    content: "OK"
                });
            }
            result.push(messages[i]);
            lastRole = messages[i].role;
        }
        return result;
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
            const tempMessages = this.geminiMessageSpacing(allMessagesButLast);
            const chat = model.startChat({
                history: tempMessages.map(m => GeminiLLM.MapMJMessageToGeminiHistoryEntry(m))
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

    public async EmbedText(params: EmbedParams): Promise<EmbedResult> {
        throw new Error("Method not implemented.");
    }
}
 

export function LoadGeminiLLM() {
    // does nothing, avoid tree shaking that will get rid of this class since there is no static link to this class in the code base as it is loaded dynamically
}