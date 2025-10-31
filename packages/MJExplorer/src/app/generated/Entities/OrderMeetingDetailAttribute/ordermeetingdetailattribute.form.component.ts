import { Component } from '@angular/core';
import { OrderMeetingDetailAttributeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderMeetingDetailAttributeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order Meeting Detail Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-ordermeetingdetailattribute-form',
    templateUrl: './ordermeetingdetailattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderMeetingDetailAttributeFormComponent extends BaseFormComponent {
    public record!: OrderMeetingDetailAttributeEntity;
} 

export function LoadOrderMeetingDetailAttributeFormComponent() {
    LoadOrderMeetingDetailAttributeDetailsComponent();
}
