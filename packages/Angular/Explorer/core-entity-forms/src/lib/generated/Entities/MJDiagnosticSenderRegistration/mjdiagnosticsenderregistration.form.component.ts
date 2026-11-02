import { Component } from '@angular/core';
import { MJDiagnosticSenderRegistrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Diagnostic Sender Registrations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdiagnosticsenderregistration-form',
    templateUrl: './mjdiagnosticsenderregistration.form.component.html'
})
export class MJDiagnosticSenderRegistrationFormComponent extends BaseFormComponent {
    public record!: MJDiagnosticSenderRegistrationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'registrationDetails', sectionName: 'Registration Details', isExpanded: true },
            { sectionKey: 'securityAndAuthentication', sectionName: 'Security and Authentication', isExpanded: true },
            { sectionKey: 'activityAndLimits', sectionName: 'Activity and Limits', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

