import { Component } from '@angular/core';
import { hubspotlist_foldersEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'List Folders') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotlist_folders-form',
    templateUrl: './hubspotlist_folders.form.component.html'
})
export class hubspotlist_foldersFormComponent extends BaseFormComponent {
    public record!: hubspotlist_foldersEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'folderDetails', sectionName: 'Folder Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

