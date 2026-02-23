import { Component } from '@angular/core';
import { MJOAuthAuthorizationStatesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Authorization States') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoauthauthorizationstates-form',
    templateUrl: './mjoauthauthorizationstates.form.component.html'
})
export class MJOAuthAuthorizationStatesFormComponent extends BaseFormComponent {
    public record!: MJOAuthAuthorizationStatesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

