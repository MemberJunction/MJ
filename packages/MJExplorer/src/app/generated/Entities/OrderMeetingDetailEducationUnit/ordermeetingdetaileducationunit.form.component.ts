import { Component } from '@angular/core';
import { OrderMeetingDetailEducationUnitEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderMeetingDetailEducationUnitDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Order Meeting Detail Education Units') // Tell MemberJunction about this class
@Component({
    selector: 'gen-ordermeetingdetaileducationunit-form',
    templateUrl: './ordermeetingdetaileducationunit.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderMeetingDetailEducationUnitFormComponent extends BaseFormComponent {
    public record!: OrderMeetingDetailEducationUnitEntity;
} 

export function LoadOrderMeetingDetailEducationUnitFormComponent() {
    LoadOrderMeetingDetailEducationUnitDetailsComponent();
}
