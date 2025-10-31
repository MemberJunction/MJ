import { Component } from '@angular/core';
import { DuesCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDuesCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Dues Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-duescategory-form',
    templateUrl: './duescategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DuesCategoryFormComponent extends BaseFormComponent {
    public record!: DuesCategoryEntity;
} 

export function LoadDuesCategoryFormComponent() {
    LoadDuesCategoryDetailsComponent();
}
