import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** A person changed a field's value on the form. */
export interface FormFieldEdit {
    /** The edited field's name. */
    FieldName: string;
}

/**
 * Per-form broadcast that a person edited a field.
 *
 * Provided on `<mj-record-form-container>` (same pattern as {@link FormRecordRefreshCoordinator}):
 * `providers`, not `viewProviders`, so every `mj-form-field` inside the form reaches it, including a
 * field declared in a widget's own template. The container forwards each edit to its form component,
 * which starts the entry-time duplicate check for a new record. A custom editor that changes the
 * record some other way can call {@link Notify} too.
 */
@Injectable()
export class FormFieldEditCoordinator {
    private readonly edited$ = new Subject<FormFieldEdit>();

    /** Emits once per field edit. */
    public readonly Edited$ = this.edited$.asObservable();

    /** Report that a person edited a field. */
    public Notify(edit: FormFieldEdit): void {
        this.edited$.next(edit);
    }
}
