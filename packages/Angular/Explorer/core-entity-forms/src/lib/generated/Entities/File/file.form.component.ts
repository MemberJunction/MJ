import { Component } from '@angular/core';
import { FileEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Files') // Tell MemberJunction about this class
@Component({
    selector: 'gen-file-form',
    templateUrl: './file.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FileFormComponent extends BaseFormComponent {
    public record!: FileEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        fileEntityRecordLinks: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadFileFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
