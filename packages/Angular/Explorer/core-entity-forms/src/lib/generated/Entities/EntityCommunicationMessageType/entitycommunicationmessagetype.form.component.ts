import { Component } from '@angular/core';
import { EntityCommunicationMessageTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Entity Communication Message Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-entitycommunicationmessagetype-form',
    templateUrl: './entitycommunicationmessagetype.form.component.html'
})
export class EntityCommunicationMessageTypeFormComponent extends BaseFormComponent {
    public record!: EntityCommunicationMessageTypeEntity;

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

export function LoadEntityCommunicationMessageTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
