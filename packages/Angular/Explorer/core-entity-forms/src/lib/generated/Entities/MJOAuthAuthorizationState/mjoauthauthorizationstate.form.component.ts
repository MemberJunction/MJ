import { Component } from '@angular/core';
import { MJOAuthAuthorizationStateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Authorization States') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoauthauthorizationstate-form',
    templateUrl: './mjoauthauthorizationstate.form.component.html'
})
export class MJOAuthAuthorizationStateFormComponent extends BaseFormComponent {
    public record!: MJOAuthAuthorizationStateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

