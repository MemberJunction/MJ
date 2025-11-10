import { Component } from '@angular/core';
import { ContentItemTagEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Item Tags') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentitemtag-form',
    templateUrl: './contentitemtag.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentItemTagFormComponent extends BaseFormComponent {
    public record!: ContentItemTagEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        tagAssociation: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadContentItemTagFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
