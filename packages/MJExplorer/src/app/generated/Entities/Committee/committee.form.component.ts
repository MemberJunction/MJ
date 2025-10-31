import { Component } from '@angular/core';
import { CommitteeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommitteeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Committees') // Tell MemberJunction about this class
@Component({
    selector: 'gen-committee-form',
    templateUrl: './committee.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommitteeFormComponent extends BaseFormComponent {
    public record!: CommitteeEntity;
} 

export function LoadCommitteeFormComponent() {
    LoadCommitteeDetailsComponent();
}
