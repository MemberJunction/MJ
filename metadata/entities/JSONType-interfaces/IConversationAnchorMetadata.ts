/**
 * Structured anchor payload stored on `MJ: Conversations.AnchorMetadata` (`AnchorMetadataObject`)
 * when a conversation acts as an inline comment thread anchored to a record, form field,
 * form section, left-nav rail group, contribution grid, or document/slide/sheet element.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */
export interface IConversationAnchorMetadata {
    /**
     * Human-readable display label of the anchored target at the time the thread was created
     * (for example "Annual Revenue" for a Field anchor, "Financial Summary" for a Section anchor,
     * or "Overview" for a Group anchor).
     */
    anchorDisplayName?: string;

    /**
     * Optional field name (`EntityField.Name`) when `AnchorType === 'Field'`.
     * Mirrors `Conversation.AnchorKey` for convenience in self-contained metadata inspection.
     */
    fieldName?: string;

    /**
     * Optional section key (`CollapsiblePanel.SectionKey`) into which a Field or Section anchor belongs,
     * enabling section-level and left-nav rail group rollup even when a field is not currently mounted in the DOM.
     */
    sectionKey?: string;

    /**
     * Optional human-readable title of the parent collapsible section containing the anchored field.
     */
    sectionDisplayName?: string;

    /**
     * Optional left-nav rail group key (`GroupKey`) containing the anchored section or field,
     * used to roll up open comment counts onto the left-nav rail and collapsed spine.
     */
    groupKey?: string;

    /**
     * Optional human-readable title of the parent left-nav rail group.
     */
    groupDisplayName?: string;

    /**
     * Snapshot of the field's formatted value at the moment the comment thread was opened
     * (for example "$145,000" or "Pending Approval"). Enables the UI to show a diff indicator
     * ("Commented when value was X") if the field's live value subsequently changes.
     */
    quotedValue?: string;

    /**
     * Optional `MJ: Record Changes.ID` capturing the exact version of the record when the thread was created.
     */
    recordChangeId?: string;

    /**
     * Field names (`EntityField.Name`) on the linked entity that are governed by Field-Level Security (FLS)
     * and referenced or discussed within this conversation thread.
     *
     * Populated deterministically when `AnchorType === 'Field'` on a restricted field, or by the
     * write-time FLS restricted-field detector when a comment posted at the Record/Section/Group level
     * references a restricted field's name, label, or value. Read-path security projectors hide the
     * entire thread from any user who is denied read access to any field in `restrictedFields`.
     */
    restrictedFields?: string[];

    /**
     * Document block identifier (`BlockID`) when `AnchorType === 'DocBlock'` (MJ Docs).
     */
    blockId?: string;

    /**
     * Quoted document text selection when `AnchorType === 'DocBlock'` (MJ Docs).
     */
    quotedText?: string;

    /**
     * Base64-encoded Y.RelativePosition start anchor when `AnchorType === 'DocBlock'` (MJ Docs).
     */
    yjsRelativeStart?: string;

    /**
     * Base64-encoded Y.RelativePosition end anchor when `AnchorType === 'DocBlock'` (MJ Docs).
     */
    yjsRelativeEnd?: string;

    /**
     * Slide identifier when `AnchorType === 'SlideRegion'` (MJ Slides).
     */
    slideId?: string;

    /**
     * Optional region/element identifier or bounding box key when `AnchorType === 'SlideRegion'` (MJ Slides).
     */
    regionId?: string;

    /**
     * Worksheet identifier when `AnchorType === 'SheetRange'` (MJ Sheets).
     */
    sheetId?: string;

    /**
     * A1-notation cell or range reference (for example "B4:D12") when `AnchorType === 'SheetRange'` (MJ Sheets).
     */
    cellRange?: string;
}
