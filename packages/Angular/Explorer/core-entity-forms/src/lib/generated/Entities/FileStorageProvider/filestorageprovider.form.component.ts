import { Component } from '@angular/core';
import { FileStorageProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'File Storage Providers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-filestorageprovider-form',
    templateUrl: './filestorageprovider.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FileStorageProviderFormComponent extends BaseFormComponent {
    public record!: FileStorageProviderEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        files: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadFileStorageProviderFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
