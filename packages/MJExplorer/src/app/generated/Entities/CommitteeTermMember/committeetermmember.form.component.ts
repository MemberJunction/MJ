import { Component } from '@angular/core';
import { CommitteeTermMemberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommitteeTermMemberDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Committee Term Members') // Tell MemberJunction about this class
@Component({
    selector: 'gen-committeetermmember-form',
    templateUrl: './committeetermmember.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommitteeTermMemberFormComponent extends BaseFormComponent {
    public record!: CommitteeTermMemberEntity;
} 

export function LoadCommitteeTermMemberFormComponent() {
    LoadCommitteeTermMemberDetailsComponent();
}
