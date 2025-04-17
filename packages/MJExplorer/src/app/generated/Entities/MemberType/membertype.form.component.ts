import { Component } from '@angular/core';
import { MemberTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMemberTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Member Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-membertype-form',
    templateUrl: './membertype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MemberTypeFormComponent extends BaseFormComponent {
    public record!: MemberTypeEntity;
} 

export function LoadMemberTypeFormComponent() {
    LoadMemberTypeDetailsComponent();
}
