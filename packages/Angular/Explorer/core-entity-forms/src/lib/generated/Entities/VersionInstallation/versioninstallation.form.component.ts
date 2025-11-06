import { Component } from '@angular/core';
import { VersionInstallationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Version Installations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-versioninstallation-form',
    templateUrl: './versioninstallation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class VersionInstallationFormComponent extends BaseFormComponent {
    public record!: VersionInstallationEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadVersionInstallationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
