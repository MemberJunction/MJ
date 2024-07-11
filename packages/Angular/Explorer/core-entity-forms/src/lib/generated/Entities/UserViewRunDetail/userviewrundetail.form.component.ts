import { Component } from '@angular/core';
import { UserViewRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadUserViewRunDetailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'User View Run Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userviewrundetail-form',
    templateUrl: './userviewrundetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserViewRunDetailFormComponent extends BaseFormComponent {
    public record!: UserViewRunDetailEntity;
} 

export function LoadUserViewRunDetailFormComponent() {
    LoadUserViewRunDetailDetailsComponent();
}
