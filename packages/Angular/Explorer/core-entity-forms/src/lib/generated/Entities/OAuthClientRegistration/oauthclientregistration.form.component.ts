import { Component } from '@angular/core';
import { OAuthClientRegistrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Client Registrations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-oauthclientregistration-form',
    templateUrl: './oauthclientregistration.form.component.html'
})
export class OAuthClientRegistrationFormComponent extends BaseFormComponent {
    public record!: OAuthClientRegistrationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'registrationMetadata', sectionName: 'Registration Metadata', isExpanded: false },
            { sectionKey: 'serverConnection', sectionName: 'Server Connection', isExpanded: true },
            { sectionKey: 'oAuthSettings', sectionName: 'OAuth Settings', isExpanded: false },
            { sectionKey: 'clientCredentials', sectionName: 'Client Credentials', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadOAuthClientRegistrationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
