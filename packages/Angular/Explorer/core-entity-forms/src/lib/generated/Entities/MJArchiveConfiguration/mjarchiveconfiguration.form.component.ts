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
            { sectionKey: 'configurationDetails', sectionName: 'Configuration Details', isExpanded: true },
            { sectionKey: 'storageSettings', sectionName: 'Storage Settings', isExpanded: true },
            { sectionKey: 'archivingRules', sectionName: 'Archiving Rules', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJArchiveConfigurationEntities', sectionName: 'Archive Configuration Entities', isExpanded: false },
            { sectionKey: 'mJArchiveRuns', sectionName: 'Archive Runs', isExpanded: false }
        ]);
    }
}

