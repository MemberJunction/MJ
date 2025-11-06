import { Component } from '@angular/core';
import { TemplateContentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Template Content Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-templatecontenttype-form',
    templateUrl: './templatecontenttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TemplateContentTypeFormComponent extends BaseFormComponent {
    public record!: TemplateContentTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        templateContents: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadTemplateContentTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
