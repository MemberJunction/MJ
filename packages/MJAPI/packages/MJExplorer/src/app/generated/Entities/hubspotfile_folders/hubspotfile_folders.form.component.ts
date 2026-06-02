import { Component } from '@angular/core';
import { hubspotfile_foldersEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'File Folders') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotfile_folders-form',
    templateUrl: './hubspotfile_folders.form.component.html'
})
export class hubspotfile_foldersFormComponent extends BaseFormComponent {
    public record!: hubspotfile_foldersEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'folderDetails', sectionName: 'Folder Details', isExpanded: true },
            { sectionKey: 'folderStatus', sectionName: 'Folder Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

