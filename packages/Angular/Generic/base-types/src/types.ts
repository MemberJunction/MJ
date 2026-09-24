import { BaseEntity } from "@memberjunction/core";

/**
 * Enum used for common events coordination throughout various types of application components and forms
 */
export const BaseFormComponentEventCodes = {
    BASE_CODE: 'BaseFormComponent_Event',
    EDITING_COMPLETE: 'EDITING_COMPLETE',
    REVERT_PENDING_CHANGES: 'REVERT_PENDING_CHANGES',
    POPULATE_PENDING_RECORDS: 'POPULATE_PENDING_RECORDS'
} as const
export type BaseFormComponentEventCodes = typeof BaseFormComponentEventCodes[keyof typeof BaseFormComponentEventCodes];

/**
 * Base type for events emitted by classes that interact with the Form Component architecture
 */
export class BaseFormComponentEvent {
    subEventCode!: string  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    elementRef: any  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    returnValue: any  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}

/**
 * Specialized type of event that is emitted when a form component is telling everyone that editing is complete
 */
export class FormEditingCompleteEvent extends BaseFormComponentEvent {
    subEventCode: string = BaseFormComponentEventCodes.EDITING_COMPLETE;
    pendingChanges: PendingRecordItem[] = [];  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}

/**
 * Type that is used for building an array of pending records that need to be saved or deleted by the Form architecture that sub-components have been editing during an edit cycle
 */
export class PendingRecordItem {
    entityObject!: BaseEntity;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    action: 'save' | 'delete' = 'save';  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}
