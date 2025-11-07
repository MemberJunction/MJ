import { Component } from '@angular/core';
import { ActionLibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Action Libraries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionlibrary-form',
    templateUrl: './actionlibrary.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionLibraryFormComponent extends BaseFormComponent {
    public record!: ActionLibraryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        referenceIDs: true,
        actionLibraryInformation: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadActionLibraryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
