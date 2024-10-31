import { Component } from '@angular/core';
import { MessageTypeModelEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMessageTypeModelDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Message Type Models') // Tell MemberJunction about this class
@Component({
    selector: 'gen-messagetypemodel-form',
    templateUrl: './messagetypemodel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MessageTypeModelFormComponent extends BaseFormComponent {
    public record!: MessageTypeModelEntity;
} 

export function LoadMessageTypeModelFormComponent() {
    LoadMessageTypeModelDetailsComponent();
}
