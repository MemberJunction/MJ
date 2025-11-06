import { Component } from '@angular/core';
import { DatasetEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Datasets') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dataset-form',
    templateUrl: './dataset.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DatasetFormComponent extends BaseFormComponent {
    public record!: DatasetEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        datasetItems: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadDatasetFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
