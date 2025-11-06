import { Component } from '@angular/core';
import { DatasetItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Dataset Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-datasetitem-form',
    templateUrl: './datasetitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DatasetItemFormComponent extends BaseFormComponent {
    public record!: DatasetItemEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadDatasetItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
