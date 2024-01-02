import { Component } from '@angular/core';
import { DatasetItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadDatasetItemDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Dataset Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-datasetitem-form',
    templateUrl: './datasetitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DatasetItemFormComponent extends BaseFormComponent {
    public record: DatasetItemEntity | null = null;
} 

export function LoadDatasetItemFormComponent() {
    LoadDatasetItemDetailsComponent();
}
