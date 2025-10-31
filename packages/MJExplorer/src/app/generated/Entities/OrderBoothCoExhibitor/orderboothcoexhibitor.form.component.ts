import { Component } from '@angular/core';
import { OrderBoothCoExhibitorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderBoothCoExhibitorDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order Booth Co Exhibitors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-orderboothcoexhibitor-form',
    templateUrl: './orderboothcoexhibitor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderBoothCoExhibitorFormComponent extends BaseFormComponent {
    public record!: OrderBoothCoExhibitorEntity;
} 

export function LoadOrderBoothCoExhibitorFormComponent() {
    LoadOrderBoothCoExhibitorDetailsComponent();
}
