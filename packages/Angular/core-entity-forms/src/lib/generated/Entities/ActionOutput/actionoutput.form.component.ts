import { Component } from '@angular/core';
import { ActionOutputEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActionOutputDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Action Outputs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionoutput-form',
    templateUrl: './actionoutput.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionOutputFormComponent extends BaseFormComponent {
    public record!: ActionOutputEntity;
} 

export function LoadActionOutputFormComponent() {
    LoadActionOutputDetailsComponent();
}
