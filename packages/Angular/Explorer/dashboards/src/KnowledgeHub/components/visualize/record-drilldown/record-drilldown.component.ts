/**
 * @fileoverview Shared Record Drilldown Panel
 *
 * A single, reusable side panel that lists records behind a selection on the
 * Knowledge Hub "Visualize" surface. It is driven entirely by inputs and emits
 * record-open intents up to the host — it never imports NavigationService, so it
 * stays a generic child that the KH resource host wires to navigation.
 *
 * Consumed by BOTH:
 *  - Cluster-point selection: the host passes a single record row.
 *  - Tag-cloud word selection: the host passes the records carrying that tag.
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';

/**
 * A single record row shown in the drilldown panel. `EntityName` + `RecordID`
 * are the open-intent payload; `Title`/`Subtitle`/`Weight` are display-only.
 */
export interface DrilldownRecord {
    /** Entity the record belongs to (e.g. 'MJ: Content Items' or a business entity). */
    EntityName: string;
    /** Primary-key URL segment used to open the record. */
    RecordID: string;
    /** Primary display label. */
    Title: string;
    /** Optional secondary line (source, content type, etc.). */
    Subtitle?: string;
    /** Optional weight/relevance shown as a chip (0.0 - 1.0). */
    Weight?: number;
}

/**
 * Emitted when the user asks to open one of the listed records. The host
 * translates this into a NavigationService call.
 */
export interface DrilldownOpenRequest {
    EntityName: string;
    RecordID: string;
}

@Component({
    selector: 'app-kh-record-drilldown',
    standalone: false,
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './record-drilldown.component.html',
    styleUrls: ['./record-drilldown.component.css'],
})
export class RecordDrilldownComponent {
    /** Panel heading (e.g. the tag text or the selected record's label). */
    @Input() Title = '';
    /** Optional sub-heading under the title (e.g. "12 records"). */
    @Input() Subtitle = '';
    /** Icon class shown next to the title. */
    @Input() Icon = 'fa-solid fa-list';
    /** Whether the panel is visible. */
    @Input() Visible = false;
    /** Whether records are currently loading. */
    @Input() IsLoading = false;
    /** The records to list. */
    @Input() Records: DrilldownRecord[] = [];

    /** Emitted when the user closes the panel. */
    @Output() Closed = new EventEmitter<void>();
    /** Emitted when the user clicks a record to open it. */
    @Output() OpenRecord = new EventEmitter<DrilldownOpenRequest>();

    public OnClose(): void {
        this.Closed.emit();
    }

    public OnOpen(record: DrilldownRecord): void {
        if (!record.EntityName || !record.RecordID) {
            return;
        }
        this.OpenRecord.emit({ EntityName: record.EntityName, RecordID: record.RecordID });
    }

    public TrackByRecord(_index: number, record: DrilldownRecord): string {
        return `${record.EntityName}|${record.RecordID}`;
    }

    public WeightPercent(weight: number | undefined): number {
        if (weight == null) {
            return 0;
        }
        return Math.round(Math.max(0, Math.min(1, weight)) * 100);
    }
}

/** Tree-shaking prevention */
export function LoadRecordDrilldownComponent(): void {
    // Prevents tree-shaking of the component
}
