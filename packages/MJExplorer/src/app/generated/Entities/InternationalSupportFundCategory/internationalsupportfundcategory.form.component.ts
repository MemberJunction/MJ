import { Component } from '@angular/core';
import { InternationalSupportFundCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInternationalSupportFundCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'International Support Fund Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-internationalsupportfundcategory-form',
    templateUrl: './internationalsupportfundcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InternationalSupportFundCategoryFormComponent extends BaseFormComponent {
    public record!: InternationalSupportFundCategoryEntity;
} 

export function LoadInternationalSupportFundCategoryFormComponent() {
    LoadInternationalSupportFundCategoryDetailsComponent();
}
