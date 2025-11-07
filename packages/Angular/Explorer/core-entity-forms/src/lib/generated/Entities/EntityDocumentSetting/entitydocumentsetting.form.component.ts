import { Component } from '@angular/core';
import { EntityDocumentSettingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Document Settings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitydocumentsetting-form',
    templateUrl: './entitydocumentsetting.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityDocumentSettingFormComponent extends BaseFormComponent {
    public record!: EntityDocumentSettingEntity;

    // Collapsible section state
    public sectionsExpanded = {
        documentIdentification: true,
        configurationSettings: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEntityDocumentSettingFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
