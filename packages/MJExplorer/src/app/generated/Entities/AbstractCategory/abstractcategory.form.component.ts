import { Component } from '@angular/core';
import { AbstractCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAbstractCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Abstract Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-abstractcategory-form',
    templateUrl: './abstractcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AbstractCategoryFormComponent extends BaseFormComponent {
    public record!: AbstractCategoryEntity;
} 

export function LoadAbstractCategoryFormComponent() {
    LoadAbstractCategoryDetailsComponent();
}
