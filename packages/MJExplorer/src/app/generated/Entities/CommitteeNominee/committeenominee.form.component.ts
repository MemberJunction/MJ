import { Component } from '@angular/core';
import { CommitteeNomineeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommitteeNomineeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Committee Nominees') // Tell MemberJunction about this class
@Component({
    selector: 'gen-committeenominee-form',
    templateUrl: './committeenominee.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommitteeNomineeFormComponent extends BaseFormComponent {
    public record!: CommitteeNomineeEntity;
} 

export function LoadCommitteeNomineeFormComponent() {
    LoadCommitteeNomineeDetailsComponent();
}
