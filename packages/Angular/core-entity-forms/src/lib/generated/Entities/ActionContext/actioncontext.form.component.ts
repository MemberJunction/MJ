import { Component } from '@angular/core';
import { ActionContextEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActionContextDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Action Contexts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actioncontext-form',
    templateUrl: './actioncontext.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionContextFormComponent extends BaseFormComponent {
    public record!: ActionContextEntity;
} 

export function LoadActionContextFormComponent() {
    LoadActionContextDetailsComponent();
}
