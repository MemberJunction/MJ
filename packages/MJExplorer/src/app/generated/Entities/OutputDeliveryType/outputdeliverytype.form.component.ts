import { Component } from '@angular/core';
import { OutputDeliveryTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadOutputDeliveryTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Output Delivery Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-outputdeliverytype-form',
    templateUrl: './outputdeliverytype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OutputDeliveryTypeFormComponent extends BaseFormComponent {
    public record: OutputDeliveryTypeEntity | null = null;
} 

export function LoadOutputDeliveryTypeFormComponent() {
    LoadOutputDeliveryTypeDetailsComponent();
}
