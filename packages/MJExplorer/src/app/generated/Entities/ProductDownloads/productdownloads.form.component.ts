import { Component } from '@angular/core';
import { ProductDownloadsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductDownloadsDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Product Downloads') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productdownloads-form',
    templateUrl: './productdownloads.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductDownloadsFormComponent extends BaseFormComponent {
    public record!: ProductDownloadsEntity;
} 

export function LoadProductDownloadsFormComponent() {
    LoadProductDownloadsDetailsComponent();
}
