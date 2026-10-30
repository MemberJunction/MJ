import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { MJQueryParameterEntity } from '@memberjunction/core-entities';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { DetectionMethodLabel, DetectionMethodTitle } from './query-child-labels';

/** A parameter type a query author can choose. */
type ParameterType = MJQueryParameterEntity['Type'];

/**
 * `<mj-query-parameters-grid>` — a query's parameters as a table.
 *
 * Which parameters exist is a fact of the SQL, so the name is read-only on a saved row (a row not
 * saved yet declares it). Everything about a parameter that a person decides is an annotation and
 * is editable in edit mode: type, required, default and sample values, whether only the server
 * sets it, and the description. A parameter the SQL no longer uses is kept and flagged on the
 * query (see its extraction message).
 */
@Component({
    standalone: true,
    selector: 'mj-query-parameters-grid',
    changeDetection: ChangeDetectionStrategy.Default,
    imports: [FormsModule, MJButtonDirective],
    templateUrl: './query-parameters-grid.component.html',
    styleUrls: ['./query-child-grids.css'],
})
export class QueryParametersGridComponent {
    @Input() Parameters: readonly MJQueryParameterEntity[] = [];
    @Input() EditMode = false;

    /** The user asked to remove a parameter (it is removed when the query is saved). */
    @Output() Remove = new EventEmitter<MJQueryParameterEntity>();
    /** An annotation changed, so the host can update its unsaved-changes state. */
    @Output() Changed = new EventEmitter<void>();

    public readonly Types: readonly ParameterType[] = ['string', 'number', 'date', 'boolean', 'array'];

    public DetectionLabel(parameter: MJQueryParameterEntity): string {
        return DetectionMethodLabel(parameter.DetectionMethod);
    }

    public DetectionTitle(parameter: MJQueryParameterEntity): string {
        return DetectionMethodTitle(parameter.DetectionMethod);
    }

    public TrackParameter(index: number, parameter: MJQueryParameterEntity): string {
        return parameter.ID || `new-${index}`;
    }

    public OnAnnotationChange(): void {
        this.Changed.emit();
    }
}
