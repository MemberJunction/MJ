import { Component } from '@angular/core';
import { MemberStatusTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMemberStatusTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Member Status Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-memberstatustype-form',
    templateUrl: './memberstatustype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MemberStatusTypeFormComponent extends BaseFormComponent {
    public record!: MemberStatusTypeEntity;
} 

export function LoadMemberStatusTypeFormComponent() {
    LoadMemberStatusTypeDetailsComponent();
}
