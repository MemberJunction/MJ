import { BaseParams, BaseResult } from "./baseModel"
import { ChatMessageContent, ChatMessageContentBlock, ChatParams } from "./chat.types";


/**
 * Defined in order to have this type available for future use with additional properties beyond the BaseParams type.
 */
export class SummarizeParams extends ChatParams {
}

export class SummarizeResult extends BaseResult {
    text: string
    summaryText: string
    constructor (text: ChatMessageContent, summaryText: string, success: boolean, startTime: Date, endTime: Date) {
        super(success, startTime, endTime);

        // if text is an array of ChatMessageContentBlock, filter it down to only text blocks and then concatenate them
        if (text instanceof Array) {
            text = text.filter((block: ChatMessageContentBlock) => block.type === 'text').map((block: ChatMessageContentBlock) => block.content).join('\n\n');
        }
        this.text = text;
        this.summaryText = summaryText;
    }
}
