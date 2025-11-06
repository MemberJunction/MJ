import { Component } from '@angular/core';
import { ComponentLibraryLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Component Library Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-componentlibrarylink-form',
    templateUrl: './componentlibrarylink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ComponentLibraryLinkFormComponent extends BaseFormComponent {
    public record!: ComponentLibraryLinkEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadComponentLibraryLinkFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
