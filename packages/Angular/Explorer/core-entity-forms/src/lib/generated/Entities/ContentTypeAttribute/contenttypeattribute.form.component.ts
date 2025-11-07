import { Component } from '@angular/core';
import { ContentTypeAttributeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Type Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contenttypeattribute-form',
    templateUrl: './contenttypeattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentTypeAttributeFormComponent extends BaseFormComponent {
    public record!: ContentTypeAttributeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        attributeMetadata: false,
        extractionPrompt: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadContentTypeAttributeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
