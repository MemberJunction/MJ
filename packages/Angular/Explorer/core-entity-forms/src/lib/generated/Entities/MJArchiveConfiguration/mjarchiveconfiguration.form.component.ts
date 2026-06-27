import { Component } from '@angular/core';
import { MJArchiveConfigurationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Archive Configurations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjarchiveconfiguration-form',
    templateUrl: './mjarchiveconfiguration.form.component.html'
})
export class MJArchiveConfigurationFormComponent extends BaseFormComponent {
    public record!: MJArchiveConfigurationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'storageConfiguration', sectionName: 'Storage Configuration', isExpanded: true },
            { sectionKey: 'archiveSettings', sectionName: 'Archive Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJArchiveConfigurationEntities', sectionName: 'Archive Configuration Entities', isExpanded: false },
            { sectionKey: 'mJArchiveRuns', sectionName: 'Archive Runs', isExpanded: false }
        ]);
    }
}

