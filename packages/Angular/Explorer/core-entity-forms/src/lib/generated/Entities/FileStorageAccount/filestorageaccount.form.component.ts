import { Component } from '@angular/core';
import { FileStorageAccountEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: File Storage Accounts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-filestorageaccount-form',
    templateUrl: './filestorageaccount.form.component.html'
})
export class FileStorageAccountFormComponent extends BaseFormComponent {
    public record!: FileStorageAccountEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'storageAccountInformation', sectionName: 'Storage Account Information', isExpanded: true },
            { sectionKey: 'connectionSettings', sectionName: 'Connection Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadFileStorageAccountFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
