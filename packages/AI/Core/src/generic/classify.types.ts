import { BaseResult, BaseParams } from "./baseModel"
import { ChatParams } from "./chat.types";

/**
 * Defined in order to have this type available for future use with additional properties beyond the BaseParams type.
 *
 * @deprecated Used only by the deprecated `BaseLLM.ClassifyText`. Will be removed in the next
 * major version.
 */
export class ClassifyParams extends ChatParams {
}

/**
 * @deprecated Used only by the deprecated `BaseLLM.ClassifyText`. Will be removed in the next
 * major version.
 */
export class ClassifyTag {
    constructor(tag: string, confidence: number) {
        this.tag = tag;
        this.confidence = confidence;
    }
    tag: string
    confidence: number
}

/**
 * @deprecated Used only by the deprecated `BaseLLM.ClassifyText`. Will be removed in the next
 * major version.
 */
export class ClassifyResult extends BaseResult {
    inputText: string
    tags: ClassifyTag[]
    statusMessage: string
}
 