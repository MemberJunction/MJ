import { BaseResult, BaseParams } from "./baseModel"
import { ChatParams } from "./chat.types";

/**
 * Defined in order to have this type available for future use with additional properties beyond the BaseParams type.
 */
export class ClassifyParams extends ChatParams {
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
 