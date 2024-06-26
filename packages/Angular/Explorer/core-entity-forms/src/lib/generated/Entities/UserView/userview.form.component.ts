import { Component } from '@angular/core';
import { UserViewEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadUserViewDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'User Views') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userview-form',
    templateUrl: './userview.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserViewFormComponent extends BaseFormComponent {
    public record!: UserViewEntity;
} 

export function LoadUserViewFormComponent() {
    LoadUserViewDetailsComponent();
}
