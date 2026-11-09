import type { BaseEventArgs } from '../component-events';
import { FormEventNames } from './form-event-names';

/** Events a form-panel component emits via `callbacks.NotifyEvent`. */
export const FormPanelEventNames = {
    /** Related-row count for the rail badge. */
    RowCountChanged: 'RowCountChanged',
    /** Reused from the whole-form contract: proposes one field value on the PARENT record. */
    FieldChanged: FormEventNames.FieldChanged,
    /** Reused from the whole-form contract. */
    ValidationChanged: FormEventNames.ValidationChanged,
} as const;
export type FormPanelEventName = typeof FormPanelEventNames[keyof typeof FormPanelEventNames];

export interface FormPanelRowCountChangedArgs extends BaseEventArgs {
    count: number;
}

/** Methods a form-panel component may register via `callbacks.RegisterMethod`. All optional. */
export const FormPanelMethodNames = {
    /** Parent record was reloaded from the database. */
    OnRecordRefreshed: 'OnRecordRefreshed',
    /** Host toolbar entered or left edit mode. */
    SetEditMode: 'SetEditMode',
    /** Host is about to save the parent record; return validity. May be async. */
    Validate: 'Validate',
} as const;
export type FormPanelMethodName = typeof FormPanelMethodNames[keyof typeof FormPanelMethodNames];

export type FormPanelSetEditModeArgs = { mode: 'view' | 'edit' };

/**
 * Shape a registered `Validate` method returns. The host awaits the value before
 * reading it, so a panel that validates against the server may return a Promise.
 */
export interface FormPanelValidateResult { isValid: boolean; errors: string[] }
