import { Component } from '@angular/core';
import { ResourceLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Resource Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resourcelink-form',
    templateUrl: './resourcelink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ResourceLinkFormComponent extends BaseFormComponent {
    public record!: ResourceLinkEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadResourceLinkFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
