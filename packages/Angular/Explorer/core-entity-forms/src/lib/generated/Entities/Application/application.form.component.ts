import { Component } from '@angular/core';
import { ApplicationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadApplicationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Applications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-application-form',
    templateUrl: './application.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ApplicationFormComponent extends BaseFormComponent {
    public record!: ApplicationEntity;
} 

export function LoadApplicationFormComponent() {
    LoadApplicationDetailsComponent();
}
