import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { MJQueryFieldEntity } from '@memberjunction/core-entities';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { DetectionMethodLabel, DetectionMethodTitle } from './query-child-labels';

/**
 * `<mj-query-fields-grid>` — a query's output fields as a table.
 *
 * Facts come from the SQL and the database server and are read-only here: name (except on a row
 * not saved yet, which declares it), order, type, nullability, source, and how they were detected.
 * Annotations are editable in edit mode: the description, the computation description of a
 * computed column, and the summary flag and description.
 *
 * The source is a button when the column maps to an entity field (`OpenSourceField` carries the
 * field's ID; the host decides where that goes), or the server-reported `schema.object.column`
 * when it maps to no entity.
 */
@Component({
    standalone: true,
    selector: 'mj-query-fields-grid',
    changeDetection: ChangeDetectionStrategy.Default,
    imports: [FormsModule, MJButtonDirective],
    templateUrl: './query-fields-grid.component.html',
    styleUrls: ['./query-child-grids.css'],
})
export class QueryFieldsGridComponent {
    @Input() Fields: readonly MJQueryFieldEntity[] = [];
    @Input() EditMode = false;

    /** The user asked to remove a field (it is removed when the query is saved). */
    @Output() Remove = new EventEmitter<MJQueryFieldEntity>();
    /** The user asked to open the entity field a column comes from; carries `SourceEntityFieldID`. */
    @Output() OpenSourceField = new EventEmitter<string>();
    /** An annotation changed, so the host can update its unsaved-changes state. */
    @Output() Changed = new EventEmitter<void>();

    public DetectionLabel(field: MJQueryFieldEntity): string {
        return DetectionMethodLabel(field.DetectionMethod);
    }

    public DetectionTitle(field: MJQueryFieldEntity): string {
        return DetectionMethodTitle(field.DetectionMethod);
    }

    /** `Yes`, `No`, or `—` when the server does not report nullability (PostgreSQL). */
    public NullableLabel(field: MJQueryFieldEntity): string {
        if (field.IsNullable === null || field.IsNullable === undefined) return '—';
        return field.IsNullable ? 'Yes' : 'No';
    }

    /** The entity-field source as `Entity.Field`, or `null` when the column maps to no entity field. */
    public EntitySource(field: MJQueryFieldEntity): string | null {
        if (!field.SourceEntityFieldID) return null;
        const entity = field.SourceEntity ?? '';
        const name = field.SourceFieldName ?? field.SourceEntityField ?? '';
        return entity ? `${entity}.${name}` : name;
    }

    public OnOpenSource(field: MJQueryFieldEntity): void {
        if (field.SourceEntityFieldID) this.OpenSourceField.emit(field.SourceEntityFieldID);
    }

    public TrackField(index: number, field: MJQueryFieldEntity): string {
        return field.ID || `new-${index}`;
    }

    public OnAnnotationChange(): void {
        this.Changed.emit();
    }
}
