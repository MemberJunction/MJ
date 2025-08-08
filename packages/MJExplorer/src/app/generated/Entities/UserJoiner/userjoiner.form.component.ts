import { Component } from '@angular/core';
import { UserJoinerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadUserJoinerDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'User Joiners') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userjoiner-form',
    templateUrl: './userjoiner.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserJoinerFormComponent extends BaseFormComponent {
    public record!: UserJoinerEntity;
} 

export function LoadUserJoinerFormComponent() {
    LoadUserJoinerDetailsComponent();
}
