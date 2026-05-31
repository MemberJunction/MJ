/**
 * Props the host (`InteractiveFormComponent`) passes to a form-role component.
 *
 * The React side never touches `BaseEntity` — it operates against this plain
 * snapshot. When the form needs to commit, it fires `BeforeSave` with the
 * dirty-field diff and the host applies that to the BaseEntity and calls
 * `record.Save()`. This keeps the React contract portable and avoids the
 * `.Set()` stringly-typed trap.
 */

import { SimpleEntityFieldInfo } from '../data-requirements';

/** Mode the form is currently rendered in. */
export type FormMode = 'view' | 'edit' | 'create';

/** Subset of the entity's metadata the form needs at render time. */
export interface FormEntityMetadata {
    /** Field list, simplified (plain objects, no BaseEntity methods). */
    fields: SimpleEntityFieldInfo[];
    /** Human-readable name of the entity (e.g. "Customer"). */
    displayName: string;
    /** Optional: the field used as the record's display name (e.g. "Name", "Title"). */
    nameField?: string;
}

/**
 * Props passed to every form-role component. Plain data, no instance methods.
 *
 * `primaryKey` is serialized as a plain object — the React side does not need
 * the `CompositeKey` class; the Angular wrapper reconstructs one when it has to
 * load or save. `null` indicates a not-yet-persisted record (create flow).
 */
export interface FormHostProps {
    entityName: string;
    /** Composite-key field values as a plain object, or `null` for new records. */
    primaryKey: Record<string, unknown> | null;
    /** Plain snapshot of the record (BaseEntity.GetAll() result). */
    record: Record<string, unknown>;
    entityMetadata: FormEntityMetadata;
    mode: FormMode;
    canEdit: boolean;
    canDelete: boolean;
    canCreate: boolean;
}
