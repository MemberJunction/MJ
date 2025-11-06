import { Component } from '@angular/core';
import { TemplateContentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Template Contents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-templatecontent-form',
    templateUrl: './templatecontent.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TemplateContentFormComponent extends BaseFormComponent {
    public record!: TemplateContentEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        templateParams: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadTemplateContentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
