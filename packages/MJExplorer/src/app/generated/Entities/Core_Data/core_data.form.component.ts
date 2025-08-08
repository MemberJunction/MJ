import { Component } from '@angular/core';
import { Core_DataEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCore_DataDetailsComponent } from "./sections/details.component"
import { LoadCore_DataTopComponent } from "./sections/top.component"

@RegisterClass(BaseFormComponent, 'Core Datas') // Tell MemberJunction about this class
@Component({
    selector: 'gen-core_data-form',
    templateUrl: './core_data.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Core_DataFormComponent extends BaseFormComponent {
    public record!: Core_DataEntity;
} 

export function LoadCore_DataFormComponent() {
    LoadCore_DataDetailsComponent();
    LoadCore_DataTopComponent();
}
