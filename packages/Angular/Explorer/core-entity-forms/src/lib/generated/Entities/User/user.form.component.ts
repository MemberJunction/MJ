import { Component, OnInit } from '@angular/core';
import { UserEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadUserDetailsComponent } from "./sections/details.component"
import { TimelineGroup } from '@memberjunction/ng-timeline';
import { RunView } from '@memberjunction/core';
@RegisterClass(BaseFormComponent, 'Users') // Tell MemberJunction about this class
@Component({
    selector: 'gen-user-form',
    templateUrl: './user.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserFormComponent extends BaseFormComponent {
    public record!: UserEntity;
} 

export function LoadUserFormComponent() {
    LoadUserDetailsComponent();
}
