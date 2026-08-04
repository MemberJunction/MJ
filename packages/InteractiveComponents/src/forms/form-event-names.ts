/**
 * Standard event names for components that declare `componentRole: 'form'`.
 *
 * The host (`InteractiveFormComponent` on the Angular side) listens for these
 * events on the React component via the existing `NotifyEvent` callback and
 * the cancelable/paired event infrastructure in `component-events.ts`.
 *
 * Every name is exported as a `const` so authoring agents and component code
 * can reference the same string without typos.
 */

import type { CancelableEventArgs, AfterEventArgs, BaseEventArgs } from '../component-events';

export const FormEventNames = {
    /** Cancelable. Host requests save. Component emits with the dirty-field diff. */
    BeforeSave: 'BeforeSave',
    /** Reports save outcome. Paired with BeforeSave. */
    AfterSave: 'AfterSave',
    /** Cancelable. Host requests delete. */
    BeforeDelete: 'BeforeDelete',
    /** Reports delete outcome. Paired with BeforeDelete. */
    AfterDelete: 'AfterDelete',
    /** Cancelable. Form asks host (or vice versa) to switch between view/edit. */
    EditModeChangeRequested: 'EditModeChangeRequested',
    /** Reports a single field change. Drives dirty tracking on the host. */
    FieldChanged: 'FieldChanged',
    /** Reports dirty state transitions. */
    DirtyStateChanged: 'DirtyStateChanged',
    /** Reports validity transitions. */
    ValidationChanged: 'ValidationChanged',
} as const;

export type FormEventName = typeof FormEventNames[keyof typeof FormEventNames];

/** Args for `BeforeSave`. Component fills `dirtyFields` with the typed diff. */
export interface FormBeforeSaveArgs extends CancelableEventArgs {
    dirtyFields: Record<string, unknown>;
}

/** Args for `AfterSave`. */
export interface FormAfterSaveArgs extends AfterEventArgs {
    /** Optional: the saved record snapshot (post-save server values). */
    record?: Record<string, unknown>;
}

/** Args for `BeforeDelete`. No payload beyond the cancel flag. */
export type FormBeforeDeleteArgs = CancelableEventArgs;

/** Args for `AfterDelete`. */
export type FormAfterDeleteArgs = AfterEventArgs;

/** Args for `EditModeChangeRequested`. */
export interface FormEditModeChangeRequestedArgs extends CancelableEventArgs {
    requestedMode: 'view' | 'edit';
}

/** Args for `FieldChanged`. */
export interface FormFieldChangedArgs extends BaseEventArgs {
    fieldName: string;
    oldValue: unknown;
    newValue: unknown;
}

/** Args for `DirtyStateChanged`. */
export interface FormDirtyStateChangedArgs extends BaseEventArgs {
    isDirty: boolean;
    dirtyFieldCount: number;
}

/** Args for `ValidationChanged`. */
export interface FormValidationChangedArgs extends BaseEventArgs {
    isValid: boolean;
    errors?: string[];
}
