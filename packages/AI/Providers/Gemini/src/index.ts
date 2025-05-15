

// Google Gemini Import
import { GoogleGenAI, Content, Part, Blob} from "@google/genai";

// MJ stuff
import { BaseLLM, ChatMessage, ChatParams, ChatResult, SummarizeParams, SummarizeResult, StreamingChatCallbacks, ChatMessageContent, ModelUsage } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseLLM, "GeminiLLM")
export class GeminiLLM extends BaseLLM {
    private _gemini: GoogleGenAI;

    constructor(apiKey: string) {
        super(apiKey);
        this._gemini = new GoogleGenAI({ apiKey });
    }

    /**
     * Read only getter method to get the Gemini client instance
     */
    public get GeminiClient(): GoogleGenAI {
        return this._gemini;
    }
    
    /**
     * Gemini supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    protected geminiMessageSpacing(messages: Content[]): Content[] {
        // This method makes sure that we alternate messages between user and model
        // If we find two messages in a row with the same role, we insert a message 
        // with the opposite role between them with just "OK"
        const result: Content[] = [];
        let lastRole = "model";
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === lastRole) {
                result.push({
                    role: "model", // we are using the ChatMessage type from the MJ package
                    parts: [{text: "OK"}]
                });
            }
            result.push(messages[i]);
            lastRole = messages[i].role;
        }
        return result;
    }
    
    /**
     * Implementation of non-streaming chat completion for Gemini
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        try {
            // For text-only input, use the gemini-pro model
            const startTime = new Date();
            const modelName = params.model || "gemini-pro";
            
            const allMessagesButLast = params.messages.slice(0, params.messages.length - 1);
            const convertedMessages = allMessagesButLast.map(m => GeminiLLM.MapMJMessageToGeminiHistoryEntry(m));
            const tempMessages = this.geminiMessageSpacing(convertedMessages);
            
            // Create the model and then chat
            const modelOptions: Record<string, any> = {
                temperature: params.temperature || 0.5,
                responseType: params.responseFormat,
            };
            
            // Add generationConfig with reasoningMode if effortLevel is provided
            if (params.effortLevel) {
                // Gemini has generationConfig.reasoningMode which can be set to 'full' for higher quality
                // reasoning but at increased cost and latency
                modelOptions.generationConfig = {
                    ...(modelOptions.generationConfig || {}),
                    reasoningMode: 'full'
                };
            }
            
            // Use the new API structure
            const chat = this.GeminiClient.chats.create({
                model: modelName,
                history: tempMessages 
            });
            
            // Send the latest message
            const latestMessage = params.messages[params.messages.length - 1].content;
            const result = await chat.sendMessage({
                message: GeminiLLM.MapMJContentToGeminiParts(latestMessage),
                ...modelOptions
            });
            
            const responseContent = result.candidates?.[0]?.content?.parts?.find(part => part.text)?.text || '';
            
            const endTime = new Date();
            return {
                success: true,
                statusText: "OK",
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                data: {
                    choices: [{
                        message: { role: 'assistant', content: responseContent },
                        finish_reason: "completed",
                        index: 0
                    }],
                    usage: new ModelUsage(0, 0) // Gemini doesn't provide detailed token usage
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
                    usage: new ModelUsage(0, 0) // Gemini doesn't provide detailed token usage
                },
                errorMessage: e.message,
                exception: e
            }
        }
    }
    
    /**
     * Create a streaming request for Gemini
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        const modelName = params.model || "gemini-pro";
        
        const allMessagesButLast = params.messages.slice(0, params.messages.length - 1);
        const convertedMessages = allMessagesButLast.map(m => GeminiLLM.MapMJMessageToGeminiHistoryEntry(m));
        const tempMessages = this.geminiMessageSpacing(convertedMessages);
        
        // Create the model and then chat
        const modelOptions: Record<string, any> = {
            temperature: params.temperature || 0.5,
            responseType: params.responseFormat,
        };
        
        // Add generationConfig with reasoningMode if effortLevel is provided
        if (params.effortLevel) {
            // Gemini has generationConfig.reasoningMode which can be set to 'full' for higher quality
            // reasoning but at increased cost and latency
            modelOptions.generationConfig = {
                ...(modelOptions.generationConfig || {}),
                reasoningMode: 'full'
            };
        }
        
        // Use the new API structure
        const chat = this.GeminiClient.chats.create({
            model: modelName,
            history: tempMessages
        });
        
        const latestMessage = params.messages[params.messages.length - 1].content;
        
        // Send message with streaming
        const streamResult = await chat.sendMessageStream({
            message: GeminiLLM.MapMJContentToGeminiParts(latestMessage),
            ...modelOptions
        });
        
        // Return the stream for the for-await loop to work
        return streamResult;
    }
    
    /**
     * Process a streaming chunk from Gemini
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        // Extract text from the chunk with the new SDK
        let content = '';
        if (chunk.candidates && 
            chunk.candidates[0] && 
            chunk.candidates[0].content && 
            chunk.candidates[0].content[0] && 
            chunk.candidates[0].content[0].parts) {
            
            // Find the text part
            const textPart = chunk.candidates[0].content[0].parts.find((part: any) => part.text);
            content = textPart?.text || '';
        }
        
        // Gemini doesn't provide finish reason or usage in chunks
        return {
            content,
            finishReason: undefined,
            usage: null
        };
    }
    
    /**
     * Create the final response from streaming results for Gemini
     */
    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: any | null | undefined,
        usage: any | null | undefined
    ): ChatResult {
        // Gemini doesn't provide usage information in streaming
        
        // Create dates (will be overridden by base class)
        const now = new Date();
        
        // Create a proper ChatResult instance with constructor params
        const result = new ChatResult(true, now, now);
        
        // Set all properties
        result.data = {
            choices: [{
                message: {
                    role: 'assistant',
                    content: accumulatedContent ? accumulatedContent : ''
                },
                finish_reason: 'stop',
                index: 0
            }],
            usage: new ModelUsage(0, 0) // Gemini doesn't provide detailed token usage
        };
        
        result.statusText = 'success';
        result.errorMessage = null;
        result.exception = null;
        
        return result;
    }
    SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error("Method not implemented.");
    }
    ClassifyText(params: any): Promise<any> {
        throw new Error("Method not implemented.");   
    }

    public static MapMJContentToGeminiParts(content: ChatMessageContent): Array<Part> {
        const parts: Array<Part> = [];
        if (Array.isArray(content)) {
            for (const part of content) {
                if (part.type === 'text') {
                    parts.push({text: part.content});
                }
                else {
                    // use the inlineData property which expects a Blob property which consists of data and mimeType
                    const blob: Blob = {
                        data: part.content
                    }
                    switch (part.type) {
                        case 'image_url':
                            blob.mimeType = 'image/jpeg';
                            break;
                        case 'audio_url':
                            blob.mimeType = 'audio/mpeg';
                            break;
                        case 'video_url':
                            blob.mimeType = 'video/mp4';
                            break;
                        case 'file_url':
                            blob.mimeType = 'application/octet-stream';
                            break;
                    }
                    parts.push({inlineData: blob});
                }
            }
        }
        else {
            // we know that message.content is a string
            parts.push({text: content});
        }
        return parts;
    }

    public static MapMJMessageToGeminiHistoryEntry(message: ChatMessage): Content {
        return {
            role: message.role === 'assistant' ? 'model' : 'user', // google calls all messages other than the replies from the model 'user' which would include the system prompt
            parts: GeminiLLM.MapMJContentToGeminiParts(message.content)
        }
    }
}
 

export function LoadGeminiLLM() {
    // does nothing, avoid tree shaking that will get rid of this class since there is no static link to this class in the code base as it is loaded dynamically
}