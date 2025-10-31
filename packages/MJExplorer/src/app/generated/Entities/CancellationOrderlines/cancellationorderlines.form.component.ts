import { Component } from '@angular/core';
import { CancellationOrderlinesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCancellationOrderlinesDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Cancellation Orderlines') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cancellationorderlines-form',
    templateUrl: './cancellationorderlines.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CancellationOrderlinesFormComponent extends BaseFormComponent {
    public record!: CancellationOrderlinesEntity;
} 

export function LoadCancellationOrderlinesFormComponent() {
    LoadCancellationOrderlinesDetailsComponent();
}
