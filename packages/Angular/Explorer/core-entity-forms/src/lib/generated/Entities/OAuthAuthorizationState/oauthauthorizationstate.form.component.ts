import { Component } from '@angular/core';
import { OAuthAuthorizationStateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Authorization States') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-oauthauthorizationstate-form',
    templateUrl: './oauthauthorizationstate.form.component.html'
})
export class OAuthAuthorizationStateFormComponent extends BaseFormComponent {
    public record!: OAuthAuthorizationStateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

