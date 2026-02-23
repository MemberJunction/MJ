import { Component } from '@angular/core';
import { MJEntityRelationshipDisplayComponentsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Relationship Display Components') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityrelationshipdisplaycomponents-form',
    templateUrl: './mjentityrelationshipdisplaycomponents.form.component.html'
})
export class MJEntityRelationshipDisplayComponentsFormComponent extends BaseFormComponent {
    public record!: MJEntityRelationshipDisplayComponentsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'componentDefinition', sectionName: 'Component Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityRelationships', sectionName: 'Entity Relationships', isExpanded: false }
        ]);
    }
}

