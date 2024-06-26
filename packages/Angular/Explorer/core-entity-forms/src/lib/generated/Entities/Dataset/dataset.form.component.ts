import { Component } from '@angular/core';
import { DatasetEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDatasetDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Datasets') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dataset-form',
    templateUrl: './dataset.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DatasetFormComponent extends BaseFormComponent {
    public record!: DatasetEntity;
} 

export function LoadDatasetFormComponent() {
    LoadDatasetDetailsComponent();
}
