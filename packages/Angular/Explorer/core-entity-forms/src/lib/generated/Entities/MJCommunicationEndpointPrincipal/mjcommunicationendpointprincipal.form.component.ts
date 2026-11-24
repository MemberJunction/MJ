import { Component } from '@angular/core';
import { MJCommunicationEndpointPrincipalEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Communication Endpoint Principals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationendpointprincipal-form',
    templateUrl: './mjcommunicationendpointprincipal.form.component.html'
})
export class MJCommunicationEndpointPrincipalFormComponent extends BaseFormComponent {
    public record!: MJCommunicationEndpointPrincipalEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

