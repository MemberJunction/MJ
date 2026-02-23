import { Component } from '@angular/core';
import { MJOAuthClientRegistrationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Client Registrations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoauthclientregistrations-form',
    templateUrl: './mjoauthclientregistrations.form.component.html'
})
export class MJOAuthClientRegistrationsFormComponent extends BaseFormComponent {
    public record!: MJOAuthClientRegistrationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

