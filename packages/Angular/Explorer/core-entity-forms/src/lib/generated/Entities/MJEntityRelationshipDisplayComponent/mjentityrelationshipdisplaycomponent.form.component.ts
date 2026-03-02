import { Component } from '@angular/core';
import { MJEntityRelationshipDisplayComponentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Relationship Display Components') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityrelationshipdisplaycomponent-form',
    templateUrl: './mjentityrelationshipdisplaycomponent.form.component.html'
})
export class MJEntityRelationshipDisplayComponentFormComponent extends BaseFormComponent {
    public record!: MJEntityRelationshipDisplayComponentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'componentDefinition', sectionName: 'Component Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJEntityRelationships', sectionName: 'Entity Relationships', isExpanded: false }
        ]);
    }
}

