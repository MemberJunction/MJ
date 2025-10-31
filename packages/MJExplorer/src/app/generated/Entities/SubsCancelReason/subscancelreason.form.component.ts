import { Component } from '@angular/core';
import { SubsCancelReasonEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubsCancelReasonDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Subs Cancel Reasons') // Tell MemberJunction about this class
@Component({
    selector: 'gen-subscancelreason-form',
    templateUrl: './subscancelreason.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubsCancelReasonFormComponent extends BaseFormComponent {
    public record!: SubsCancelReasonEntity;
} 

export function LoadSubsCancelReasonFormComponent() {
    LoadSubsCancelReasonDetailsComponent();
}
