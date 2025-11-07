import { Component } from '@angular/core';
import { CommunicationLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Communication Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationlog-form',
    templateUrl: './communicationlog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommunicationLogFormComponent extends BaseFormComponent {
    public record!: CommunicationLogEntity;

    // Collapsible section state
    public sectionsExpanded = {
        messageIdentification: true,
        messageDetails: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadCommunicationLogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
