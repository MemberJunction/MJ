import { Component } from '@angular/core';
import { MessageTypeModelRoleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMessageTypeModelRoleDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Message Type Model Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-messagetypemodelrole-form',
    templateUrl: './messagetypemodelrole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MessageTypeModelRoleFormComponent extends BaseFormComponent {
    public record!: MessageTypeModelRoleEntity;
} 

export function LoadMessageTypeModelRoleFormComponent() {
    LoadMessageTypeModelRoleDetailsComponent();
}
