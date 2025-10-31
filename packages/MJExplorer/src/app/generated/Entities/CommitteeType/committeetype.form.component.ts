import { Component } from '@angular/core';
import { CommitteeTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommitteeTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Committee Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-committeetype-form',
    templateUrl: './committeetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommitteeTypeFormComponent extends BaseFormComponent {
    public record!: CommitteeTypeEntity;
} 

export function LoadCommitteeTypeFormComponent() {
    LoadCommitteeTypeDetailsComponent();
}
