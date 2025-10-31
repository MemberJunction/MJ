import { Component } from '@angular/core';
import { CommitteeRoleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommitteeRoleDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Committee Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-committeerole-form',
    templateUrl: './committeerole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommitteeRoleFormComponent extends BaseFormComponent {
    public record!: CommitteeRoleEntity;
} 

export function LoadCommitteeRoleFormComponent() {
    LoadCommitteeRoleDetailsComponent();
}
