import { Component } from '@angular/core';
import { UserViewRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadUserViewRunDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'User View Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userviewrun-form',
    templateUrl: './userviewrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserViewRunFormComponent extends BaseFormComponent {
    public record!: UserViewRunEntity;
} 

export function LoadUserViewRunFormComponent() {
    LoadUserViewRunDetailsComponent();
}
