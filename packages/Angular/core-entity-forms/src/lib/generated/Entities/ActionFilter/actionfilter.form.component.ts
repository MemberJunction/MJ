import { Component } from '@angular/core';
import { ActionFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActionFilterDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Action Filters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionfilter-form',
    templateUrl: './actionfilter.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionFilterFormComponent extends BaseFormComponent {
    public record!: ActionFilterEntity;
} 

export function LoadActionFilterFormComponent() {
    LoadActionFilterDetailsComponent();
}
