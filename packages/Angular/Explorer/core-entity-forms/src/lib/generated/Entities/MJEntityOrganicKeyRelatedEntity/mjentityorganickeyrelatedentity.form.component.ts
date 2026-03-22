import { Component } from '@angular/core';
import { MJEntityOrganicKeyRelatedEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Organic Key Related Entities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityorganickeyrelatedentity-form',
    templateUrl: './mjentityorganickeyrelatedentity.form.component.html'
})
export class MJEntityOrganicKeyRelatedEntityFormComponent extends BaseFormComponent {
    public record!: MJEntityOrganicKeyRelatedEntityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entityMapping', sectionName: 'Entity Mapping', isExpanded: true },
            { sectionKey: 'matchingConfiguration', sectionName: 'Matching Configuration', isExpanded: true },
            { sectionKey: 'displaySettings', sectionName: 'Display Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

