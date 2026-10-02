export class ContentItemParams {
    contentSourceID: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    name: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    description?: string;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
    ContentTypeID: string;
    ContentSourceTypeID: string;
    ContentFileTypeID: string;
    URL: string;
    AIModelID?: string;
    minTags?: number;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
    maxTags?: number;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
}

export class ContentSourceParams {
    contentSourceID: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    name?: string;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
    description?: string;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
    ContentTypeID: string;
    ContentSourceTypeID: string;
    ContentFileTypeID: string;
    URL: string;
    AIModelID?: string;
    minTags?: number;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
    maxTags?: number;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
}

export type ContentSourceTypeParamValue = string | number | boolean | string[] | RegExp;

export class ContentSourceTypeParams {
    contentSourceID: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    contentSourceTypeID: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    name: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    value: ContentSourceTypeParamValue;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    type: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}