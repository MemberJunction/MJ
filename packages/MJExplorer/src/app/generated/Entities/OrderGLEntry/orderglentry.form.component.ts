import { Component } from '@angular/core';
import { OrderGLEntryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderGLEntryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order GL Entries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-orderglentry-form',
    templateUrl: './orderglentry.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderGLEntryFormComponent extends BaseFormComponent {
    public record!: OrderGLEntryEntity;
} 

export function LoadOrderGLEntryFormComponent() {
    LoadOrderGLEntryDetailsComponent();
}
