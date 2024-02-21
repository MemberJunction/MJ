import { Component } from '@angular/core';
import { UserViewCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadUserViewCategoryDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'User View Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userviewcategory-form',
    templateUrl: './userviewcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserViewCategoryFormComponent extends BaseFormComponent {
    public record!: UserViewCategoryEntity;
} 

export function LoadUserViewCategoryFormComponent() {
    LoadUserViewCategoryDetailsComponent();
}
