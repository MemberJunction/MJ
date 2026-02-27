import { Component } from '@angular/core';
import { MJEntityCommunicationMessageTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Communication Message Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentitycommunicationmessagetype-form',
    templateUrl: './mjentitycommunicationmessagetype.form.component.html'
})
export class MJEntityCommunicationMessageTypeFormComponent extends BaseFormComponent {
    public record!: MJEntityCommunicationMessageTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mappingKeys', sectionName: 'Mapping Keys', isExpanded: true },
            { sectionKey: 'messageAttributes', sectionName: 'Message Attributes', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityCommunicationFields', sectionName: 'Entity Communication Fields', isExpanded: false }
        ]);
    }
}

