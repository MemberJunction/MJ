import { Component } from '@angular/core';
import { MemberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMemberDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Members') // Tell MemberJunction about this class
@Component({
    selector: 'gen-member-form',
    templateUrl: './member.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MemberFormComponent extends BaseFormComponent {
    public record!: MemberEntity;
} 

export function LoadMemberFormComponent() {
    LoadMemberDetailsComponent();
}
