import { Component } from '@angular/core';
import { YourMembershipEventRegistrationFormEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Registration Forms') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipeventregistrationform-form',
    templateUrl: './yourmembershipeventregistrationform.form.component.html'
})
export class YourMembershipEventRegistrationFormFormComponent extends BaseFormComponent {
    public record!: YourMembershipEventRegistrationFormEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'registrationSettings', sectionName: 'Registration Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

