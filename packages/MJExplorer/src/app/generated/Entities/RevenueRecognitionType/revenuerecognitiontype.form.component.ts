import { Component } from '@angular/core';
import { RevenueRecognitionTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRevenueRecognitionTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Revenue Recognition Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-revenuerecognitiontype-form',
    templateUrl: './revenuerecognitiontype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RevenueRecognitionTypeFormComponent extends BaseFormComponent {
    public record!: RevenueRecognitionTypeEntity;
} 

export function LoadRevenueRecognitionTypeFormComponent() {
    LoadRevenueRecognitionTypeDetailsComponent();
}
