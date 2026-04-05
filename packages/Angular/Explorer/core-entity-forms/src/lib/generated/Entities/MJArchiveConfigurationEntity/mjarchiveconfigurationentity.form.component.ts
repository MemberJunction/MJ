import { Component } from '@angular/core';
import { MJArchiveConfigurationEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Archive Configuration Entities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjarchiveconfigurationentity-form',
    templateUrl: './mjarchiveconfigurationentity.form.component.html'
})
export class MJArchiveConfigurationEntityFormComponent extends BaseFormComponent {
    public record!: MJArchiveConfigurationEntityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'archiveIdentity', sectionName: 'Archive Identity', isExpanded: true },
            { sectionKey: 'archivingRules', sectionName: 'Archiving Rules', isExpanded: true },
            { sectionKey: 'processingAndOutput', sectionName: 'Processing and Output', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

