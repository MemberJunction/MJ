import { Component } from '@angular/core';
import { BatchEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadBatchDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Batches') // Tell MemberJunction about this class
@Component({
    selector: 'gen-batch-form',
    templateUrl: './batch.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class BatchFormComponent extends BaseFormComponent {
    public record!: BatchEntity;
} 

export function LoadBatchFormComponent() {
    LoadBatchDetailsComponent();
}
