import { Component } from '@angular/core';
import { LibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Libraries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-library-form',
    templateUrl: './library.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class LibraryFormComponent extends BaseFormComponent {
    public record!: LibraryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        actions: false,
        items: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadLibraryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
