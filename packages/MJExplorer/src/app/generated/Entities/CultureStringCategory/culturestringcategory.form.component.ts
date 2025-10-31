import { Component } from '@angular/core';
import { CultureStringCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCultureStringCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Culture String Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-culturestringcategory-form',
    templateUrl: './culturestringcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CultureStringCategoryFormComponent extends BaseFormComponent {
    public record!: CultureStringCategoryEntity;
} 

export function LoadCultureStringCategoryFormComponent() {
    LoadCultureStringCategoryDetailsComponent();
}
