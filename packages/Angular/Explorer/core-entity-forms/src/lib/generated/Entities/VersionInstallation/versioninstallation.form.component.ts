import { Component } from '@angular/core';
import { VersionInstallationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Version Installations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-versioninstallation-form',
    templateUrl: './versioninstallation.form.component.html'
})
export class VersionInstallationFormComponent extends BaseFormComponent {
    public record!: VersionInstallationEntity;

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

export function LoadVersionInstallationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
