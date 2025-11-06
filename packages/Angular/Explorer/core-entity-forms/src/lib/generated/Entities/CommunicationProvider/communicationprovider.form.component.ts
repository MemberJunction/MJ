import { Component } from '@angular/core';
import { CommunicationProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"
import { JoinGridComponent } from "@memberjunction/ng-join-grid"

@RegisterClass(BaseFormComponent, 'Communication Providers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationprovider-form',
    templateUrl: './communicationprovider.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommunicationProviderFormComponent extends BaseFormComponent {
    public record!: CommunicationProviderEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        communicationLogs: false,
        messageTypes: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadCommunicationProviderFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
