import { Component } from '@angular/core';
import { CommitteeTermRenewalMembersEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommitteeTermRenewalMembersDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Committee Term Renewal Members') // Tell MemberJunction about this class
@Component({
    selector: 'gen-committeetermrenewalmembers-form',
    templateUrl: './committeetermrenewalmembers.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommitteeTermRenewalMembersFormComponent extends BaseFormComponent {
    public record!: CommitteeTermRenewalMembersEntity;
} 

export function LoadCommitteeTermRenewalMembersFormComponent() {
    LoadCommitteeTermRenewalMembersDetailsComponent();
}
