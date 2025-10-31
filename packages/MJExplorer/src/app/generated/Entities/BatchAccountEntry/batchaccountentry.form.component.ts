import { Component } from '@angular/core';
import { BatchAccountEntryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadBatchAccountEntryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Batch Account Entries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-batchaccountentry-form',
    templateUrl: './batchaccountentry.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class BatchAccountEntryFormComponent extends BaseFormComponent {
    public record!: BatchAccountEntryEntity;
} 

export function LoadBatchAccountEntryFormComponent() {
    LoadBatchAccountEntryDetailsComponent();
}
