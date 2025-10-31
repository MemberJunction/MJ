import { Component } from '@angular/core';
import { CommitteeTermRenewalEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommitteeTermRenewalDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Committee Term Renewals') // Tell MemberJunction about this class
@Component({
    selector: 'gen-committeetermrenewal-form',
    templateUrl: './committeetermrenewal.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommitteeTermRenewalFormComponent extends BaseFormComponent {
    public record!: CommitteeTermRenewalEntity;
} 

export function LoadCommitteeTermRenewalFormComponent() {
    LoadCommitteeTermRenewalDetailsComponent();
}
