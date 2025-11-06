import { Component } from '@angular/core';
import { LibraryItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Library Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-libraryitem-form',
    templateUrl: './libraryitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class LibraryItemFormComponent extends BaseFormComponent {
    public record!: LibraryItemEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadLibraryItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
