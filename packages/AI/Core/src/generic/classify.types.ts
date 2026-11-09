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
    tag: string  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    confidence: number  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}

/**
 * @deprecated Used only by the deprecated `BaseLLM.ClassifyText`. Will be removed in the next
 * major version.
 */
export class ClassifyResult extends BaseResult {
    inputText: string  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    tags: ClassifyTag[]
    statusMessage: string  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}
 