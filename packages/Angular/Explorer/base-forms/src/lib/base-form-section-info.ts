/**
 * Information about a form section, including its expanded state and optional metadata.
 * Generic type M allows subclasses to extend with custom metadata.
 */
export class BaseFormSectionInfo<M = any> {
    /**
     * Unique key for the section (used for lookups and bindings)
     */
    sectionKey: string;

    /**
     * Display name for the section
     */
    sectionName: string;

    /**
     * Whether the section is currently expanded
     */
    isExpanded: boolean;

    /**
     * Optional row count for related entity sections (populated after grid loads)
     */
    rowCount?: number;

    /**
     * Optional custom metadata for the section
     */
    metadata?: M;

    constructor(sectionKey: string, sectionName: string, isExpanded: boolean = false, rowCount?: number, metadata?: M) {
        this.sectionKey = sectionKey;
        this.sectionName = sectionName;
        this.isExpanded = isExpanded;
        this.rowCount = rowCount;
        this.metadata = metadata;
    }
}
