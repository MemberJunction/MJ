import { Component } from '@angular/core';
import { GrantsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGrantsDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Grants') // Tell MemberJunction about this class
@Component({
    selector: 'gen-grants-form',
    templateUrl: './grants.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GrantsFormComponent extends BaseFormComponent {
    public record!: GrantsEntity;
} 

export function LoadGrantsFormComponent() {
    LoadGrantsDetailsComponent();
}
