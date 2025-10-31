import { Component } from '@angular/core';
import { GrantDueDiligenceStepEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGrantDueDiligenceStepDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Grant Due Diligence Steps') // Tell MemberJunction about this class
@Component({
    selector: 'gen-grantduediligencestep-form',
    templateUrl: './grantduediligencestep.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GrantDueDiligenceStepFormComponent extends BaseFormComponent {
    public record!: GrantDueDiligenceStepEntity;
} 

export function LoadGrantDueDiligenceStepFormComponent() {
    LoadGrantDueDiligenceStepDetailsComponent();
}
