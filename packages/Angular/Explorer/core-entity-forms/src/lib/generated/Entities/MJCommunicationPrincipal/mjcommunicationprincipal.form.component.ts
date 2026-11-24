import { Component } from '@angular/core';
import { MJCommunicationPrincipalEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Principals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationprincipal-form',
    templateUrl: './mjcommunicationprincipal.form.component.html'
})
export class MJCommunicationPrincipalFormComponent extends BaseFormComponent {
    public record!: MJCommunicationPrincipalEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJEntityCommunicationMessageTypes', sectionName: 'Entity Communication Message Types', isExpanded: false }
        ]);
    }
}

