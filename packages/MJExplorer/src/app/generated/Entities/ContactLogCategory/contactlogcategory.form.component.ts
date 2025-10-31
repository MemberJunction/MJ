import { Component } from '@angular/core';
import { ContactLogCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContactLogCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Contact Log Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contactlogcategory-form',
    templateUrl: './contactlogcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContactLogCategoryFormComponent extends BaseFormComponent {
    public record!: ContactLogCategoryEntity;
} 

export function LoadContactLogCategoryFormComponent() {
    LoadContactLogCategoryDetailsComponent();
}
