import { Component } from '@angular/core';
import { core_data_codesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { Loadcore_data_codesDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Core Data Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-core_data_codes-form',
    templateUrl: './core_data_codes.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class core_data_codesFormComponent extends BaseFormComponent {
    public record!: core_data_codesEntity;
} 

export function Loadcore_data_codesFormComponent() {
    Loadcore_data_codesDetailsComponent();
}
