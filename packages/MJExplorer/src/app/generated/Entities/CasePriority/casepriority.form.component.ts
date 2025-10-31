import { Component } from '@angular/core';
import { CasePriorityEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCasePriorityDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Case Priorities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-casepriority-form',
    templateUrl: './casepriority.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CasePriorityFormComponent extends BaseFormComponent {
    public record!: CasePriorityEntity;
} 

export function LoadCasePriorityFormComponent() {
    LoadCasePriorityDetailsComponent();
}
