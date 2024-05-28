import { Component } from '@angular/core';
import { ActionInputEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActionInputDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Action Inputs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actioninput-form',
    templateUrl: './actioninput.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionInputFormComponent extends BaseFormComponent {
    public record!: ActionInputEntity;
} 

export function LoadActionInputFormComponent() {
    LoadActionInputDetailsComponent();
}
