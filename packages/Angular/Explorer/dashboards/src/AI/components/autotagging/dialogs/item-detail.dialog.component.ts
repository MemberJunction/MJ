/**
 * @fileoverview Classify · Content Item Detail slide-in dialog.
 *
 * Presentational slide-in panel showing a content item's details, tags, text,
 * metadata, and actions. Opened from multiple tabs, so it is rendered by the
 * HOST (the data orchestrator), which builds the `ContentItemDetail` and toggles
 * visibility. This component is purely presentational: data DOWN via `[Item]` /
 * `[Show]`, intents UP via `(Closed)` / `(OpenRecordRequested)`.
 */
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ContentItemDetail } from '../shared/classify.types';
import { formatWeight, tagFontSize } from '../shared/classify.format';

@Component({
    standalone: false,
    selector: 'classify-item-detail-dialog',
    templateUrl: './item-detail.dialog.component.html',
    styleUrls: ['./item-detail.dialog.component.css']
})
export class ClassifyItemDetailDialogComponent extends BaseAngularComponent {
    /** The content item to display, built and supplied by the host orchestrator. */
    @Input() Item: ContentItemDetail | null = null;
    /** Whether the slide-in is visible. */
    @Input() Show = false;

    /** Emitted when the user dismisses the panel (overlay/close button). */
    @Output() Closed = new EventEmitter<void>();
    /** Emitted when the user requests to open the underlying record. */
    @Output() OpenRecordRequested = new EventEmitter<ContentItemDetail>();

    // Template-facing formatters
    public readonly FormatWeight = formatWeight;
    public readonly TagFontSize = tagFontSize;
}
