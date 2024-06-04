import { Component } from '@angular/core';
import { UserApplicationEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadUserApplicationEntityDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'User Application Entities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userapplicationentity-form',
    templateUrl: './userapplicationentity.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserApplicationEntityFormComponent extends BaseFormComponent {
    public record!: UserApplicationEntityEntity;
} 

export function LoadUserApplicationEntityFormComponent() {
    LoadUserApplicationEntityDetailsComponent();
}
