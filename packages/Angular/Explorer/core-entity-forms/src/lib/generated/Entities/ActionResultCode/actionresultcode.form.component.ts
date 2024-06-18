import { Component } from '@angular/core';
import { ActionResultCodeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActionResultCodeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Action Result Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionresultcode-form',
    templateUrl: './actionresultcode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionResultCodeFormComponent extends BaseFormComponent {
    public record!: ActionResultCodeEntity;
} 

export function LoadActionResultCodeFormComponent() {
    LoadActionResultCodeDetailsComponent();
}
