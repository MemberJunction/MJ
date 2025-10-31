import { Component } from '@angular/core';
import { GLPaymentLevelEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGLPaymentLevelDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'GL Payment Levels') // Tell MemberJunction about this class
@Component({
    selector: 'gen-glpaymentlevel-form',
    templateUrl: './glpaymentlevel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GLPaymentLevelFormComponent extends BaseFormComponent {
    public record!: GLPaymentLevelEntity;
} 

export function LoadGLPaymentLevelFormComponent() {
    LoadGLPaymentLevelDetailsComponent();
}
