/**
 * Information about a form section, including its expanded state and optional metadata.
 * Generic type M allows subclasses to extend with custom metadata.
 */
export class BaseFormSectionInfo<M = any> {
    /**
     * Unique key for the section (used for lookups and bindings)
     */
    sectionKey: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply

    /**
     * Display name for the section
     */
    sectionName: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply

    /**
     * Whether the section is currently expanded
     */
    isExpanded: boolean;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply

    /**
     * Optional row count for related entity sections (populated after grid loads)
     */
    rowCount?: number;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member

    /**
     * Optional custom metadata for the section
     */
    metadata?: M;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member

    constructor(sectionKey: string, sectionName: string, isExpanded: boolean = false, rowCount?: number, metadata?: M) {
        this.sectionKey = sectionKey;
        this.sectionName = sectionName;
        this.isExpanded = isExpanded;
        this.rowCount = rowCount;
        this.metadata = metadata;
    }
}
