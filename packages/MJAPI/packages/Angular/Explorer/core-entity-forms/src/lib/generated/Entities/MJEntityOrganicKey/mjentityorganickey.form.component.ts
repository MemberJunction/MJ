import { Component } from '@angular/core';
import { MJEntityOrganicKeyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Organic Keys') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityorganickey-form',
    templateUrl: './mjentityorganickey.form.component.html'
})
export class MJEntityOrganicKeyFormComponent extends BaseFormComponent {
    public record!: MJEntityOrganicKeyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'keyIdentity', sectionName: 'Key Identity', isExpanded: true },
            { sectionKey: 'matchingLogic', sectionName: 'Matching Logic', isExpanded: true },
            { sectionKey: 'configurationPriority', sectionName: 'Configuration & Priority', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJEntityOrganicKeyRelatedEntities', sectionName: 'Entity Organic Key Related Entities', isExpanded: false }
        ]);
    }
}

