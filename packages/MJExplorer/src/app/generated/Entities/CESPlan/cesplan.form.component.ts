import { Component } from '@angular/core';
import { CESPlanEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCESPlanDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'CES Plans') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cesplan-form',
    templateUrl: './cesplan.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CESPlanFormComponent extends BaseFormComponent {
    public record!: CESPlanEntity;
} 

export function LoadCESPlanFormComponent() {
    LoadCESPlanDetailsComponent();
}
