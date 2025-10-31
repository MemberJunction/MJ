import { Component } from '@angular/core';
import { CaseCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Case Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-casecategory-form',
    templateUrl: './casecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseCategoryFormComponent extends BaseFormComponent {
    public record!: CaseCategoryEntity;
} 

export function LoadCaseCategoryFormComponent() {
    LoadCaseCategoryDetailsComponent();
}
