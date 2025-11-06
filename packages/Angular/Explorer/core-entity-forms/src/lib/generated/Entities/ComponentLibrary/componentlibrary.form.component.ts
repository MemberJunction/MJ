import { Component } from '@angular/core';
import { ComponentLibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Component Libraries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-componentlibrary-form',
    templateUrl: './componentlibrary.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ComponentLibraryFormComponent extends BaseFormComponent {
    public record!: ComponentLibraryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        mJComponentLibraryLinks: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadComponentLibraryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
