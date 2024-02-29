import { Component } from '@angular/core';
import { OutputTriggerTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadOutputTriggerTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Output Trigger Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-outputtriggertype-form',
    templateUrl: './outputtriggertype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OutputTriggerTypeFormComponent extends BaseFormComponent {
    public record!: OutputTriggerTypeEntity;
} 

export function LoadOutputTriggerTypeFormComponent() {
    LoadOutputTriggerTypeDetailsComponent();
}
