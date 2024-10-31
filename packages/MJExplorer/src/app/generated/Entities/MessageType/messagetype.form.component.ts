import { Component } from '@angular/core';
import { MessageTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMessageTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Message Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-messagetype-form',
    templateUrl: './messagetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MessageTypeFormComponent extends BaseFormComponent {
    public record!: MessageTypeEntity;
} 

export function LoadMessageTypeFormComponent() {
    LoadMessageTypeDetailsComponent();
}
