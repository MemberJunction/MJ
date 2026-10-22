import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectionStrategy
} from '@angular/core';
import { BaseEntity } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { FormNavigationEvent } from '../types/navigation-events';
import { RecordLinkFilterType, RecordLinksSummary } from './record-links.component';

/**
 * Convenience slide-in drawer component `<mj-record-links-drawer>` wrapping `<mj-record-links [Mode]="'drawer'">`.
 */
@Component({
    standalone: false,
    selector: 'mj-record-links-drawer',
    template: `
        <mj-record-links
            [Provider]="Provider"
            [Record]="Record"
            [InitialLinkFilter]="InitialLinkFilter"
            [Mode]="'drawer'"
            [IsOpen]="IsOpen"
            (Navigate)="Navigate.emit($event)"
            (Close)="Close.emit()"
            (LinkCountChange)="LinkCountChange.emit($event)"
            (LinksSummaryChange)="LinksSummaryChange.emit($event)">
        </mj-record-links>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MjRecordLinksDrawerComponent extends BaseAngularComponent {
    @Input() Record: BaseEntity | null = null;
    @Input() InitialLinkFilter: RecordLinkFilterType = 'both';
    @Input() IsOpen = false;

    @Output() Navigate = new EventEmitter<FormNavigationEvent>();
    @Output() Close = new EventEmitter<void>();
    @Output() LinkCountChange = new EventEmitter<number>();
    @Output() LinksSummaryChange = new EventEmitter<RecordLinksSummary>();
}
