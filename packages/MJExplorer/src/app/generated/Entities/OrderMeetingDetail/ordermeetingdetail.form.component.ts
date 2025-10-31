import { Component } from '@angular/core';
import { OrderMeetingDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderMeetingDetailDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Order Meeting Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-ordermeetingdetail-form',
    templateUrl: './ordermeetingdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderMeetingDetailFormComponent extends BaseFormComponent {
    public record!: OrderMeetingDetailEntity;
} 

export function LoadOrderMeetingDetailFormComponent() {
    LoadOrderMeetingDetailDetailsComponent();
}
