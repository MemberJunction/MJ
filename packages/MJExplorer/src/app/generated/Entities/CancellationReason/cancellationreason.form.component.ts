import { Component } from '@angular/core';
import { CancellationReasonEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCancellationReasonDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Cancellation Reasons') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cancellationreason-form',
    templateUrl: './cancellationreason.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CancellationReasonFormComponent extends BaseFormComponent {
    public record!: CancellationReasonEntity;
} 

export function LoadCancellationReasonFormComponent() {
    LoadCancellationReasonDetailsComponent();
}
