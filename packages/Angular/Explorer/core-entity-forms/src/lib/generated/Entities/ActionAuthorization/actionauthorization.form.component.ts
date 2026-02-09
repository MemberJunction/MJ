import { Component } from '@angular/core';
import { ActionAuthorizationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Action Authorizations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-actionauthorization-form',
    templateUrl: './actionauthorization.form.component.html'
})
export class ActionAuthorizationFormComponent extends BaseFormComponent {
    public record!: ActionAuthorizationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'authorizationMapping', sectionName: 'Authorization Mapping', isExpanded: true },
            { sectionKey: 'actionAuthorizationDetails', sectionName: 'Action & Authorization Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

