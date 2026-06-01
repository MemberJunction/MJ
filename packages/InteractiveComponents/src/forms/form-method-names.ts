/**
 * Standard method names a form-role component registers with the host via
 * `RegisterMethod`. The host (`InteractiveFormComponent`) invokes these in
 * response to toolbar actions, sidebar updates, etc.
 *
 * Components don't have to implement every method — `RequestSave` and
 * `RequestCancel` are the minimum useful set.
 */

export const FormMethodNames = {
    /** Host (toolbar) asks the form to start its save flow. Form fires `BeforeSave`. */
    RequestSave: 'RequestSave',
    /** Discard edits. Form fires `EditModeChangeRequested` → 'view'. */
    RequestCancel: 'RequestCancel',
    /** Host pushes a mode change (e.g. entered edit via the toolbar). */
    SetEditMode: 'SetEditMode',
    /** Host pulls a single field value (used by related panels). */
    GetFieldValue: 'GetFieldValue',
    /** Host pushes a single field value (used by sidebars / related panels). */
    SetFieldValue: 'SetFieldValue',
} as const;

export type FormMethodName = typeof FormMethodNames[keyof typeof FormMethodNames];

/** Signature for the `SetEditMode` method. */
export type FormSetEditModeArgs = { mode: 'view' | 'edit' };

/** Signature for the `GetFieldValue` method. */
export type FormGetFieldValueArgs = { fieldName: string };

/** Signature for the `SetFieldValue` method. */
export type FormSetFieldValueArgs = { fieldName: string; value: unknown };
