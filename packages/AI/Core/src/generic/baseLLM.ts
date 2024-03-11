import { SummarizeParams, SummarizeResult } from "./summarize.types";
import { BaseModel } from "./baseModel";
import { ChatParams, ChatResult } from "./chat.types";
import { ClassifyParams, ClassifyResult } from "./classify.types";
import { EmbedParams, EmbedResult } from "./embed.types";

export abstract class BaseLLM extends BaseModel {
    public abstract ChatCompletion(params: ChatParams): Promise<ChatResult> 
    public abstract ClassifyText(params: ClassifyParams): Promise<ClassifyResult>
    public abstract SummarizeText(params: SummarizeParams): Promise<SummarizeResult>
    public abstract EmbedText(params: EmbedParams): Promise<EmbedResult>
}