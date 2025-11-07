import { Component } from '@angular/core';
import { ApplicationEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Application Entities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-applicationentity-form',
    templateUrl: './applicationentity.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ApplicationEntityFormComponent extends BaseFormComponent {
    public record!: ApplicationEntityEntity;

    // Collapsible section state
    public sectionsExpanded = {
        applicationLinkage: true,
        entityDefinition: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadApplicationEntityFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
