import { Component } from '@angular/core';
import { MJActionAuthorizationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Action Authorizations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjactionauthorizations-form',
    templateUrl: './mjactionauthorizations.form.component.html'
})
export class MJActionAuthorizationsFormComponent extends BaseFormComponent {
    public record!: MJActionAuthorizationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'authorizationMapping', sectionName: 'Authorization Mapping', isExpanded: true },
            { sectionKey: 'actionAuthorizationDetails', sectionName: 'Action & Authorization Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

