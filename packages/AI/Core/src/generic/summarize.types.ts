import { BaseParams, BaseResult } from "./baseModel"
import { ChatMessageContent, ChatMessageContentBlock, ChatParams } from "./chat.types";


/**
 * Defined in order to have this type available for future use with additional properties beyond the BaseParams type.
 */
export class SummarizeParams extends ChatParams {
}

export class SummarizeResult extends BaseResult {
    public get text(): string {  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
        return this._text;
    }
    private _text: string;

    summaryText: string  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    constructor (text: ChatMessageContent, summaryText: string, success: boolean, startTime: Date, endTime: Date) {
        super(success, startTime, endTime);

        // if text is an array of ChatMessageContentBlock, filter it down to only text blocks and then concatenate them
        if (Array.isArray(text)) {
            text = text.filter((block) => block.type === 'text').map((block) => block.content).join('\n\n');
        }
        this._text = text;
        this.summaryText = summaryText;
    }
}
