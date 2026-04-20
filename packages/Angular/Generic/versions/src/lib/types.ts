/**
 * Shared types for the ng-versions package.
 */

/** Data passed to the record micro-view for displaying a snapshot record. */
export interface MicroViewData {
    EntityName: string;
    EntityID: string;
    RecordID: string;
    RecordChangeID: string;
    FullRecordJSON: Record<string, unknown> | null;
    FieldDiffs: FieldChangeView[] | null;
}

/** A single field-level change in a diff comparison. */
export interface FieldChangeView {
    FieldName: string;
    OldValue: string;
    NewValue: string;
    ChangeType: 'Added' | 'Modified' | 'Removed';
}

/** Display mode for the slide panel container. */
export type SlidePanelMode = 'slide' | 'dialog';
