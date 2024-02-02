import { BaseResult, BaseParams } from "./baseModel"

export class ClassifyParams extends BaseParams {
}

export class ClassifyTag {
    constructor(tag: string, confidence: number) {
        this.tag = tag;
        this.confidence = confidence;
    }
    tag: string
    confidence: number
}

export class ClassifyResult extends BaseResult {
    inputText: string
    tags: ClassifyTag[]
    statusMessage: string
}

export interface IClassify {
    ClassifyText(params: ClassifyParams): Promise<ClassifyResult>
}