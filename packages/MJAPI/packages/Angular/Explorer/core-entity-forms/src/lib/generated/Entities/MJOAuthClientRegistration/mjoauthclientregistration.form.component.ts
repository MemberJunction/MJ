import { Component } from '@angular/core';
import { MJOAuthClientRegistrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Client Registrations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoauthclientregistration-form',
    templateUrl: './mjoauthclientregistration.form.component.html'
})
export class MJOAuthClientRegistrationFormComponent extends BaseFormComponent {
    public record!: MJOAuthClientRegistrationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

