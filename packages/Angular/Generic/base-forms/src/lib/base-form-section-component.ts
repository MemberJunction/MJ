import { BaseEntity } from "@memberjunction/core";
import { BaseRecordComponent } from "./base-record-component";

// This is a base class for form sections, it is used to have a clear hiearchy for all sections to subclass
// which is primarily needed for the Class Factory and registration process to differentiate between sections and other components
export class BaseFormSectionComponent extends BaseRecordComponent {
    record!: BaseEntity;
    EditMode: boolean = false;
}