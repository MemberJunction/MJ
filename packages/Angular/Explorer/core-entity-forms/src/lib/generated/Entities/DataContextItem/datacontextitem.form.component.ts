import { Component } from '@angular/core';
import { DataContextItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Data Context Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-datacontextitem-form',
    templateUrl: './datacontextitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DataContextItemFormComponent extends BaseFormComponent {
    public record!: DataContextItemEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadDataContextItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
