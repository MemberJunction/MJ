import { BaseParams, BaseResult } from "./baseModel"
import { ChatParams } from "./chat.types";


/**
 * Defined in order to have this type available for future use with additional properties beyond the BaseParams type.
 */
export class SummarizeParams extends ChatParams {
}

export class SummarizeResult extends BaseResult {
    text: string
    summaryText: string
    constructor (text: string, summaryText: string, success: boolean, startTime: Date, endTime: Date) {
        super(success, startTime, endTime);
        this.text = text;
        this.summaryText = summaryText;
    }
}
