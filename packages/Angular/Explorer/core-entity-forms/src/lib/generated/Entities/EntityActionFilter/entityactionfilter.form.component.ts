import { Component } from '@angular/core';
import { EntityActionFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Action Filters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityactionfilter-form',
    templateUrl: './entityactionfilter.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityActionFilterFormComponent extends BaseFormComponent {
    public record!: EntityActionFilterEntity;

    // Collapsible section state
    public sectionsExpanded = {
        identifierKeys: true,
        executionSettings: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityActionFilterFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
