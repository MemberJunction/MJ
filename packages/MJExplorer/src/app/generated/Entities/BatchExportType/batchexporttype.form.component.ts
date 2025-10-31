import { Component } from '@angular/core';
import { BatchExportTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadBatchExportTypeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Batch Export Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-batchexporttype-form',
    templateUrl: './batchexporttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class BatchExportTypeFormComponent extends BaseFormComponent {
    public record!: BatchExportTypeEntity;
} 

export function LoadBatchExportTypeFormComponent() {
    LoadBatchExportTypeDetailsComponent();
}
