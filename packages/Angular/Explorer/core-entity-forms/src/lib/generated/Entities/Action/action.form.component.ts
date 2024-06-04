import { Component } from '@angular/core';
import { ActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActionDetailsComponent } from "./sections/details.component"
import { LoadActionTopComponent } from "./sections/top.component"
import { LoadActionCodeComponent } from "./sections/code.component"
@RegisterClass(BaseFormComponent, 'Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-action-form',
    templateUrl: './action.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionFormComponent extends BaseFormComponent {
    public record!: ActionEntity;
} 

export function LoadActionFormComponent() {
    LoadActionDetailsComponent();
    LoadActionTopComponent();
    LoadActionCodeComponent();
}
