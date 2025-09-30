import { Component } from '@angular/core';
import { EnvironmentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEnvironmentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Environments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-environment-form',
    templateUrl: './environment.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EnvironmentFormComponent extends BaseFormComponent {
    public record!: EnvironmentEntity;
} 

export function LoadEnvironmentFormComponent() {
    LoadEnvironmentDetailsComponent();
}
