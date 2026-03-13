import { Component } from '@angular/core';
import { MJVersionInstallationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Version Installations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjversioninstallation-form',
    templateUrl: './mjversioninstallation.form.component.html'
})
export class MJVersionInstallationFormComponent extends BaseFormComponent {
    public record!: MJVersionInstallationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'versionDetails', sectionName: 'Version Details', isExpanded: true },
            { sectionKey: 'installationExecution', sectionName: 'Installation Execution', isExpanded: true },
            { sectionKey: 'installationDocumentation', sectionName: 'Installation Documentation', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

