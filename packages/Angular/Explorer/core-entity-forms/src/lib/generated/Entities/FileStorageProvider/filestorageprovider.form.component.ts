import { Component } from '@angular/core';
import { FileStorageProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'File Storage Providers') // Tell MemberJunction about this class
@Component({
  standalone: false,
    selector: 'gen-filestorageprovider-form',
    templateUrl: './filestorageprovider.form.component.html'
})
export class FileStorageProviderFormComponent extends BaseFormComponent {
    public record!: FileStorageProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerIdentification', sectionName: 'Provider Identification', isExpanded: true },
            { sectionKey: 'driverConfiguration', sectionName: 'Driver Configuration', isExpanded: true },
            { sectionKey: 'selectionAvailability', sectionName: 'Selection & Availability', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'files', sectionName: 'Files', isExpanded: false }
        ]);
    }
}

export function LoadFileStorageProviderFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
