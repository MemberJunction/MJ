import { BaseParams, BaseResult } from "./baseModel"

export class SummarizeParams extends BaseParams {

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

export interface ISummarize {
    SummarizeText(params: SummarizeParams): Promise<SummarizeResult>
}