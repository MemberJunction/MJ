import { Component } from '@angular/core';
import { MembershipEmailSchedulesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMembershipEmailSchedulesDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Membership Email Schedules') // Tell MemberJunction about this class
@Component({
    selector: 'gen-membershipemailschedules-form',
    templateUrl: './membershipemailschedules.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MembershipEmailSchedulesFormComponent extends BaseFormComponent {
    public record!: MembershipEmailSchedulesEntity;
} 

export function LoadMembershipEmailSchedulesFormComponent() {
    LoadMembershipEmailSchedulesDetailsComponent();
}
