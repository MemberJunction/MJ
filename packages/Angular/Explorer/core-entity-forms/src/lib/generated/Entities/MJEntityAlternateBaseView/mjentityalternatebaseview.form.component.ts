import { Component } from '@angular/core';
import { MJEntityAlternateBaseViewEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Alternate Base Views') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityalternatebaseview-form',
    templateUrl: './mjentityalternatebaseview.form.component.html'
})
export class MJEntityAlternateBaseViewFormComponent extends BaseFormComponent {
    public record!: MJEntityAlternateBaseViewEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'viewConfiguration', sectionName: 'View Configuration', isExpanded: true },
            { sectionKey: 'databaseProperties', sectionName: 'Database Properties', isExpanded: true },
            { sectionKey: 'behaviorAndStatus', sectionName: 'Behavior and Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJQueryEntities', sectionName: 'Query Entities', isExpanded: false },
            { sectionKey: 'mJEntityAlternateBaseViews', sectionName: 'Entity Alternate Base Views', isExpanded: false }
        ]);
    }
}

