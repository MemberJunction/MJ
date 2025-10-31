import { Component } from '@angular/core';
import { ProductDownloadHistoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductDownloadHistoryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product Download Histories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productdownloadhistory-form',
    templateUrl: './productdownloadhistory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductDownloadHistoryFormComponent extends BaseFormComponent {
    public record!: ProductDownloadHistoryEntity;
} 

export function LoadProductDownloadHistoryFormComponent() {
    LoadProductDownloadHistoryDetailsComponent();
}
