import { Component } from '@angular/core';
import { ActionCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActionCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Action Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actioncategory-form',
    templateUrl: './actioncategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionCategoryFormComponent extends BaseFormComponent {
    public record!: ActionCategoryEntity;
} 

export function LoadActionCategoryFormComponent() {
    LoadActionCategoryDetailsComponent();
}
