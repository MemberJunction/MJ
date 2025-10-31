import { Component } from '@angular/core';
import { CaseTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Case Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-casetype-form',
    templateUrl: './casetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseTypeFormComponent extends BaseFormComponent {
    public record!: CaseTypeEntity;
} 

export function LoadCaseTypeFormComponent() {
    LoadCaseTypeDetailsComponent();
}
