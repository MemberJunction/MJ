import { Component } from '@angular/core';
import { EntityRelationshipDisplayComponentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Entity Relationship Display Components') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityrelationshipdisplaycomponent-form',
    templateUrl: './entityrelationshipdisplaycomponent.form.component.html'
})
export class EntityRelationshipDisplayComponentFormComponent extends BaseFormComponent {
    public record!: EntityRelationshipDisplayComponentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'componentDefinition', sectionName: 'Component Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityRelationships', sectionName: 'Entity Relationships', isExpanded: false }
        ]);
    }
}

export function LoadEntityRelationshipDisplayComponentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
