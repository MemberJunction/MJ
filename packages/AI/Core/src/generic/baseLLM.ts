import { SummarizeParams, SummarizeResult } from "./summarize.types";
import { BaseModel } from "./baseModel";
import { ChatParams, ChatResult } from "./chat.types";
import { ClassifyParams, ClassifyResult } from "./classify.types";

/**
 * Base class for all LLM sub-class implementations. Not all sub-classes will support all methods. 
 * If a method is not supported an exception will be thrown.
 */
export abstract class BaseLLM extends BaseModel {
    public abstract ChatCompletion(params: ChatParams): Promise<ChatResult> 
    public abstract ClassifyText(params: ClassifyParams): Promise<ClassifyResult>
    public abstract SummarizeText(params: SummarizeParams): Promise<SummarizeResult>
    
    /**
     * Check if this provider supports streaming
     * @returns true if streaming is supported, false otherwise
     */
    public get SupportsStreaming(): boolean {
        // Default to false, providers that support streaming should override
        return false;
    }
}