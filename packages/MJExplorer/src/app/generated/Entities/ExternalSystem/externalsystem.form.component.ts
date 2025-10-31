import { Component } from '@angular/core';
import { ExternalSystemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadExternalSystemDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'External Systems') // Tell MemberJunction about this class
@Component({
    selector: 'gen-externalsystem-form',
    templateUrl: './externalsystem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ExternalSystemFormComponent extends BaseFormComponent {
    public record!: ExternalSystemEntity;
} 

export function LoadExternalSystemFormComponent() {
    LoadExternalSystemDetailsComponent();
}
