import { Component } from '@angular/core';
import { FileEntityRecordLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'File Entity Record Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-fileentityrecordlink-form',
    templateUrl: './fileentityrecordlink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FileEntityRecordLinkFormComponent extends BaseFormComponent {
    public record!: FileEntityRecordLinkEntity;

    // Collapsible section state
    public sectionsExpanded = {
        technicalIdentifiers: true,
        linkDetails: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadFileEntityRecordLinkFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
