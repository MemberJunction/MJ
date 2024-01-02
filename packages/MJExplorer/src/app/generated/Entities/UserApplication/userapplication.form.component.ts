import { Component } from '@angular/core';
import { UserApplicationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadUserApplicationDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'User Applications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userapplication-form',
    templateUrl: './userapplication.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserApplicationFormComponent extends BaseFormComponent {
    public record: UserApplicationEntity | null = null;
} 

export function LoadUserApplicationFormComponent() {
    LoadUserApplicationDetailsComponent();
}
