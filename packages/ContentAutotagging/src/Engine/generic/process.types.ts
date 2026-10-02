export class ProcessRunParams {
    sourceID: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    startTime: Date;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    endTime: Date;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    numItemsProcessed: number;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}

export class ContentItemProcessParams {
    text: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    modelID: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    minTags: number;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    maxTags: number;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    contentItemID: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    contentTypeID: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    contentFileTypeID: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    contentSourceTypeID: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    /** The owning ContentSource ID — used to resolve the source-level classification context. */
    contentSourceID?: string;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
    /**
     * Effective classification-context string assembled from the org/content-type/source
     * scopes and injected into the autotagging prompt as `classificationContext`. Resolved
     * once per item before chunking so the (async) lookup isn't repeated per chunk.
     */
    classificationContext?: string;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
}

export class ContentItemProcessResults {
    title: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    author: string[];  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    publicationDate: Date;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    keywords: string[];  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    content_text: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    processStartTime: Date;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    processEndTime: Date;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    contentItemID: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}

export interface JsonObject {
    [key: string]: any;
}