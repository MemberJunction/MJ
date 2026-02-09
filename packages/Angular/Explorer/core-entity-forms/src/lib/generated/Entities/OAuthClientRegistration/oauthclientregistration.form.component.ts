import { Component } from '@angular/core';
import { OAuthClientRegistrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Client Registrations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-oauthclientregistration-form',
    templateUrl: './oauthclientregistration.form.component.html'
})
export class OAuthClientRegistrationFormComponent extends BaseFormComponent {
    public record!: OAuthClientRegistrationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

