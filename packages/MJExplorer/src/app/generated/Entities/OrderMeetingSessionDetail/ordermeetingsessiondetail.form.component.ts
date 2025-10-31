import { Component } from '@angular/core';
import { OrderMeetingSessionDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderMeetingSessionDetailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order Meeting Session Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-ordermeetingsessiondetail-form',
    templateUrl: './ordermeetingsessiondetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderMeetingSessionDetailFormComponent extends BaseFormComponent {
    public record!: OrderMeetingSessionDetailEntity;
} 

export function LoadOrderMeetingSessionDetailFormComponent() {
    LoadOrderMeetingSessionDetailDetailsComponent();
}
