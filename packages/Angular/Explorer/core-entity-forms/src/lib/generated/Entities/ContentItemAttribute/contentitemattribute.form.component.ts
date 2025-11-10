import { Component } from '@angular/core';
import { ContentItemAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Item Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentitemattribute-form',
    templateUrl: './contentitemattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentItemAttributeFormComponent extends BaseFormComponent {
    public record!: ContentItemAttributeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        attributeData: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadContentItemAttributeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
