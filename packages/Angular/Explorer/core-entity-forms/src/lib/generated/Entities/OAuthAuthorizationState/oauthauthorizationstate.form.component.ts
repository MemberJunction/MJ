import { Component } from '@angular/core';
import { OAuthAuthorizationStateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Authorization States') // Tell MemberJunction about this class
@Component({
    selector: 'gen-oauthauthorizationstate-form',
    templateUrl: './oauthauthorizationstate.form.component.html'
})
export class OAuthAuthorizationStateFormComponent extends BaseFormComponent {
    public record!: OAuthAuthorizationStateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'authorizationDetails', sectionName: 'Authorization Details', isExpanded: true },
            { sectionKey: 'statusErrors', sectionName: 'Status & Errors', isExpanded: false },
            { sectionKey: 'flowTiming', sectionName: 'Flow Timing', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadOAuthAuthorizationStateFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
