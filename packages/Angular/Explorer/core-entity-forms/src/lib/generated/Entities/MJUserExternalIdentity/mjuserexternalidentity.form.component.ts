import { Component } from '@angular/core';
import { MJUserExternalIdentityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User External Identities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserexternalidentity-form',
    templateUrl: './mjuserexternalidentity.form.component.html'
})
export class MJUserExternalIdentityFormComponent extends BaseFormComponent {
    public record!: MJUserExternalIdentityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

