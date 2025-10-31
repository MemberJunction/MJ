import { Component } from '@angular/core';
import { GrantDueDiligenceStepLinkEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGrantDueDiligenceStepLinkDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Grant Due Diligence Step Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-grantduediligencesteplink-form',
    templateUrl: './grantduediligencesteplink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GrantDueDiligenceStepLinkFormComponent extends BaseFormComponent {
    public record!: GrantDueDiligenceStepLinkEntity;
} 

export function LoadGrantDueDiligenceStepLinkFormComponent() {
    LoadGrantDueDiligenceStepLinkDetailsComponent();
}
