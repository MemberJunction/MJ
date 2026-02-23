import { Component } from '@angular/core';
import { MJOAuthTokensEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Tokens') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoauthtokens-form',
    templateUrl: './mjoauthtokens.form.component.html'
})
export class MJOAuthTokensFormComponent extends BaseFormComponent {
    public record!: MJOAuthTokensEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

