import { Component } from '@angular/core';
import { MJOAuthTokenEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Tokens') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoauthtoken-form',
    templateUrl: './mjoauthtoken.form.component.html'
})
export class MJOAuthTokenFormComponent extends BaseFormComponent {
    public record!: MJOAuthTokenEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

