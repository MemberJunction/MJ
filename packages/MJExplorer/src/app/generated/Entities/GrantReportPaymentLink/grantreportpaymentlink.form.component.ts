import { Component } from '@angular/core';
import { GrantReportPaymentLinkEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGrantReportPaymentLinkDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Grant Report Payment Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-grantreportpaymentlink-form',
    templateUrl: './grantreportpaymentlink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GrantReportPaymentLinkFormComponent extends BaseFormComponent {
    public record!: GrantReportPaymentLinkEntity;
} 

export function LoadGrantReportPaymentLinkFormComponent() {
    LoadGrantReportPaymentLinkDetailsComponent();
}
