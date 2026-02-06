import { Component } from '@angular/core';
import { OAuthTokenEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Tokens') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-oauthtoken-form',
    templateUrl: './oauthtoken.form.component.html'
})
export class OAuthTokenFormComponent extends BaseFormComponent {
    public record!: OAuthTokenEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadOAuthTokenFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
