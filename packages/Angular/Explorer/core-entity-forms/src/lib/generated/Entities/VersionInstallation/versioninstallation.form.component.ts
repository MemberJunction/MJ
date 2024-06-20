import { Component } from '@angular/core';
import { VersionInstallationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadVersionInstallationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Version Installations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-versioninstallation-form',
    templateUrl: './versioninstallation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class VersionInstallationFormComponent extends BaseFormComponent {
    public record!: VersionInstallationEntity;
} 

export function LoadVersionInstallationFormComponent() {
    LoadVersionInstallationDetailsComponent();
}
